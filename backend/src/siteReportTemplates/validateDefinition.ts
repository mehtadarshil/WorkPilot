import type { SiteReportTemplateDefinition, SiteReportTemplateField, SiteReportTemplateSection } from './types';
import { SITE_REPORT_FIELD_TYPES } from './types';

function normalizeField(raw: unknown, sectionId: string, index: number): SiteReportTemplateField | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim() : `${sectionId}_field_${index}`;
  const label = typeof o.label === 'string' ? o.label : '';
  const type = typeof o.type === 'string' ? o.type.trim() : '';
  if (!SITE_REPORT_FIELD_TYPES.includes(type as SiteReportTemplateField['type'])) return null;
  const t = type as SiteReportTemplateField['type'];
  const content = typeof o.content === 'string' ? o.content : undefined;
  const rows = typeof o.rows === 'number' && Number.isFinite(o.rows) ? Math.min(40, Math.max(1, Math.round(o.rows))) : undefined;
  return { id, label, type: t, ...(content !== undefined ? { content } : {}), ...(rows !== undefined ? { rows } : {}) };
}

function normalizeSection(raw: unknown, index: number): SiteReportTemplateSection | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim() : `section_${index}`;
  const title = typeof o.title === 'string' ? o.title : 'Section';
  const helper_text = typeof o.helper_text === 'string' ? o.helper_text : undefined;
  const allow_section_images = o.allow_section_images === true;
  const fieldsRaw = Array.isArray(o.fields) ? o.fields : [];
  const fields: SiteReportTemplateField[] = [];
  let fi = 0;
  for (const fr of fieldsRaw) {
    const nf = normalizeField(fr, id, fi++);
    if (nf) fields.push(nf);
  }
  const omit_from_pdf = o.omit_from_pdf === true;
  return {
    id,
    title,
    fields,
    ...(helper_text ? { helper_text } : {}),
    ...(allow_section_images ? { allow_section_images: true } : {}),
    ...(omit_from_pdf ? { omit_from_pdf: true } : {}),
  };
}

export function parseSiteReportTemplateDefinition(raw: unknown): SiteReportTemplateDefinition | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1) return null;
  const sectionsRaw = Array.isArray(o.sections) ? o.sections : [];
  const sections: SiteReportTemplateSection[] = [];
  let si = 0;
  for (const s of sectionsRaw) {
    const ns = normalizeSection(s, si++);
    if (ns && ns.fields.length > 0) sections.push(ns);
  }
  if (sections.length === 0) return null;
  let footer: SiteReportTemplateDefinition['footer'];
  if (o.footer && typeof o.footer === 'object') {
    const f = o.footer as Record<string, unknown>;
    const title = typeof f.title === 'string' ? f.title : undefined;
    const allow_section_images = f.allow_section_images === true;
    const fieldsRaw = Array.isArray(f.fields) ? f.fields : [];
    const ff: SiteReportTemplateField[] = [];
    let fi = 0;
    for (const fr of fieldsRaw) {
      const nf = normalizeField(fr, 'footer', fi++);
      if (nf) ff.push(nf);
    }
    if (ff.length > 0) {
      footer = { fields: ff, ...(title ? { title } : {}), ...(allow_section_images ? { allow_section_images: true } : {}) };
    }
  }
  const report_title_default =
    typeof o.report_title_default === 'string' ? o.report_title_default.trim().slice(0, 500) : undefined;
  return { version: 1, sections, ...(footer ? { footer } : {}), ...(report_title_default ? { report_title_default } : {}) };
}
