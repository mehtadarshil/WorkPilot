/** Stored in site_report_templates.definition (JSONB) */
export type SiteReportFieldType =
  | 'text'
  | 'textarea'
  | 'date'
  | 'yes_no_na'
  | 'pass_fail'
  | 'static_text'
  | 'image'
  | 'signature'
  | 'select';

export type SiteReportTemplateField = {
  id: string;
  label: string;
  type: SiteReportFieldType;
  /** static_text only — shown on form/print, not stored in customer values */
  content?: string;
  rows?: number;
  choices?: string[];
};

export type SiteReportTemplateSection = {
  id: string;
  title: string;
  helper_text?: string;
  fields: SiteReportTemplateField[];
  /** Allow photo attachments under this section (stored in report document.section_images) */
  allow_section_images?: boolean;
  /** When true, this section is shown on the customer report screen but omitted from generated PDFs */
  omit_from_pdf?: boolean;
  /** When true, users can add multiple instances of this section (e.g. one card per fire door). */
  repeatable?: boolean;
  /** Singular label for each instance card, e.g. "Door". */
  repeat_label?: string;
  /** Label for the add button, e.g. "Add door". */
  add_label?: string;
};

export type SiteReportRepeatableInstance = {
  id: string;
  values: Record<string, string>;
};

export type SiteReportTemplateFooter = {
  title?: string;
  fields: SiteReportTemplateField[];
  allow_section_images?: boolean;
};

export type SiteReportTemplateDefinition = {
  version: 1;
  /** Default report title when customer report title is empty */
  report_title_default?: string;
  sections: SiteReportTemplateSection[];
  footer?: SiteReportTemplateFooter;
};

export type TemplateSiteReportDocument = {
  mode: 'template_v1';
  template_id: number;
  values: Record<string, string>;
  section_images?: Record<string, SiteReportSectionImageRow[]>;
  /** Images keyed by template field id (e.g. photo fields, signatures) */
  field_images?: Record<string, SiteReportSectionImageRow[]>;
  /** Repeatable section instances keyed by section id. */
  repeatable_values?: Record<string, SiteReportRepeatableInstance[]>;
};

/** Scoped field-image key for a repeatable section instance field. */
export function scopedRepeatableFieldKey(sectionId: string, instanceId: string, fieldId: string): string {
  return `repeat:${sectionId}:${instanceId}:${fieldId}`;
}

export type SiteReportSectionImageRow = {
  id: string;
  image_id: number;
  description: string;
  note: string;
};

export const SITE_REPORT_FIELD_TYPES: SiteReportFieldType[] = [
  'text',
  'textarea',
  'date',
  'yes_no_na',
  'pass_fail',
  'static_text',
  'image',
  'signature',
  'select',
];

export const YES_NO_NA_VALUES = ['yes', 'no', 'na', 'not_determined'] as const;
export type YesNoNaValue = (typeof YES_NO_NA_VALUES)[number] | '';
