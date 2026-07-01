import { createReadStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import type { Response } from 'express';
import {
  getSpacesBuffer,
  isSpacesEnabled,
  putSpacesBuffer,
  spacesKey,
  spacesObjectExists,
  spacesObjectUrl,
} from './spacesStorage';

export type WorkpilotFileCategory =
  | 'customer-site-report-images'
  | 'job-report-answer-files'
  | 'job-attachments'
  | 'electrical-certificate-files'
  | 'branding-assets'
  | 'customer-files'
  | 'customer-specific-note-media'
  | 'quotation-line-item-images'
  | 'quotation-internal-notes'
  | 'diary-extra-submissions'
  | 'diary-technical-notes'
  | 'job-client-submissions'
  | 'job-cost-proofs'
  | 'job-expense-proofs'
  | 'mobile-profile-photos'
  | 'stock-photos'
  | 'tool-photos'
  | 'uniform-photos';

export type StoredFileRef = {
  category: WorkpilotFileCategory;
  rootDir: string;
  pathParts: Array<string | number>;
  filename: string;
};

export type LoadedStoredFile = {
  buffer?: Buffer;
  fullPath?: string;
  size: number;
  spacesKey: string;
  from: 'spaces' | 'local';
};

const CATEGORY_ENV: Record<WorkpilotFileCategory, string> = {
  'customer-site-report-images': 'CUSTOMER_SITE_REPORT_IMAGES_DIR',
  'job-report-answer-files': 'WORKPILOT_INLINE_FILES_DIR',
  'job-attachments': 'WORKPILOT_INLINE_FILES_DIR',
  'electrical-certificate-files': 'WORKPILOT_INLINE_FILES_DIR',
  'branding-assets': 'WORKPILOT_INLINE_FILES_DIR',
  'customer-files': 'CUSTOMER_FILES_DIR',
  'customer-specific-note-media': 'CUSTOMER_SPECIFIC_NOTE_MEDIA_DIR',
  'quotation-line-item-images': 'QUOTATION_LINE_ITEM_IMAGES_DIR',
  'quotation-internal-notes': 'QUOTATION_INTERNAL_NOTE_FILES_DIR',
  'diary-extra-submissions': 'DIARY_EXTRA_FILES_DIR',
  'diary-technical-notes': 'DIARY_TECHNICAL_NOTE_FILES_DIR',
  'job-client-submissions': 'JOB_CLIENT_FILES_DIR',
  'job-cost-proofs': 'JOB_COST_PROOF_FILES_DIR',
  'job-expense-proofs': 'JOB_EXPENSE_PROOF_FILES_DIR',
  'mobile-profile-photos': 'WORKPILOT_MOBILE_PROFILE_PHOTOS_DIR',
  'stock-photos': 'WORKPILOT_INLINE_FILES_DIR',
  'tool-photos': 'WORKPILOT_INLINE_FILES_DIR',
  'uniform-photos': 'WORKPILOT_INLINE_FILES_DIR',
};

export function getWorkpilotFileRootDir(category: WorkpilotFileCategory): string {
  const raw = process.env[CATEGORY_ENV[category]]?.trim();
  if (raw) {
    if (
      process.env[CATEGORY_ENV[category]]?.trim() &&
      CATEGORY_ENV[category] === 'WORKPILOT_INLINE_FILES_DIR'
    ) {
      return path.resolve(raw, category);
    }
    return path.resolve(raw);
  }
  return path.resolve(process.cwd(), 'data', category);
}

export function getWorkpilotFileReadRootDirs(category: WorkpilotFileCategory): string[] {
  const configured = process.env[CATEGORY_ENV[category]]?.trim();
  const configuredRoot = configured && CATEGORY_ENV[category] === 'WORKPILOT_INLINE_FILES_DIR'
    ? path.resolve(configured, category)
    : configured
      ? path.resolve(configured)
      : null;
  const roots = [
    ...(configuredRoot ? [configuredRoot] : []),
    path.resolve(process.cwd(), 'data', category),
    path.resolve(process.cwd(), 'backend', 'data', category),
    path.resolve(process.cwd(), '..', 'data', category),
  ];
  return Array.from(new Set(roots));
}

function cleanPathPart(part: string | number): string {
  return String(part).replace(/^\/+|\/+$/g, '');
}

export function cleanStoredFilename(filename: string): string {
  return path.basename(String(filename || '').trim());
}

export function workpilotFileKey(category: WorkpilotFileCategory, pathParts: Array<string | number>, filename: string): string {
  return spacesKey(category, ...pathParts.map(cleanPathPart), cleanStoredFilename(filename));
}

export function workpilotFileUrl(category: WorkpilotFileCategory, pathParts: Array<string | number>, filename: string): string | null {
  return spacesObjectUrl(workpilotFileKey(category, pathParts, filename));
}

export async function ensureWorkpilotFileDir(category: WorkpilotFileCategory, ...pathParts: Array<string | number>): Promise<string> {
  const dir = path.join(getWorkpilotFileRootDir(category), ...pathParts.map(cleanPathPart));
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function writeWorkpilotFile(
  category: WorkpilotFileCategory,
  pathParts: Array<string | number>,
  filename: string,
  buffer: Buffer,
  contentType?: string | null,
): Promise<{ fullPath: string; spacesKey: string; fileUrl: string | null }> {
  const storedFilename = cleanStoredFilename(filename);
  const dir = path.join(getWorkpilotFileRootDir(category), ...pathParts.map(cleanPathPart));
  const fullPath = path.join(dir, storedFilename);
  const key = workpilotFileKey(category, pathParts, storedFilename);

  let spacesOk = false;
  if (isSpacesEnabled()) {
    try {
      spacesOk = await putSpacesBuffer(key, buffer, contentType);
    } catch (err) {
      console.warn('[workpilotFileStorage] Spaces upload failed, falling back to local storage:', key, err);
    }
  }

  if (!spacesOk) {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, buffer);
  }

  return { fullPath, spacesKey: key, fileUrl: spacesOk ? spacesObjectUrl(key) : null };
}

export async function findLocalWorkpilotFile(
  category: WorkpilotFileCategory,
  pathParts: Array<string | number>,
  filename: string,
): Promise<{ fullPath: string; size: number } | null> {
  const storedFilename = cleanStoredFilename(filename);
  if (!storedFilename) return null;
  for (const root of getWorkpilotFileReadRootDirs(category)) {
    const fullPath = path.join(root, ...pathParts.map(cleanPathPart), storedFilename);
    const rel = path.relative(root, fullPath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) continue;
    try {
      const st = await fs.stat(fullPath);
      if (st.isFile()) return { fullPath, size: st.size };
    } catch {
      /* try next legacy/dev root */
    }
  }
  return null;
}

export async function loadWorkpilotFile(
  category: WorkpilotFileCategory,
  pathParts: Array<string | number>,
  filename: string,
  spacesKeyOverride?: string | null,
): Promise<LoadedStoredFile | null> {
  const storedFilename = cleanStoredFilename(filename);
  const defaultKey = workpilotFileKey(category, pathParts, storedFilename);
  const keys = Array.from(
    new Set([spacesKeyOverride?.trim() || null, defaultKey].filter((k): k is string => Boolean(k))),
  );
  for (const key of keys) {
    const fromSpaces = await getSpacesBuffer(key);
    if (fromSpaces) return { buffer: fromSpaces, size: fromSpaces.length, spacesKey: key, from: 'spaces' };
  }

  const local = await findLocalWorkpilotFile(category, pathParts, storedFilename);
  if (local) return { fullPath: local.fullPath, size: local.size, spacesKey: defaultKey, from: 'local' };

  const flatLocal = await findLocalWorkpilotFile(category, [], storedFilename);
  if (flatLocal) return { fullPath: flatLocal.fullPath, size: flatLocal.size, spacesKey: defaultKey, from: 'local' };

  return null;
}

export async function workpilotFileExists(
  category: WorkpilotFileCategory,
  pathParts: Array<string | number>,
  filename: string,
): Promise<boolean> {
  const key = workpilotFileKey(category, pathParts, filename);
  if (await spacesObjectExists(key)) return true;
  return (await findLocalWorkpilotFile(category, pathParts, filename)) != null;
}

export async function sendWorkpilotFile(
  res: Response,
  file: LoadedStoredFile,
  contentType: string,
  opts: { disposition?: string; cacheControl?: string } = {},
): Promise<void> {
  res.setHeader('Content-Type', contentType || 'application/octet-stream');
  if (opts.disposition) res.setHeader('Content-Disposition', opts.disposition);
  if (opts.cacheControl) res.setHeader('Cache-Control', opts.cacheControl);
  res.setHeader('Content-Length', String(file.size));
  if (file.buffer) {
    res.send(file.buffer);
    return;
  }
  if (!file.fullPath) {
    res.status(404).json({ message: 'File not found' });
    return;
  }
  createReadStream(file.fullPath).pipe(res);
}

export async function sendWorkpilotFileWithRange(
  res: Response,
  file: LoadedStoredFile,
  contentType: string,
  rangeRaw: unknown,
  opts: { cacheControl?: string } = {},
): Promise<void> {
  res.setHeader('Content-Type', contentType || 'application/octet-stream');
  if (opts.cacheControl) res.setHeader('Cache-Control', opts.cacheControl);
  res.setHeader('Accept-Ranges', 'bytes');

  if (typeof rangeRaw === 'string') {
    const m = /^bytes=(.+)$/i.exec(rangeRaw.trim());
    if (m) {
      const spec = m[1].trim();
      let start = 0;
      let end = file.size - 1;
      let parsed = false;
      if (spec.startsWith('-')) {
        const suffix = parseInt(spec.slice(1), 10);
        if (Number.isFinite(suffix) && suffix > 0) {
          start = Math.max(0, file.size - suffix);
          end = file.size - 1;
          parsed = true;
        }
      } else {
        const dash = spec.indexOf('-');
        if (dash >= 0) {
          const a = spec.slice(0, dash);
          const b = spec.slice(dash + 1);
          start = a === '' ? 0 : parseInt(a, 10);
          end = b === '' ? file.size - 1 : parseInt(b, 10);
          if (!Number.isFinite(start) || start < 0) start = 0;
          if (!Number.isFinite(end)) end = file.size - 1;
          parsed = true;
        }
      }
      if (parsed) {
        if (start >= file.size || end < start) {
          res.status(416);
          res.setHeader('Content-Range', `bytes */${file.size}`);
          res.end();
          return;
        }
        if (end >= file.size) end = file.size - 1;
        const chunkSize = end - start + 1;
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${file.size}`);
        res.setHeader('Content-Length', String(chunkSize));
        if (file.buffer) {
          res.send(file.buffer.subarray(start, end + 1));
          return;
        }
        if (file.fullPath) {
          createReadStream(file.fullPath, { start, end }).pipe(res);
          return;
        }
      }
    }
  }

  return sendWorkpilotFile(res, file, contentType, opts);
}

