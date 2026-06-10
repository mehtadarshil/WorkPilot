import path from 'path';
import { loadWorkpilotFile, sendWorkpilotFile, writeWorkpilotFile, type WorkpilotFileCategory } from './workpilotFileStorage';
import type { Response } from 'express';

export type InlineDataUrl = {
  buffer: Buffer;
  contentType: string;
  extension: string;
};

export function parseInlineDataUrl(value: string): InlineDataUrl | null {
  const m = /^data:([a-z0-9.+/-]+);base64,([\s\S]+)$/i.exec(value.trim());
  if (!m) return null;
  const contentType = m[1].toLowerCase();
  let buffer: Buffer;
  try {
    buffer = Buffer.from(m[2], 'base64');
  } catch {
    return null;
  }
  if (buffer.length === 0) return null;
  const extension =
    contentType === 'image/jpeg' || contentType === 'image/jpg'
      ? '.jpg'
      : contentType === 'image/png'
        ? '.png'
        : contentType === 'image/webp'
          ? '.webp'
          : contentType === 'image/gif'
            ? '.gif'
            : contentType === 'application/pdf'
              ? '.pdf'
              : contentType.startsWith('video/')
                ? `.${contentType.split('/')[1].replace(/[^a-z0-9]/g, '') || 'bin'}`
                : '.bin';
  return { buffer, contentType, extension };
}

export function contentTypeFromFilename(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.mov') return 'video/quicktime';
  return 'application/octet-stream';
}

export async function storeInlineDataUrlAsWorkpilotFile(
  category: WorkpilotFileCategory,
  pathParts: Array<string | number>,
  filenameBase: string,
  value: string,
): Promise<{ filePath: string; filename: string } | null> {
  const parsed = parseInlineDataUrl(value);
  if (!parsed) return null;
  const safeBase = filenameBase.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'blob';
  const filename = `${safeBase}_${Date.now()}${parsed.extension}`;
  await writeWorkpilotFile(category, pathParts, filename, parsed.buffer, parsed.contentType);
  return { filename, filePath: filename };
}

export async function sendInlineWorkpilotFile(
  res: Response,
  category: WorkpilotFileCategory,
  pathParts: Array<string | number>,
  filename: string,
): Promise<void> {
  const file = await loadWorkpilotFile(category, pathParts, filename);
  if (!file) {
    res.status(404).json({ message: 'File not found' });
    return;
  }
  await sendWorkpilotFile(res, file, contentTypeFromFilename(filename), { cacheControl: 'private, max-age=3600' });
}

