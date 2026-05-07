import type { SiteReportSectionImageRow, TemplateSiteReportDocument } from './types';

function normalizeImageRow(raw: unknown, index: number): SiteReportSectionImageRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim() : `img_${index}`;
  const image_id = typeof o.image_id === 'number' && Number.isFinite(o.image_id) ? Math.trunc(o.image_id) : NaN;
  if (!Number.isFinite(image_id)) return null;
  return {
    id,
    image_id,
    description: typeof o.description === 'string' ? o.description.slice(0, 2000) : '',
    note: typeof o.note === 'string' ? o.note.slice(0, 4000) : '',
  };
}

function normalizeFieldImagesMap(raw: unknown): Record<string, SiteReportSectionImageRow[]> {
  const field_images: Record<string, SiteReportSectionImageRow[]> = {};
  if (!raw || typeof raw !== 'object') return field_images;
  for (const [fk, arr] of Object.entries(raw as Record<string, unknown>)) {
    const fieldKey = fk.slice(0, 120);
    if (!Array.isArray(arr)) continue;
    const rows: SiteReportSectionImageRow[] = [];
    let i = 0;
    for (const item of arr) {
      const nr = normalizeImageRow(item, i++);
      if (nr) rows.push(nr);
    }
    field_images[fieldKey] = rows;
  }
  return field_images;
}

export function normalizeTemplateSiteReportDocument(raw: unknown, templateId: number): TemplateSiteReportDocument {
  const base: TemplateSiteReportDocument = {
    mode: 'template_v1',
    template_id: templateId,
    values: {},
    section_images: {},
    field_images: {},
  };
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Record<string, unknown>;
  if (o.mode === 'template_v1') {
    const tid = typeof o.template_id === 'number' && Number.isFinite(o.template_id) ? Math.trunc(o.template_id) : templateId;
    const values: Record<string, string> = {};
    if (o.values && typeof o.values === 'object') {
      for (const [k, v] of Object.entries(o.values as Record<string, unknown>)) {
        const key = k.slice(0, 200);
        if (typeof v === 'string') values[key] = v.slice(0, 32000);
        else if (v != null && typeof v !== 'object') values[key] = String(v).slice(0, 32000);
      }
    }
    const section_images: Record<string, SiteReportSectionImageRow[]> = {};
    if (o.section_images && typeof o.section_images === 'object') {
      for (const [sk, arr] of Object.entries(o.section_images as Record<string, unknown>)) {
        const sectionKey = sk.slice(0, 120);
        if (!Array.isArray(arr)) continue;
        const rows: SiteReportSectionImageRow[] = [];
        let i = 0;
        for (const item of arr) {
          const nr = normalizeImageRow(item, i++);
          if (nr) rows.push(nr);
        }
        section_images[sectionKey] = rows;
      }
    }
    const field_images = o.field_images && typeof o.field_images === 'object' ? normalizeFieldImagesMap(o.field_images) : {};
    return { mode: 'template_v1', template_id: tid, values, section_images, field_images };
  }
  return base;
}

export function collectTemplateDocumentImageIds(doc: TemplateSiteReportDocument): number[] {
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
