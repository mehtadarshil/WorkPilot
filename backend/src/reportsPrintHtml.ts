import type { Pool } from 'pg';
import { renderHtmlReportToPdf } from './jobClientReportPdf';
import { resolveBrandingLogoForPdf } from './brandingLogoPdf';
import type { ReportsOverview } from './reportsRoutes';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseSafeHexColor(raw: unknown, fallback: string): string {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(s)) return s;
  return fallback;
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount || 0);
}

function formatHours(seconds: number): string {
  const hours = seconds / 3600;
  return `${hours.toFixed(hours >= 10 ? 1 : 2)}h`;
}

function formatPeriodDay(isoDay: string): string {
  try {
    return new Date(`${isoDay}T00:00:00`).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return isoDay;
  }
}

function buildReportsHtmlDocument(input: {
  accent: string;
  accentEnd: string;
  companyName: string;
  companyAddress: string | null;
  companyPhone: string | null;
  companyEmail: string | null;
  companyWebsite: string | null;
  companyTaxId: string | null;
  logoUrl: string | null;
  footerText: string | null;
  data: ReportsOverview;
}): string {
  const { accent, accentEnd, companyName, logoUrl, footerText, data } = input;
  const { financials: fin, totals } = data;

  const logoBlock =
    logoUrl != null
      ? `<img src="${escapeHtml(logoUrl)}" alt="" class="logo-img" />`
      : `<div class="logo-fallback">${escapeHtml(companyName.slice(0, 2).toUpperCase())}</div>`;

  const companyLines: string[] = [];
  if (input.companyAddress) companyLines.push(`<p class="co-line">${escapeHtml(input.companyAddress)}</p>`);
  if (input.companyWebsite) companyLines.push(`<p class="co-line">${escapeHtml(input.companyWebsite)}</p>`);
  if (input.companyTaxId) companyLines.push(`<p class="co-line">Tax ID: ${escapeHtml(input.companyTaxId)}</p>`);
  if (input.companyPhone) companyLines.push(`<p class="co-line">${escapeHtml(input.companyPhone)}</p>`);
  if (input.companyEmail) companyLines.push(`<p class="co-line">${escapeHtml(input.companyEmail)}</p>`);

  const travelPct = totals.total_seconds > 0 ? Math.round((totals.travelling_seconds / totals.total_seconds) * 100) : 0;

  const kpis: { label: string; value: string; sub: string; color: string }[] = [
    { label: 'Turnover', value: formatMoney(fin.turnover), sub: `${fin.invoice_count} invoices`, color: accent },
    { label: 'Profit', value: formatMoney(fin.profit), sub: 'after job costs', color: '#10b981' },
    { label: 'General overheads', value: formatMoney(fin.overheads), sub: `${fin.overhead_count} entries`, color: '#f97316' },
    { label: 'Net profit', value: formatMoney(fin.net_profit), sub: 'after costs & overheads', color: fin.net_profit < 0 ? '#e11d48' : '#059669' },
    { label: 'Hours worked', value: formatHours(totals.total_seconds), sub: `${formatHours(totals.on_site_seconds)} on site`, color: '#64748b' },
    { label: 'Travel time', value: formatHours(totals.travelling_seconds), sub: `${travelPct}% of all hours`, color: '#f59e0b' },
  ];
  const kpiCards = kpis
    .map(
      (k) => `
      <div class="kpi" style="border-left-color:${k.color}">
        <p class="kpi-k">${escapeHtml(k.label)}</p>
        <p class="kpi-v">${escapeHtml(k.value)}</p>
        <p class="kpi-s">${escapeHtml(k.sub)}</p>
      </div>`,
    )
    .join('');

  const staffRows = data.staff.length
    ? data.staff
        .map(
          (o, i) => `
      <tr class="${i % 2 === 1 ? 'tr-alt' : ''}">
        <td class="td-desc">${escapeHtml(o.full_name)}</td>
        <td class="td-num">${o.days_worked}</td>
        <td class="td-num">${escapeHtml(formatHours(o.on_site_seconds))}</td>
        <td class="td-num">${escapeHtml(formatHours(o.travelling_seconds))}</td>
        <td class="td-num td-amt">${escapeHtml(formatHours(o.total_seconds))}</td>
      </tr>`,
        )
        .join('')
    : `<tr><td class="td-empty" colspan="5">No hours recorded in this period.</td></tr>`;

  const revenueRows = data.revenueByCustomer.length
    ? data.revenueByCustomer
        .map(
          (r, i) => `
      <tr class="${i % 2 === 1 ? 'tr-alt' : ''}">
        <td class="td-desc">${escapeHtml(r.customer_name)}</td>
        <td class="td-num">${r.invoice_count}</td>
        <td class="td-num td-amt">${escapeHtml(formatMoney(r.total))}</td>
      </tr>`,
        )
        .join('')
    : `<tr><td class="td-empty" colspan="3">No invoices in this period.</td></tr>`;

  const topJobRows = data.topJobs.length
    ? data.topJobs
        .map(
          (r, i) => `
      <tr class="${i % 2 === 1 ? 'tr-alt' : ''}">
        <td class="td-desc">${escapeHtml(r.title)}</td>
        <td class="td-num td-amt">${r.count}×</td>
      </tr>`,
        )
        .join('')
    : `<tr><td class="td-empty" colspan="2">No jobs in this period.</td></tr>`;

  const workRows = data.workByCustomer.length
    ? data.workByCustomer
        .map(
          (r, i) => `
      <tr class="${i % 2 === 1 ? 'tr-alt' : ''}">
        <td class="td-desc">${escapeHtml(r.customer_name)}</td>
        <td class="td-num">${r.job_count}</td>
        <td class="td-num">${escapeHtml(formatHours(r.on_site_seconds))}</td>
        <td class="td-num">${escapeHtml(formatHours(r.travelling_seconds))}</td>
        <td class="td-num td-amt">${escapeHtml(formatHours(r.total_seconds))}</td>
      </tr>`,
        )
        .join('')
    : `<tr><td class="td-empty" colspan="5">No jobs in this period.</td></tr>`;

  const generatedAt = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const footerBlock = footerText?.trim() ? `<p class="footer-t">${escapeHtml(footerText.trim())}</p>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Business report ${escapeHtml(data.from)} – ${escapeHtml(data.to)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background: #fff; color: #0f172a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .report { max-width: 900px; margin: 0 auto; overflow: hidden; border-radius: 16px; border: 1px solid #e2e8f0; background: #fff; box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.08); }
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
    .doc-right { text-align: right; }
    .doc-title { font-size: 24px; font-weight: 700; letter-spacing: -0.025em; color: ${accent}; margin: 0; }
    .doc-period { margin-top: 8px; display: inline-block; border-radius: 6px; background: #f1f5f9; padding: 4px 12px; font-size: 12px; font-weight: 600; color: #334155; }
    .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; padding: 24px 32px 8px; }
    .kpi { border-radius: 10px; border: 1px solid #f1f5f9; border-left: 4px solid ${accent}; background: rgba(248, 250, 252, 0.5); padding: 12px 14px; }
    .kpi-k { margin: 0; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; }
    .kpi-v { margin: 4px 0 0; font-size: 18px; font-weight: 800; color: #0f172a; }
    .kpi-s { margin: 2px 0 0; font-size: 10px; color: #94a3b8; }
    .section { padding: 24px 32px 0; page-break-inside: avoid; }
    .sec-title { margin: 0; font-size: 15px; font-weight: 700; color: #0f172a; }
    .sec-sub { margin: 2px 0 12px; font-size: 12px; color: #64748b; }
    table { width: 100%; border-collapse: collapse; }
    thead tr { border-top: 2px solid #e2e8f0; border-bottom: 2px solid #e2e8f0; background: rgba(241, 245, 249, 0.8); }
    th { padding: 10px 14px; text-align: left; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; }
    th.th-r { text-align: right; }
    tbody tr { border-bottom: 1px solid #f1f5f9; }
    tr.tr-alt { background: rgba(248, 250, 252, 0.5); }
    td { padding: 10px 14px; font-size: 12px; }
    .td-desc { font-weight: 500; color: #0f172a; }
    .td-num { text-align: right; color: #475569; }
    .td-amt { font-weight: 600; color: #0f172a; }
    .td-empty { padding: 16px 14px; font-size: 12px; color: #94a3b8; }
    .foot { padding: 24px 32px 32px; }
    .footer-t { margin: 0 0 8px; text-align: center; font-size: 12px; color: #64748b; }
    .gen-t { margin: 0; text-align: center; font-size: 10px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="report">
    <div class="gradient-bar"></div>
    <div class="head">
      <div class="head-inner">
        <div class="brand">
          <div class="logo-wrap">${logoBlock}</div>
          <div>
            <h1 class="co-name">${escapeHtml(companyName)}</h1>
            <p class="co-sub">BUSINESS REPORT</p>
            ${companyLines.length ? `<div class="co-meta">${companyLines.join('')}</div>` : ''}
          </div>
        </div>
        <div class="doc-right">
          <p class="doc-title">Reports</p>
          <span class="doc-period">${escapeHtml(formatPeriodDay(data.from))} – ${escapeHtml(formatPeriodDay(data.to))}</span>
        </div>
      </div>
    </div>

    <div class="kpis">${kpiCards}</div>

    <div class="section">
      <h2 class="sec-title">Staff hours &amp; travel</h2>
      <p class="sec-sub">Who worked what hours, split by on-site and travelling time.</p>
      <table>
        <thead>
          <tr><th>Officer</th><th class="th-r">Days</th><th class="th-r">On site</th><th class="th-r">Travelling</th><th class="th-r">Total</th></tr>
        </thead>
        <tbody>${staffRows}</tbody>
      </table>
    </div>

    <div class="section">
      <h2 class="sec-title">Revenue by customer</h2>
      <p class="sec-sub">Invoiced totals per customer in the period.</p>
      <table>
        <thead>
          <tr><th>Customer</th><th class="th-r">Invoices</th><th class="th-r">Total</th></tr>
        </thead>
        <tbody>${revenueRows}</tbody>
      </table>
    </div>

    <div class="section">
      <h2 class="sec-title">Jobs done the most</h2>
      <p class="sec-sub">Most frequent job types created in the period.</p>
      <table>
        <thead>
          <tr><th>Job</th><th class="th-r">Count</th></tr>
        </thead>
        <tbody>${topJobRows}</tbody>
      </table>
    </div>

    <div class="section">
      <h2 class="sec-title">Customers worked for the most</h2>
      <p class="sec-sub">Job count and hours spent per customer in the period.</p>
      <table>
        <thead>
          <tr><th>Customer</th><th class="th-r">Jobs</th><th class="th-r">On site</th><th class="th-r">Travelling</th><th class="th-r">Total</th></tr>
        </thead>
        <tbody>${workRows}</tbody>
      </table>
    </div>

    <div class="foot">
      ${footerBlock}
      <p class="gen-t">Generated ${escapeHtml(generatedAt)} · ${escapeHtml(companyName)}</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Branded business-report PDF (company logo, colours and details from invoice settings),
 * rendered via headless Chromium like the invoice PDFs.
 */
export async function generateReportsPdfBuffer(
  pool: Pool,
  ownerId: number,
  data: ReportsOverview,
): Promise<Buffer> {
  const settingsRow = await pool.query('SELECT * FROM invoice_settings WHERE created_by = $1', [ownerId]);
  const row = (settingsRow.rows[0] as Record<string, unknown> | undefined) ?? undefined;
  const companyName = (row?.company_name as string) || 'WorkPilot';
  const accent = parseSafeHexColor(row?.invoice_accent_color, '#14B8A6');
  const accentEnd = parseSafeHexColor(row?.invoice_accent_end_color, '#0d9488');
  const logoResolved = await resolveBrandingLogoForPdf(row?.company_logo as string | null, ownerId);

  const html = buildReportsHtmlDocument({
    accent,
    accentEnd,
    companyName,
    companyAddress: (row?.company_address as string) || null,
    companyPhone: (row?.company_phone as string) || null,
    companyEmail: (row?.company_email as string) || null,
    companyWebsite: (row?.company_website as string) || null,
    companyTaxId: (row?.company_tax_id as string) || null,
    logoUrl: logoResolved,
    footerText: (row?.footer_text as string) || null,
    data,
  });

  return renderHtmlReportToPdf(html);
}
