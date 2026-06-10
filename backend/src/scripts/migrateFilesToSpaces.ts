import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { isSpacesEnabled, putSpacesFile, relativeFileKey } from '../spacesStorage';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

type RootDef = {
  category: string;
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

async function main() {
  if (!isSpacesEnabled()) {
    throw new Error('Spaces is not configured. Set endpoint, bucket, access key id, and secret key env vars first.');
  }

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
        await putSpacesFile(key, file, contentTypeForFile(file));
        uploaded += 1;
      } catch (error) {
        failed += 1;
        console.error(`FAILED ${key}:`, error instanceof Error ? error.message : error);
      }
    }
  }

  console.log(`Done. scanned=${scanned} uploaded=${uploaded} failed=${failed}`);
  if (failed > 0) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
