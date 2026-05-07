export type SiteReportFieldType = 'text' | 'textarea' | 'date' | 'yes_no_na' | 'static_text' | 'image' | 'signature';

export type SiteReportTemplateField = {
  id: string;
  label: string;
  type: SiteReportFieldType;
  content?: string;
  rows?: number;
};

export type SiteReportTemplateSection = {
  id: string;
  title: string;
  helper_text?: string;
  fields: SiteReportTemplateField[];
  allow_section_images?: boolean;
  /** Shown on screen only; omitted from PDF (e.g. client lines that duplicate the PDF header) */
  omit_from_pdf?: boolean;
};

export type SiteReportTemplateFooter = {
  title?: string;
  fields: SiteReportTemplateField[];
  allow_section_images?: boolean;
};

export type SiteReportTemplateDefinition = {
  version: 1;
  report_title_default?: string;
  sections: SiteReportTemplateSection[];
  footer?: SiteReportTemplateFooter;
};

export type SiteReportSectionImageRow = {
  id: string;
  image_id: number;
  description: string;
  note: string;
};

export type TemplateSiteReportDocument = {
  mode: 'template_v1';
  template_id: number;
  values: Record<string, string>;
  section_images?: Record<string, SiteReportSectionImageRow[]>;
  field_images?: Record<string, SiteReportSectionImageRow[]>;
};

export const SITE_REPORT_FIELD_TYPE_OPTIONS: { value: SiteReportFieldType; label: string; hint: string }[] = [
  { value: 'text', label: 'Short text', hint: 'Single line answer' },
  { value: 'textarea', label: 'Long text / notes', hint: 'Multiple lines' },
  { value: 'date', label: 'Date', hint: 'Date picker' },
  { value: 'yes_no_na', label: 'Yes / No / N/A', hint: 'Radio choices including Not determined' },
  { value: 'static_text', label: 'Read-only text', hint: 'Instructions or legal wording shown to staff' },
  { value: 'image', label: 'Image (field)', hint: 'Upload one or more photos tied to this question' },
  { value: 'signature', label: 'Signature', hint: 'Sign on screen; stored as an image on the report' },
];

export const YES_NO_NA_OPTIONS: { value: string; label: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'na', label: 'N/A' },
  { value: 'not_determined', label: 'Not determined' },
];

function newKey(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  return `${prefix}_${Date.now().toString(36)}`;
}

export function newTemplateField(partial?: Partial<SiteReportTemplateField>): SiteReportTemplateField {
  return {
    id: newKey('field'),
    label: 'New field',
    type: 'text',
    ...partial,
  };
}

export function newTemplateSection(): SiteReportTemplateSection {
  return {
    id: newKey('section'),
    title: 'New section',
    fields: [newTemplateField({ label: 'Question or label' })],
  };
}

export function emptyFooter(): SiteReportTemplateFooter {
  return { title: 'Certificate / footer', fields: [], allow_section_images: true };
}

/** Safe parse for the settings UI when API returns unknown JSON */
export function coerceSiteReportDefinition(raw: unknown): SiteReportTemplateDefinition {
  const minimal: SiteReportTemplateDefinition = {
    version: 1,
    report_title_default: 'Site report',
    sections: [newTemplateSection()],
  };
  if (!raw || typeof raw !== 'object') return minimal;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1) return minimal;

  const parseField = (x: unknown, idx: number): SiteReportTemplateField | null => {
    if (!x || typeof x !== 'object') return null;
    const f = x as Record<string, unknown>;
    const id = typeof f.id === 'string' && f.id.trim() ? f.id.trim() : `field_${idx}`;
    const label = typeof f.label === 'string' ? f.label : '';
    const t = typeof f.type === 'string' ? f.type : 'text';
    const allowed: SiteReportFieldType[] = ['text', 'textarea', 'date', 'yes_no_na', 'static_text', 'image', 'signature'];
    const type = (allowed.includes(t as SiteReportFieldType) ? t : 'text') as SiteReportFieldType;
    const content = typeof f.content === 'string' ? f.content : undefined;
    const rows = typeof f.rows === 'number' && Number.isFinite(f.rows) ? Math.min(40, Math.max(1, Math.round(f.rows))) : undefined;
    return { id, label, type, ...(content !== undefined ? { content } : {}), ...(rows !== undefined ? { rows } : {}) };
  };

  const parseSection = (x: unknown, idx: number): SiteReportTemplateSection | null => {
    if (!x || typeof x !== 'object') return null;
    const s = x as Record<string, unknown>;
    const id = typeof s.id === 'string' && s.id.trim() ? s.id.trim() : `section_${idx}`;
    const title = typeof s.title === 'string' ? s.title : 'Section';
    const helper_text = typeof s.helper_text === 'string' ? s.helper_text : undefined;
    const allow_section_images = s.allow_section_images === true;
    const omit_from_pdf = s.omit_from_pdf === true;
    const fieldsRaw = Array.isArray(s.fields) ? s.fields : [];
    const fields = fieldsRaw.map(parseField).filter(Boolean) as SiteReportTemplateField[];
    if (fields.length === 0) fields.push(newTemplateField());
    return {
      id,
      title,
      fields,
      ...(helper_text ? { helper_text } : {}),
      ...(allow_section_images ? { allow_section_images: true } : {}),
      ...(omit_from_pdf ? { omit_from_pdf: true } : {}),
    };
  };

  const sectionsRaw = Array.isArray(o.sections) ? o.sections : [];
  let sections = sectionsRaw.map(parseSection).filter(Boolean) as SiteReportTemplateSection[];
  if (sections.length === 0) sections = [newTemplateSection()];

  let footer: SiteReportTemplateDefinition['footer'];
  if (o.footer && typeof o.footer === 'object') {
    const ft = o.footer as Record<string, unknown>;
    const title = typeof ft.title === 'string' ? ft.title : undefined;
    const allow_section_images = ft.allow_section_images === true;
    const fieldsRaw = Array.isArray(ft.fields) ? ft.fields : [];
    const fields = fieldsRaw.map(parseField).filter(Boolean) as SiteReportTemplateField[];
    footer = { fields, ...(title ? { title } : {}), ...(allow_section_images ? { allow_section_images: true } : {}) };
  }

  const report_title_default =
    typeof o.report_title_default === 'string' ? o.report_title_default.trim().slice(0, 500) : undefined;

  return {
    version: 1,
    sections,
    ...(footer ? { footer } : {}),
    ...(report_title_default ? { report_title_default } : {}),
  };
}
