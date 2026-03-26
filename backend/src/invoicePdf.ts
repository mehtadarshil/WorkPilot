import PDFDocument from 'pdfkit';
import type { Pool } from 'pg';

/** Matches customer detail page and GET /invoices/:id formatting. */
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

function formatDate(isoDate: string): string {
  try {
    return new Date(isoDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return isoDate;
  }
}

/**
 * Server-side invoice PDF (pdfkit). Uses the same data as the on-screen / print invoice
 * (line items, totals, tax %, terms, payment/bank blocks, etc.) but is not pixel-identical
 * to browser print: no HTML/CSS, gradient bar, or embedded logo image. For a perfect match
 * to print, use HTML→PDF (e.g. headless Chrome) instead.
 */
export async function generateInvoicePdfBuffer(pool: Pool, invoiceId: number): Promise<Buffer> {
  const invResult = await pool.query<{
    id: number;
    invoice_number: string;
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
    description: string;
    quantity: string;
    unit_price: string;
    amount: string;
  }>(
    'SELECT description, quantity, unit_price, amount FROM invoice_line_items WHERE invoice_id = $1 ORDER BY sort_order ASC, id ASC',
    [invoiceId],
  );

  const ownerId = inv.created_by;
  const settingsRow = ownerId
    ? await pool.query(
        `SELECT company_name, company_address, company_phone, company_email, company_website, company_tax_id,
                tax_label, terms_and_conditions, footer_text, payment_terms, bank_details
         FROM invoice_settings WHERE created_by = $1`,
        [ownerId],
      )
    : { rows: [] as Record<string, unknown>[] };

  const s = settingsRow.rows[0] as Record<string, unknown> | undefined;
  const companyName = (s?.company_name as string) || 'WorkPilot';
  const companyAddress = (s?.company_address as string) || null;
  const companyPhone = (s?.company_phone as string) || null;
  const companyEmail = (s?.company_email as string) || null;
  const companyWebsite = (s?.company_website as string) || null;
  const companyTaxId = (s?.company_tax_id as string) || null;
  const taxLabel = (s?.tax_label as string) || 'Tax';
  const terms = (s?.terms_and_conditions as string) || null;
  const footerText = (s?.footer_text as string) || null;
  const paymentTerms = (s?.payment_terms as string) || null;
  const bankDetails = (s?.bank_details as string) || null;

  const subtotal = parseFloat(inv.subtotal);
  const taxAmount = parseFloat(inv.tax_amount);
  const totalAmount = parseFloat(inv.total_amount);
  const totalPaid = parseFloat(inv.total_paid);
  const balance = Math.round((totalAmount - totalPaid) * 100) / 100;
  const currency = inv.currency || 'USD';

  const custRefLine =
    (inv.customer_reference && String(inv.customer_reference).trim()) ||
    (inv.job_customer_reference && String(inv.job_customer_reference).trim()) ||
    '';
  const invDate = (inv.invoice_date as Date).toISOString().slice(0, 10);
  const dueDate = (inv.due_date as Date).toISOString().slice(0, 10);

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).fillColor('#0f172a').text(companyName, { align: 'left' });
    doc.moveDown(0.25);
    doc.fontSize(9).fillColor('#64748b');
    if (companyAddress) doc.text(companyAddress, { width: 280 });
    if (companyPhone) doc.text(`Tel: ${companyPhone}`);
    if (companyEmail) doc.text(companyEmail);
    if (companyWebsite) doc.text(companyWebsite);
    if (companyTaxId) doc.text(`Tax ID: ${companyTaxId}`);
    doc.moveDown(1);

    doc.fontSize(16).fillColor('#0d9488').text('INVOICE', { align: 'right' });
    doc.fontSize(10).fillColor('#0f172a').text(inv.invoice_number, { align: 'right' });
    doc.moveDown(0.5);
    doc.fontSize(9).fillColor('#64748b');
    doc.text(`Invoice date: ${formatDate(invDate)}`, { align: 'right' });
    doc.text(`Due date: ${formatDate(dueDate)}`, { align: 'right' });
    doc.moveDown(1);

    doc.fontSize(10).fillColor('#0f172a').text('Bill to', { continued: false });
    doc.moveDown(0.25);
    doc.fontSize(10).fillColor('#334155');
    doc.text(inv.customer_full_name || 'Customer', { width: 260 });
    if (inv.customer_email) doc.fontSize(9).text(inv.customer_email);
    if (inv.customer_phone) doc.fontSize(9).text(inv.customer_phone);
    if (custRefLine) doc.fontSize(9).text(`Customer reference: ${custRefLine}`);
    doc.fontSize(9).fillColor('#334155').text(customerAddrFormatted || '—', { width: 260 });
    if (workSiteName || workSiteAddrOnly) {
      doc.moveDown(0.4);
      doc.fontSize(8).fillColor('#64748b').text('Work / site address');
      doc.font('Helvetica');
      if (workSiteName) {
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f172a').text(workSiteName, { width: 260 });
        doc.font('Helvetica');
      }
      if (workSiteAddrOnly) {
        doc.fontSize(9).fillColor('#334155').text(workSiteAddrOnly, { width: 260 });
      }
    }
    if (customBillingAddr) {
      doc.moveDown(0.4);
      doc.fontSize(8).fillColor('#64748b').text('Billing address');
      doc.fontSize(9).fillColor('#334155').text(customBillingAddr, { width: 260 });
    }

    doc.moveDown(1.2);
    const tableTop = doc.y;
    const colDesc = 50;
    const colQty = 300;
    const colUnit = 360;
    const colAmt = 460;
    doc.fontSize(8).fillColor('#64748b');
    doc.text('Description', colDesc, tableTop, { width: 230 });
    doc.text('Qty', colQty, tableTop, { width: 40, align: 'right' });
    doc.text('Unit', colUnit, tableTop, { width: 70, align: 'right' });
    doc.text('Amount', colAmt, tableTop, { width: 80, align: 'right' });
    doc.moveTo(48, doc.y + 4).lineTo(547, doc.y + 4).stroke('#e2e8f0');
    doc.moveDown(0.8);

    let y = doc.y + 4;
    doc.fontSize(9).fillColor('#0f172a');
    for (const row of lineItemsResult.rows) {
      const desc = row.description || '';
      const qty = parseFloat(row.quantity);
      const unit = parseFloat(row.unit_price);
      const amt = parseFloat(row.amount);
      const startY = y;
      doc.text(desc, colDesc, startY, { width: 230 });
      const afterDesc = doc.y;
      doc.text(String(qty), colQty, startY, { width: 40, align: 'right' });
      doc.text(formatMoney(unit, currency), colUnit, startY, { width: 70, align: 'right' });
      doc.text(formatMoney(amt, currency), colAmt, startY, { width: 80, align: 'right' });
      y = afterDesc + 8;
      doc.y = y;
      if (y > 700) {
        doc.addPage();
        y = 50;
        doc.y = y;
      }
    }

    doc.moveDown(1);
    doc.moveTo(320, doc.y).lineTo(547, doc.y).stroke('#e2e8f0');
    doc.moveDown(0.5);

    const labelX = 320;
    const valX = 460;
    y = doc.y;
    doc.fontSize(9).fillColor('#64748b').text('Subtotal', labelX, y);
    doc.fillColor('#0f172a').text(formatMoney(subtotal, currency), valX, y, { width: 80, align: 'right' });
    y += 16;
    const taxPctLabel =
      subtotal > 0 && taxAmount >= 0
        ? `${taxLabel} (${((taxAmount / subtotal) * 100).toFixed(1)}%)`
        : taxLabel;
    doc.fillColor('#64748b').text(taxPctLabel, labelX, y);
    doc.fillColor('#0f172a').text(formatMoney(taxAmount, currency), valX, y, { width: 80, align: 'right' });
    y += 16;
    doc.fontSize(10).fillColor('#0f172a').text('Total', labelX, y);
    doc.fontSize(10).fillColor('#0d9488').text(formatMoney(totalAmount, currency), valX, y, { width: 80, align: 'right' });
    y += 18;
    doc.fontSize(9).fillColor('#64748b').text('Paid', labelX, y);
    doc.fillColor('#0f172a').text(formatMoney(totalPaid, currency), valX, y, { width: 80, align: 'right' });
    y += 16;
    doc.fontSize(10).fillColor('#b91c1c').text('Balance due', labelX, y);
    doc.text(formatMoney(balance, currency), valX, y, { width: 80, align: 'right' });

    if (inv.notes?.trim()) {
      doc.moveDown(2);
      doc.fontSize(9).fillColor('#64748b').text('Notes');
      doc.fillColor('#334155').text(inv.notes.trim(), { width: 500 });
    }
    if (terms?.trim()) {
      doc.moveDown(1);
      doc.fontSize(8).fillColor('#64748b').text('Terms & conditions', { width: 500 });
      doc.fillColor('#64748b').fontSize(7).text(terms.trim(), { width: 500 });
    }
    if (paymentTerms?.trim() || bankDetails?.trim()) {
      doc.moveDown(1);
      if (paymentTerms?.trim()) {
        doc.fontSize(8).fillColor('#64748b').text('Payment terms', { width: 500 });
        doc.fillColor('#334155').fontSize(7).text(paymentTerms.trim(), { width: 500 });
        doc.moveDown(0.5);
      }
      if (bankDetails?.trim()) {
        doc.fontSize(8).fillColor('#64748b').text('Bank details', { width: 500 });
        doc.fillColor('#334155').fontSize(7).text(bankDetails.trim(), { width: 500 });
      }
    }
    if (footerText?.trim()) {
      doc.moveDown(1);
      doc.fontSize(8).fillColor('#94a3b8').text(footerText.trim(), { width: 500, align: 'center' });
    }

    doc.end();
  });
}
