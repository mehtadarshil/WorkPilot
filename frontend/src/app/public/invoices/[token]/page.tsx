'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Printer, AlertCircle } from 'lucide-react';
import dayjs from 'dayjs';
import { getJson } from '../../../apiClient';

/**
 * Public Invoice View - Exact match of dashboard template
 */
export default function PublicInvoicePage() {
  const params = useParams();
  const token = params?.token as string;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    getJson<any>(`/public/invoices/${token}`)
      .then(setData)
      .catch(err => setError(err.message || 'Invoice not found'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#14B8A6] border-t-transparent"></div>
      <p className="mt-4 font-medium text-slate-500">Loading invoice...</p>
    </div>
  );

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md w-full rounded-2xl bg-white p-8 text-center shadow-xl border border-slate-100">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-rose-50 text-rose-500">
            <AlertCircle className="size-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Unable to load invoice</h2>
          <p className="mt-2 text-slate-600">{error || 'This link might have expired or is incorrect.'}</p>
        </div>
      </div>
    );
  }

  const { invoice, line_items, business } = data;
  const settings = invoice.settings;
  const companyName = business.name || 'WorkPilot';
  const taxLabel = settings?.tax_label || 'Tax';
  const balanceDue = Number(invoice.total_amount) - Number(invoice.total_paid);
  const accent = settings?.invoice_accent_color || '#14B8A6';
  const accentEnd = settings?.invoice_accent_end_color || '#0d9488';

  function formatCurrency(amount: number, currency: string): string {
    try {
      return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount);
    } catch {
      return `£${amount.toFixed(2)}`;
    }
  }

  function formatDate(iso: string | null): string {
    if (!iso) return '-';
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-8">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          html, body { 
            background: white !important; 
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          .no-print { display: none !important; }
          #invoice-print { 
            box-shadow: none !important; 
            border: none !important; 
            border-radius: 0 !important; 
            width: 100% !important; 
            margin: 0 !important; 
            max-width: none !important;
            overflow: visible !important;
            display: block !important;
          }
          /* Force backgrounds and gradients to appear */
          #invoice-print, #invoice-print * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          /* Ensure the top accent bar prints as a block */
          #print-accent-bar {
            display: block !important;
            min-height: 4px !important;
            width: 100% !important;
            background: linear-gradient(to right, ${accent}, ${accentEnd}) !important;
          }
          @page { margin: 10mm; }
        }
      `}} />

      <div className="no-print mx-auto mb-8 flex max-w-4xl items-center justify-between px-2">
        <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-sm border border-slate-200 overflow-hidden">
                <img src="/logo.jpg" alt="WorkPilot" className="size-full object-contain" />
            </div>
            <h2 className="text-[13px] font-bold text-slate-600 tracking-tight">Invoice Portal</h2>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-lg bg-[#14B8A6] px-5 py-2 text-sm font-bold text-white shadow-md hover:bg-[#13a89a] transition-all active:scale-95"
        >
          <Printer className="size-4" />
          Print / Save PDF
        </button>
      </div>

      <div id="invoice-print" className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        {/* Exact Copy of Dashboard Template Content */}
        <div className="relative border-b border-slate-200 bg-white px-8 py-10">
          <div
            id="print-accent-bar"
            className="absolute left-0 top-0 h-1 w-full"
            style={{ background: `linear-gradient(to right, ${accent}, ${accentEnd})` }}
          />
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="relative size-14 shrink-0 overflow-hidden rounded-xl border border-slate-100 shadow-sm">
                {business.logo ? (
                  <img src={business.logo} alt={companyName} className="h-full w-full object-contain" />
                ) : (
                  <img src="/logo.jpg" alt={companyName} className="size-full object-contain" />
                )}
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">{companyName}</h1>
                <p className="mt-0.5 text-sm font-medium text-slate-500">INVOICE</p>
                {(settings?.company_address || business.address) && (
                  <div className="mt-2 space-y-0.5 text-xs text-slate-600">
                    <p className="leading-snug">{business.address || settings?.company_address}</p>
                    {settings?.company_website && <p>{settings.company_website}</p>}
                    {settings?.company_tax_id && <p>Tax ID: {settings.company_tax_id}</p>}
                    {settings?.company_phone && <p>{settings.company_phone}</p>}
                    {settings?.company_email && <p>{settings.company_email}</p>}
                  </div>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold tracking-tight" style={{ color: accent }}>
                {invoice.invoice_number}
              </p>
              <span className="mt-2 inline-block rounded-md bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{invoice.state.replace('_', ' ')}</span>
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
              <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Customer address</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{invoice.billing_address || invoice.customer_address || '—'}</p>
            </div>
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
            {invoice.customer_reference && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Reference</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{invoice.customer_reference}</p>
              </div>
            )}
          </div>
        </div>

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
              {line_items.map((item: any, i: number) => (
                <tr key={item.id} className={`border-b border-slate-100 ${i % 2 === 1 ? 'bg-slate-50/50' : ''}`}>
                  <td className="px-5 py-3.5 text-sm font-medium text-slate-900">{item.description}</td>
                  <td className="px-5 py-3.5 text-right text-sm text-slate-600">{item.quantity}</td>
                  <td className="px-5 py-3.5 text-right text-sm text-slate-600">{formatCurrency(Number(item.unit_price), invoice.currency)}</td>
                  <td className="px-5 py-3.5 text-right text-sm font-medium text-slate-900">{formatCurrency(Number(item.amount), invoice.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-8 flex flex-col items-end gap-1.5 border-t-2 border-slate-200 pt-6">
            <div className="flex w-72 max-w-full justify-between text-sm">
              <span className="text-slate-600">Subtotal</span>
              <span className="font-medium text-slate-900">{formatCurrency(Number(invoice.subtotal), invoice.currency)}</span>
            </div>
            <div className="flex w-72 max-w-full justify-between text-sm">
              <span className="text-slate-600">{taxLabel}</span>
              <span className="font-medium text-slate-900">{formatCurrency(Number(invoice.tax_amount), invoice.currency)}</span>
            </div>
            <div className="flex w-72 max-w-full justify-between border-t border-slate-200 pt-3 text-base font-bold">
              <span className="text-slate-900">Total</span>
              <span style={{ color: accent }}>{formatCurrency(Number(invoice.total_amount), invoice.currency)}</span>
            </div>
            <div className="flex w-72 max-w-full justify-between text-sm">
              <span className="text-slate-600">Paid</span>
              <span className="font-medium text-slate-900">{formatCurrency(Number(invoice.total_paid), invoice.currency)}</span>
            </div>
            <div className="flex w-72 max-w-full justify-between border-t border-slate-200 pt-3 text-base font-bold">
              <span className="text-slate-900">Balance due</span>
              <span className="text-rose-600">{formatCurrency(balanceDue, invoice.currency)}</span>
            </div>
          </div>
          {invoice.notes && (
            <div className="mt-6 rounded-lg border border-slate-100 bg-slate-50/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Notes</p>
              <p className="mt-1 text-sm text-slate-700 leading-relaxed">{invoice.notes}</p>
            </div>
          )}
          {settings?.terms_and_conditions && (
            <div className="mt-6 rounded-lg border border-slate-100 bg-slate-50/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Terms & conditions</p>
              <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600 leading-relaxed">{settings.terms_and_conditions}</p>
            </div>
          )}
          {(settings?.payment_terms || settings?.bank_details) && (
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {settings?.payment_terms && (
                <div className="rounded-lg border border-slate-100 bg-slate-50/30 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Payment terms</p>
                  <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600 leading-relaxed">{settings.payment_terms}</p>
                </div>
              )}
              {settings?.bank_details && (
                <div className="rounded-lg border border-slate-100 bg-slate-50/30 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Bank details</p>
                  <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600 leading-relaxed">{settings.bank_details}</p>
                </div>
              )}
            </div>
          )}
          {settings?.footer_text && <p className="mt-6 text-center text-xs text-slate-500">{settings.footer_text}</p>}
        </div>
      </div>

      <div className="no-print mt-10 text-center text-[11px] font-semibold text-slate-400">
        POWERED BY WORKPILOT
      </div>
    </div>
  );
}
