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
