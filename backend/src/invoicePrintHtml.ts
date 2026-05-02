import type { Pool } from 'pg';
import { renderHtmlReportToPdf } from './jobClientReportPdf';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCustomerAddressSingleLine(row: Record<string, unknown>): string {
  const parts = [row.address_line_1, row.address_line_2, row.town, row.county, row.postcode]
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter(Boolean);
  if (parts.length) return parts.join(', ');
  const legacy = typeof row.address === 'string' ? row.address.trim() : '';
  if (legacy) return legacy;
  const city = typeof row.city === 'string' ? row.city.trim() : '';
  const region = typeof row.region === 'string' ? row.region.trim() : '';
  const country = typeof row.country === 'string' ? row.country.trim() : '';
  return [city, region, country].filter(Boolean).join(', ') || '';
}

function workSiteAddressAsSingleLine(stored: string): string {
  return stored
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(', ');
}

function formatWorkAddressSingleLineWithoutName(row: Record<string, unknown>): string {
  const parts: string[] = [];
  const push = (v: unknown) => {
    const t = typeof v === 'string' ? v.trim() : '';
    if (t) parts.push(t);
  };
  push(row.branch_name);
  push(row.company_name);
  push(row.address_line_1);
  push(row.address_line_2);
  push(row.address_line_3);
  const town = typeof row.town === 'string' ? row.town.trim() : '';
  const county = typeof row.county === 'string' ? row.county.trim() : '';
  if (town || county) parts.push([town, county].filter(Boolean).join(', '));
  push(row.postcode);
  return parts.join(', ');
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function formatDateFromDb(d: Date): string {
  try {
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

function parseSafeHexColor(raw: unknown, fallback: string): string {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(s)) return s;
  return fallback;
}

function appOrigin(): string {
  return (process.env.PUBLIC_APP_URL || process.env.APP_ORIGIN || '').replace(/\/+$/, '');
}

/** Resolve logo / asset href for Puppeteer (absolute or data URL). */
function resolveAssetUrl(href: string | null | undefined): string | null {
  if (!href || !String(href).trim()) return null;
  const t = String(href).trim();
  if (t.startsWith('data:') || t.startsWith('http://') || t.startsWith('https://')) return t;
  if (t.startsWith('//')) return `https:${t}`;
  const origin = appOrigin();
  if (t.startsWith('/') && origin) return `${origin}${t}`;
  return t;
}

type LineItem = {
  id: number;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  sort_order: number;
};

function buildInvoiceHtmlDocument(input: {
  accent: string;
  accentEnd: string;
  companyName: string;
  companyAddress: string | null;
  companyPhone: string | null;
  companyEmail: string | null;
  companyWebsite: string | null;
  companyTaxId: string | null;
  logoUrl: string | null;
  defaultLogoUrl: string | null;
  invoiceNumber: string;
  stateLabel: string;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerReferenceDisplay: string | null;
  customerAddrLine: string;
  workSiteName: string | null;
  workSiteAddress: string | null;
  invoiceCustomAddress: string | null;
  jobId: number | null;
  invoiceDateStr: string;
  dueDateStr: string;
  description: string | null;
  lineItems: LineItem[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  totalPaid: number;
  balanceDue: number;
  currency: string;
  taxLabel: string;
  notes: string | null;
  terms: string | null;
  paymentTerms: string | null;
  bankDetails: string | null;
  footerText: string | null;
}): string {
  const {
    accent,
    accentEnd,
    companyName,
    companyAddress,
    companyPhone,
    companyEmail,
    companyWebsite,
    companyTaxId,
    logoUrl,
    defaultLogoUrl,
    invoiceNumber,
    stateLabel,
    customerName,
    customerEmail,
    customerPhone,
    customerReferenceDisplay,
    customerAddrLine,
    workSiteName,
    workSiteAddress,
    invoiceCustomAddress,
    jobId,
    invoiceDateStr,
    dueDateStr,
    description,
    lineItems,
    subtotal,
    taxAmount,
    totalAmount,
    totalPaid,
    balanceDue,
    currency,
    taxLabel,
    notes,
    terms,
    paymentTerms,
    bankDetails,
    footerText,
  } = input;

  const taxPctLabel =
    subtotal > 0 ? `${escapeHtml(taxLabel)} (${((taxAmount / subtotal) * 100).toFixed(1)}%)` : escapeHtml(taxLabel);

  const logoBlock =
    logoUrl != null
      ? `<img src="${escapeHtml(logoUrl)}" alt="" class="logo-img" />`
      : defaultLogoUrl != null
        ? `<img src="${escapeHtml(defaultLogoUrl)}" alt="" class="logo-img" />`
        : `<div class="logo-fallback">${escapeHtml(companyName.slice(0, 2).toUpperCase())}</div>`;

  const companyLines: string[] = [];
  if (companyAddress) companyLines.push(`<p class="co-line">${escapeHtml(companyAddress)}</p>`);
  if (companyWebsite) companyLines.push(`<p class="co-line">${escapeHtml(companyWebsite)}</p>`);
  if (companyTaxId) companyLines.push(`<p class="co-line">Tax ID: ${escapeHtml(companyTaxId)}</p>`);
  if (companyPhone) companyLines.push(`<p class="co-line">${escapeHtml(companyPhone)}</p>`);
  if (companyEmail) companyLines.push(`<p class="co-line">${escapeHtml(companyEmail)}</p>`);

  const workSiteBlock =
    workSiteName?.trim() || workSiteAddress?.trim()
      ? `<div class="card">
      <p class="card-k">Work / site address</p>
      ${workSiteName?.trim() ? `<p class="ws-name">${escapeHtml(workSiteName.trim())}</p>` : ''}
      ${workSiteAddress?.trim() ? `<p class="ws-addr">${escapeHtml(workSiteAddress.trim())}</p>` : ''}
    </div>`
      : '';

  const customBillingBlock =
    invoiceCustomAddress?.trim() && !workSiteName?.trim() && !workSiteAddress?.trim()
      ? `<div class="card">
      <p class="card-k">Billing address</p>
      <p class="billing-pre">${escapeHtml(invoiceCustomAddress.trim())}</p>
    </div>`
      : '';

  const descriptionBlock = description?.trim()
    ? `<div class="desc-block">
      <p class="desc-k">Description</p>
      <p class="desc-body">${escapeHtml(description.trim()).replace(/\n/g, '<br/>')}</p>
    </div>`
    : '';

  const tableRows = lineItems
    .map(
      (item, i) => `
    <tr class="${i % 2 === 1 ? 'tr-alt' : ''}">
      <td class="td-desc">${escapeHtml(item.description)}</td>
      <td class="td-num">${escapeHtml(String(item.quantity))}</td>
      <td class="td-num">${escapeHtml(formatMoney(item.unit_price, currency))}</td>
      <td class="td-num td-amt">${escapeHtml(formatMoney(item.amount, currency))}</td>
    </tr>`,
    )
    .join('');

  const notesBlock = notes?.trim()
    ? `<div class="notes-box">
      <p class="card-k">Notes</p>
      <p class="notes-body">${escapeHtml(notes.trim()).replace(/\n/g, '<br/>')}</p>
    </div>`
    : '';

  const termsBlock = terms?.trim()
    ? `<div class="terms-box">
      <p class="card-k">Terms &amp; conditions</p>
      <p class="terms-body">${escapeHtml(terms.trim()).replace(/\n/g, '<br/>')}</p>
    </div>`
    : '';

  const payBankInner = [
    paymentTerms?.trim()
      ? `<div class="terms-box"><p class="card-k">Payment terms</p><p class="terms-body">${escapeHtml(paymentTerms.trim()).replace(/\n/g, '<br/>')}</p></div>`
      : '',
    bankDetails?.trim()
      ? `<div class="terms-box"><p class="card-k">Bank details</p><p class="terms-body">${escapeHtml(bankDetails.trim()).replace(/\n/g, '<br/>')}</p></div>`
      : '',
  ].join('');
  const payBankBlock = payBankInner.trim() ? `<div class="pay-grid">${payBankInner}</div>` : '';

  const footerBlock = footerText?.trim() ? `<p class="footer-t">${escapeHtml(footerText.trim())}</p>` : '';

  const jobBlock =
    jobId != null
      ? `<div class="meta-item">
      <p class="meta-k">Related job</p>
      <p class="meta-v">#${String(jobId).padStart(4, '0')}</p>
    </div>`
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(invoiceNumber)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background: #fff; color: #0f172a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .invoice-print { max-width: 900px; margin: 0 auto; overflow: hidden; border-radius: 16px; border: 1px solid #e2e8f0; background: #fff; box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.08); }
    .gradient-bar { height: 4px; width: 100%; background: linear-gradient(to right, ${accent}, ${accentEnd}); }
    .head { position: relative; border-bottom: 1px solid #e2e8f0; background: #fff; padding: 40px 32px; }
    .head-inner { display: flex; flex-direction: row; align-items: flex-start; justify-content: space-between; gap: 24px; flex-wrap: wrap; }
    .brand { display: flex; align-items: center; gap: 16px; }
    .logo-wrap { position: relative; width: 56px; height: 56px; flex-shrink: 0; overflow: hidden; border-radius: 12px; border: 1px solid #f1f5f9; box-shadow: 0 1px 2px rgb(0 0 0 / 0.05); }
    .logo-img { width: 100%; height: 100%; object-fit: contain; display: block; }
    .logo-fallback { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; color: #64748b; background: #f8fafc; }
    .co-name { font-size: 24px; font-weight: 700; letter-spacing: -0.025em; color: #0f172a; margin: 0; }
    .co-sub { margin: 4px 0 0; font-size: 14px; font-weight: 500; color: #64748b; }
    .co-meta { margin-top: 8px; }
    .co-line { margin: 2px 0; font-size: 12px; color: #475569; line-height: 1.35; }
    .inv-right { text-align: right; }
    .inv-num { font-size: 24px; font-weight: 700; letter-spacing: -0.025em; color: ${accent}; margin: 0; }
    .state-pill { margin-top: 8px; display: inline-block; border-radius: 6px; background: #f1f5f9; padding: 4px 12px; font-size: 12px; font-weight: 600; color: #334155; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; padding: 32px; }
    @media (max-width: 640px) { .grid-2 { grid-template-columns: 1fr; } }
    .card { border-radius: 8px; border: 1px solid #f1f5f9; background: rgba(248, 250, 252, 0.5); padding: 20px; margin-bottom: 16px; }
    .card-k { margin: 0 0 8px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; }
    .cust-name { margin: 0; font-size: 16px; font-weight: 600; color: #0f172a; }
    .cust-line { margin: 4px 0 0; font-size: 14px; color: #475569; }
    .ws-name { margin: 0; font-size: 16px; font-weight: 700; color: #0f172a; }
    .ws-addr { margin: 4px 0 0; font-size: 14px; line-height: 1.5; color: #475569; }
    .billing-pre { margin: 4px 0 0; font-size: 14px; line-height: 1.5; color: #475569; white-space: pre-wrap; }
    .meta-row { display: flex; flex-wrap: wrap; gap: 24px 32px; justify-content: flex-end; }
    .meta-item {}
    .meta-k { margin: 0; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; }
    .meta-v { margin: 4px 0 0; font-size: 14px; font-weight: 500; color: #0f172a; }
    .desc-block { padding: 16px 32px 0; }
    .desc-k { margin: 0 0 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #94a3b8; }
    .desc-body { margin: 0; font-size: 16px; line-height: 1.6; color: #334155; white-space: pre-wrap; }
    .table-wrap { padding: 0 32px 32px; }
    table { width: 100%; border-collapse: collapse; }
    thead tr { border-top: 2px solid #e2e8f0; border-bottom: 2px solid #e2e8f0; background: rgba(241, 245, 249, 0.8); }
    th { padding: 14px 20px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; }
    th.th-r { text-align: right; }
    tbody tr { border-bottom: 1px solid #f1f5f9; }
    tr.tr-alt { background: rgba(248, 250, 252, 0.5); }
    td { padding: 14px 20px; font-size: 14px; }
    .td-desc { font-weight: 500; color: #0f172a; }
    .td-num { text-align: right; color: #475569; }
    .td-amt { font-weight: 500; color: #0f172a; }
    .totals { margin-top: 32px; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; border-top: 2px solid #e2e8f0; padding-top: 24px; }
    .tot-row { display: flex; width: 288px; max-width: 100%; justify-content: space-between; font-size: 14px; }
    .tot-l { color: #475569; }
    .tot-v { font-weight: 500; color: #0f172a; }
    .tot-big { display: flex; width: 288px; max-width: 100%; justify-content: space-between; padding-top: 12px; margin-top: 4px; border-top: 1px solid #e2e8f0; font-size: 16px; font-weight: 700; }
    .tot-total-val { color: ${accent}; }
    .tot-balance-val { color: #e11d48; }
    .notes-box, .terms-box { margin-top: 24px; border-radius: 8px; border: 1px solid #f1f5f9; background: rgba(248, 250, 252, 0.5); padding: 16px; }
    .terms-box { background: rgba(248, 250, 252, 0.3); }
    .notes-body { margin: 4px 0 0; font-size: 14px; line-height: 1.6; color: #334155; }
    .terms-body { margin: 4px 0 0; font-size: 12px; line-height: 1.6; color: #475569; white-space: pre-wrap; }
    .pay-grid { margin-top: 24px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    @media (max-width: 640px) { .pay-grid { grid-template-columns: 1fr; } }
    .footer-t { margin-top: 24px; text-align: center; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div id="invoice-print" class="invoice-print">
    <div class="head">
      <div class="gradient-bar"></div>
      <div class="head-inner">
        <div class="brand">
          <div class="logo-wrap">${logoBlock}</div>
          <div>
            <h1 class="co-name">${escapeHtml(companyName)}</h1>
            <p class="co-sub">INVOICE</p>
            ${companyLines.length ? `<div class="co-meta">${companyLines.join('')}</div>` : ''}
          </div>
        </div>
        <div class="inv-right">
          <p class="inv-num">${escapeHtml(invoiceNumber)}</p>
          <span class="state-pill">${escapeHtml(stateLabel)}</span>
        </div>
      </div>
    </div>
    <div class="grid-2">
      <div>
        <div class="card">
          <p class="card-k">Invoice for</p>
          <p class="cust-name">${escapeHtml(customerName || '-')}</p>
          ${customerEmail ? `<p class="cust-line">${escapeHtml(customerEmail)}</p>` : ''}
          ${customerPhone ? `<p class="cust-line">${escapeHtml(customerPhone)}</p>` : ''}
          ${
            customerReferenceDisplay?.trim()
              ? `<p class="cust-line"><span style="font-weight:500;color:#334155">Customer reference:</span> ${escapeHtml(customerReferenceDisplay.trim())}</p>`
              : ''
          }
          <p class="card-k" style="margin-top:12px">Customer address</p>
          <p class="cust-line" style="margin-top:4px;line-height:1.5">${escapeHtml(customerAddrLine)}</p>
        </div>
        ${workSiteBlock || ''}
        ${customBillingBlock || ''}
      </div>
      <div>
        <div class="meta-row">
          <div class="meta-item">
            <p class="meta-k">Invoice date</p>
            <p class="meta-v">${escapeHtml(invoiceDateStr)}</p>
          </div>
          <div class="meta-item">
            <p class="meta-k">Due date</p>
            <p class="meta-v">${escapeHtml(dueDateStr)}</p>
          </div>
          ${jobBlock || ''}
        </div>
      </div>
    </div>
    ${descriptionBlock || ''}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th class="th-r">Qty</th>
            <th class="th-r">Unit price</th>
            <th class="th-r">Amount</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
      <div class="totals">
        <div class="tot-row"><span class="tot-l">Subtotal</span><span class="tot-v">${escapeHtml(formatMoney(subtotal, currency))}</span></div>
        <div class="tot-row"><span class="tot-l">${taxPctLabel}</span><span class="tot-v">${escapeHtml(formatMoney(taxAmount, currency))}</span></div>
        <div class="tot-big"><span>Total</span><span class="tot-total-val">${escapeHtml(formatMoney(totalAmount, currency))}</span></div>
        <div class="tot-row"><span class="tot-l">Paid</span><span class="tot-v">${escapeHtml(formatMoney(totalPaid, currency))}</span></div>
        <div class="tot-big"><span>Balance due</span><span class="tot-balance-val">${escapeHtml(formatMoney(balanceDue, currency))}</span></div>
      </div>
      ${notesBlock || ''}
      ${termsBlock || ''}
      ${payBankBlock || ''}
      ${footerBlock || ''}
    </div>
  </div>
</body>
</html>`;
}

/**
 * Invoice PDF using the same layout as the dashboard print view (`InvoicePrintTemplate.tsx`), via headless Chromium.
 */
export async function generateInvoicePdfBuffer(pool: Pool, invoiceId: number): Promise<Buffer> {
  const invResult = await pool.query<{
    id: number;
    customer_id: number;
    job_id: number | null;
    invoice_number: string;
    state: string;
    description: string | null;
    customer_full_name: string | null;
    customer_email: string | null;
    customer_phone: string | null;
    address_line_1: string | null;
    address_line_2: string | null;
    town: string | null;
    county: string | null;
    postcode: string | null;
    address: string | null;
    city: string | null;
    region: string | null;
    country: string | null;
    billing_address: string | null;
    invoice_work_address_id: number | null;
    customer_reference: string | null;
    job_customer_reference: string | null;
    invoice_date: Date;
    due_date: Date;
    subtotal: string;
    tax_amount: string;
    total_amount: string;
    total_paid: string;
    currency: string;
    notes: string | null;
    created_by: number | null;
  }>(
    `SELECT i.*, c.full_name AS customer_full_name, c.email AS customer_email, c.phone AS customer_phone,
      c.address_line_1, c.address_line_2, c.town, c.county, c.postcode,
      c.address, c.city, c.region, c.country,
      j.customer_reference AS job_customer_reference
     FROM invoices i
     JOIN customers c ON c.id = i.customer_id
     LEFT JOIN jobs j ON j.id = i.job_id
     WHERE i.id = $1`,
    [invoiceId],
  );
  if ((invResult.rowCount ?? 0) === 0) {
    throw new Error('Invoice not found');
  }
  const inv = invResult.rows[0];
  const customerAddrFormatted = formatCustomerAddressSingleLine(inv as unknown as Record<string, unknown>);

  let workSiteName: string | null = null;
  let workSiteAddrOnly: string | null = null;
  if (inv.invoice_work_address_id) {
    const waRes = await pool.query('SELECT * FROM customer_work_addresses WHERE id = $1 AND customer_id = $2', [
      inv.invoice_work_address_id,
      inv.customer_id,
    ]);
    if ((waRes.rowCount ?? 0) > 0) {
      const wa = waRes.rows[0] as Record<string, unknown>;
      const n = typeof wa.name === 'string' ? wa.name.trim() : '';
      workSiteName = n || null;
      const addr = formatWorkAddressSingleLineWithoutName(wa).trim();
      workSiteAddrOnly = addr || null;
    }
    if (!workSiteName && !workSiteAddrOnly && inv.billing_address?.trim()) {
      workSiteAddrOnly = workSiteAddressAsSingleLine(inv.billing_address.trim());
    }
  }
  const customBillingAddr =
    !inv.invoice_work_address_id && inv.billing_address?.trim() ? inv.billing_address.trim() : null;

  const lineItemsResult = await pool.query<{
    id: number;
    description: string;
    quantity: string;
    unit_price: string;
    amount: string;
    sort_order: number;
  }>(
    'SELECT id, description, quantity, unit_price, amount, sort_order FROM invoice_line_items WHERE invoice_id = $1 ORDER BY sort_order ASC, id ASC',
    [invoiceId],
  );

  const ownerId = inv.created_by ?? 1;
  const settingsRow = await pool.query('SELECT * FROM invoice_settings WHERE created_by = $1', [ownerId]);
  const row = (settingsRow.rows[0] as Record<string, unknown> | undefined) ?? undefined;
  const companyName = (row?.company_name as string) || 'WorkPilot';
  const companyAddress = (row?.company_address as string) || null;
  const companyPhone = (row?.company_phone as string) || null;
  const companyEmail = (row?.company_email as string) || null;
  const companyWebsite = (row?.company_website as string) || null;
  const companyTaxId = (row?.company_tax_id as string) || null;
  const taxLabel = (row?.tax_label as string) || 'Tax';
  const terms = (row?.terms_and_conditions as string) || null;
  const footerText = (row?.footer_text as string) || null;
  const paymentTerms = (row?.payment_terms as string) || null;
  const bankDetails = (row?.bank_details as string) || null;
  const accent = parseSafeHexColor(row?.invoice_accent_color, '#14B8A6');
  const accentEnd = parseSafeHexColor(row?.invoice_accent_end_color, '#0d9488');
  const logoResolved = resolveAssetUrl(row?.company_logo as string | null);
  const origin = appOrigin();
  const defaultLogoUrl = origin ? `${origin}/logo.jpg` : null;

  const subtotal = parseFloat(inv.subtotal);
  const taxAmount = parseFloat(inv.tax_amount);
  const totalAmount = parseFloat(inv.total_amount);
  const totalPaid = parseFloat(inv.total_paid);
  const balanceDue = Math.round((totalAmount - totalPaid) * 100) / 100;
  const currency = inv.currency || 'USD';

  const custRefLine =
    (inv.customer_reference && String(inv.customer_reference).trim()) ||
    (inv.job_customer_reference && String(inv.job_customer_reference).trim()) ||
    '';

  const stateLabel = String(inv.state || '').replace(/_/g, ' ');

  const lineItems: LineItem[] = lineItemsResult.rows.map((r) => ({
    id: r.id,
    description: r.description || '',
    quantity: parseFloat(r.quantity),
    unit_price: parseFloat(r.unit_price),
    amount: parseFloat(r.amount),
    sort_order: r.sort_order,
  }));

  const html = buildInvoiceHtmlDocument({
    accent,
    accentEnd,
    companyName,
    companyAddress,
    companyPhone,
    companyEmail,
    companyWebsite,
    companyTaxId,
    logoUrl: logoResolved,
    defaultLogoUrl,
    invoiceNumber: inv.invoice_number,
    stateLabel,
    customerName: inv.customer_full_name,
    customerEmail: inv.customer_email,
    customerPhone: inv.customer_phone,
    customerReferenceDisplay: custRefLine || null,
    customerAddrLine: customerAddrFormatted || '—',
    workSiteName,
    workSiteAddress: workSiteAddrOnly,
    invoiceCustomAddress: customBillingAddr,
    jobId: inv.job_id,
    invoiceDateStr: formatDateFromDb(inv.invoice_date as Date),
    dueDateStr: formatDateFromDb(inv.due_date as Date),
    description: inv.description,
    lineItems,
    subtotal,
    taxAmount,
    totalAmount,
    totalPaid,
    balanceDue,
    currency,
    taxLabel,
    notes: inv.notes,
    terms,
    paymentTerms,
    bankDetails,
    footerText,
  });

  return renderHtmlReportToPdf(html);
}
