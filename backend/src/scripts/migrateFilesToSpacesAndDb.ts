import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { Pool, PoolConfig } from 'pg';
import { isSpacesEnabled, putSpacesFile, relativeFileKey, spacesObjectExists, spacesObjectUrl } from '../spacesStorage';
import {
  getWorkpilotFileRootDir,
  workpilotFileKey,
  workpilotFileUrl,
  writeWorkpilotFile,
  type WorkpilotFileCategory,
} from '../workpilotFileStorage';
import { parseInlineDataUrl } from '../inlineBlobStorage';
import { storeCertificateDocumentInlineFiles } from '../electricalCertificates/certificateFileStorage';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const dryRun = process.argv.includes('--dry-run');

type RootDef = {
  category: WorkpilotFileCategory | 'customer-site-report-images';
  env: string;
  fallback: string;
};

const roots: RootDef[] = [
  { category: 'customer-site-report-images', env: 'CUSTOMER_SITE_REPORT_IMAGES_DIR', fallback: 'data/customer-site-report-images' },
  { category: 'customer-files', env: 'CUSTOMER_FILES_DIR', fallback: 'data/customer-files' },
  { category: 'customer-specific-note-media', env: 'CUSTOMER_SPECIFIC_NOTE_MEDIA_DIR', fallback: 'data/customer-specific-note-media' },
  { category: 'quotation-line-item-images', env: 'QUOTATION_LINE_ITEM_IMAGES_DIR', fallback: 'data/quotation-line-item-images' },
  { category: 'quotation-internal-notes', env: 'QUOTATION_INTERNAL_NOTE_FILES_DIR', fallback: 'data/quotation-internal-notes' },
  { category: 'diary-extra-submissions', env: 'DIARY_EXTRA_FILES_DIR', fallback: 'data/diary-extra-submissions' },
  { category: 'diary-technical-notes', env: 'DIARY_TECHNICAL_NOTE_FILES_DIR', fallback: 'data/diary-technical-notes' },
  { category: 'job-client-submissions', env: 'JOB_CLIENT_FILES_DIR', fallback: 'data/job-client-submissions' },
  { category: 'job-cost-proofs', env: 'JOB_COST_PROOF_FILES_DIR', fallback: 'data/job-cost-proofs' },
  { category: 'mobile-profile-photos', env: 'WORKPILOT_MOBILE_PROFILE_PHOTOS_DIR', fallback: 'data/mobile-profile-photos' },
];

function rootPath(def: RootDef): string {
  const raw = process.env[def.env]?.trim();
  return raw ? path.resolve(raw) : path.resolve(process.cwd(), def.fallback);
}

function contentTypeForFile(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.txt') return 'text/plain';
  if (ext === '.csv') return 'text/csv';
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.mov') return 'video/quicktime';
  return 'application/octet-stream';
}

async function walkFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(current: string) {
    let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) out.push(full);
    }
  }
  await walk(dir);
  return out;
}

function buildDbConfig(): PoolConfig {
  if (process.env.DATABASE_URL?.trim()) {
    const cfg: PoolConfig = { connectionString: process.env.DATABASE_URL.trim() };
    if (process.env.DB_SSL === 'true') {
      cfg.ssl = { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' };
    }
    return cfg;
  }
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'workpilot',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' } : undefined,
  };
}

async function uploadLocalFiles(): Promise<void> {
  let uploaded = 0;
  let failed = 0;
  let scanned = 0;
  for (const def of roots) {
    const root = rootPath(def);
    const files = await walkFiles(root);
    console.log(`[${def.category}] root=${root} files=${files.length}`);
    for (const file of files) {
      const key = relativeFileKey(def.category, root, file);
      if (!key) continue;
      scanned += 1;
      try {
        if (!dryRun) await putSpacesFile(key, file, contentTypeForFile(file));
        uploaded += 1;
      } catch (error) {
        failed += 1;
        console.error(`FAILED ${key}:`, error instanceof Error ? error.message : error);
      }
    }
  }
  console.log(`Upload phase done. dryRun=${dryRun} scanned=${scanned} ${dryRun ? 'would_upload' : 'uploaded'}=${uploaded} failed=${failed}`);
  if (failed > 0) process.exitCode = 1;
}

async function objectReady(key: string): Promise<boolean> {
  return spacesObjectExists(key);
}

function withObjectMeta<T extends Record<string, unknown>>(item: T, category: WorkpilotFileCategory, parts: Array<string | number>): T {
  const stored = typeof item.stored_filename === 'string' ? path.basename(item.stored_filename) : '';
  if (!stored) return item;
  const key = workpilotFileKey(category, parts, stored);
  return { ...item, spaces_key: key, file_url: spacesObjectUrl(key) };
}

async function updateJsonMediaRows(
  pool: Pool,
  label: string,
  query: string,
  categoryForRow: (row: Record<string, unknown>, item: Record<string, unknown>) => Promise<{ category: WorkpilotFileCategory; parts: Array<string | number> } | null>,
  update: (row: Record<string, unknown>, media: unknown[]) => Promise<void>,
): Promise<void> {
  const rows = await pool.query(query);
  let changedRows = 0;
  let changedFiles = 0;
  for (const row of rows.rows as Record<string, unknown>[]) {
    const media = Array.isArray(row.media) ? (row.media as Record<string, unknown>[]) : [];
    let changed = false;
    const next: unknown[] = [];
    for (const item of media) {
      if (!item || typeof item !== 'object') {
        next.push(item);
        continue;
      }
      const stored = typeof item.stored_filename === 'string' ? path.basename(item.stored_filename) : '';
      const loc = stored ? await categoryForRow(row, item) : null;
      if (!stored || !loc) {
        next.push(item);
        continue;
      }
      const key = workpilotFileKey(loc.category, loc.parts, stored);
      if (!(await objectReady(key))) {
        next.push(item);
        continue;
      }
      const enriched = withObjectMeta(item, loc.category, loc.parts);
      changed = changed || JSON.stringify(enriched) !== JSON.stringify(item);
      if (changed) changedFiles += 1;
      next.push(enriched);
    }
    if (changed) {
      changedRows += 1;
      if (!dryRun) await update(row, next);
    }
  }
  console.log(`[db:${label}] rows=${rows.rowCount ?? 0} ${dryRun ? 'would_update_rows' : 'updated_rows'}=${changedRows} files=${changedFiles}`);
}

async function updateDatabase(): Promise<void> {
  const pool = new Pool(buildDbConfig());
  try {
    await pool.query(`ALTER TABLE customer_files ADD COLUMN IF NOT EXISTS spaces_key TEXT`);
    await pool.query(`ALTER TABLE customer_files ADD COLUMN IF NOT EXISTS file_url TEXT`);
    await pool.query(`ALTER TABLE customer_site_report_images ADD COLUMN IF NOT EXISTS spaces_key TEXT`);
    await pool.query(`ALTER TABLE customer_site_report_images ADD COLUMN IF NOT EXISTS file_url TEXT`);
    await pool.query(`ALTER TABLE officers ADD COLUMN IF NOT EXISTS profile_photo_url TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo_url TEXT`);

    let updated = 0;
    const customerFiles = await pool.query(`SELECT id, customer_id, stored_filename FROM customer_files`);
    for (const row of customerFiles.rows) {
      const key = workpilotFileKey('customer-files', [row.customer_id], row.stored_filename);
      if (!(await objectReady(key))) continue;
      updated += 1;
      if (!dryRun) await pool.query(`UPDATE customer_files SET spaces_key = $1, file_url = $2 WHERE id = $3`, [key, spacesObjectUrl(key), row.id]);
    }
    console.log(`[db:customer_files] rows=${customerFiles.rowCount ?? 0} ${dryRun ? 'would_update' : 'updated'}=${updated}`);

    updated = 0;
    const reportImages = await pool.query(`
      SELECT i.id, r.customer_id, i.report_id, i.stored_filename
      FROM customer_site_report_images i
      INNER JOIN customer_site_reports r ON r.id = i.report_id
    `);
    for (const row of reportImages.rows) {
      const key = workpilotFileKey('customer-site-report-images' as WorkpilotFileCategory, [row.customer_id, row.report_id], row.stored_filename);
      if (!(await objectReady(key))) continue;
      updated += 1;
      if (!dryRun) await pool.query(`UPDATE customer_site_report_images SET spaces_key = $1, file_url = $2 WHERE id = $3`, [key, spacesObjectUrl(key), row.id]);
    }
    console.log(`[db:customer_site_report_images] rows=${reportImages.rowCount ?? 0} ${dryRun ? 'would_update' : 'updated'}=${updated}`);

    await updateJsonMediaRows(
      pool,
      'diary_event_extra_submissions',
      `SELECT id, diary_event_id, media FROM diary_event_extra_submissions`,
      async (row) => ({ category: 'diary-extra-submissions', parts: [Number(row.diary_event_id), Number(row.id)] }),
      async (row, media) => {
        await pool.query(`UPDATE diary_event_extra_submissions SET media = $1::jsonb WHERE id = $2`, [JSON.stringify(media), row.id]);
      },
    );

    await updateJsonMediaRows(
      pool,
      'quotation_internal_notes',
      `SELECT id, quotation_id, media FROM quotation_internal_notes`,
      async (row) => ({ category: 'quotation-internal-notes', parts: [Number(row.quotation_id), Number(row.id)] }),
      async (row, media) => {
        await pool.query(`UPDATE quotation_internal_notes SET media = $1::jsonb WHERE id = $2`, [JSON.stringify(media), row.id]);
      },
    );

    await updateJsonMediaRows(
      pool,
      'job_client_submissions',
      `SELECT id, job_id, media FROM job_client_submissions`,
      async (row) => ({ category: 'job-client-submissions', parts: [Number(row.job_id), Number(row.id)] }),
      async (row, media) => {
        await pool.query(`UPDATE job_client_submissions SET media = $1::jsonb WHERE id = $2`, [JSON.stringify(media), row.id]);
      },
    );

    await updateJsonMediaRows(
      pool,
      'job_cost_entries',
      `SELECT id, job_id, proof_files AS media FROM job_cost_entries`,
      async (row) => ({ category: 'job-cost-proofs', parts: [Number(row.job_id), Number(row.id)] }),
      async (row, media) => {
        await pool.query(`UPDATE job_cost_entries SET proof_files = $1::jsonb WHERE id = $2`, [JSON.stringify(media), row.id]);
      },
    );

    await updateJsonMediaRows(
      pool,
      'quotation_line_items',
      `SELECT id, quotation_id, images AS media FROM quotation_line_items`,
      async (row) => ({ category: 'quotation-line-item-images', parts: [Number(row.quotation_id)] }),
      async (row, media) => {
        await pool.query(`UPDATE quotation_line_items SET images = $1::jsonb WHERE id = $2`, [JSON.stringify(media), row.id]);
      },
    );

    await updateJsonMediaRows(
      pool,
      'customer_specific_notes',
      `SELECT id, customer_id, work_address_id, media FROM customer_specific_notes`,
      async (row, item) => {
        const stored = String(item.stored_filename || '');
        const regularKey = workpilotFileKey('customer-specific-note-media', [Number(row.customer_id), Number(row.id)], stored);
        if (await objectReady(regularKey)) return { category: 'customer-specific-note-media', parts: [Number(row.customer_id), Number(row.id)] };
        const diaries = await pool.query(
          `SELECT d.id
           FROM diary_events d
           INNER JOIN jobs j ON j.id = d.job_id
           WHERE j.customer_id = $1
             AND ($2::integer IS NULL OR j.work_address_id IS NULL OR j.work_address_id = $2)
           ORDER BY d.id DESC`,
          [row.customer_id, row.work_address_id],
        );
        for (const d of diaries.rows) {
          const key = workpilotFileKey('diary-technical-notes', [Number(d.id), Number(row.id)], stored);
          if (await objectReady(key)) return { category: 'diary-technical-notes', parts: [Number(d.id), Number(row.id)] };
        }
        return null;
      },
      async (row, media) => {
        await pool.query(`UPDATE customer_specific_notes SET media = $1::jsonb WHERE id = $2`, [JSON.stringify(media), row.id]);
      },
    );

    const reportAnswers = await pool.query<{
      diary_event_id: number;
      question_id: number;
      question_type: string;
      value: string;
    }>(`
      SELECT a.diary_event_id, a.question_id,
             COALESCE(NULLIF(TRIM(a.question_type_snapshot), ''), q.question_type, '') AS question_type,
             a.value
      FROM job_report_answers a
      LEFT JOIN job_report_questions q ON q.id = a.question_id
      WHERE a.value LIKE 'data:%;base64,%'
    `);
    let answerUpdates = 0;
    for (const row of reportAnswers.rows) {
      const parsed = parseInlineDataUrl(row.value);
      if (!parsed) continue;
      const qType = String(row.question_type || 'answer').replace(/[^a-zA-Z0-9_-]/g, '_') || 'answer';
      const filename = `${qType}_${Date.now()}_${row.diary_event_id}_${row.question_id}${parsed.extension}`;
      const apiPath = `/diary-events/${row.diary_event_id}/job-report-answers/${row.question_id}/files/${encodeURIComponent(filename)}`;
      answerUpdates += 1;
      if (!dryRun) {
        await writeWorkpilotFile('job-report-answer-files', [row.diary_event_id, row.question_id], filename, parsed.buffer, parsed.contentType);
        await pool.query(
          `UPDATE job_report_answers SET value = $1, updated_at = NOW() WHERE diary_event_id = $2 AND question_id = $3`,
          [apiPath, row.diary_event_id, row.question_id],
        );
      }
    }
    console.log(`[db:job_report_answers.inline_blobs] rows=${reportAnswers.rowCount ?? 0} ${dryRun ? 'would_update' : 'updated'}=${answerUpdates}`);

    const certDocs = await pool.query<{ id: number; document: unknown }>(
      `SELECT id, document FROM electrical_certificates WHERE document::text LIKE '%data:%;base64,%'`,
    );
    let certDocUpdates = 0;
    for (const row of certDocs.rows) {
      certDocUpdates += 1;
      if (!dryRun) {
        const storedDoc = await storeCertificateDocumentInlineFiles(row.id, row.document);
        await pool.query(`UPDATE electrical_certificates SET document = $1::jsonb, updated_at = NOW() WHERE id = $2`, [
          JSON.stringify(storedDoc),
          row.id,
        ]);
      }
    }
    console.log(`[db:electrical_certificates.inline_blobs] rows=${certDocs.rowCount ?? 0} ${dryRun ? 'would_update' : 'updated'}=${certDocUpdates}`);

    for (const table of ['invoice_settings', 'quotation_settings'] as const) {
      const scope = table === 'invoice_settings' ? 'invoice' : 'quotation';
      const rows = await pool.query<{ id: number; created_by: number; company_logo: string }>(
        `SELECT id, created_by, company_logo FROM ${table} WHERE company_logo LIKE 'data:%;base64,%'`,
      );
      let logoUpdates = 0;
      for (const row of rows.rows) {
        const parsed = parseInlineDataUrl(row.company_logo);
        if (!parsed) continue;
        const filename = `company_logo_${Date.now()}_${row.id}${parsed.extension}`;
        logoUpdates += 1;
        if (!dryRun) {
          await writeWorkpilotFile('branding-assets', [scope, row.created_by], filename, parsed.buffer, parsed.contentType);
          await pool.query(`UPDATE ${table} SET company_logo = $1 WHERE id = $2`, [
            workpilotFileUrl('branding-assets', [scope, row.created_by], filename),
            row.id,
          ]);
        }
      }
      console.log(`[db:${table}.company_logo_inline] rows=${rows.rowCount ?? 0} ${dryRun ? 'would_update' : 'updated'}=${logoUpdates}`);
    }

    for (const kind of ['officer', 'user'] as const) {
      const table = kind === 'officer' ? 'officers' : 'users';
      const rows = await pool.query(`SELECT id, profile_photo_filename FROM ${table} WHERE profile_photo_filename IS NOT NULL`);
      let count = 0;
      for (const row of rows.rows) {
        const key = workpilotFileKey('mobile-profile-photos', [`${kind}_${row.id}`], row.profile_photo_filename);
        if (!(await objectReady(key))) continue;
        count += 1;
        if (!dryRun) await pool.query(`UPDATE ${table} SET profile_photo_url = $1 WHERE id = $2`, [spacesObjectUrl(key), row.id]);
      }
      console.log(`[db:${table}.profile_photo_url] rows=${rows.rowCount ?? 0} ${dryRun ? 'would_update' : 'updated'}=${count}`);
    }
  } finally {
    await pool.end();
  }
}

async function main() {
  if (!isSpacesEnabled()) {
    throw new Error('Spaces is not configured. Set endpoint, bucket, access key id, and secret key env vars first.');
  }
  await uploadLocalFiles();
  await updateDatabase();
  console.log(`Done. dryRun=${dryRun}`);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});

