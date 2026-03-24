'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Quote, Send, DollarSign, Clock, Printer, Check, X, FileText } from 'lucide-react';
import { motion } from 'framer-motion';
import { getJson, postJson } from '../../../apiClient';

interface LineItem {
  id: number;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  sort_order: number;
}

interface Activity {
  id: number;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
  created_by: number | null;
}

interface QuotationSettings {
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
}

interface Quotation {
  id: number;
  quotation_number: string;
  customer_id: number;
  customer_full_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  job_id: number | null;
  job_title: string | null;
  quotation_date: string;
  valid_until: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  currency: string;
  notes: string | null;
  billing_address: string | null;
  state: string;
  created_at: string;
  updated_at: string;
  line_items: LineItem[];
  activities: Activity[];
  settings?: QuotationSettings;
}

const QUOTATION_STATES = [
  { value: 'draft', label: 'Draft', color: 'bg-slate-100 text-slate-600' },
  { value: 'sent', label: 'Sent', color: 'bg-blue-100 text-blue-800' },
  { value: 'accepted', label: 'Accepted', color: 'bg-emerald-100 text-emerald-800' },
  { value: 'rejected', label: 'Rejected', color: 'bg-rose-100 text-rose-800' },
  { value: 'expired', label: 'Expired', color: 'bg-slate-200 text-slate-500' },
] as const;

const ACTION_LABELS: Record<string, string> = {
  created: 'Quotation created',
  updated: 'Quotation updated',
  sent_to_client: 'Sent to client',
  accepted: 'Quotation accepted',
  rejected: 'Quotation rejected',
  transferred_to_invoice: 'Transferred to invoice',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

export default function QuotationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === 'string' ? params.id : String(params.id);
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [transferring, setTransferring] = useState(false);

  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  const fetchQuotation = useCallback(async () => {
    if (!token || !id) return;
    try {
      const data = await getJson<{ quotation: Quotation }>(`/quotations/${id}`, token);
      setQuotation(data.quotation);
    } catch {
      setQuotation(null);
    }
  }, [token, id]);

  useEffect(() => {
    fetchQuotation();
  }, [fetchQuotation]);

  const handleSend = async () => {
    if (!token || !quotation) return;
    setSending(true);
    setActionError(null);
    try {
      await postJson(`/quotations/${id}/send`, {}, token);
      fetchQuotation();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const handleAccept = async () => {
    if (!token || !quotation) return;
    setActionError(null);
    try {
      await postJson(`/quotations/${id}/accept`, {}, token);
      fetchQuotation();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to accept');
    }
  };

  const handleReject = async () => {
    if (!token || !quotation) return;
    setActionError(null);
    try {
      await postJson(`/quotations/${id}/reject`, {}, token);
      fetchQuotation();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to reject');
    }
  };

  const handleTransferToInvoice = async () => {
    if (!token || !quotation) return;
    setTransferring(true);
    setActionError(null);
    try {
      const res = await postJson<{ invoice: { id: number } }>(`/quotations/${id}/transfer-to-invoice`, {}, token);
      if (res.invoice?.id) router.push(`/dashboard/invoices/${res.invoice.id}`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to transfer to invoice');
    } finally {
      setTransferring(false);
    }
  };

  if (quotation === null) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-slate-500">Quotation not found or loading…</div>
      </div>
    );
  }

  const stateOpt = QUOTATION_STATES.find((s) => s.value === quotation.state) ?? QUOTATION_STATES[0];
  const canSend = quotation.state === 'draft';
  const canAcceptReject = quotation.state === 'sent';
  const canTransferToInvoice = quotation.state === 'accepted';
  const hasRelatedJob = quotation.job_id != null && quotation.job_title && quotation.job_title.trim() !== '';

  const handlePrint = () => window.print();

  const s = quotation.settings;
  const companyName = s?.company_name ?? 'WorkPilot';
  const taxLabel = s?.tax_label ?? 'Tax';

  const QuotationContent = () => (
    <div id="quotation-print" className="quotation-print-area">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl print:shadow-none print:border-0">
        <div className="relative border-b border-slate-200 bg-white px-8 py-10 print:border-b">
          <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-[#14B8A6] to-teal-600" />
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="relative size-14 shrink-0 overflow-hidden rounded-xl border border-slate-100 shadow-sm">
                {s?.company_logo ? (
                  <img src={s.company_logo} alt={companyName} className="h-full w-full object-contain" />
                ) : (
                  <Image src="/logo.jpg" alt={companyName} fill className="object-contain" />
                )}
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">{companyName}</h1>
                <p className="mt-0.5 text-sm font-medium text-slate-500">QUOTATION</p>
                {(s?.company_address || s?.company_phone || s?.company_email || s?.company_website || s?.company_tax_id) && (
                  <div className="mt-2 space-y-0.5 text-xs text-slate-600">
                    {s.company_address && <p className="leading-snug">{s.company_address}</p>}
                    {s.company_website && <p><a href={s.company_website.startsWith('http') ? s.company_website : `https://${s.company_website}`} target="_blank" rel="noopener noreferrer" className="text-[#14B8A6] hover:underline">{s.company_website}</a></p>}
                    {s.company_tax_id && <p>Tax ID: {s.company_tax_id}</p>}
                    {s.company_phone && <p>{s.company_phone}</p>}
                    {s.company_email && <p>{s.company_email}</p>}
                  </div>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold tracking-tight text-[#14B8A6]">{quotation.quotation_number}</p>
              <span className={`mt-2 inline-block rounded-md px-3 py-1 text-xs font-semibold ${stateOpt.color}`}>
                {stateOpt.label}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 px-8 py-8 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Quote for</p>
            <p className="text-base font-semibold text-slate-900">{quotation.customer_full_name}</p>
            {quotation.customer_email && <p className="mt-1 text-sm text-slate-600">{quotation.customer_email}</p>}
            {quotation.customer_phone && <p className="text-sm text-slate-600">{quotation.customer_phone}</p>}
            {(quotation.customer_address || quotation.billing_address) && (
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                {quotation.billing_address || quotation.customer_address}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-6 sm:justify-end sm:gap-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Quotation date</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{formatDate(quotation.quotation_date)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Valid until</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{formatDate(quotation.valid_until)}</p>
            </div>
            {hasRelatedJob && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Related job</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{quotation.job_title}</p>
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
              {quotation.line_items.map((item, i) => (
                <tr key={item.id} className={`border-b border-slate-100 ${i % 2 === 1 ? 'bg-slate-50/50' : ''}`}>
                  <td className="px-5 py-3.5 text-sm font-medium text-slate-900">{item.description}</td>
                  <td className="px-5 py-3.5 text-right text-sm text-slate-600">{item.quantity}</td>
                  <td className="px-5 py-3.5 text-right text-sm text-slate-600">{formatCurrency(item.unit_price, quotation.currency)}</td>
                  <td className="px-5 py-3.5 text-right text-sm font-medium text-slate-900">{formatCurrency(item.amount, quotation.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-8 flex flex-col items-end gap-1.5 border-t-2 border-slate-200 pt-6">
            <div className="flex w-72 max-w-full justify-between text-sm">
              <span className="text-slate-600">Subtotal</span>
              <span className="font-medium text-slate-900">{formatCurrency(quotation.subtotal, quotation.currency)}</span>
            </div>
            <div className="flex w-72 max-w-full justify-between text-sm">
              <span className="text-slate-600">
                {quotation.subtotal > 0
                  ? `${taxLabel} (${((quotation.tax_amount / quotation.subtotal) * 100).toFixed(1)}%)`
                  : taxLabel}
              </span>
              <span className="font-medium text-slate-900">{formatCurrency(quotation.tax_amount, quotation.currency)}</span>
            </div>
            <div className="flex w-72 max-w-full justify-between border-t border-slate-200 pt-3 text-base font-bold">
              <span className="text-slate-900">Total</span>
              <span className="text-[#14B8A6]">{formatCurrency(quotation.total_amount, quotation.currency)}</span>
            </div>
          </div>
          {quotation.notes && (
            <div className="mt-6 rounded-lg border border-slate-100 bg-slate-50/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Notes</p>
              <p className="mt-1 text-sm text-slate-700 leading-relaxed">{quotation.notes}</p>
            </div>
          )}
          {s?.terms_and_conditions && (
            <div className="mt-6 rounded-lg border border-slate-100 bg-slate-50/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Terms & conditions</p>
              <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600 leading-relaxed">{s.terms_and_conditions}</p>
            </div>
          )}
          {s?.footer_text && (
            <p className="mt-6 text-center text-xs text-slate-500">{s.footer_text}</p>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          .no-print { display: none !important; }
          aside { display: none !important; }
          main { padding: 0 !important; }
          #quotation-print { box-shadow: none !important; }
          #quotation-print .rounded-2xl { border-radius: 0 !important; }
        }
      `}} />
      <div className="flex-1 overflow-y-auto p-8 print:p-0">
        <div className="mx-auto max-w-6xl space-y-6 print:max-w-none">
          <div className="no-print flex items-center justify-between">
            <Link href="/dashboard/quotations" className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900">
              <ArrowLeft className="size-4" />
              Back to Quotations
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={handlePrint} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50">
                <Printer className="size-4" />
                Print Quotation
              </button>
              {canSend && (
                <button onClick={handleSend} disabled={sending} className="rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#13a89a] disabled:opacity-50">
                  <Send className="mr-2 inline size-4" /> Send to Client
                </button>
              )}
              {canAcceptReject && (
                <>
                  <button onClick={handleAccept} className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100">
                    <Check className="size-4" /> Accept
                  </button>
                  <button onClick={handleReject} className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-100">
                    <X className="size-4" /> Reject
                  </button>
                </>
              )}
              {canTransferToInvoice && (
                <button onClick={handleTransferToInvoice} disabled={transferring} className="inline-flex items-center gap-2 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#13a89a] disabled:opacity-50">
                  <FileText className="size-4" /> {transferring ? 'Creating…' : 'Transfer to Invoice'}
                </button>
              )}
            </div>
          </div>
          {actionError && (
            <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{actionError}</div>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <QuotationContent />
            </div>
            <div className="no-print lg:col-span-1 space-y-6">
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900">
                  <DollarSign className="size-5" />
                  Summary
                </h2>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Total amount</span>
                    <span className="font-semibold">{formatCurrency(quotation.total_amount, quotation.currency)}</span>
                  </div>
                </div>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900">
                  <Clock className="size-5" />
                  Activity Log
                </h2>
                <div className="space-y-3">
                  {quotation.activities.length === 0 ? (
                    <p className="text-sm text-slate-500">No activity yet</p>
                  ) : (
                    quotation.activities.map((a) => (
                      <div key={a.id} className="flex gap-3 border-l-2 border-slate-200 pl-3">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{ACTION_LABELS[a.action] || a.action}</p>
                          <p className="text-xs text-slate-500">{formatDateTime(a.created_at)}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
