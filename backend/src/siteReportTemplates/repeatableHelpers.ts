import type { SiteReportRepeatableInstance, SiteReportSectionImageRow, SiteReportTemplateField, SiteReportTemplateSection } from './types';
import { scopedRepeatableFieldKey } from './types';

export function coerceRepeatableInstances(raw: unknown): SiteReportRepeatableInstance[] {
  if (!Array.isArray(raw)) return [];
  const out: SiteReportRepeatableInstance[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim().slice(0, 120) : `inst_${i}`;
    const values: Record<string, string> = {};
    if (o.values && typeof o.values === 'object') {
      for (const [k, v] of Object.entries(o.values as Record<string, unknown>)) {
        const key = k.slice(0, 200);
        if (typeof v === 'string') values[key] = v.slice(0, 32000);
        else if (v != null && typeof v !== 'object') values[key] = String(v).slice(0, 32000);
      }
    }
    out.push({ id, values });
  }
  return out;
}

export function repeatableInstanceHasContent(
  sec: SiteReportTemplateSection,
  instance: SiteReportRepeatableInstance,
  fieldImages: Record<string, SiteReportSectionImageRow[]> | undefined,
): boolean {
  for (const f of sec.fields) {
    if (f.type === 'static_text') continue;
    if (f.type === 'image' || f.type === 'signature') {
      const rows = fieldImages?.[scopedRepeatableFieldKey(sec.id, instance.id, f.id)];
      if (rows && rows.length > 0) return true;
      continue;
    }
    const raw = instance.values[f.id] ?? '';
    if (String(raw).trim().length > 0) return true;
  }
  return false;
}

export function repeatableFieldHasEntry(
  field: SiteReportTemplateField,
  instance: SiteReportRepeatableInstance,
  sectionId: string,
  fieldImages: Record<string, SiteReportSectionImageRow[]> | undefined,
): boolean {
  if (field.type === 'static_text') return false;
  if (field.type === 'image' || field.type === 'signature') {
    const rows = fieldImages?.[scopedRepeatableFieldKey(sectionId, instance.id, field.id)];
    return !!(rows && rows.length > 0);
  }
  return String(instance.values[field.id] ?? '').trim().length > 0;
}
