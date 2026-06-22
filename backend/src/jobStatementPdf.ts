import type { Pool } from 'pg';
import fs from 'fs/promises';
import { renderHtmlReportToPdf } from './jobClientReportPdf';
import { loadWorkpilotFile } from './workpilotFileStorage';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

function resolveAssetUrl(href: string | null | undefined): string | null {
  if (!href || !String(href).trim()) return null;
  const t = String(href).trim();
  if (t.startsWith('data:') || t.startsWith('http://') || t.startsWith('https://')) return t;
  if (t.startsWith('//')) return `https:${t}`;
  const origin = appOrigin();
  if (t.startsWith('/') && origin) return `${origin}${t}`;
  return t;
}

function imageContentTypeFromFilename(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  return 'image/jpeg';
}

async function resolveCompanyLogoForPdf(href: string | null | undefined, ownerUserId: number): Promise<string | null> {
  if (!href || !String(href).trim()) return null;
  const trimmed = String(href).trim();
  if (trimmed.startsWith('data:')) return trimmed;

  try {
    const pathname = trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? new URL(trimmed).pathname
      : trimmed;
    const parts = pathname.split('/').map((p) => decodeURIComponent(p)).filter(Boolean);
    const brandingIndex = parts.findIndex((p) => p === 'branding-assets');
    const scope = parts[brandingIndex + 1];
    const userId = parseInt(String(parts[brandingIndex + 2]), 10);
    const fileName = parts[brandingIndex + 3];
    if (brandingIndex >= 0 && (scope === 'invoice' || scope === 'quotation') && userId === ownerUserId && fileName) {
      const file = await loadWorkpilotFile('branding-assets', [scope, userId], fileName);
      if (file) {
        const buffer = file.buffer ?? (file.fullPath ? await fs.readFile(file.fullPath) : null);
        if (buffer) {
          return `data:${imageContentTypeFromFilename(fileName)};base64,${buffer.toString('base64')}`;
        }
      }
    }
  } catch {
    /* Fall through to URL-based rendering for manually entered external URLs. */
  }

  return resolveAssetUrl(trimmed);
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

function formatWorkAddressLine(row: Record<string, unknown>): string {
  const parts: string[] = [];
  const push = (v: unknown) => {
    const t = typeof v === 'string' ? v.trim() : '';
    if (t) parts.push(t);
  };
  push(row.address_line_1);
  push(row.address_line_2);
  push(row.address_line_3);
  const town = typeof row.town === 'string' ? row.town.trim() : '';
  const county = typeof row.county === 'string' ? row.county.trim() : '';
  if (town || county) parts.push([town, county].filter(Boolean).join(', '));
  push(row.postcode);
  return parts.join(', ');
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysBetween(a: Date, b: Date): number {
  const ms = startOfDay(b).getTime() - startOfDay(a).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

function dueStatusLabel(dueDate: Date, balanceDue: number, today = new Date()): string {
  if (balanceDue <= 0.005) return 'Paid in full';
  const diff = daysBetween(today, dueDate);
  if (diff > 0) return `Due in ${diff} day${diff === 1 ? '' : 's'}`;
  if (diff === 0) return 'Due today';
  const overdue = Math.abs(diff);
  return `${overdue} day${overdue === 1 ? '' : 's'} overdue`;
}

type StatementLineItem = {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
};

type StatementPayment = {
  amount: number;
  payment_method: string | null;
  payment_date: Date;
  reference_number: string | null;
};

type StatementInvoice = {
  id: number;
  invoice_number: string;
  state: string;
  invoice_date: Date;
  due_date: Date;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  total_paid: number;
  balance_due: number;
  currency: string;
  description: string | null;
  line_items: StatementLineItem[];
  payments: StatementPayment[];
};

function buildJobStatementHtml(input: {
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
  taxLabel: string;
  footerText: string | null;
  jobNumber: string;
  jobTitle: string;
  jobDescription: string | null;
  customerName: string;
  customerAddress: string;
  workSiteName: string | null;
  workSiteAddress: string | null;
  customerReference: string | null;
  statementDate: string;
  invoices: StatementInvoice[];
  currency: string;
  totals: {
    invoiceCount: number;
    grandTotal: number;
    totalPaid: number;
    totalPending: number;
    overdueBalance: number;
  };
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
    taxLabel,
    footerText,
    jobNumber,
    jobTitle,
    jobDescription,
    customerName,
    customerAddress,
    workSiteName,
    workSiteAddress,
    customerReference,
    statementDate,
    invoices,
    currency,
    totals,
  } = input;

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

  const invoiceSections =
    invoices.length === 0
      ? `<div class="empty-box"><p>No invoices have been raised for this job yet.</p></div>`
      : invoices
          .map((inv) => {
            const stateLabel = String(inv.state || '').replace(/_/g, ' ');
            const lineRows = inv.line_items
              .map(
                (item, i) => `
        <tr class="${i % 2 === 1 ? 'tr-alt' : ''}">
          <td class="td-desc">${escapeHtml(item.description)}</td>
          <td class="td-num">${escapeHtml(String(item.quantity))}</td>
          <td class="td-num">${escapeHtml(formatMoney(item.unit_price, inv.currency))}</td>
          <td class="td-num td-amt">${escapeHtml(formatMoney(item.amount, inv.currency))}</td>
        </tr>`,
              )
              .join('');

            const paymentRows =
              inv.payments.length === 0
                ? `<tr><td colspan="4" class="td-muted">No payments recorded</td></tr>`
                : inv.payments
                    .map(
                      (p) => `
        <tr>
          <td>${escapeHtml(formatDateFromDb(p.payment_date))}</td>
          <td>${escapeHtml(p.payment_method?.trim() || '—')}</td>
          <td>${escapeHtml(p.reference_number?.trim() || '—')}</td>
          <td class="td-num">${escapeHtml(formatMoney(p.amount, inv.currency))}</td>
        </tr>`,
                    )
                    .join('');

            const descBlock = inv.description?.trim()
              ? `<p class="inv-desc">${escapeHtml(inv.description.trim())}</p>`
              : '';

            return `
      <section class="inv-section">
        <div class="inv-head">
          <div>
            <h3 class="inv-title">${escapeHtml(inv.invoice_number)}</h3>
            <span class="state-pill">${escapeHtml(stateLabel)}</span>
          </div>
          <div class="inv-meta">
            <span>Invoice date: <strong>${escapeHtml(formatDateFromDb(inv.invoice_date))}</strong></span>
            <span>Due date: <strong>${escapeHtml(formatDateFromDb(inv.due_date))}</strong></span>
            <span>Status: <strong>${escapeHtml(dueStatusLabel(inv.due_date, inv.balance_due))}</strong></span>
          </div>
        </div>
        ${descBlock}
        <div class="inv-totals">
          <span>Subtotal: ${escapeHtml(formatMoney(inv.subtotal, inv.currency))}</span>
          <span>${escapeHtml(taxLabel)}: ${escapeHtml(formatMoney(inv.tax_amount, inv.currency))}</span>
          <span>Total: <strong>${escapeHtml(formatMoney(inv.total_amount, inv.currency))}</strong></span>
          <span>Paid: ${escapeHtml(formatMoney(inv.total_paid, inv.currency))}</span>
          <span>Balance: <strong class="${inv.balance_due > 0.005 ? 'bal-due' : 'bal-ok'}">${escapeHtml(formatMoney(inv.balance_due, inv.currency))}</strong></span>
        </div>
        <p class="sub-k">Line items</p>
        <table class="tbl">
          <thead>
            <tr>
              <th>Description</th>
              <th class="th-num">Qty</th>
              <th class="th-num">Unit</th>
              <th class="th-num">Amount</th>
            </tr>
          </thead>
          <tbody>${lineRows || `<tr><td colspan="4" class="td-muted">No line items</td></tr>`}</tbody>
        </table>
        <p class="sub-k">Payments</p>
        <table class="tbl pay-tbl">
          <thead>
            <tr>
              <th>Date</th>
              <th>Method</th>
              <th>Reference</th>
              <th class="th-num">Amount</th>
            </tr>
          </thead>
          <tbody>${paymentRows}</tbody>
        </table>
      </section>`;
          })
          .join('');

  const footerBlock = footerText?.trim() ? `<p class="footer-t">${escapeHtml(footerText.trim())}</p>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Job ${escapeHtml(jobNumber)} Statement</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; background: #fff; color: #0f172a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .doc { max-width: 900px; margin: 0 auto; overflow: hidden; border-radius: 16px; border: 1px solid #e2e8f0; background: #fff; box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.08); }
    .gradient-bar { height: 4px; width: 100%; background: linear-gradient(to right, ${accent}, ${accentEnd}); }
    .head { border-bottom: 1px solid #e2e8f0; padding: 40px 32px; }
    .head-inner { display: flex; justify-content: space-between; gap: 24px; flex-wrap: wrap; }
    .brand { display: flex; align-items: center; gap: 16px; }
    .logo-wrap { width: 56px; height: 56px; overflow: hidden; border-radius: 12px; border: 1px solid #f1f5f9; }
    .logo-img { width: 100%; height: 100%; object-fit: contain; display: block; }
    .logo-fallback { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; color: #64748b; background: #f8fafc; }
    .co-name { font-size: 24px; font-weight: 700; margin: 0; }
    .co-sub { margin: 4px 0 0; font-size: 14px; color: #64748b; }
    .co-line { margin: 2px 0; font-size: 12px; color: #475569; }
    .stmt-right { text-align: right; }
    .stmt-title { font-size: 24px; font-weight: 700; color: ${accent}; margin: 0; }
    .stmt-sub { margin: 8px 0 0; font-size: 13px; color: #64748b; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; padding: 32px; }
    .card { border-radius: 8px; border: 1px solid #f1f5f9; background: rgba(248,250,252,0.5); padding: 20px; margin-bottom: 16px; }
    .card-k { margin: 0 0 8px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; }
    .cust-name, .ws-name { margin: 0; font-size: 16px; font-weight: 600; }
    .cust-line, .ws-addr { margin: 4px 0 0; font-size: 14px; color: #475569; }
    .body { padding: 0 32px 32px; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
    .sum-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; background: #f8fafc; }
    .sum-k { margin: 0; font-size: 11px; font-weight: 600; text-transform: uppercase; color: #64748b; }
    .sum-v { margin: 6px 0 0; font-size: 18px; font-weight: 700; color: #0f172a; }
    .sum-v.warn { color: #b45309; }
    .inv-section { border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 20px; page-break-inside: avoid; }
    .inv-head { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 12px; }
    .inv-title { margin: 0; font-size: 18px; font-weight: 700; color: #0f172a; }
    .state-pill { display: inline-block; margin-top: 6px; border-radius: 6px; background: #f1f5f9; padding: 4px 10px; font-size: 11px; font-weight: 600; color: #334155; }
    .inv-meta { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #475569; text-align: right; }
    .inv-desc { margin: 0 0 12px; font-size: 13px; color: #475569; }
    .inv-totals { display: flex; flex-wrap: wrap; gap: 12px 20px; font-size: 12px; color: #334155; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #f1f5f9; }
    .bal-due { color: #b45309; }
    .bal-ok { color: #059669; }
    .sub-k { margin: 12px 0 6px; font-size: 11px; font-weight: 600; text-transform: uppercase; color: #64748b; }
    .tbl { width: 100%; border-collapse: collapse; font-size: 12px; }
    .tbl th { text-align: left; padding: 8px 10px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-size: 11px; text-transform: uppercase; color: #64748b; }
    .th-num, .td-num { text-align: right; }
    .tbl td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
    .tr-alt { background: #fafbfc; }
    .td-muted { color: #94a3b8; font-style: italic; }
    .empty-box { border: 1px dashed #cbd5e1; border-radius: 12px; padding: 32px; text-align: center; color: #64748b; }
    .footer-t { margin: 24px 0 0; text-align: center; font-size: 11px; color: #94a3b8; }
    .pay-tbl { margin-bottom: 0; }
  </style>
</head>
<body>
  <div class="doc">
    <div class="gradient-bar"></div>
    <div class="head">
      <div class="head-inner">
        <div class="brand">
          <div class="logo-wrap">${logoBlock}</div>
          <div>
            <h1 class="co-name">${escapeHtml(companyName)}</h1>
            <p class="co-sub">Job statement</p>
            <div class="co-meta">${companyLines.join('')}</div>
          </div>
        </div>
        <div class="stmt-right">
          <h2 class="stmt-title">Full statement</h2>
          <p class="stmt-sub">Job ${escapeHtml(jobNumber)} · ${escapeHtml(statementDate)}</p>
        </div>
      </div>
    </div>
    <div class="grid-2">
      <div>
        <div class="card">
          <p class="card-k">Customer</p>
          <p class="cust-name">${escapeHtml(customerName)}</p>
          <p class="cust-line">${escapeHtml(customerAddress || '—')}</p>
        </div>
        ${workSiteBlock}
      </div>
      <div>
        <div class="card">
          <p class="card-k">Job</p>
          <p class="cust-name">${escapeHtml(jobTitle)}</p>
          ${jobDescription?.trim() ? `<p class="cust-line">${escapeHtml(jobDescription.trim())}</p>` : ''}
          ${customerReference?.trim() ? `<p class="cust-line">Ref: ${escapeHtml(customerReference.trim())}</p>` : ''}
        </div>
      </div>
    </div>
    <div class="body">
      <div class="summary">
        <div class="sum-card"><p class="sum-k">Invoices</p><p class="sum-v">${totals.invoiceCount}</p></div>
        <div class="sum-card"><p class="sum-k">Grand total</p><p class="sum-v">${escapeHtml(formatMoney(totals.grandTotal, currency))}</p></div>
        <div class="sum-card"><p class="sum-k">Total paid</p><p class="sum-v">${escapeHtml(formatMoney(totals.totalPaid, currency))}</p></div>
        <div class="sum-card"><p class="sum-k">Balance due</p><p class="sum-v ${totals.totalPending > 0.005 ? 'warn' : ''}">${escapeHtml(formatMoney(totals.totalPending, currency))}</p></div>
      </div>
      ${totals.overdueBalance > 0.005 ? `<p class="inv-desc"><strong>Overdue balance:</strong> ${escapeHtml(formatMoney(totals.overdueBalance, currency))}</p>` : ''}
      ${invoiceSections}
      ${footerBlock}
    </div>
  </div>
</body>
</html>`;
}

export async function generateJobStatementPdfBuffer(pool: Pool, jobId: number): Promise<Buffer> {
  const jobResult = await pool.query<{
    id: number;
    job_number: string | null;
    title: string;
    description: string | null;
    customer_reference: string | null;
    created_by: number | null;
    customer_id: number | null;
    customer_full_name: string | null;
    address_line_1: string | null;
    address_line_2: string | null;
    town: string | null;
    county: string | null;
    postcode: string | null;
    address: string | null;
    city: string | null;
    region: string | null;
    country: string | null;
    work_address_id: number | null;
    wa_name: string | null;
    wa_address_line_1: string | null;
    wa_address_line_2: string | null;
    wa_address_line_3: string | null;
    wa_town: string | null;
    wa_county: string | null;
    wa_postcode: string | null;
  }>(
    `SELECT j.id, j.job_number, j.title, j.description, j.customer_reference, j.created_by, j.customer_id, j.work_address_id,
      c.full_name AS customer_full_name,
      c.address_line_1, c.address_line_2, c.town, c.county, c.postcode, c.address, c.city, c.region, c.country,
      wa.name AS wa_name, wa.address_line_1 AS wa_address_line_1, wa.address_line_2 AS wa_address_line_2,
      wa.address_line_3 AS wa_address_line_3, wa.town AS wa_town, wa.county AS wa_county, wa.postcode AS wa_postcode
     FROM jobs j
     LEFT JOIN customers c ON c.id = j.customer_id
     LEFT JOIN customer_work_addresses wa ON wa.id = j.work_address_id AND wa.customer_id = j.customer_id
     WHERE j.id = $1`,
    [jobId],
  );
  if ((jobResult.rowCount ?? 0) === 0) throw new Error('Job not found');
  const job = jobResult.rows[0];

  const invResult = await pool.query<{
    id: number;
    invoice_number: string;
    state: string;
    invoice_date: Date;
    due_date: Date;
    subtotal: string;
    tax_amount: string;
    total_amount: string;
    total_paid: string;
    currency: string;
    description: string | null;
  }>(
    `SELECT id, invoice_number, state, invoice_date, due_date, subtotal, tax_amount, total_amount, total_paid, currency, description
     FROM invoices WHERE job_id = $1 ORDER BY invoice_date ASC, id ASC`,
    [jobId],
  );

  const invoiceIds = invResult.rows.map((r) => r.id);
  const lineItemsByInvoice = new Map<number, StatementLineItem[]>();
  const paymentsByInvoice = new Map<number, StatementPayment[]>();

  if (invoiceIds.length > 0) {
    const linesRes = await pool.query<{
      invoice_id: number;
      description: string;
      quantity: string;
      unit_price: string;
      amount: string;
      sort_order: number;
    }>(
      `SELECT invoice_id, description, quantity, unit_price, amount, sort_order
       FROM invoice_line_items WHERE invoice_id = ANY($1::int[])
       ORDER BY sort_order ASC, id ASC`,
      [invoiceIds],
    );
    for (const row of linesRes.rows) {
      const list = lineItemsByInvoice.get(row.invoice_id) || [];
      list.push({
        description: row.description || '',
        quantity: parseFloat(row.quantity),
        unit_price: parseFloat(row.unit_price),
        amount: parseFloat(row.amount),
      });
      lineItemsByInvoice.set(row.invoice_id, list);
    }

    const payRes = await pool.query<{
      invoice_id: number;
      amount: string;
      payment_method: string | null;
      payment_date: Date;
      reference_number: string | null;
    }>(
      `SELECT invoice_id, amount, payment_method, payment_date, reference_number
       FROM invoice_payments WHERE invoice_id = ANY($1::int[])
       ORDER BY payment_date ASC, id ASC`,
      [invoiceIds],
    );
    for (const row of payRes.rows) {
      const list = paymentsByInvoice.get(row.invoice_id) || [];
      list.push({
        amount: parseFloat(row.amount),
        payment_method: row.payment_method,
        payment_date: row.payment_date,
        reference_number: row.reference_number,
      });
      paymentsByInvoice.set(row.invoice_id, list);
    }
  }

  const today = new Date();
  let grandTotal = 0;
  let totalPaid = 0;
  let totalPending = 0;
  let overdueBalance = 0;
  const primaryCurrency = invResult.rows[0]?.currency || 'GBP';

  const invoices: StatementInvoice[] = invResult.rows.map((inv) => {
    const subtotal = parseFloat(inv.subtotal);
    const taxAmount = parseFloat(inv.tax_amount);
    const totalAmount = parseFloat(inv.total_amount);
    const paid = parseFloat(inv.total_paid);
    const balanceDue = Math.round((totalAmount - paid) * 100) / 100;
    grandTotal += totalAmount;
    totalPaid += paid;
    totalPending += balanceDue;
    if (balanceDue > 0.005 && daysBetween(inv.due_date, today) < 0) {
      overdueBalance += balanceDue;
    }
    return {
      id: inv.id,
      invoice_number: inv.invoice_number,
      state: inv.state,
      invoice_date: inv.invoice_date,
      due_date: inv.due_date,
      subtotal,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      total_paid: paid,
      balance_due: balanceDue,
      currency: inv.currency || primaryCurrency,
      description: inv.description,
      line_items: lineItemsByInvoice.get(inv.id) || [],
      payments: paymentsByInvoice.get(inv.id) || [],
    };
  });

  const ownerId = job.created_by ?? 1;
  const settingsRow = await pool.query('SELECT * FROM invoice_settings WHERE created_by = $1', [ownerId]);
  const row = (settingsRow.rows[0] as Record<string, unknown> | undefined) ?? undefined;
  const companyName = (row?.company_name as string) || 'WorkPilot';
  const companyAddress = (row?.company_address as string) || null;
  const companyPhone = (row?.company_phone as string) || null;
  const companyEmail = (row?.company_email as string) || null;
  const companyWebsite = (row?.company_website as string) || null;
  const companyTaxId = (row?.company_tax_id as string) || null;
  const taxLabel = (row?.tax_label as string) || 'Tax';
  const footerText = (row?.footer_text as string) || null;
  const accent = parseSafeHexColor(row?.invoice_accent_color, '#14B8A6');
  const accentEnd = parseSafeHexColor(row?.invoice_accent_end_color, '#0d9488');
  const logoResolved = await resolveCompanyLogoForPdf(row?.company_logo as string | null, ownerId);

  const jobNumber = job.job_number?.trim() || String(job.id).padStart(4, '0');
  const customerAddress = formatCustomerAddressSingleLine(job as unknown as Record<string, unknown>);
  const workSiteName = job.wa_name?.trim() || null;
  const workSiteAddress = job.work_address_id
    ? formatWorkAddressLine({
        address_line_1: job.wa_address_line_1,
        address_line_2: job.wa_address_line_2,
        address_line_3: job.wa_address_line_3,
        town: job.wa_town,
        county: job.wa_county,
        postcode: job.wa_postcode,
      }) || null
    : null;

  const html = buildJobStatementHtml({
    accent,
    accentEnd,
    companyName,
    companyAddress,
    companyPhone,
    companyEmail,
    companyWebsite,
    companyTaxId,
    logoUrl: logoResolved,
    defaultLogoUrl: null,
    taxLabel,
    footerText,
    jobNumber,
    jobTitle: job.title,
    jobDescription: job.description,
    customerName: job.customer_full_name?.trim() || 'Customer',
    customerAddress,
    workSiteName,
    workSiteAddress,
    customerReference: job.customer_reference,
    statementDate: formatDateFromDb(today),
    invoices,
    currency: primaryCurrency,
    totals: {
      invoiceCount: invoices.length,
      grandTotal: Math.round(grandTotal * 100) / 100,
      totalPaid: Math.round(totalPaid * 100) / 100,
      totalPending: Math.round(totalPending * 100) / 100,
      overdueBalance: Math.round(overdueBalance * 100) / 100,
    },
  });

  return renderHtmlReportToPdf(html);
}

type CustomerJobBrief = {
  id: number;
  job_number: string | null;
  title: string;
  work_site_label: string;
};

function buildCustomerStatementHtml(input: {
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
  taxLabel: string;
  footerText: string | null;
  customerName: string;
  customerAddress: string;
  statementDate: string;
  jobs: { brief: CustomerJobBrief; invoices: StatementInvoice[] }[];
  currency: string;
  totals: {
    jobCount: number;
    invoiceCount: number;
    grandTotal: number;
    totalPaid: number;
    totalPending: number;
    overdueBalance: number;
  };
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
    taxLabel,
    footerText,
    customerName,
    customerAddress,
    statementDate,
    jobs,
    currency,
    totals,
  } = input;

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

  const jobSections =
    jobs.length === 0
      ? `<div class="empty-box"><p>No jobs have been raised for this customer yet.</p></div>`
      : jobs
          .map(({ brief, invoices: jobInvoices }) => {
            const jobInvoiceRows =
              jobInvoices.length === 0
                ? `<tr><td colspan="5" class="td-muted">No invoices for this job</td></tr>`
                : jobInvoices
                    .map(
                      (inv, i) => `
        <tr class="${i % 2 === 1 ? 'tr-alt' : ''}">
          <td>${escapeHtml(inv.invoice_number)}</td>
          <td>${escapeHtml(formatDateFromDb(inv.invoice_date))}</td>
          <td class="td-num">${escapeHtml(formatMoney(inv.total_amount, inv.currency))}</td>
          <td class="td-num">${escapeHtml(formatMoney(inv.total_paid, inv.currency))}</td>
          <td class="td-num"><strong class="${inv.balance_due > 0.005 ? 'bal-due' : 'bal-ok'}">${escapeHtml(formatMoney(inv.balance_due, inv.currency))}</strong></td>
        </tr>`,
                    )
                    .join('');

            const jobSubtotal = jobInvoices.reduce((s, inv) => s + inv.total_amount, 0);
            const jobPaid = jobInvoices.reduce((s, inv) => s + inv.total_paid, 0);
            const jobBal = Math.round((jobSubtotal - jobPaid) * 100) / 100;

            return `
      <section class="job-section">
        <div class="job-head">
          <h3 class="job-title">Job ${escapeHtml(brief.job_number ?? '')} — ${escapeHtml(brief.title)}</h3>
          ${brief.work_site_label ? `<span class="job-site">${escapeHtml(brief.work_site_label)}</span>` : ''}
        </div>
        <table class="tbl">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Date</th>
              <th class="th-num">Total</th>
              <th class="th-num">Paid</th>
              <th class="th-num">Balance</th>
            </tr>
          </thead>
          <tbody>${jobInvoiceRows}</tbody>
        </table>
        ${jobInvoices.length > 0 ? `<p class="job-sum">Job total: <strong>${escapeHtml(formatMoney(jobSubtotal, currency))}</strong> · Paid: <strong>${escapeHtml(formatMoney(jobPaid, currency))}</strong> · Balance: <strong class="${jobBal > 0.005 ? 'bal-due' : 'bal-ok'}">${escapeHtml(formatMoney(jobBal, currency))}</strong></p>` : ''}
      </section>`;
          })
          .join('');

  const footerBlock = footerText?.trim() ? `<p class="footer-t">${escapeHtml(footerText.trim())}</p>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Customer Statement — ${escapeHtml(customerName)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; background: #fff; color: #0f172a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .doc { max-width: 900px; margin: 0 auto; overflow: hidden; border-radius: 16px; border: 1px solid #e2e8f0; background: #fff; box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.08); }
    .gradient-bar { height: 4px; width: 100%; background: linear-gradient(to right, ${accent}, ${accentEnd}); }
    .head { border-bottom: 1px solid #e2e8f0; padding: 40px 32px; }
    .head-inner { display: flex; justify-content: space-between; gap: 24px; flex-wrap: wrap; }
    .brand { display: flex; align-items: center; gap: 16px; }
    .logo-wrap { width: 56px; height: 56px; overflow: hidden; border-radius: 12px; border: 1px solid #f1f5f9; }
    .logo-img { width: 100%; height: 100%; object-fit: contain; display: block; }
    .logo-fallback { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; color: #64748b; background: #f8fafc; }
    .co-name { font-size: 24px; font-weight: 700; margin: 0; }
    .co-sub { margin: 4px 0 0; font-size: 14px; color: #64748b; }
    .co-line { margin: 2px 0; font-size: 12px; color: #475569; }
    .stmt-right { text-align: right; }
    .stmt-title { font-size: 24px; font-weight: 700; color: ${accent}; margin: 0; }
    .stmt-sub { margin: 8px 0 0; font-size: 13px; color: #64748b; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; padding: 32px; }
    .card { border-radius: 8px; border: 1px solid #f1f5f9; background: rgba(248,250,252,0.5); padding: 20px; margin-bottom: 16px; }
    .card-k { margin: 0 0 8px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; }
    .cust-name { margin: 0; font-size: 16px; font-weight: 600; }
    .cust-line { margin: 4px 0 0; font-size: 14px; color: #475569; }
    .body { padding: 0 32px 32px; }
    .summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 24px; }
    .sum-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; background: #f8fafc; }
    .sum-k { margin: 0; font-size: 11px; font-weight: 600; text-transform: uppercase; color: #64748b; }
    .sum-v { margin: 6px 0 0; font-size: 18px; font-weight: 700; color: #0f172a; }
    .sum-v.warn { color: #b45309; }
    .job-section { border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 20px; page-break-inside: avoid; }
    .job-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
    .job-title { margin: 0; font-size: 16px; font-weight: 700; color: #0f172a; }
    .job-site { font-size: 12px; color: #64748b; }
    .job-sum { margin: 12px 0 0; font-size: 12px; color: #334155; }
    .tbl { width: 100%; border-collapse: collapse; font-size: 12px; }
    .tbl th { text-align: left; padding: 8px 10px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-size: 11px; text-transform: uppercase; color: #64748b; }
    .th-num, .td-num { text-align: right; }
    .tbl td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
    .tr-alt { background: #fafbfc; }
    .td-muted { color: #94a3b8; font-style: italic; }
    .empty-box { border: 1px dashed #cbd5e1; border-radius: 12px; padding: 32px; text-align: center; color: #64748b; }
    .footer-t { margin: 24px 0 0; text-align: center; font-size: 11px; color: #94a3b8; }
    .bal-due { color: #b45309; }
    .bal-ok { color: #059669; }
  </style>
</head>
<body>
  <div class="doc">
    <div class="gradient-bar"></div>
    <div class="head">
      <div class="head-inner">
        <div class="brand">
          <div class="logo-wrap">${logoBlock}</div>
          <div>
            <h1 class="co-name">${escapeHtml(companyName)}</h1>
            <p class="co-sub">Customer statement</p>
            <div class="co-meta">${companyLines.join('')}</div>
          </div>
        </div>
        <div class="stmt-right">
          <h2 class="stmt-title">Full statement</h2>
          <p class="stmt-sub">${escapeHtml(customerName)} · ${escapeHtml(statementDate)}</p>
        </div>
      </div>
    </div>
    <div class="grid-2">
      <div>
        <div class="card">
          <p class="card-k">Customer</p>
          <p class="cust-name">${escapeHtml(customerName)}</p>
          <p class="cust-line">${escapeHtml(customerAddress || '—')}</p>
        </div>
      </div>
      <div>
        <div class="card">
          <p class="card-k">Summary</p>
          <p class="cust-line"><strong>${totals.jobCount}</strong> job${totals.jobCount === 1 ? '' : 's'} · <strong>${totals.invoiceCount}</strong> invoice${totals.invoiceCount === 1 ? '' : 's'}</p>
          <p class="cust-line">Grand total: <strong>${escapeHtml(formatMoney(totals.grandTotal, currency))}</strong></p>
          <p class="cust-line">Paid: <strong>${escapeHtml(formatMoney(totals.totalPaid, currency))}</strong></p>
          <p class="cust-line">Balance: <strong class="${totals.totalPending > 0.005 ? 'bal-due' : 'bal-ok'}">${escapeHtml(formatMoney(totals.totalPending, currency))}</strong></p>
        </div>
      </div>
    </div>
    <div class="body">
      <div class="summary">
        <div class="sum-card"><p class="sum-k">Jobs</p><p class="sum-v">${totals.jobCount}</p></div>
        <div class="sum-card"><p class="sum-k">Invoices</p><p class="sum-v">${totals.invoiceCount}</p></div>
        <div class="sum-card"><p class="sum-k">Grand total</p><p class="sum-v">${escapeHtml(formatMoney(totals.grandTotal, currency))}</p></div>
        <div class="sum-card"><p class="sum-k">Total paid</p><p class="sum-v">${escapeHtml(formatMoney(totals.totalPaid, currency))}</p></div>
        <div class="sum-card"><p class="sum-k">Balance due</p><p class="sum-v ${totals.totalPending > 0.005 ? 'warn' : ''}">${escapeHtml(formatMoney(totals.totalPending, currency))}</p></div>
      </div>
      ${totals.overdueBalance > 0.005 ? `<p class="cust-line"><strong>Overdue balance:</strong> ${escapeHtml(formatMoney(totals.overdueBalance, currency))}</p>` : ''}
      ${jobSections}
      ${footerBlock}
    </div>
  </div>
</body>
</html>`;
}

export async function generateCustomerStatementPdfBuffer(pool: Pool, customerId: number): Promise<Buffer> {
  const custResult = await pool.query<{
    id: number;
    full_name: string;
    address_line_1: string | null;
    address_line_2: string | null;
    address_line_3: string | null;
    town: string | null;
    county: string | null;
    postcode: string | null;
    address: string | null;
    city: string | null;
    region: string | null;
    country: string | null;
    created_by: number | null;
  }>(
    `SELECT id, full_name, address_line_1, address_line_2, address_line_3, town, county, postcode, address, city, region, country, created_by
     FROM customers WHERE id = $1`,
    [customerId],
  );
  if ((custResult.rowCount ?? 0) === 0) throw new Error('Customer not found');
  const cust = custResult.rows[0];

  const jobsResult = await pool.query<{
    id: number;
    job_number: string | null;
    title: string;
    work_address_id: number | null;
    wa_name: string | null;
    wa_address_line_1: string | null;
    wa_town: string | null;
    wa_postcode: string | null;
  }>(
    `SELECT j.id, j.job_number, j.title, j.work_address_id,
            wa.name AS wa_name, wa.address_line_1 AS wa_address_line_1, wa.town AS wa_town, wa.postcode AS wa_postcode
     FROM jobs j
     LEFT JOIN customer_work_addresses wa ON wa.id = j.work_address_id AND wa.customer_id = j.customer_id
     WHERE j.customer_id = $1
     ORDER BY j.created_at ASC`,
    [customerId],
  );

  const jobIds = jobsResult.rows.map((r) => r.id);

  let allInvoices: StatementInvoice[] = [];
  const invoicesByJob = new Map<number, StatementInvoice[]>();

  if (jobIds.length > 0) {
    const invResult = await pool.query<{
      job_id: number;
      id: number;
      invoice_number: string;
      state: string;
      invoice_date: Date;
      due_date: Date;
      subtotal: string;
      tax_amount: string;
      total_amount: string;
      total_paid: string;
      currency: string;
      description: string | null;
    }>(
      `SELECT job_id, id, invoice_number, state, invoice_date, due_date, subtotal, tax_amount, total_amount, total_paid, currency, description
       FROM invoices WHERE job_id = ANY($1::int[]) ORDER BY invoice_date ASC, id ASC`,
      [jobIds],
    );

    const invoiceIds = invResult.rows.map((r) => r.id);
    const lineItemsByInvoice = new Map<number, StatementLineItem[]>();
    const paymentsByInvoice = new Map<number, StatementPayment[]>();

    if (invoiceIds.length > 0) {
      const linesRes = await pool.query<{
        invoice_id: number;
        description: string;
        quantity: string;
        unit_price: string;
        amount: string;
        sort_order: number;
      }>(
        `SELECT invoice_id, description, quantity, unit_price, amount, sort_order
         FROM invoice_line_items WHERE invoice_id = ANY($1::int[])
         ORDER BY sort_order ASC, id ASC`,
        [invoiceIds],
      );
      for (const row of linesRes.rows) {
        const list = lineItemsByInvoice.get(row.invoice_id) || [];
        list.push({
          description: row.description || '',
          quantity: parseFloat(row.quantity),
          unit_price: parseFloat(row.unit_price),
          amount: parseFloat(row.amount),
        });
        lineItemsByInvoice.set(row.invoice_id, list);
      }

      const payRes = await pool.query<{
        invoice_id: number;
        amount: string;
        payment_method: string | null;
        payment_date: Date;
        reference_number: string | null;
      }>(
        `SELECT invoice_id, amount, payment_method, payment_date, reference_number
         FROM invoice_payments WHERE invoice_id = ANY($1::int[])
         ORDER BY payment_date ASC, id ASC`,
        [invoiceIds],
      );
      for (const row of payRes.rows) {
        const list = paymentsByInvoice.get(row.invoice_id) || [];
        list.push({
          amount: parseFloat(row.amount),
          payment_method: row.payment_method,
          payment_date: row.payment_date,
          reference_number: row.reference_number,
        });
        paymentsByInvoice.set(row.invoice_id, list);
      }
    }

    const primaryCurrency = invResult.rows[0]?.currency || 'GBP';
    for (const inv of invResult.rows) {
      const subtotal = parseFloat(inv.subtotal);
      const taxAmount = parseFloat(inv.tax_amount);
      const totalAmount = parseFloat(inv.total_amount);
      const paid = parseFloat(inv.total_paid);
      const balanceDue = Math.round((totalAmount - paid) * 100) / 100;
      const stmtInv: StatementInvoice = {
        id: inv.id,
        invoice_number: inv.invoice_number,
        state: inv.state,
        invoice_date: inv.invoice_date,
        due_date: inv.due_date,
        subtotal,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        total_paid: paid,
        balance_due: balanceDue,
        currency: inv.currency || primaryCurrency,
        description: inv.description,
        line_items: lineItemsByInvoice.get(inv.id) || [],
        payments: paymentsByInvoice.get(inv.id) || [],
      };
      allInvoices.push(stmtInv);
      const list = invoicesByJob.get(inv.job_id) || [];
      list.push(stmtInv);
      invoicesByJob.set(inv.job_id, list);
    }
  }

  const today = new Date();
  let grandTotal = 0;
  let totalPaid = 0;
  let totalPending = 0;
  let overdueBalance = 0;

  for (const inv of allInvoices) {
    grandTotal += inv.total_amount;
    totalPaid += inv.total_paid;
    totalPending += inv.balance_due;
    if (inv.balance_due > 0.005 && daysBetween(inv.due_date, today) < 0) {
      overdueBalance += inv.balance_due;
    }
  }

  const primaryCurrency = allInvoices[0]?.currency || 'GBP';

  const jobsForHtml = jobsResult.rows.map((j) => {
    const jobNum = j.job_number?.trim() || String(j.id).padStart(4, '0');
    const siteParts = [j.wa_name, j.wa_address_line_1, j.wa_town, j.wa_postcode].filter((p) => p?.trim()).join(', ');
    return {
      brief: {
        id: j.id,
        job_number: jobNum,
        title: j.title,
        work_site_label: siteParts || '',
      },
      invoices: invoicesByJob.get(j.id) || [],
    };
  });

  const ownerId = cust.created_by ?? 1;
  const settingsRow = await pool.query('SELECT * FROM invoice_settings WHERE created_by = $1', [ownerId]);
  const settings = (settingsRow.rows[0] as Record<string, unknown> | undefined) ?? undefined;
  const companyName = (settings?.company_name as string) || 'WorkPilot';
  const companyAddress = (settings?.company_address as string) || null;
  const companyPhone = (settings?.company_phone as string) || null;
  const companyEmail = (settings?.company_email as string) || null;
  const companyWebsite = (settings?.company_website as string) || null;
  const companyTaxId = (settings?.company_tax_id as string) || null;
  const taxLabel = (settings?.tax_label as string) || 'Tax';
  const footerText = (settings?.footer_text as string) || null;
  const accent = parseSafeHexColor(settings?.invoice_accent_color, '#14B8A6');
  const accentEnd = parseSafeHexColor(settings?.invoice_accent_end_color, '#0d9488');
  const logoResolved = await resolveCompanyLogoForPdf(settings?.company_logo as string | null, ownerId);

  const customerAddressStr = formatCustomerAddressSingleLine(cust as unknown as Record<string, unknown>);

  const html = buildCustomerStatementHtml({
    accent,
    accentEnd,
    companyName,
    companyAddress,
    companyPhone,
    companyEmail,
    companyWebsite,
    companyTaxId,
    logoUrl: logoResolved,
    defaultLogoUrl: null,
    taxLabel,
    footerText,
    customerName: cust.full_name?.trim() || 'Customer',
    customerAddress: customerAddressStr,
    statementDate: formatDateFromDb(today),
    jobs: jobsForHtml,
    currency: primaryCurrency,
    totals: {
      jobCount: jobsResult.rows.length,
      invoiceCount: allInvoices.length,
      grandTotal: Math.round(grandTotal * 100) / 100,
      totalPaid: Math.round(totalPaid * 100) / 100,
      totalPending: Math.round(totalPending * 100) / 100,
      overdueBalance: Math.round(overdueBalance * 100) / 100,
    },
  });

  return renderHtmlReportToPdf(html);
}
