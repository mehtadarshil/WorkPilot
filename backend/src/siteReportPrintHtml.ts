import path from 'path';
import fs from 'fs/promises';
import type { Pool } from 'pg';
import { renderHtmlReportToPdf } from './jobClientReportPdf';
import type {
  SiteReportSectionImageRow,
  SiteReportTemplateDefinition,
  SiteReportTemplateField,
  SiteReportTemplateSection,
} from './siteReportTemplates/types';
import type { TemplateSiteReportDocument } from './siteReportTemplates/types';

type SectionImages = NonNullable<TemplateSiteReportDocument['section_images']>;
type FieldImages = NonNullable<TemplateSiteReportDocument['field_images']>;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function nl2br(text: string): string {
  return escapeHtml(text).replace(/\r\n|\r|\n/g, '<br/>');
}

function appOrigin(): string {
  return (process.env.PUBLIC_APP_URL || process.env.APP_ORIGIN || '').replace(/\/+$/, '');
}

function resolveLogoHref(href: string | null | undefined): string | null {
  if (!href || !String(href).trim()) return null;
  const t = String(href).trim();
  if (t.startsWith('data:') || t.startsWith('http://') || t.startsWith('https://')) return t;
  if (t.startsWith('//')) return `https:${t}`;
  const origin = appOrigin();
  if (t.startsWith('/') && origin) return `${origin}${t}`;
  return t;
}

function yesNoLabel(raw: string): string {
  const m: Record<string, string> = {
    yes: 'Yes',
    no: 'No',
    na: 'N/A',
    not_determined: 'Not determined',
  };
  return m[raw] ?? raw;
}

function formatFieldValue(field: SiteReportTemplateField, value: string): string {
  if (field.type === 'yes_no_na') return value ? yesNoLabel(value) : '—';
  if (field.type === 'date') return value ? escapeHtml(value) : '—';
  if (field.type === 'textarea') return value ? nl2br(value) : '—';
  if (field.type === 'text') return value ? escapeHtml(value) : '—';
  return '';
}

function getCustomerSiteReportImagesRootDir(): string {
  const raw = process.env.CUSTOMER_SITE_REPORT_IMAGES_DIR?.trim();
  return raw ? path.resolve(raw) : path.resolve(process.cwd(), 'data', 'customer-site-report-images');
}

async function loadImageDataUrlMap(
  pool: Pool,
  customerId: number,
  reportId: number,
  imageIds: number[],
): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (imageIds.length === 0) return map;
  const rows = await pool.query<{ id: number; stored_filename: string; content_type: string | null }>(
    `SELECT id, stored_filename, content_type FROM customer_site_report_images WHERE report_id = $1 AND id = ANY($2::int[])`,
    [reportId, imageIds],
  );
  const root = getCustomerSiteReportImagesRootDir();
  for (const r of rows.rows) {
    const full = path.join(root, String(customerId), String(reportId), r.stored_filename);
    try {
      const buf = await fs.readFile(full);
      const ct = (r.content_type || 'image/jpeg').split(';')[0].trim() || 'image/jpeg';
      map.set(Number(r.id), `data:${ct};base64,${buf.toString('base64')}`);
    } catch {
      /* skip missing file */
    }
  }
  return map;
}

function collectAllImageIds(doc: TemplateSiteReportDocument): number[] {
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

function imageRowHasUserText(im: SiteReportSectionImageRow): boolean {
  return !!(String(im.description || '').trim() || String(im.note || '').trim());
}

/** When every image in a group has no caption/note, lay them out in a row for PDF/print. */
function renderImageGalleryHtml(rows: SiteReportSectionImageRow[], imageMap: Map<number, string>): string {
  const withSrc: SiteReportSectionImageRow[] = [];
  for (const im of rows) {
    if (imageMap.get(im.image_id)) withSrc.push(im);
  }
  if (withSrc.length === 0) return '';
  const anyText = withSrc.some(imageRowHasUserText);
  const useRow = !anyText && withSrc.length >= 2;
  const parts: string[] = [`<div class="images${useRow ? ' images--row' : ''}">`];
  for (const im of withSrc) {
    const src = imageMap.get(im.image_id)!;
    const cap = String(im.description || '').trim();
    const note = String(im.note || '').trim();
    const capHtml = cap ? `<div class="imgcap">${escapeHtml(cap)}</div>` : '';
    const noteHtml = note ? `<div class="imgnote">${nl2br(im.note)}</div>` : '';
    parts.push(`<div class="imgwrap"><img src=${JSON.stringify(src)} alt="" />${capHtml}${noteHtml}</div>`);
  }
  parts.push('</div>');
  return parts.join('');
}

function renderFieldImagesHtml(
  fieldId: string,
  fieldImages: FieldImages | undefined,
  imageMap: Map<number, string>,
): string {
  const rows = fieldImages?.[fieldId];
  if (!rows || rows.length === 0) return '';
  return renderImageGalleryHtml(rows, imageMap);
}

function fieldHasUserEntry(
  field: SiteReportTemplateField,
  values: Record<string, string>,
  overrides: Record<string, string>,
  fieldImages: FieldImages | undefined,
): boolean {
  if (field.type === 'static_text') return false;
  if (field.type === 'image' || field.type === 'signature') {
    const rows = fieldImages?.[field.id];
    return !!(rows && rows.length > 0);
  }
  const override = overrides[field.id];
  const rawVal = override !== undefined ? override : (values[field.id] ?? '');
  if (field.type === 'yes_no_na') return rawVal.trim().length > 0;
  if (field.type === 'text' || field.type === 'textarea' || field.type === 'date') return rawVal.trim().length > 0;
  return false;
}

function sectionHasAnyUserContent(
  sec: SiteReportTemplateSection,
  values: Record<string, string>,
  overrides: Record<string, string>,
  fieldImages: FieldImages | undefined,
  sectionImages: SectionImages | undefined,
): boolean {
  for (const f of sec.fields) {
    if (fieldHasUserEntry(f, values, overrides, fieldImages)) return true;
  }
  if (sec.allow_section_images) {
    const rows = sectionImages?.[sec.id];
    if (rows && rows.length > 0) return true;
  }
  return false;
}

/** Footer may contain mandatory static certificate text — print it even when no signature/name yet. */
function footerHasRenderableContent(
  footer: NonNullable<SiteReportTemplateDefinition['footer']>,
  values: Record<string, string>,
  overrides: Record<string, string>,
  fieldImages: FieldImages | undefined,
  sectionImages: SectionImages | undefined,
): boolean {
  for (const f of footer.fields) {
    if (f.type === 'static_text' && (f.content || '').trim()) return true;
    if (fieldHasUserEntry(f, values, overrides, fieldImages)) return true;
  }
  if (footer.allow_section_images) {
    const rows = sectionImages?.footer;
    if (rows && rows.length > 0) return true;
  }
  return false;
}

function renderFieldBlock(
  field: SiteReportTemplateField,
  values: Record<string, string>,
  overrides: Record<string, string>,
  fieldImages: FieldImages | undefined,
  imageMap: Map<number, string>,
): string {
  if (field.type === 'static_text') {
    return `<div class="static">${field.content ? nl2br(field.content) : ''}</div>`;
  }
  const labelHtml = field.label ? `<div class="label">${escapeHtml(field.label)}</div>` : '';
  if (field.type === 'image' || field.type === 'signature') {
    const imgs = renderFieldImagesHtml(field.id, fieldImages, imageMap);
    const body = imgs || '<div class="value">—</div>';
    return `<div class="field">${labelHtml}${body}</div>`;
  }
  const override = overrides[field.id];
  const rawVal = override !== undefined ? override : (values[field.id] ?? '');
  if (field.type === 'yes_no_na' || field.type === 'text' || field.type === 'date' || field.type === 'textarea') {
    const body = formatFieldValue(field, rawVal);
    return `<div class="field">${labelHtml}<div class="value">${body}</div></div>`;
  }
  return '';
}

function renderSectionImagesHtml(
  sectionKey: string,
  sectionImages: SectionImages | undefined,
  imageMap: Map<number, string>,
): string {
  const rows = sectionImages?.[sectionKey];
  if (!rows || rows.length === 0) return '';
  return renderImageGalleryHtml(rows, imageMap);
}

export function buildSiteReportPrintHtml(input: {
  accent: string;
  companyName: string;
  logoUrl: string | null;
  reportTitle: string;
  clientLine: string;
  siteLine: string;
  certificateNumber: string;
  definition: SiteReportTemplateDefinition;
  document: TemplateSiteReportDocument;
  imageMap: Map<number, string>;
  headerOverrides: Record<string, string>;
}): string {
  const { accent, companyName, logoUrl, reportTitle, clientLine, siteLine, certificateNumber, definition, document, imageMap, headerOverrides } = input;
  const values = document.values || {};
  const sectionImages = document.section_images || {};
  const fieldImages = document.field_images || {};

  const logoBlock = logoUrl
    ? `<img class="logo" src=${JSON.stringify(logoUrl)} alt="" crossorigin="anonymous" />`
    : `<div class="logo-fallback">${escapeHtml(companyName.slice(0, 2).toUpperCase())}</div>`;

  const certLine = certificateNumber.trim()
    ? `<p class="cert-ref">Certificate no. <strong>${escapeHtml(certificateNumber.trim())}</strong></p>`
    : '';

  const sectionsHtml: string[] = [];
  for (const sec of definition.sections) {
    if (sec.omit_from_pdf) continue;
    if (!sectionHasAnyUserContent(sec, values, headerOverrides, fieldImages, sectionImages)) continue;
    const fieldsHtml: string[] = [];
    for (const f of sec.fields) {
      fieldsHtml.push(renderFieldBlock(f, values, headerOverrides, fieldImages, imageMap));
    }
    const imgs =
      sec.allow_section_images ? renderSectionImagesHtml(sec.id, sectionImages, imageMap) : '';
    sectionsHtml.push(
      `<section class="sec"><h2 class="sec-title">${escapeHtml(sec.title)}</h2>${sec.helper_text ? `<p class="helper">${nl2br(sec.helper_text)}</p>` : ''}<div class="fields">${fieldsHtml.join('')}</div>${imgs}</section>`,
    );
  }

  let footerHtml = '';
  if (definition.footer && definition.footer.fields.length > 0) {
    const ft = definition.footer;
    if (footerHasRenderableContent(ft, values, headerOverrides, fieldImages, sectionImages)) {
      const ff = ft.fields.map((f) => renderFieldBlock(f, values, headerOverrides, fieldImages, imageMap)).join('');
      const fImgs = ft.allow_section_images ? renderSectionImagesHtml('footer', sectionImages, imageMap) : '';
      footerHtml = `<section class="sec footer"><h2 class="sec-title">${escapeHtml(ft.title || 'Footer')}</h2><div class="fields">${ff}</div>${fImgs}</section>`;
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(reportTitle)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #0f172a; font-size: 10.5pt; line-height: 1.45; margin: 0; padding: 14mm 16mm; background: #fff; }
    .accent { color: ${escapeHtml(accent)}; }
    .top { display: flex; align-items: flex-start; justify-content: flex-start; gap: 16px; padding-bottom: 14px; margin-bottom: 18px; border-bottom: 3px solid ${escapeHtml(accent)}; }
    .brand { display: flex; align-items: center; gap: 14px; min-width: 0; }
    .logo { max-height: 52px; max-width: 220px; object-fit: contain; }
    .logo-fallback { width: 52px; height: 52px; border-radius: 8px; background: ${escapeHtml(accent)}; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14pt; flex-shrink: 0; }
    .company { font-size: 16pt; font-weight: 800; color: #0f172a; letter-spacing: -0.02em; }
    h1.doc-title { font-size: 18pt; font-weight: 800; margin: 0 0 8px; color: #0f172a; letter-spacing: -0.02em; }
    p.cert-ref { font-size: 10pt; color: #475569; margin: 0 0 14px; }
    .keyline { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px; margin-bottom: 20px; padding: 12px 14px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 10pt; }
    .keyline .k { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; margin-bottom: 4px; }
    .keyline .v { font-weight: 600; color: #0f172a; white-space: pre-wrap; }
    section.sec { margin-bottom: 22px; page-break-inside: avoid; }
    h2.sec-title { font-size: 11.5pt; font-weight: 800; margin: 0 0 10px; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
    p.helper { margin: 0 0 12px; font-size: 9.5pt; color: #475569; }
    .fields { display: flex; flex-direction: column; gap: 12px; }
    .field .label { font-size: 9pt; font-weight: 700; color: #334155; margin-bottom: 4px; }
    .field .value { font-size: 10pt; color: #0f172a; }
    .static { font-size: 9.5pt; color: #334155; padding: 10px 12px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; }
    .images { display: flex; flex-direction: column; gap: 12px; margin-top: 12px; }
    .images--row { flex-direction: row; flex-wrap: wrap; align-items: flex-start; gap: 10px; }
    .images--row .imgwrap { flex: 1 1 45%; min-width: 0; max-width: calc(50% - 5px); }
    .images--row .imgwrap img { width: 100%; }
    .imgwrap { break-inside: avoid; }
    .imgwrap img { max-width: 100%; max-height: 220px; object-fit: contain; border: 1px solid #e2e8f0; border-radius: 6px; }
    .imgcap { font-size: 9pt; font-weight: 600; margin-top: 6px; color: #334155; }
    .imgnote { font-size: 8.5pt; color: #64748b; margin-top: 2px; }
    @page { margin: 12mm; size: A4; }
  </style>
</head>
<body>
  <div class="top">
    <div class="brand">
      ${logoBlock}
      <div class="company">${escapeHtml(companyName)}</div>
    </div>
  </div>
  <h1 class="doc-title">${escapeHtml(reportTitle)}</h1>
  ${certLine}
  <div class="keyline">
    <div><div class="k">Client</div><div class="v">${nl2br(clientLine)}</div></div>
    <div><div class="k">Property / site</div><div class="v">${nl2br(siteLine)}</div></div>
  </div>
  ${sectionsHtml.join('')}
  ${footerHtml}
</body>
</html>`;
}

/** Assign a stable certificate reference when missing; returns the value stored (or generated fallback). */
export async function ensureCustomerSiteReportCertificateNumber(pool: Pool, reportId: number): Promise<string> {
  await pool.query(
    `UPDATE customer_site_reports SET certificate_number = 'WP-FRA-' || id::text
     WHERE id = $1 AND (certificate_number IS NULL OR TRIM(certificate_number) = '')`,
    [reportId],
  );
  const r = await pool.query<{ certificate_number: string | null }>(
    'SELECT certificate_number FROM customer_site_reports WHERE id = $1',
    [reportId],
  );
  const s = String(r.rows[0]?.certificate_number ?? '').trim();
  return s || `WP-FRA-${reportId}`;
}

/** Build the same HTML used for PDFs, without running headless Chrome (for browser print / client-side PDF). */
export async function getCustomerSiteReportPrintHtml(
  pool: Pool,
  input: {
    customerId: number;
    reportId: number;
    ownerUserId: number;
  },
): Promise<{ html: string; filenameBase: string }> {
  const { customerId, reportId, ownerUserId } = input;

  const rep = await pool.query<{
    id: number;
    work_address_id: number | null;
    report_title: string | null;
    document: unknown;
  }>('SELECT id, work_address_id, report_title, document FROM customer_site_reports WHERE id = $1 AND customer_id = $2', [
    reportId,
    customerId,
  ]);
  if ((rep.rowCount ?? 0) === 0) throw new Error('REPORT_NOT_FOUND');

  const row = rep.rows[0];
  const certificateNumber = await ensureCustomerSiteReportCertificateNumber(pool, row.id);
  const doc = row.document as TemplateSiteReportDocument;
  if (!doc || doc.mode !== 'template_v1') throw new Error('INVALID_DOCUMENT');

  const tpl = await pool.query<{ definition: unknown }>(
    'SELECT definition FROM site_report_templates WHERE id = $1 AND created_by = $2',
    [doc.template_id, ownerUserId],
  );
  if ((tpl.rowCount ?? 0) === 0) throw new Error('TEMPLATE_NOT_FOUND');
  const definition = tpl.rows[0].definition as SiteReportTemplateDefinition;
  if (!definition || definition.version !== 1) throw new Error('INVALID_TEMPLATE');
  if (!Array.isArray(definition.sections)) throw new Error('INVALID_TEMPLATE');
  if (definition.footer != null && !Array.isArray(definition.footer.fields)) throw new Error('INVALID_TEMPLATE');

  const inv = await pool.query<{
    company_name: string | null;
    company_logo: string | null;
    invoice_accent_color: string | null;
  }>('SELECT company_name, company_logo, invoice_accent_color FROM invoice_settings WHERE created_by = $1 LIMIT 1', [ownerUserId]);
  const invRow = inv.rows[0];
  const companyName = (invRow?.company_name || 'WorkPilot').trim() || 'WorkPilot';
  const logoUrl = resolveLogoHref(invRow?.company_logo ?? null);
  const accent = (() => {
    const c = typeof invRow?.invoice_accent_color === 'string' ? invRow.invoice_accent_color.trim() : '';
    return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(c) ? c : '#14B8A6';
  })();

  const cust = await pool.query<{
    full_name: string;
    company: string | null;
    address_line_1: string | null;
    address_line_2: string | null;
    address_line_3: string | null;
    town: string | null;
    county: string | null;
    postcode: string | null;
  }>(
    `SELECT full_name, company, address_line_1, address_line_2, address_line_3, town, county, postcode FROM customers WHERE id = $1`,
    [customerId],
  );
  const c = cust.rows[0];
  const co = c?.company?.trim();
  const clientLine = co ? `${c.full_name} (${co})` : (c?.full_name ?? '');

  let siteLine = '';
  if (row.work_address_id != null) {
    const wa = await pool.query<{
      name: string;
      address_line_1: string | null;
      address_line_2: string | null;
      address_line_3: string | null;
      town: string | null;
      county: string | null;
      postcode: string | null;
    }>(
      `SELECT name, address_line_1, address_line_2, address_line_3, town, county, postcode FROM customer_work_addresses WHERE id = $1 AND customer_id = $2`,
      [row.work_address_id, customerId],
    );
    if ((wa.rowCount ?? 0) > 0) {
      const w = wa.rows[0];
      const addr = [w.address_line_1, w.address_line_2, w.address_line_3, w.town, w.county, w.postcode]
        .map((x) => (typeof x === 'string' ? x.trim() : ''))
        .filter(Boolean)
        .join(', ');
      siteLine = [w.name?.trim(), addr].filter(Boolean).join('\n');
    }
  }
  if (!siteLine && c) {
    siteLine = [c.address_line_1, c.address_line_2, c.address_line_3, c.town, c.county, c.postcode]
      .map((x) => (typeof x === 'string' ? x.trim() : ''))
      .filter(Boolean)
      .join(', ');
  }

  const reportTitle =
    (row.report_title && String(row.report_title).trim()) ||
    definition.report_title_default?.trim() ||
    'Report';

  const headerOverrides: Record<string, string> = {
    client_name_display: clientLine,
    property_address_display: siteLine,
  };

  const ids = collectAllImageIds(doc);
  const imageMap = await loadImageDataUrlMap(pool, customerId, reportId, ids);

  const html = buildSiteReportPrintHtml({
    accent,
    companyName,
    logoUrl,
    reportTitle,
    clientLine,
    siteLine,
    certificateNumber,
    definition,
    document: doc,
    imageMap,
    headerOverrides,
  });

  const safe = reportTitle.replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').slice(0, 80) || 'site-report';
  return { html, filenameBase: safe };
}

export async function generateCustomerSiteReportPdfBuffer(
  pool: Pool,
  input: {
    customerId: number;
    reportId: number;
    ownerUserId: number;
  },
): Promise<{ pdf: Buffer; filenameBase: string }> {
  const { html, filenameBase } = await getCustomerSiteReportPrintHtml(pool, input);
  const pdf = await renderHtmlReportToPdf(html);
  return { pdf, filenameBase };
}
