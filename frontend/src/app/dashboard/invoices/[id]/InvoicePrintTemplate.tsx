'use client';

import Image from 'next/image';

export type InvoicePrintSettings = {
  company_name: string;
  company_address: string | null;
  company_phone: string | null;
  company_email: string | null;
  company_logo: string | null;
  company_website: string | null;
  company_tax_id: string | null;
  tax_label: string;
  terms_and_conditions: string | null;
  footer_text: string | null;
  invoice_accent_color?: string;
  invoice_accent_end_color?: string;
  payment_terms?: string | null;
  bank_details?: string | null;
};

export type InvoicePrintModel = {
  invoice_number: string;
  customer_full_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  /** Resolved for display: invoice reference, else job reference. */
  customer_reference_display?: string | null;
  /** Site / work name (bold), separate from address line. */
  work_site_name?: string | null;
  /** Work/site address only (no site name). */
  work_site_address?: string | null;
  /** Custom billing text when not using work/site (optional second block). */
  invoice_custom_address?: string | null;
  job_id: number | null;
  invoice_date: string;
  due_date: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  total_paid: number;
  currency: string;
  notes: string | null;
  description: string | null;
  billing_address: string | null;
  state: string;
  line_items: {
    id: number;
    description: string;
    quantity: number;
    unit_price: number;
    amount: number;
    sort_order: number;
  }[];
};

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount);
  } catch {
    return `£${amount.toFixed(2)}`;
  }
}

type Props = {
  invoice: InvoicePrintModel;
  settings?: InvoicePrintSettings;
};

export default function InvoicePrintTemplate({ invoice, settings }: Props) {
  const companyName = settings?.company_name || 'WorkPilot';
  const taxLabel = settings?.tax_label || 'Tax';
  const customerAddrLine = invoice.customer_address?.trim() || '—';
  const balanceDue = invoice.total_amount - invoice.total_paid;
  const accent =
    settings?.invoice_accent_color && /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(settings.invoice_accent_color)
      ? settings.invoice_accent_color
      : '#14B8A6';
  const accentEnd =
    settings?.invoice_accent_end_color && /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(settings.invoice_accent_end_color)
      ? settings.invoice_accent_end_color
      : '#0d9488';

  return (
    <div id="invoice-print" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
      <div className="relative border-b border-slate-200 bg-white px-8 py-10">
        <div className="absolute left-0 top-0 h-1 w-full" style={{ background: `linear-gradient(to right, ${accent}, ${accentEnd})` }} />
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative size-14 shrink-0 overflow-hidden rounded-xl border border-slate-100 shadow-sm">
              {settings?.company_logo ? (
                <img src={settings.company_logo} alt={companyName} className="h-full w-full object-contain" />
              ) : (
                <Image src="/logo.jpg" alt={companyName} fill className="object-contain" />
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">{companyName}</h1>
              <p className="mt-0.5 text-sm font-medium text-slate-500">INVOICE</p>
              {(settings?.company_address ||
                settings?.company_phone ||
                settings?.company_email ||
                settings?.company_website ||
                settings?.company_tax_id) && (
                <div className="mt-2 space-y-0.5 text-xs text-slate-600">
                  {settings.company_address && <p className="leading-snug">{settings.company_address}</p>}
                  {settings.company_website && <p>{settings.company_website}</p>}
                  {settings.company_tax_id && <p>Tax ID: {settings.company_tax_id}</p>}
                  {settings.company_phone && <p>{settings.company_phone}</p>}
                  {settings.company_email && <p>{settings.company_email}</p>}
                </div>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold tracking-tight" style={{ color: accent }}>
              {invoice.invoice_number}
            </p>
            <span className="mt-2 inline-block rounded-md bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {invoice.state.replace('_', ' ')}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 px-8 py-8 sm:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Invoice for</p>
            <p className="text-base font-semibold text-slate-900">{invoice.customer_full_name || '-'}</p>
            {invoice.customer_email && <p className="mt-1 text-sm text-slate-600">{invoice.customer_email}</p>}
            {invoice.customer_phone && <p className="text-sm text-slate-600">{invoice.customer_phone}</p>}
            {invoice.customer_reference_display?.trim() && (
              <p className="mt-1 text-sm text-slate-600">
                <span className="font-medium text-slate-700">Customer reference:</span> {invoice.customer_reference_display.trim()}
              </p>
            )}
            <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Customer address</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">{customerAddrLine}</p>
          </div>
          {(invoice.work_site_name?.trim() || invoice.work_site_address?.trim()) && (
            <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Work / site address</p>
              {invoice.work_site_name?.trim() && (
                <p className="text-base font-bold text-slate-900">{invoice.work_site_name.trim()}</p>
              )}
              {invoice.work_site_address?.trim() && (
                <p className={`text-sm leading-relaxed text-slate-600 ${invoice.work_site_name?.trim() ? 'mt-1' : ''}`}>
                  {invoice.work_site_address.trim()}
                </p>
              )}
            </div>
          )}
          {invoice.invoice_custom_address?.trim() &&
            !invoice.work_site_name?.trim() &&
            !invoice.work_site_address?.trim() && (
            <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Billing address</p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{invoice.invoice_custom_address.trim()}</p>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-6 sm:justify-end sm:gap-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Invoice date</p>
            <p className="mt-1 text-sm font-medium text-slate-900">{formatDate(invoice.invoice_date)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Due date</p>
            <p className="mt-1 text-sm font-medium text-slate-900">{formatDate(invoice.due_date)}</p>
          </div>
          {invoice.job_id && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Related job</p>
              <p className="mt-1 text-sm font-medium text-slate-900">#{invoice.job_id.toString().padStart(4, '0')}</p>
            </div>
          )}
        </div>
      </div>

      {invoice.description && (
        <div className="px-8 pt-4 pb-8">
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">Description</p>
          <p className="whitespace-pre-wrap text-base leading-relaxed text-slate-700">{invoice.description}</p>
        </div>
      )}

      <div className="px-8 pb-8">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-y-2 border-slate-200 bg-slate-100/80">
              <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Description</th>
              <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Qty</th>
              <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Unit price</th>
              <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.line_items.map((item, i) => (
              <tr key={item.id} className={`border-b border-slate-100 ${i % 2 === 1 ? 'bg-slate-50/50' : ''}`}>
                <td className="px-5 py-3.5 text-sm font-medium text-slate-900">{item.description}</td>
                <td className="px-5 py-3.5 text-right text-sm text-slate-600">{item.quantity}</td>
                <td className="px-5 py-3.5 text-right text-sm text-slate-600">{formatCurrency(item.unit_price, invoice.currency)}</td>
                <td className="px-5 py-3.5 text-right text-sm font-medium text-slate-900">{formatCurrency(item.amount, invoice.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-8 flex flex-col items-end gap-1.5 border-t-2 border-slate-200 pt-6">
          <div className="flex w-72 max-w-full justify-between text-sm">
            <span className="text-slate-600">Subtotal</span>
            <span className="font-medium text-slate-900">{formatCurrency(invoice.subtotal, invoice.currency)}</span>
          </div>
          <div className="flex w-72 max-w-full justify-between text-sm">
            <span className="text-slate-600">
              {invoice.subtotal > 0 ? `${taxLabel} (${((invoice.tax_amount / invoice.subtotal) * 100).toFixed(1)}%)` : taxLabel}
            </span>
            <span className="font-medium text-slate-900">{formatCurrency(invoice.tax_amount, invoice.currency)}</span>
          </div>
          <div className="flex w-72 max-w-full justify-between border-t border-slate-200 pt-3 text-base font-bold">
            <span className="text-slate-900">Total</span>
            <span style={{ color: accent }}>{formatCurrency(invoice.total_amount, invoice.currency)}</span>
          </div>
          <div className="flex w-72 max-w-full justify-between text-sm">
            <span className="text-slate-600">Paid</span>
            <span className="font-medium text-slate-900">{formatCurrency(invoice.total_paid, invoice.currency)}</span>
          </div>
          <div className="flex w-72 max-w-full justify-between border-t border-slate-200 pt-3 text-base font-bold">
            <span className="text-slate-900">Balance due</span>
            <span className="text-rose-600">{formatCurrency(balanceDue, invoice.currency)}</span>
          </div>
        </div>
        {invoice.notes && (
          <div className="mt-6 rounded-lg border border-slate-100 bg-slate-50/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Notes</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-700">{invoice.notes}</p>
          </div>
        )}
        {settings?.terms_and_conditions && (
          <div className="mt-6 rounded-lg border border-slate-100 bg-slate-50/30 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Terms & conditions</p>
            <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-600">{settings.terms_and_conditions}</p>
          </div>
        )}
        {(settings?.payment_terms || settings?.bank_details) && (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {settings?.payment_terms && (
              <div className="rounded-lg border border-slate-100 bg-slate-50/30 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Payment terms</p>
                <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-600">{settings.payment_terms}</p>
              </div>
            )}
            {settings?.bank_details && (
              <div className="rounded-lg border border-slate-100 bg-slate-50/30 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Bank details</p>
                <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-600">{settings.bank_details}</p>
              </div>
            )}
          </div>
        )}
        {settings?.footer_text && <p className="mt-6 text-center text-xs text-slate-500">{settings.footer_text}</p>}
      </div>
    </div>
  );
}
