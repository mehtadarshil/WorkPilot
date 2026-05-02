import { getBlob } from '../../apiClient';

export type FileAccess = 'inline' | 'bearer' | 'public';

export interface JobManifestFile {
  id: string;
  source: string;
  source_detail: string;
  label: string;
  kind: 'image' | 'video' | 'pdf' | 'signature' | 'other';
  content_type: string | null;
  byte_size: number | null;
  created_at: string | null;
  access: FileAccess;
  href: string;
  too_large_for_inline?: boolean;
}

export interface JobFilesManifestResponse {
  files: JobManifestFile[];
}

/** Payload for email send / preset rows in composers */
export type ComposerPresetAttachment = {
  filename: string;
  content_base64: string;
  content_type: string;
};

export const MAX_EMAIL_ATTACH_BYTES = 8 * 1024 * 1024;
export const MAX_EMAIL_ATTACH_TOTAL_BYTES = 10 * 1024 * 1024;

export function browserPublicUrl(href: string): string {
  if (href.startsWith('http://') || href.startsWith('https://')) return href;
  if (href.startsWith('/api/')) return href;
  if (href.startsWith('/public/')) return `/api${href}`;
  return href;
}

export function canAttachJobFileToEmail(f: JobManifestFile): boolean {
  if (f.access === 'inline' && !f.href) return false;
  return true;
}

export function approxBytesFromBase64(b64: string): number {
  const len = b64.length;
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((len * 3) / 4) - padding);
}

export function makePresetAttachmentKey(prefix: string, filename: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}-${filename.replace(/[/\\]/g, '_')}`;
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = r.result as string;
      const i = s.indexOf(',');
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function manifestFileToBlob(f: JobManifestFile, token: string): Promise<Blob> {
  if (f.access === 'inline' && f.href.startsWith('data:')) {
    const res = await fetch(f.href);
    return res.blob();
  }
  if (f.access === 'public') {
    const u = browserPublicUrl(f.href);
    const res = await fetch(u);
    if (!res.ok) throw new Error(`Could not load “${f.label}”.`);
    return res.blob();
  }
  if (f.access === 'bearer') {
    if (f.href.startsWith('http')) {
      const res = await fetch(f.href, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Could not load “${f.label}”.`);
      return res.blob();
    }
    return getBlob(f.href, token);
  }
  throw new Error(`“${f.label}” cannot be attached from this list.`);
}

export async function jobManifestFileToEmailAttachment(
  f: JobManifestFile,
  token: string,
): Promise<ComposerPresetAttachment> {
  if (f.byte_size != null && f.byte_size > MAX_EMAIL_ATTACH_BYTES) {
    throw new Error(`“${f.label}” is over 8 MB and cannot be attached.`);
  }
  const blob = await manifestFileToBlob(f, token);
  if (blob.size > MAX_EMAIL_ATTACH_BYTES) {
    throw new Error(`“${f.label}” is over 8 MB and cannot be attached.`);
  }
  const content_base64 = await blobToBase64(blob);
  const content_type = f.content_type || blob.type || 'application/octet-stream';
  const filename = f.label.replace(/[/\\]/g, '_') || 'attachment';
  return { filename, content_base64, content_type };
}
