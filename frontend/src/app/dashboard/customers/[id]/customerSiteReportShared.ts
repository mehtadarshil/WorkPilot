import type { TemplateSiteReportDocument } from '@/lib/siteReportTemplateTypes';

export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '/api';

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export function pdfFilenameFromTitle(title: string): string {
  const base = title
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 72);
  return `${base || 'site-report'}.pdf`;
}

function isHeicLikeFile(file: File): boolean {
  const t = (file.type || '').toLowerCase();
  if (t === 'image/heic' || t === 'image/heif') return true;
  const n = file.name.toLowerCase();
  return n.endsWith('.heic') || n.endsWith('.heif');
}

/**
 * HEIC uploads are large as base64 JSON and often hit reverse-proxy body limits (413).
 * Convert to JPEG in the browser before upload when possible.
 */
export async function prepareImageFileForUpload(file: File): Promise<File> {
  if (!isHeicLikeFile(file)) return file;
  try {
    const { default: heic2any } = await import('heic2any');
    const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.88 });
    const blob = Array.isArray(out) ? out[0] : out;
    const base = file.name.replace(/\.[^.]+$/i, '') || 'photo';
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  } catch (e) {
    console.error('HEIC conversion in browser failed:', e);
    throw new Error(
      'Could not convert this HEIC photo in the browser. Open it in Photos and export as JPEG, or try a smaller image.',
    );
  }
}

export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = r.result as string;
      const i = s.indexOf(',');
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.onerror = () => reject(new Error('Could not read file'));
    r.readAsDataURL(file);
  });
}

export function collectImageIds(doc: TemplateSiteReportDocument): number[] {
  const s = new Set<number>();
  if (doc.section_images) {
    for (const arr of Object.values(doc.section_images)) {
      for (const im of arr) s.add(im.image_id);
    }
  }
  if (doc.field_images) {
    for (const arr of Object.values(doc.field_images)) {
      for (const im of arr) s.add(im.image_id);
    }
  }
  return [...s];
}
