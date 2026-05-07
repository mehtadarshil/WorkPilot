import type { Request, Response, Application, RequestHandler } from 'express';
import type { Pool } from 'pg';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { createReadStream } from 'fs';
import { applyTemplateVars, wrapEmailHtml, formatFromHeader, type EmailSettingsPayload } from './emailHelpers';
import { PdfRenderUnavailableError, renderHtmlReportToPdf } from './jobClientReportPdf';
import { getTenantScopeUserId, requireTenantCrmAccess } from './tenantAccess';
import type { TenantAuthUser } from './tenantAccess';

function getJobClientFilesRootDir(): string {
  const raw = process.env.JOB_CLIENT_FILES_DIR?.trim();
  return raw ? path.resolve(raw) : path.resolve(process.cwd(), 'data', 'job-client-submissions');
}

function getDiaryExtraSubmissionsRootDir(): string {
  const raw = process.env.DIARY_EXTRA_FILES_DIR?.trim();
  return raw ? path.resolve(raw) : path.resolve(process.cwd(), 'data', 'diary-extra-submissions');
}

async function ensureJobClientSubmissionDir(jobId: number, submissionId: number): Promise<string> {
  const dir = path.join(getJobClientFilesRootDir(), String(jobId), String(submissionId));
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

type AuthReq = Request & { user?: TenantAuthUser };

export type JobClientPanelRouteDeps = {
  pool: Pool;
  authenticate: RequestHandler;
  getQuotationSettings: (userId: number) => Promise<Record<string, unknown>>;
  formatCustomerAddressSingleLine: (row: Record<string, unknown>) => string;
  loadEmailSettingsPayload: (userId: number) => Promise<EmailSettingsPayload>;
  sendUserEmail: (pool: Pool, userId: number, emailCfg: EmailSettingsPayload, opts: Record<string, unknown>) => Promise<void>;
  getPublicAppBaseUrl: () => string;
};

/** IANA zone for printable client reports (`device` = viewer system zone). Default UK London includes GMT/BST. */
const CLIENT_REPORT_DISPLAY_TIMEZONE =
  (process.env.CLIENT_REPORT_DISPLAY_TIMEZONE || 'Europe/London').trim() || 'Europe/London';

const EMAIL_SUBJECT = '{{company_name}} — Shared visit report: {{job_title}}';
const EMAIL_BODY = `<p>Hello {{customer_name}},</p>
<p>A visit report selection was shared for job <strong>{{job_title}}</strong>.</p>
<p><a href="{{report_link}}">Open printable report</a> (use Print → Save as PDF if you like).</p>
<p>Thank you,<br/>{{company_name}}</p>`;

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function toIsoInstant(v: unknown): string | null {
  if (v == null) return null;
  try {
    const d = v instanceof Date ? v : new Date(String(v));
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

/** IANA zone for formatting (same env as printable HTML). `device` → Node process default zone. */
function resolveReportTimeZoneId(): string {
  const raw = CLIENT_REPORT_DISPLAY_TIMEZONE.trim();
  if (!raw || raw.toLowerCase() === 'device') {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
  return raw;
}

/** Format instant for the report (London = GMT/BST when `CLIENT_REPORT_DISPLAY_TIMEZONE=Europe/London`). */
function formatReportDateTime(iso: string, mode: 'date' | 'datetime'): string {
  const tz = resolveReportTimeZoneId();
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    if (mode === 'date') {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(d);
    }
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);
  } catch {
    return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  }
}

/** Visible label + machine-readable `datetime` (no client script — works in Safari print/PDF). */
function localTimeHtml(iso: string, mode: 'date' | 'datetime'): string {
  const visible = formatReportDateTime(iso, mode);
  return `<time datetime="${escapeAttr(iso)}">${escapeHtml(visible)}</time>`;
}

function buildFixedPrintHtml(opts: {
  companyName: string;
  jobTitle: string;
  /** Pre-built summary line (may include &lt;time&gt;…). */
  metaInnerHtml: string;
  submitterLine: string;
  /** Full HTML block (heading + table) for job/visit context; empty string to omit. */
  jobDetailsBlock: string;
  reportRowsHtml: string;
  extraMediaHtml: string;
}): string {
  const detailsBlock = opts.jobDetailsBlock.trim();
  const reportBlock =
    opts.reportRowsHtml.trim().length > 0
      ? `<h2>Job report</h2><div class="block">${opts.reportRowsHtml}</div>`
      : '';
  const mediaBlock =
    opts.extraMediaHtml.trim().length > 0
      ? `<h2>Photos &amp; videos</h2><div class="block">${opts.extraMediaHtml}</div>`
      : '';
  return `<!DOCTYPE html>
<html lang="en-GB">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(opts.companyName)} — ${escapeHtml(opts.jobTitle)}</title>
  <style>
    :root { --ink: #0f172a; --muted: #64748b; --line: #e2e8f0; --accent: #0d9488; }
    * { box-sizing: border-box; }
    body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: var(--ink); margin: 0; padding: 24px; background: #f8fafc; }
    .sheet { max-width: 800px; margin: 0 auto; background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 28px 32px 36px; }
    .brand { font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); margin-bottom: 6px; }
    h1 { font-size: 22px; margin: 0 0 4px; line-height: 1.25; }
    .meta { font-size: 13px; color: var(--muted); margin-bottom: 22px; }
    .text-muted { color: var(--muted); }
    h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin: 22px 0 10px; border-bottom: 1px solid var(--line); padding-bottom: 6px; }
    .block { font-size: 14px; line-height: 1.55; }
    .block table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
    .block th, .block td { border: 1px solid var(--line); padding: 8px 10px; text-align: left; vertical-align: top; }
    .block th { background: #f1f5f9; width: 34%; }
    .media-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; margin-top: 10px; }
    .media-grid img, .media-grid video { width: 100%; border-radius: 8px; border: 1px solid var(--line); max-height: 220px; object-fit: cover; }
    .notes { white-space: pre-wrap; }
    @media print {
      body { background: #fff; padding: 0; }
      .sheet { border: none; border-radius: 0; max-width: none; padding: 0; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      .media-grid img, .media-grid video { max-height: 260px; page-break-inside: avoid; }
      @page { margin: 12mm; size: auto; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="brand">${escapeHtml(opts.companyName)}</div>
    <h1>${escapeHtml(opts.jobTitle)}</h1>
    <div class="meta">${opts.metaInnerHtml}${opts.submitterLine}</div>
    ${detailsBlock}
    ${reportBlock}
    ${mediaBlock}
  </div>
</body>
</html>`;
}

async function ensureJobClientPortalToken(pool: Pool, jobId: number, rotate: boolean): Promise<string> {
  if (!rotate) {
    const cur = await pool.query<{ client_portal_token: string | null }>(
      'SELECT client_portal_token FROM jobs WHERE id = $1',
      [jobId],
    );
    const t = cur.rows[0]?.client_portal_token;
    if (t && String(t).trim()) return String(t).trim();
  }
  const t = crypto.randomBytes(32).toString('hex');
  await pool.query('UPDATE jobs SET client_portal_token = $1, updated_at = NOW() WHERE id = $2', [t, jobId]);
  return t;
}

function renderAnswerCell(value: string, questionType: string): string {
  const v = value.trim();
  if (!v) return '<span class="text-muted">(empty)</span>';
  const t = questionType.toLowerCase();
  if (t === 'customer_signature' || t === 'officer_signature' || t === 'before_photo' || t === 'after_photo' || v.startsWith('data:image')) {
    const safe = escapeHtml(v);
    return `<img src="${safe}" alt="" style="max-width:100%;max-height:220px;border-radius:8px;border:1px solid #e2e8f0"/>`;
  }
  if (t === 'textarea') {
    return `<div class="notes">${escapeHtml(v)}</div>`;
  }
  return escapeHtml(v);
}

function strVal(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function formatDurationFromSeconds(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '';
  const totalM = Math.floor(sec / 60);
  const h = Math.floor(totalM / 60);
  const m = totalM % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  if (sec >= 1) return `${Math.floor(sec)}s`;
  return '0s';
}

function segmentTypeLabel(t: string | null | undefined): string {
  const s = String(t || '').trim().toLowerCase();
  if (s === 'on_site') return 'On site';
  if (s === 'travelling' || s === 'traveling') return 'Travel';
  return s ? s.replace(/_/g, ' ') : 'Segment';
}

function formatMoney(v: unknown): string | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  if (!Number.isFinite(n)) return null;
  return n.toFixed(2);
}

/** Rich job + customer + visit context for the printable shared report (name / value rows). */
async function buildJobVisitDetailsBlockHtml(
  pool: Pool,
  jobId: number,
  diaryEventId: number,
  formatCustomerAddressSingleLine: (row: Record<string, unknown>) => string,
): Promise<string> {
  try {
    const q = await pool.query<Record<string, unknown>>(
      `SELECT j.id, j.title AS job_title, j.state, j.location,
              j.start_date, j.deadline, j.responsible_person, j.customer_reference, j.quoted_amount,
              j.job_notes, j.contact_name,
              c.full_name AS customer_full_name, c.email AS customer_email, c.phone AS customer_phone,
              c.contact_mobile AS customer_contact_mobile,
              c.address_line_1, c.address_line_2, c.address_line_3, c.town, c.county, c.postcode,
              c.address, c.city, c.region, c.country,
              wa.name AS work_address_name, wa.branch_name AS work_address_branch,
              wa.address_line_1 AS work_site_line_1, wa.town AS work_site_town, wa.postcode AS work_site_postcode,
              d.notes AS visit_notes, d.status AS visit_status,
              vo.full_name AS visit_officer_name,
              jo.full_name AS job_officer_name
       FROM jobs j
       LEFT JOIN customers c ON c.id = j.customer_id
       LEFT JOIN customer_work_addresses wa ON wa.id = j.work_address_id AND wa.customer_id = j.customer_id
       INNER JOIN diary_events d ON d.id = $2 AND d.job_id = j.id
       LEFT JOIN officers vo ON vo.id = d.officer_id
       LEFT JOIN officers jo ON jo.id = j.officer_id
       WHERE j.id = $1`,
      [jobId, diaryEventId],
    );
    const r = q.rows[0];
    if (!r) return '';

    const rows: string[] = [];
    const pushText = (label: string, raw: unknown) => {
      const s = strVal(raw);
      if (!s) return;
      rows.push(`<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(s)}</td></tr>`);
    };
    const pushPre = (label: string, raw: unknown) => {
      const s = strVal(raw);
      if (!s) return;
      rows.push(`<tr><th>${escapeHtml(label)}</th><td><div class="notes">${escapeHtml(s)}</div></td></tr>`);
    };
    const pushHtmlCell = (label: string, tdHtml: string) => {
      rows.push(`<tr><th>${escapeHtml(label)}</th><td>${tdHtml}</td></tr>`);
    };

    pushText('Job ID', String(jobId));
    pushText('Job title', r.job_title);
    pushText('Job state', r.state);
    pushText('Site / job location', r.location);
    pushText('Responsible person', r.responsible_person);
    pushText('Customer reference', r.customer_reference);
    const qa = formatMoney(r.quoted_amount);
    if (qa) pushText('Quoted amount', qa);
    pushPre('Job notes', r.job_notes);
    pushText('On-site contact (job)', r.contact_name);

    pushText('Customer name', r.customer_full_name);
    pushText('Customer email', r.customer_email);
    const mob = strVal(r.customer_contact_mobile);
    const land = strVal(r.customer_phone);
    if (mob || land) pushText('Customer phone', [mob, land].filter(Boolean).join(' · '));

    const addr = formatCustomerAddressSingleLine(r).trim();
    if (addr) pushText('Customer address', addr);

    const waParts = [
      strVal(r.work_address_name),
      strVal(r.work_address_branch),
      strVal(r.work_site_line_1),
      strVal(r.work_site_town),
      strVal(r.work_site_postcode),
    ].filter(Boolean);
    if (waParts.length) pushText('Work / site address', waParts.join(', '));

    const ts = await pool.query<{
      clock_in: Date;
      clock_out: Date | null;
      segment_type: string | null;
      dur_sec: string;
    }>(
      `SELECT te.clock_in, te.clock_out, te.segment_type,
              EXTRACT(EPOCH FROM (COALESCE(te.clock_out, NOW()) - te.clock_in))::bigint AS dur_sec
       FROM timesheet_entries te
       WHERE te.diary_event_id = $1
       ORDER BY te.clock_in ASC`,
      [diaryEventId],
    );

    if ((ts.rowCount ?? 0) > 0) {
      let firstIn: Date | null = null;
      let lastEndMs = 0;
      let onSiteTotal = 0;
      let travelTotal = 0;
      for (const row of ts.rows) {
        const cin = row.clock_in instanceof Date ? row.clock_in : new Date(String(row.clock_in));
        if (Number.isNaN(cin.getTime())) continue;
        if (!firstIn || cin.getTime() < firstIn.getTime()) firstIn = cin;
        const cout = row.clock_out
          ? row.clock_out instanceof Date
            ? row.clock_out
            : new Date(String(row.clock_out))
          : null;
        const dur = parseInt(String(row.dur_sec), 10);
        const endMs = cout && !Number.isNaN(cout.getTime()) ? cout.getTime() : cin.getTime() + (Number.isFinite(dur) ? dur * 1000 : 0);
        if (endMs > lastEndMs) lastEndMs = endMs;
        const st = String(row.segment_type || '').toLowerCase();
        if (st === 'on_site' && Number.isFinite(dur) && dur > 0) onSiteTotal += dur;
        if ((st === 'travelling' || st === 'traveling') && Number.isFinite(dur) && dur > 0) travelTotal += dur;
      }

      const firstIso = firstIn ? toIsoInstant(firstIn) : null;
      if (firstIso) pushHtmlCell('Visit date (timesheet)', localTimeHtml(firstIso, 'date'));
      const firstClockIso = firstIn ? toIsoInstant(firstIn) : null;
      if (firstClockIso) pushHtmlCell('First clock-in (timesheet)', localTimeHtml(firstClockIso, 'datetime'));
      if (lastEndMs > 0) {
        const lastOut = new Date(lastEndMs);
        if (!Number.isNaN(lastOut.getTime())) {
          const lo = toIsoInstant(lastOut);
          if (lo) pushHtmlCell('Last clock-out (timesheet)', localTimeHtml(lo, 'datetime'));
        }
      }
      if (onSiteTotal > 0) pushText('Total on-site time (timesheet)', formatDurationFromSeconds(onSiteTotal));
      if (travelTotal > 0) pushText('Total travel time (timesheet)', formatDurationFromSeconds(travelTotal));

      let idx = 0;
      for (const row of ts.rows) {
        idx += 1;
        const cinIso = toIsoInstant(row.clock_in);
        if (!cinIso) continue;
        const coutIso = row.clock_out ? toIsoInstant(row.clock_out) : null;
        const dur = parseInt(String(row.dur_sec), 10);
        const durLabel = Number.isFinite(dur) ? formatDurationFromSeconds(dur) : '';
        const label = segmentTypeLabel(row.segment_type);
        const cell = `${localTimeHtml(cinIso, 'datetime')} → ${
          coutIso
            ? localTimeHtml(coutIso, 'datetime')
            : '<span class="text-muted">(open — no clock-out yet)</span>'
        }${durLabel ? ` · ${escapeHtml(durLabel)}` : ''}`;
        pushHtmlCell(`Timesheet · ${label} #${idx}`, cell);
      }
    }

    pushText('Visit status', r.visit_status);
    pushText('Visit engineer', r.visit_officer_name);
    pushText('Job assigned officer', r.job_officer_name);
    pushPre('Visit notes', r.visit_notes);

    const startIso = toIsoInstant(r.start_date);
    if (startIso) pushHtmlCell('Job start date', localTimeHtml(startIso, 'date'));
    const deadlineIso = toIsoInstant(r.deadline);
    if (deadlineIso) pushHtmlCell('Job deadline', localTimeHtml(deadlineIso, 'date'));

    if (rows.length === 0) return '';

    return `<h2>Job &amp; visit details</h2><div class="block"><table>${rows.join('')}</table></div>`;
  } catch (e) {
    console.error('buildJobVisitDetailsBlockHtml', e);
    return '';
  }
}

type JobBrief = { id: number; title: string; created_by: number | null; customer_id: number | null };
type ExtraMediaKey = { extra_submission_id: number; stored_filename: string };

type ShareCtx = Pick<
  JobClientPanelRouteDeps,
  'getQuotationSettings' | 'loadEmailSettingsPayload' | 'sendUserEmail' | 'getPublicAppBaseUrl' | 'formatCustomerAddressSingleLine'
>;

type ShareOk = { ok: true; submissionId: number; pdfToken: string; reportLink: string };
type ShareErr = { ok: false; status: number; message: string };
type ShareResult = ShareOk | ShareErr;

async function createJobClientShareSubmission(
  pool: Pool,
  ctx: ShareCtx,
  input: {
    job: JobBrief;
    diaryEventId: number;
    reportQuestionIds: Set<number>;
    extraKeys: ExtraMediaKey[];
    submitterName: string | null;
    submitterEmail: string | null;
    notifyOffice: boolean;
  },
): Promise<ShareResult> {
  const { job, diaryEventId, reportQuestionIds, extraKeys, submitterName, submitterEmail, notifyOffice } = input;
  const {
    getQuotationSettings,
    loadEmailSettingsPayload,
    sendUserEmail,
    getPublicAppBaseUrl,
    formatCustomerAddressSingleLine,
  } = ctx;

  if (!Number.isFinite(diaryEventId)) {
    return { ok: false, status: 400, message: 'diary_event_id is required' };
  }
  if (reportQuestionIds.size === 0 && extraKeys.length === 0) {
    return { ok: false, status: 400, message: 'Select at least one job report answer or one extra photo/video' };
  }

  try {
    const dChk = await pool.query<{ id: number; start_time: Date; officer_full_name: string | null }>(
      `SELECT d.id, d.start_time, o.full_name AS officer_full_name
       FROM diary_events d
       LEFT JOIN officers o ON o.id = d.officer_id
       WHERE d.id = $1 AND d.job_id = $2 AND LOWER(TRIM(d.status)) = 'completed'`,
      [diaryEventId, job.id],
    );
    if ((dChk.rowCount ?? 0) === 0) {
      return { ok: false, status: 400, message: 'Visit not found or not completed' };
    }
    const visitRow = dChk.rows[0];

    const ansRows = await pool.query<{
      question_id: number;
      value: string;
      prompt: string;
      question_type: string;
    }>(
      `SELECT jra.question_id, jra.value,
              COALESCE(NULLIF(TRIM(jra.prompt_snapshot), ''), NULLIF(TRIM(q.prompt), ''), 'Question') AS prompt,
              COALESCE(NULLIF(TRIM(jra.question_type_snapshot), ''), NULLIF(TRIM(q.question_type), ''), 'text') AS question_type
       FROM job_report_answers jra
       LEFT JOIN job_report_questions q ON q.id = jra.question_id AND q.job_id = $1
       WHERE jra.diary_event_id = $2`,
      [job.id, diaryEventId],
    );
    const byQid = new Map(ansRows.rows.map((r) => [r.question_id, r]));
    for (const qid of reportQuestionIds) {
      const row = byQid.get(qid);
      if (!row) return { ok: false, status: 400, message: `Unknown question_id ${qid} for this visit` };
      if (!String(row.value || '').trim()) return { ok: false, status: 400, message: `No data for: ${row.prompt}` };
    }

    for (const ek of extraKeys) {
      const ex = await pool.query<{ media: unknown }>(
        'SELECT media FROM diary_event_extra_submissions WHERE id = $1 AND diary_event_id = $2',
        [ek.extra_submission_id, diaryEventId],
      );
      if ((ex.rowCount ?? 0) === 0) return { ok: false, status: 400, message: 'Invalid extra submission' };
      const arr = Array.isArray(ex.rows[0].media) ? (ex.rows[0].media as Record<string, unknown>[]) : [];
      const found = arr.some((m) => String(m.stored_filename) === ek.stored_filename);
      if (!found) return { ok: false, status: 400, message: 'Invalid extra media selection' };
    }

    const pdfToken = crypto.randomBytes(32).toString('hex');
    const selection = {
      diary_event_id: diaryEventId,
      report_question_ids: [...reportQuestionIds],
      extra_media: extraKeys,
    };
    const ins = await pool.query<{ id: number }>(
      `INSERT INTO job_client_submissions (
         job_id, submitter_name, submitter_email, notes, answers, media, include_flags, pdf_public_token, created_at
       ) VALUES ($1, $2, $3, NULL, '[]'::jsonb, '[]'::jsonb, $4::jsonb, $5, NOW())
       RETURNING id`,
      [job.id, submitterName, submitterEmail, JSON.stringify(selection), pdfToken],
    );
    const submissionId = ins.rows[0].id;
    const outDir = await ensureJobClientSubmissionDir(job.id, submissionId);

    const reportRows: string[] = [];
    for (const qid of reportQuestionIds) {
      const r = byQid.get(qid)!;
      const cell = renderAnswerCell(r.value, r.question_type);
      reportRows.push(`<tr><th>${escapeHtml(r.prompt)}</th><td>${cell}</td></tr>`);
    }
    const reportRowsHtml = reportRows.length ? `<table>${reportRows.join('')}</table>` : '';

    const appBase = getPublicAppBaseUrl().replace(/\/+$/, '');
    const mediaJson: Record<string, unknown>[] = [];
    let copyIdx = 0;
    const mediaCells: string[] = [];

    for (const ek of extraKeys) {
      const src = path.join(
        getDiaryExtraSubmissionsRootDir(),
        String(diaryEventId),
        String(ek.extra_submission_id),
        ek.stored_filename,
      );
      const stat = await fs.stat(src).catch(() => null);
      if (!stat?.isFile()) return { ok: false, status: 400, message: 'Missing file on server' };
      const ext = path.extname(ek.stored_filename).slice(0, 32) || '.bin';
      const newName = `ex_${copyIdx}_${crypto.randomBytes(4).toString('hex')}${ext}`;
      copyIdx += 1;
      await fs.copyFile(src, path.join(outDir, newName));
      const pubUrl = `${appBase}/api/public/job-client-media/${pdfToken}/${encodeURIComponent(newName)}`;
      const meta = await pool.query<{ media: unknown }>(
        'SELECT media FROM diary_event_extra_submissions WHERE id = $1',
        [ek.extra_submission_id],
      );
      const arr = Array.isArray(meta.rows[0]?.media) ? (meta.rows[0].media as Record<string, unknown>[]) : [];
      const item = arr.find((m) => String(m.stored_filename) === ek.stored_filename);
      const orig = item && typeof item.original_filename === 'string' ? item.original_filename : ek.stored_filename;
      const kind =
        item && typeof item.kind === 'string'
          ? String(item.kind)
          : String(item?.content_type || '').startsWith('video/')
            ? 'video'
            : 'image';
      mediaJson.push({
        stored_filename: newName,
        original_filename: orig,
        content_type: item?.content_type ?? '',
        kind,
        byte_size: stat.size,
      });
      if (kind === 'video') {
        mediaCells.push(
          `<div><video controls src="${escapeHtml(pubUrl)}"></video><div style="font-size:11px;color:#64748b;margin-top:4px">${escapeHtml(
            String(orig),
          )}</div></div>`,
        );
      } else {
        mediaCells.push(
          `<div><img src="${escapeHtml(pubUrl)}" alt=""/><div style="font-size:11px;color:#64748b;margin-top:4px">${escapeHtml(
            String(orig),
          )}</div></div>`,
        );
      }
    }

    await pool.query(`UPDATE job_client_submissions SET media = $1::jsonb WHERE id = $2`, [
      JSON.stringify(mediaJson),
      submissionId,
    ]);

    const creatorId = job.created_by || 1;
    const qs = await getQuotationSettings(creatorId);
    const companyName = (qs.company_name as string) || 'WorkPilot';
    const cust = await pool.query(`SELECT full_name FROM customers WHERE id = $1`, [job.customer_id]);
    const customerName = (cust.rows[0]?.full_name as string) || 'Customer';
    const reportLink = `${appBase}/public/job-client-report/${pdfToken}`;
    const visitIso = toIsoInstant(visitRow.start_time);
    const sharedIso = new Date().toISOString();
    const submittedAtForEmail = formatReportDateTime(sharedIso, 'datetime');
    const metaInnerHtml = `Customer: ${escapeHtml(customerName)} · Visit ${
      visitIso ? localTimeHtml(visitIso, 'date') : '—'
    }${visitRow.officer_full_name ? ` · ${escapeHtml(String(visitRow.officer_full_name))}` : ''} · Shared: ${localTimeHtml(
      sharedIso,
      'datetime',
    )}`;
    const sn = (submitterName || '').trim();
    const se = (submitterEmail || '').trim();
    const submitterLine =
      sn || se ? ` · From: ${escapeHtml(sn)}${se ? ` (${escapeHtml(se)})` : ''}` : '';
    const extraMediaHtml = mediaCells.length ? `<div class="media-grid">${mediaCells.join('')}</div>` : '';

    const jobDetailsBlock = await buildJobVisitDetailsBlockHtml(
      pool,
      job.id,
      diaryEventId,
      formatCustomerAddressSingleLine,
    );

    const htmlOut = buildFixedPrintHtml({
      companyName,
      jobTitle: job.title,
      metaInnerHtml,
      submitterLine,
      jobDetailsBlock,
      reportRowsHtml,
      extraMediaHtml,
    });
    await pool.query(`UPDATE job_client_submissions SET rendered_html = $1 WHERE id = $2`, [htmlOut, submissionId]);

    if (notifyOffice && job.created_by) {
      try {
        const emailCfg = await loadEmailSettingsPayload(job.created_by);
        const owner = await pool.query<{ email: string | null }>(`SELECT email FROM users WHERE id = $1`, [
          job.created_by,
        ]);
        const to = (owner.rows[0]?.email || '').trim();
        if (to && (emailCfg.smtp_enabled || emailCfg.oauth_provider)) {
          const evVars: Record<string, string> = {
            company_name: companyName,
            job_title: job.title,
            customer_name: customerName,
            report_link: reportLink,
            submitted_at: submittedAtForEmail,
          };
          const subject = applyTemplateVars(EMAIL_SUBJECT, evVars);
          const inner = applyTemplateVars(EMAIL_BODY, evVars);
          const html = wrapEmailHtml(inner, null);
          const from = formatFromHeader(emailCfg.from_name, emailCfg.from_email);
          await sendUserEmail(pool, job.created_by, emailCfg, {
            from,
            to,
            subject,
            html,
            replyTo: emailCfg.reply_to,
          });
        }
      } catch (emErr) {
        console.error('notify office client submission', emErr);
      }
    }

    return { ok: true, submissionId, pdfToken, reportLink };
  } catch (e) {
    console.error('createJobClientShareSubmission', e);
    return { ok: false, status: 500, message: 'Internal server error' };
  }
}

export function mountJobClientPanelRoutes(app: Application, deps: JobClientPanelRouteDeps): void {
  const {
    pool,
    authenticate,
    getQuotationSettings,
    formatCustomerAddressSingleLine,
    loadEmailSettingsPayload,
    sendUserEmail,
    getPublicAppBaseUrl,
  } = deps;

  app.post('/api/jobs/:id/client-portal-token', authenticate, requireTenantCrmAccess('jobs'), async (req: Request, res: Response) => {
    const jobId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(jobId)) return res.status(400).json({ message: 'Invalid job id' });
    const userId = getTenantScopeUserId((req as AuthReq).user!);
    const isSuperAdmin = (req as AuthReq).user!.role === 'SUPER_ADMIN';
    const rotate = req.query.rotate === '1' || req.query.rotate === 'true';
    try {
      const chk = await pool.query(
        `SELECT id FROM jobs WHERE id = $1${isSuperAdmin ? '' : ' AND created_by = $2'}`,
        isSuperAdmin ? [jobId] : [jobId, userId],
      );
      if ((chk.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Job not found' });
      const tok = await ensureJobClientPortalToken(pool, jobId, rotate);
      return res.json({ client_portal_token: tok });
    } catch (e) {
      console.error('client portal token', e);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.get('/api/jobs/:id/client-submissions', authenticate, requireTenantCrmAccess('jobs'), async (req: Request, res: Response) => {
    const jobId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(jobId)) return res.status(400).json({ message: 'Invalid job id' });
    const userId = getTenantScopeUserId((req as AuthReq).user!);
    const isSuperAdmin = (req as AuthReq).user!.role === 'SUPER_ADMIN';
    try {
      const j = await pool.query(
        `SELECT id FROM jobs WHERE id = $1${isSuperAdmin ? '' : ' AND created_by = $2'}`,
        isSuperAdmin ? [jobId] : [jobId, userId],
      );
      if ((j.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Job not found' });
      const s = await pool.query(
        `SELECT id, job_id, submitter_name, submitter_email, include_flags, pdf_public_token, created_at
         FROM job_client_submissions WHERE job_id = $1 ORDER BY created_at DESC`,
        [jobId],
      );
      return res.json({ submissions: s.rows });
    } catch (e) {
      console.error('list client submissions', e);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.get(
    '/api/jobs/:id/diary-events/:diaryEventId/client-share-options',
    authenticate,
    requireTenantCrmAccess('jobs'),
    async (req: Request, res: Response) => {
      const jobId = parseInt(String(req.params.id), 10);
      const diaryEventId = parseInt(String(req.params.diaryEventId), 10);
      if (!Number.isFinite(jobId) || !Number.isFinite(diaryEventId)) {
        return res.status(400).json({ message: 'Invalid job or visit id' });
      }
      const userId = getTenantScopeUserId((req as AuthReq).user!);
      const isSuperAdmin = (req as AuthReq).user!.role === 'SUPER_ADMIN';
      try {
        const j = await pool.query<{ id: number }>(
          `SELECT j.id FROM jobs j WHERE j.id = $1${isSuperAdmin ? '' : ' AND j.created_by = $2'}`,
          isSuperAdmin ? [jobId] : [jobId, userId],
        );
        if ((j.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Job not found' });

        const d = await pool.query<{ id: number }>(
          `SELECT d.id FROM diary_events d
           WHERE d.id = $1 AND d.job_id = $2 AND LOWER(TRIM(d.status)) = 'completed'`,
          [diaryEventId, jobId],
        );
        if ((d.rowCount ?? 0) === 0) {
          return res.status(400).json({ message: 'Visit not found or not completed for this job' });
        }

        const ans = await pool.query<{
          question_id: number;
          value: string;
          prompt: string;
          question_type: string;
        }>(
          `SELECT jra.question_id, jra.value,
                  COALESCE(NULLIF(TRIM(jra.prompt_snapshot), ''), NULLIF(TRIM(q.prompt), ''), 'Question') AS prompt,
                  COALESCE(NULLIF(TRIM(jra.question_type_snapshot), ''), NULLIF(TRIM(q.question_type), ''), 'text') AS question_type
           FROM job_report_answers jra
           LEFT JOIN job_report_questions q ON q.id = jra.question_id AND q.job_id = $1
           WHERE jra.diary_event_id = $2
           ORDER BY COALESCE(q.sort_order, 1000000), jra.question_id`,
          [jobId, diaryEventId],
        );
        const report_answers = ans.rows.map((r) => ({
          question_id: r.question_id,
          prompt: r.prompt,
          question_type: r.question_type,
          has_value: String(r.value || '').trim().length > 0,
        }));

        const extra_media: {
          extra_submission_id: number;
          stored_filename: string;
          original_filename: string;
          content_type: string;
          kind: string;
          submission_notes: string | null;
        }[] = [];
        const extras = await pool.query<{ id: number; notes: string | null; media: unknown }>(
          'SELECT id, notes, media FROM diary_event_extra_submissions WHERE diary_event_id = $1 ORDER BY created_at ASC, id ASC',
          [diaryEventId],
        );
        for (const ex of extras.rows) {
          const arr = Array.isArray(ex.media) ? (ex.media as Record<string, unknown>[]) : [];
          for (const m of arr) {
            const stored = typeof m.stored_filename === 'string' ? m.stored_filename : '';
            if (!stored) continue;
            const orig = typeof m.original_filename === 'string' ? m.original_filename : 'file';
            const ct = typeof m.content_type === 'string' ? m.content_type : 'application/octet-stream';
            const kind =
              typeof m.kind === 'string' && m.kind.trim()
                ? String(m.kind)
                : ct.startsWith('video/')
                  ? 'video'
                  : 'image';
            extra_media.push({
              extra_submission_id: ex.id,
              stored_filename: stored,
              original_filename: orig,
              content_type: ct,
              kind,
              submission_notes: ex.notes,
            });
          }
        }

        return res.json({ diary_event_id: diaryEventId, report_answers, extra_media });
      } catch (e) {
        console.error('client-share-options', e);
        return res.status(500).json({ message: 'Internal server error' });
      }
    },
  );

  app.post(
    '/api/jobs/:id/diary-events/:diaryEventId/client-share',
    authenticate,
    requireTenantCrmAccess('jobs'),
    async (req: Request, res: Response) => {
      const jobId = parseInt(String(req.params.id), 10);
      const diaryEventId = parseInt(String(req.params.diaryEventId), 10);
      if (!Number.isFinite(jobId) || !Number.isFinite(diaryEventId)) {
        return res.status(400).json({ message: 'Invalid job or visit id' });
      }
      const userId = getTenantScopeUserId((req as AuthReq).user!);
      const isSuperAdmin = (req as AuthReq).user!.role === 'SUPER_ADMIN';

      const body = req.body as {
        report_question_ids?: unknown;
        extra_media?: unknown;
        notify_office?: unknown;
        submitter_name?: unknown;
        submitter_email?: unknown;
      };
      const notifyOffice = body.notify_office === true;
      const submitterName =
        typeof body.submitter_name === 'string' ? body.submitter_name.trim().slice(0, 200) || null : null;
      const submitterEmail =
        typeof body.submitter_email === 'string' ? body.submitter_email.trim().slice(0, 255) || null : null;

      const rawQids = Array.isArray(body.report_question_ids) ? body.report_question_ids : [];
      const reportQuestionIds = new Set<number>();
      for (const x of rawQids) {
        const n = typeof x === 'number' ? x : parseInt(String(x), 10);
        if (Number.isFinite(n)) reportQuestionIds.add(n);
      }

      const rawExtra = Array.isArray(body.extra_media) ? body.extra_media : [];
      const extraKeys: ExtraMediaKey[] = [];
      for (const x of rawExtra) {
        if (!x || typeof x !== 'object') continue;
        const o = x as Record<string, unknown>;
        const sid =
          typeof o.extra_submission_id === 'number' ? o.extra_submission_id : parseInt(String(o.extra_submission_id), 10);
        const fn = typeof o.stored_filename === 'string' ? o.stored_filename.trim() : '';
        if (Number.isFinite(sid) && fn) extraKeys.push({ extra_submission_id: sid, stored_filename: path.basename(fn) });
      }

      try {
        const jRes = await pool.query<JobBrief>(
          `SELECT j.id, j.title, j.created_by, j.customer_id FROM jobs j WHERE j.id = $1${isSuperAdmin ? '' : ' AND j.created_by = $2'}`,
          isSuperAdmin ? [jobId] : [jobId, userId],
        );
        if ((jRes.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Job not found' });
        const job = jRes.rows[0];

        const shareCtx: ShareCtx = {
          getQuotationSettings,
          formatCustomerAddressSingleLine,
          loadEmailSettingsPayload,
          sendUserEmail,
          getPublicAppBaseUrl,
        };
        const result = await createJobClientShareSubmission(pool, shareCtx, {
          job,
          diaryEventId,
          reportQuestionIds,
          extraKeys,
          submitterName,
          submitterEmail,
          notifyOffice,
        });

        if (!result.ok) {
          return res.status(result.status).json({ message: result.message });
        }
        return res.status(201).json({
          submission_id: result.submissionId,
          pdf_public_token: result.pdfToken,
          report_url: result.reportLink,
        });
      } catch (e) {
        console.error('client-share', e);
        return res.status(500).json({ message: 'Internal server error' });
      }
    },
  );

  app.get('/api/public/job-client-report/:token', async (req: Request, res: Response) => {
    const token = typeof req.params.token === 'string' ? req.params.token : req.params.token?.[0];
    if (!token) return res.status(400).send('Bad request');
    const q = req.query as Record<string, unknown>;
    const fmt = String(q.format ?? '').toLowerCase();
    const wantsPdf = q.pdf === '1' || q.pdf === 'true' || fmt === 'pdf';
    try {
      const r = await pool.query<{ rendered_html: string | null }>(
        `SELECT rendered_html FROM job_client_submissions WHERE pdf_public_token = $1`,
        [token],
      );
      if ((r.rowCount ?? 0) === 0) return res.status(404).send('Not found');
      const html = r.rows[0].rendered_html;
      if (!html) return res.status(404).send('Not found');
      if (wantsPdf) {
        let pdf: Buffer;
        try {
          pdf = await renderHtmlReportToPdf(html);
        } catch (e) {
          console.error('public job client report pdf', e);
          const hint =
            e instanceof PdfRenderUnavailableError
              ? e.message
              : 'PDF generation is temporarily unavailable. Please use Print / Save as PDF instead.';
          return res.status(503).type('text/plain').send(hint);
        }
        const safeTail = token.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);
        const filename = `workpilot-client-report${safeTail ? `-${safeTail}` : ''}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', String(pdf.length));
        return res.send(pdf);
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(html);
    } catch (e) {
      console.error('public job client report', e);
      return res.status(500).send('Error');
    }
  });

  app.get('/api/public/job-client-media/:token/:file', async (req: Request, res: Response) => {
    const token = typeof req.params.token === 'string' ? req.params.token : req.params.token?.[0];
    const file = typeof req.params.file === 'string' ? req.params.file : req.params.file?.[0];
    if (!token || !file) return res.status(400).json({ message: 'Bad request' });
    try {
      const s = await pool.query<{ id: number; job_id: number }>(
        `SELECT id, job_id FROM job_client_submissions WHERE pdf_public_token = $1`,
        [token],
      );
      if ((s.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Not found' });
      const { id: sid, job_id: jobId } = s.rows[0];
      const decoded = decodeURIComponent(file);
      const fullPath = path.join(getJobClientFilesRootDir(), String(jobId), String(sid), path.basename(decoded));
      const stat = await fs.stat(fullPath).catch(() => null);
      if (!stat?.isFile()) return res.status(404).json({ message: 'Not found' });
      const ext = path.extname(fullPath).toLowerCase();
      const ct =
        ext === '.png'
          ? 'image/png'
          : ext === '.webp'
            ? 'image/webp'
            : ext === '.gif'
              ? 'image/gif'
              : ext === '.mp4' || ext === '.mov' || ext === '.webm'
                ? 'video/' + ext.slice(1)
                : 'image/jpeg';
      res.setHeader('Content-Type', ct);
      res.setHeader('Content-Length', String(stat.size));
      return createReadStream(fullPath).pipe(res);
    } catch (e) {
      console.error('job client media', e);
      return res.status(500).json({ message: 'Error' });
    }
  });
}
