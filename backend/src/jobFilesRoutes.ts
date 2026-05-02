import type { Application, Request, Response } from 'express';
import type { Pool } from 'pg';
import path from 'path';
import fs from 'fs/promises';
import { getTenantScopeUserId, requireTenantCrmAccess } from './tenantAccess';
import type { TenantAuthUser } from './tenantAccess';

type AuthReq = Request & { user?: TenantAuthUser };

function getDiaryTechnicalNotesRootDir(): string {
  const raw = process.env.DIARY_TECHNICAL_NOTE_FILES_DIR?.trim();
  return raw ? path.resolve(raw) : path.resolve(process.cwd(), 'data', 'diary-technical-notes');
}

const MAX_INLINE_DATA_URL_CHARS = 900_000;

function classifyFromMimeAndName(
  contentType: string | null | undefined,
  filename: string,
): 'image' | 'video' | 'pdf' | 'signature' | 'other' {
  const ct = (contentType || '').toLowerCase().split(';')[0]!.trim();
  const fn = (filename || '').toLowerCase();
  if (ct.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/.test(fn)) return 'image';
  if (ct.startsWith('video/') || /\.(mp4|mov|webm|m4v|mkv)$/.test(fn)) return 'video';
  if (ct === 'application/pdf' || fn.endsWith('.pdf')) return 'pdf';
  return 'other';
}

function classifyDataUrl(dataUrl: string): 'image' | 'video' | 'pdf' | 'signature' | 'other' {
  const head = dataUrl.slice(0, 120).toLowerCase();
  if (head.startsWith('data:image/')) return 'image';
  if (head.startsWith('data:video/')) return 'video';
  if (head.startsWith('data:application/pdf')) return 'pdf';
  return 'other';
}

/** Strip leading `/api` so paths work with clients whose base URL is `/api`. */
function stripApiPrefix(p: string): string {
  const t = p.trim();
  if (t.startsWith('http://') || t.startsWith('https://')) return t;
  if (t.startsWith('/api/')) return t.slice(4);
  return t.startsWith('/') ? t : `/${t}`;
}

async function findDiaryIdForTechnicalNote(diaryIds: number[], noteId: number): Promise<number | null> {
  const root = getDiaryTechnicalNotesRootDir();
  for (const dId of diaryIds) {
    const dir = path.join(root, String(dId), String(noteId));
    try {
      const st = await fs.stat(dir);
      if (st.isDirectory()) return dId;
    } catch {
      /* */
    }
  }
  return null;
}

export type JobFilesRouteDeps = {
  pool: Pool;
  authenticate: (req: Request, res: Response, next: () => void) => void;
};

export function mountJobFilesRoutes(app: Application, deps: JobFilesRouteDeps): void {
  const { pool, authenticate } = deps;

  app.get('/api/jobs/:id/files', authenticate, requireTenantCrmAccess('jobs'), async (req: Request, res: Response) => {
    const jobId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(jobId)) return res.status(400).json({ message: 'Invalid job id' });
    const userId = getTenantScopeUserId((req as AuthReq).user!);
    const isSuperAdmin = (req as AuthReq).user!.role === 'SUPER_ADMIN';

    type Out = {
      id: string;
      source: string;
      source_detail: string;
      label: string;
      kind: 'image' | 'video' | 'pdf' | 'signature' | 'other';
      content_type: string | null;
      byte_size: number | null;
      created_at: string | null;
      access: 'inline' | 'bearer' | 'public';
      href: string;
      too_large_for_inline?: boolean;
    };

    const files: Out[] = [];

    try {
      const jobRes = await pool.query<{
        id: number;
        customer_id: number | null;
        work_address_id: number | null;
        created_by: number | null;
        attachments: unknown;
      }>(
        `SELECT id, customer_id, work_address_id, created_by, attachments FROM jobs WHERE id = $1${
          isSuperAdmin ? '' : ' AND created_by = $2'
        }`,
        isSuperAdmin ? [jobId] : [jobId, userId],
      );
      if ((jobRes.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Job not found' });
      const job = jobRes.rows[0];
      const customerId = job.customer_id;
      const workAddressId = job.work_address_id;

      const visitLabel = (start: Date) => `Visit ${start.toISOString().slice(0, 10)}`;

      const att = Array.isArray(job.attachments) ? job.attachments : [];
      for (let i = 0; i < att.length; i++) {
        const item = att[i];
        if (typeof item === 'string') {
          const s = item.trim();
          if (!s) continue;
          if (s.startsWith('data:')) {
            files.push({
              id: `job_att_${i}`,
              source: 'Job record',
              source_detail: 'Attachments on job',
              label: `Attachment ${i + 1}`,
              kind: classifyDataUrl(s),
              content_type: s.slice(5).split(';')[0] || null,
              byte_size: null,
              created_at: null,
              access: 'inline',
              href: s.length <= MAX_INLINE_DATA_URL_CHARS ? s : '',
              too_large_for_inline: s.length > MAX_INLINE_DATA_URL_CHARS,
            });
          } else {
            const href = stripApiPrefix(s.startsWith('http') ? s : s);
            files.push({
              id: `job_att_${i}`,
              source: 'Job record',
              source_detail: 'Attachments on job',
              label: `Attachment ${i + 1}`,
              kind: classifyFromMimeAndName(null, s),
              content_type: null,
              byte_size: null,
              created_at: null,
              access: href.includes('/public/') ? 'public' : 'bearer',
              href,
            });
          }
        } else if (item && typeof item === 'object') {
          const o = item as Record<string, unknown>;
          const url =
            typeof o.url === 'string'
              ? o.url
              : typeof o.href === 'string'
                ? o.href
                : typeof o.file_url === 'string'
                  ? o.file_url
                  : '';
          const filename =
            typeof o.filename === 'string' && o.filename.trim()
              ? o.filename.trim()
              : typeof o.name === 'string' && o.name.trim()
                ? o.name.trim()
                : `Attachment ${i + 1}`;
          const contentType = typeof o.content_type === 'string' ? o.content_type : null;
          if (!url.trim()) continue;
          const u = url.trim();
          if (u.startsWith('data:')) {
            files.push({
              id: `job_att_${i}`,
              source: 'Job record',
              source_detail: 'Attachments on job',
              label: filename,
              kind: classifyDataUrl(u),
              content_type: contentType || u.slice(5).split(';')[0] || null,
              byte_size: null,
              created_at: null,
              access: 'inline',
              href: u.length <= MAX_INLINE_DATA_URL_CHARS ? u : '',
              too_large_for_inline: u.length > MAX_INLINE_DATA_URL_CHARS,
            });
          } else {
            const href = stripApiPrefix(u.startsWith('http') ? u : u);
            files.push({
              id: `job_att_${i}`,
              source: 'Job record',
              source_detail: 'Attachments on job',
              label: filename,
              kind: classifyFromMimeAndName(contentType, filename),
              content_type: contentType,
              byte_size: typeof o.byte_size === 'number' ? o.byte_size : null,
              created_at: typeof o.created_at === 'string' ? o.created_at : null,
              access: href.includes('/public/') ? 'public' : 'bearer',
              href,
            });
          }
        }
      }

      const diaryRes = await pool.query<{ id: number; start_time: Date }>(
        `SELECT id, start_time FROM diary_events WHERE job_id = $1 ORDER BY start_time DESC`,
        [jobId],
      );
      const diaryRows = diaryRes.rows;
      const diaryIds = diaryRows.map((r) => r.id);
      const diaryStart = new Map(diaryRows.map((r) => [r.id, r.start_time]));

      const extras = await pool.query<{
        id: number;
        diary_event_id: number;
        media: unknown;
        created_at: Date;
      }>(
        `SELECT s.id, s.diary_event_id, s.media, s.created_at
         FROM diary_event_extra_submissions s
         INNER JOIN diary_events d ON d.id = s.diary_event_id
         WHERE d.job_id = $1
         ORDER BY s.created_at ASC`,
        [jobId],
      );
      for (const row of extras.rows) {
        const st = diaryStart.get(row.diary_event_id);
        const detail = st ? visitLabel(st) : `Diary #${row.diary_event_id}`;
        const mediaArr = Array.isArray(row.media) ? (row.media as Record<string, unknown>[]) : [];
        let mi = 0;
        for (const m of mediaArr) {
          const stored = typeof m.stored_filename === 'string' ? m.stored_filename : '';
          if (!stored) continue;
          const orig = typeof m.original_filename === 'string' ? m.original_filename : 'file';
          const ct = typeof m.content_type === 'string' ? m.content_type : null;
          const kindStr =
            typeof m.kind === 'string' && m.kind.trim()
              ? String(m.kind)
              : ct && ct.startsWith('video/')
                ? 'video'
                : 'image';
          const kind: Out['kind'] =
            kindStr === 'video' ? 'video' : kindStr === 'image' ? 'image' : classifyFromMimeAndName(ct, orig);
          files.push({
            id: `extra_${row.diary_event_id}_${row.id}_${mi++}`,
            source: 'Visit extras',
            source_detail: detail,
            label: orig,
            kind,
            content_type: ct,
            byte_size: m.byte_size != null ? Number(m.byte_size) : null,
            created_at: (row.created_at as Date).toISOString(),
            access: 'bearer',
            href: `/diary-events/${row.diary_event_id}/extra-submissions/${row.id}/files/${encodeURIComponent(stored)}`,
          });
        }
      }

      if (customerId != null) {
        const notes = await pool.query<{
          id: number;
          media: unknown;
          created_at: Date;
        }>(
          `SELECT n.id, n.media, n.created_at
           FROM customer_specific_notes n
           WHERE n.customer_id = $1
             AND n.title = 'Technical note'
             AND (n.work_address_id IS NULL OR n.work_address_id IS NOT DISTINCT FROM $2::integer)
             AND n.media::text != '[]'`,
          [customerId, workAddressId],
        );
        for (const row of notes.rows) {
          const mediaArr = Array.isArray(row.media) ? (row.media as Record<string, unknown>[]) : [];
          const diaryForNote = await findDiaryIdForTechnicalNote(diaryIds, row.id);
          if (diaryForNote == null) continue;
          const st = diaryStart.get(diaryForNote);
          const detail = st ? visitLabel(st) : `Diary #${diaryForNote}`;
          let ni = 0;
          for (const m of mediaArr) {
            const stored = typeof m.stored_filename === 'string' ? m.stored_filename : '';
            if (!stored) continue;
            const orig = typeof m.original_filename === 'string' ? m.original_filename : 'file';
            const ct = typeof m.content_type === 'string' ? m.content_type : null;
            files.push({
              id: `tech_${diaryForNote}_${row.id}_${ni++}`,
              source: 'Technical notes',
              source_detail: detail,
              label: orig,
              kind: classifyFromMimeAndName(ct, orig),
              content_type: ct,
              byte_size: m.byte_size != null ? Number(m.byte_size) : null,
              created_at: (row.created_at as Date).toISOString(),
              access: 'bearer',
              href: `/diary-events/${diaryForNote}/technical-notes/${row.id}/files/${encodeURIComponent(stored)}`,
            });
          }
        }
      }

      const answers = await pool.query<{
        diary_event_id: number;
        question_id: number;
        value: string;
        prompt: string;
        question_type: string;
        start_time: Date;
      }>(
        `SELECT jra.diary_event_id, jra.question_id, jra.value,
                COALESCE(NULLIF(TRIM(jra.prompt_snapshot), ''), NULLIF(TRIM(q.prompt), ''), 'Question') AS prompt,
                COALESCE(NULLIF(TRIM(jra.question_type_snapshot), ''), NULLIF(TRIM(q.question_type), ''), 'text') AS question_type,
                d.start_time
         FROM job_report_answers jra
         INNER JOIN diary_events d ON d.id = jra.diary_event_id
         LEFT JOIN job_report_questions q ON q.id = jra.question_id AND q.job_id = d.job_id
         WHERE d.job_id = $1`,
        [jobId],
      );
      for (const a of answers.rows) {
        const v = String(a.value || '').trim();
        if (v.length < 16) continue;
        const qt = String(a.question_type || '').toLowerCase();
        const isMediaQuestion =
          qt === 'before_photo' ||
          qt === 'after_photo' ||
          qt === 'customer_signature' ||
          qt === 'officer_signature';
        const isData = v.startsWith('data:');
        const isHttpPath = v.startsWith('/api/') || v.startsWith('/diary-events/');
        if (!isMediaQuestion && !isData && !isHttpPath) continue;
        const st = diaryStart.get(a.diary_event_id) ?? a.start_time;
        const detail = visitLabel(st);
        if (v.startsWith('data:')) {
          const tooLarge = v.length > MAX_INLINE_DATA_URL_CHARS;
          files.push({
            id: `report_${a.diary_event_id}_q${a.question_id}`,
            source: 'Job report',
            source_detail: detail,
            label: a.prompt,
            kind: qt.includes('signature') ? 'signature' : classifyDataUrl(v),
            content_type: v.slice(5).split(';')[0] || null,
            byte_size: null,
            created_at: st.toISOString(),
            access: 'inline',
            href: tooLarge ? '' : v,
            too_large_for_inline: tooLarge,
          });
        } else {
          const href = stripApiPrefix(v.startsWith('http') ? v : v);
          files.push({
            id: `report_${a.diary_event_id}_q${a.question_id}`,
            source: 'Job report',
            source_detail: detail,
            label: a.prompt,
            kind: classifyFromMimeAndName(null, v),
            content_type: null,
            byte_size: null,
            created_at: st.toISOString(),
            access: href.includes('/public/') ? 'public' : 'bearer',
            href,
          });
        }
      }

      const subs = await pool.query<{
        id: number;
        pdf_public_token: string;
        media: unknown;
        created_at: Date;
      }>(
        `SELECT id, pdf_public_token, media, created_at FROM job_client_submissions WHERE job_id = $1 ORDER BY created_at DESC`,
        [jobId],
      );
      for (const s of subs.rows) {
        const tok = s.pdf_public_token;
        files.push({
          id: `client_pdf_${s.id}`,
          source: 'Client report pack',
          source_detail: `Shared ${(s.created_at as Date).toISOString().slice(0, 10)}`,
          label: `Client report (PDF) #${s.id}`,
          kind: 'pdf',
          content_type: 'application/pdf',
          byte_size: null,
          created_at: (s.created_at as Date).toISOString(),
          access: 'public',
          href: `/public/job-client-report/${encodeURIComponent(tok)}?pdf=1`,
        });
        const mediaArr = Array.isArray(s.media) ? (s.media as Record<string, unknown>[]) : [];
        let ci = 0;
        for (const m of mediaArr) {
          const stored = typeof m.stored_filename === 'string' ? m.stored_filename : '';
          if (!stored) continue;
          const orig = typeof m.original_filename === 'string' ? m.original_filename : stored;
          const ct = typeof m.content_type === 'string' ? m.content_type : null;
          const kindStr =
            typeof m.kind === 'string' && m.kind.trim()
              ? String(m.kind)
              : ct && ct.startsWith('video/')
                ? 'video'
                : 'image';
          const kind: Out['kind'] =
            kindStr === 'video' ? 'video' : kindStr === 'image' ? 'image' : classifyFromMimeAndName(ct, orig);
          files.push({
            id: `client_media_${s.id}_${ci++}`,
            source: 'Client report pack',
            source_detail: `Pack #${s.id}`,
            label: orig,
            kind,
            content_type: ct,
            byte_size: m.byte_size != null ? Number(m.byte_size) : null,
            created_at: (s.created_at as Date).toISOString(),
            access: 'public',
            href: `/public/job-client-media/${encodeURIComponent(tok)}/${encodeURIComponent(stored)}`,
          });
        }
      }

      if (customerId != null) {
        const cf = await pool.query<{
          id: number;
          original_filename: string;
          content_type: string | null;
          byte_size: number;
          created_at: Date;
        }>(
          `SELECT id, original_filename, content_type, byte_size, created_at
           FROM customer_files
           WHERE customer_id = $1
             AND (work_address_id IS NULL OR work_address_id IS NOT DISTINCT FROM $2::integer)
           ORDER BY created_at DESC`,
          [customerId, workAddressId],
        );
        for (const f of cf.rows) {
          files.push({
            id: `cust_file_${f.id}`,
            source: 'Customer files',
            source_detail: 'Files for this customer / work site',
            label: f.original_filename,
            kind: classifyFromMimeAndName(f.content_type, f.original_filename),
            content_type: f.content_type,
            byte_size: f.byte_size,
            created_at: (f.created_at as Date).toISOString(),
            access: 'bearer',
            href: `/customers/${customerId}/files/${f.id}/content`,
          });
        }
      }

      const invRows = await pool.query<{
        id: number;
        invoice_number: string;
        invoice_date: Date;
        state: string;
        created_at: Date;
      }>(
        `SELECT id, invoice_number, invoice_date, state, created_at
         FROM invoices
         WHERE job_id = $1
         ORDER BY created_at DESC`,
        [jobId],
      );
      for (const inv of invRows.rows) {
        const num = String(inv.invoice_number || '').trim() || `INV-${inv.id}`;
        files.push({
          id: `invoice_${inv.id}`,
          source: 'Invoice',
          source_detail: `Status: ${String(inv.state || '').replace(/_/g, ' ')}`,
          label: `${num}.pdf`,
          kind: 'pdf',
          content_type: 'application/pdf',
          byte_size: null,
          created_at: (inv.created_at as Date).toISOString(),
          access: 'bearer',
          href: `/invoices/${inv.id}/pdf`,
        });
      }

      const quotRows = await pool.query<{
        id: number;
        quotation_number: string;
        quotation_date: Date;
        state: string;
        created_at: Date;
      }>(
        `SELECT id, quotation_number, quotation_date, state, created_at
         FROM quotations
         WHERE job_id = $1
         ORDER BY created_at DESC`,
        [jobId],
      );
      for (const q of quotRows.rows) {
        const num = String(q.quotation_number || '').trim() || `QUOT-${q.id}`;
        files.push({
          id: `quotation_${q.id}`,
          source: 'Quotation',
          source_detail: `Status: ${String(q.state || '').replace(/_/g, ' ')}`,
          label: `${num}.pdf`,
          kind: 'pdf',
          content_type: 'application/pdf',
          byte_size: null,
          created_at: (q.created_at as Date).toISOString(),
          access: 'bearer',
          href: `/quotations/${q.id}/pdf`,
        });
      }

      files.sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tb - ta;
      });

      return res.json({ files });
    } catch (e) {
      console.error('job files manifest', e);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });
}
