'use client';

import Image from 'next/image';
import dayjs from 'dayjs';

export type QuotationPrintSettings = {
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
  quotation_accent_color?: string | null;
  quotation_accent_end_color?: string | null;
  payment_terms?: string | null;
  bank_details?: string | null;
};

export type QuotationPrintModel = {
  quotation_number: string;
  customer_full_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  quotation_date: string;
  valid_until: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  currency: string;
  notes: string | null;
  billing_address: string | null;
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
  if (!iso) return '—';
  return dayjs(iso).format('MMM D, YYYY');
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount);
}

type Props = {
  quotation: QuotationPrintModel;
  settings?: QuotationPrintSettings;
  /** Use rounded card + border on screen; flat for minimal public/print wrappers */
  shellClassName?: string;
};

export default function QuotationPrintTemplate({ quotation, settings, shellClassName }: Props) {
  const s = settings;
  const companyName = s?.company_name ?? 'WorkPilot';
  const taxLabel = s?.tax_label ?? 'Tax';
  const accentColor = s?.quotation_accent_color || '#14B8A6';
  const accentEndColor = s?.quotation_accent_end_color || s?.quotation_accent_color || '#0D9488';

  const shell =
    shellClassName ??
    'overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl print:max-w-none print:overflow-visible print:shadow-none print:border-0';

  return (
    <div id="quotation-print" className={shell}>
      <div className="h-1.5 w-full" style={{ background: `linear-gradient(to right, ${accentColor}, ${accentEndColor})` }} />

      <div className="relative border-b border-slate-200 bg-white px-8 py-10 print:border-b">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative size-14 shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
              {s?.company_logo ? (
                <img src={s.company_logo} alt={companyName} className="h-full w-full object-contain" />
              ) : (
                <Image src="/logo.jpg" alt={companyName} fill className="object-contain" />
              )}
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">{companyName}</h2>
              <p className="text-sm font-semibold uppercase tracking-wider text-slate-500">QUOTATION</p>
              {(s?.company_address || s?.company_phone || s?.company_email) && (
                <div className="mt-3 space-y-0.5 text-xs font-medium text-slate-500">
                  {s.company_address && <p>{s.company_address}</p>}
                  {s.company_phone && <p>{s.company_phone}</p>}
                  {s.company_email && <p>{s.company_email}</p>}
                  {s.company_website && <p>{s.company_website}</p>}
                  {s.company_tax_id && <p>Tax ID: {s.company_tax_id}</p>}
                </div>
              )}
            </div>
          </div>
          <div className="text-right sm:text-right">
            <p className="text-2xl font-black italic tracking-tighter" style={{ color: accentColor }}>
              {quotation.quotation_number}
            </p>
            <div className="mt-3 space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Date</div>
              <div className="text-sm font-bold text-slate-900">{formatDate(quotation.quotation_date)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 bg-slate-50/30 px-8 py-8 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Bill To</p>
          <p className="text-base font-bold text-slate-900">{quotation.customer_full_name}</p>
          {quotation.customer_email && <p className="mt-1 text-sm font-medium text-slate-500">{quotation.customer_email}</p>}
          {quotation.customer_phone && <p className="text-sm font-medium text-slate-500">{quotation.customer_phone}</p>}
          {(quotation.billing_address || quotation.customer_address) && (
            <p className="mt-3 text-sm font-medium leading-relaxed text-slate-600">
              {quotation.billing_address || quotation.customer_address}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-6 sm:items-end">
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Valid Until</p>
            <p className="mt-1 text-base font-bold text-slate-900">{formatDate(quotation.valid_until)}</p>
          </div>
        </div>
      </div>

      <div className="px-8 pb-8">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-5 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Service Description</th>
                <th className="px-5 py-3.5 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Qty</th>
                <th className="px-5 py-3.5 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Rate</th>
                <th className="px-5 py-3.5 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {quotation.line_items.map((item) => (
                <tr key={item.id}>
                  <td className="px-5 py-4 text-sm font-semibold text-slate-900">{item.description}</td>
                  <td className="px-5 py-4 text-right text-sm font-medium text-slate-500">{item.quantity}</td>
                  <td className="px-5 py-4 text-right text-sm font-medium text-slate-500">
                    {formatCurrency(item.unit_price, quotation.currency)}
                  </td>
                  <td className="px-5 py-4 text-right text-sm font-bold text-slate-900">
                    {formatCurrency(item.amount, quotation.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-8 flex flex-col items-end gap-2 pr-2 print-break-avoid">
          <div className="flex w-64 justify-between text-sm">
            <span className="font-semibold text-slate-500">Subtotal</span>
            <span className="font-bold text-slate-900">{formatCurrency(quotation.subtotal, quotation.currency)}</span>
          </div>
          <div className="flex w-64 justify-between text-sm">
            <span className="font-semibold text-slate-500">{taxLabel}</span>
            <span className="font-bold text-slate-900">{formatCurrency(quotation.tax_amount, quotation.currency)}</span>
          </div>
          <div className="mt-2 flex w-64 justify-between border-t border-slate-100 pt-3">
            <span className="text-base font-bold text-slate-900">Total</span>
            <span className="text-xl font-black" style={{ color: accentColor }}>
              {formatCurrency(quotation.total_amount, quotation.currency)}
            </span>
          </div>
        </div>

        <div className="mt-12 space-y-6">
          {quotation.notes && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-8 print-break-avoid">
              <p className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-400">Service Notes</p>
              <p className="text-sm font-medium leading-relaxed text-slate-600">{quotation.notes}</p>
            </div>
          )}
          {s?.bank_details && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-8 print-break-avoid">
              <p className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-400">Payment Information</p>
              <p className="whitespace-pre-wrap text-sm font-medium leading-relaxed text-slate-600">{s.bank_details}</p>
            </div>
          )}
          {s?.terms_and_conditions && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-8 print-break-avoid">
              <p className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-400">Terms & Conditions</p>
              <div className="prose prose-sm max-w-none">
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-600">{s.terms_and_conditions}</p>
              </div>
            </div>
          )}
          {s?.payment_terms && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/30 p-8 print-break-avoid">
              <p className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-400">Payment Terms</p>
              <p className="whitespace-pre-wrap text-sm font-medium leading-relaxed text-slate-600">{s.payment_terms}</p>
            </div>
          )}
        </div>

        {s?.footer_text && (
          <p className="mt-12 border-t border-slate-100 pt-8 text-center text-xs font-medium text-slate-400">{s.footer_text}</p>
        )}
      </div>
    </div>
  );
}
