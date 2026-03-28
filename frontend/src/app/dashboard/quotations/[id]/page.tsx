'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowLeft,
  Quote,
  Send,
  DollarSign,
  Clock,
  Printer,
  Check,
  X,
  FileText,
  Info,
  Pencil,
  Trash2
} from 'lucide-react';
import { motion } from 'framer-motion';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import advancedFormat from 'dayjs/plugin/advancedFormat';

dayjs.extend(relativeTime);
dayjs.extend(advancedFormat);
import { getJson, postJson, deleteRequest } from '../../../apiClient';
import QuotationNotesPanel from './QuotationNotesPanel';
import QuotationEmailComposer from './QuotationEmailComposer';

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
  quotation_accent_color?: string | null;
  quotation_accent_end_color?: string | null;
  payment_terms?: string | null;
  bank_details?: string | null;
}

interface Quotation {
  id: number;
  quotation_number: string;
  customer_id: number;
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

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return dayjs(iso).format('MMM D, YYYY');
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount);
}

export default function QuotationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === 'string' ? params.id : String(params.id);

  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'notes'>('details');
  const [emailComposerOpen, setEmailComposerOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  const fetchQuotation = useCallback(async (opts?: { silent?: boolean }) => {
    if (!token || !id) return;
    if (!opts?.silent) setLoading(true);
    try {
      const data = await getJson<{ quotation: Quotation }>(`/quotations/${id}`, token);
      setQuotation(data.quotation);
    } catch {
      setQuotation(null);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [token, id]);

  useEffect(() => {
    fetchQuotation();
  }, [fetchQuotation]);

  const handleAccept = async () => {
    if (!token || !quotation) return;
    setActionError(null);
    try {
      await postJson(`/quotations/${id}/accept`, {}, token);
      fetchQuotation({ silent: true });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to accept');
    }
  };

  const handleReject = async () => {
    if (!token || !quotation) return;
    setActionError(null);
    try {
      await postJson(`/quotations/${id}/reject`, {}, token);
      fetchQuotation({ silent: true });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to reject');
    }
  };

  const handleTransferToInvoice = async () => {
    if (!token || !quotation) return;
    setActionError(null);
    try {
      const res = await postJson<{ invoice: { id: number } }>(`/quotations/${id}/transfer-to-invoice`, {}, token);
      if (res.invoice?.id) router.push(`/dashboard/invoices/${res.invoice.id}`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to transfer to invoice');
    }
  };

  const handleDeleteQuotation = async () => {
    if (!token || !id) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteRequest(`/quotations/${id}`, token);
      router.push('/dashboard/quotations');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete quotation');
    } finally {
      setDeleting(false);
    }
  };

  const handlePrint = () => window.print();

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#14B8A6] border-t-transparent" />
      </div>
    );
  }

  if (!quotation) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-slate-500">
        Quotation not found.
      </div>
    );
  }

  const s = quotation.settings;
  const companyName = s?.company_name ?? 'WorkPilot';
  const taxLabel = s?.tax_label ?? 'Tax';
  const accentColor = s?.quotation_accent_color || '#14B8A6';
  const accentEndColor = s?.quotation_accent_end_color || s?.quotation_accent_color || '#0D9488';

  const stateOpt = QUOTATION_STATES.find((st) => st.value === quotation.state) ?? QUOTATION_STATES[0];

  const canAcceptReject = quotation.state === 'sent';
  const canTransferToInvoice = quotation.state === 'accepted';

  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
        @media print {
          /* Force all parents to show full height and allow breaks */
          html, body, #wp-dashboard-root, #wp-dashboard-root > main, .quotation-page-root, .min-h-0.flex-1 {
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
            display: block !important;
            position: static !important;
            background: #fff !important;
          }

          /* Hide UI elements */
          .no-print, header, aside {
            display: none !important;
          }

          /* Print area cleanup */
          .mx-auto.max-w-6xl {
            max-width: none !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .rounded-2xl, .rounded-xl {
            border-radius: 0 !important;
            border: none !important;
            box-shadow: none !important;
          }

          .quotation-page-root {
            padding: 0 !important;
            margin: 0 !important;
          }

          /* Ensure colors print */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }

          /* Prevent page break inside key sections */
          .print-break-avoid {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          @page {
            margin: 10mm 12mm;
            size: auto;
          }
        }
      `}} />

      <div className="quotation-page-root flex flex-1 flex-col overflow-hidden bg-[#f8fafc] print:bg-white">

        {/* Header */}
        <div className="no-print border-b border-slate-200 bg-white px-8 py-4 shadow-sm">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/dashboard/quotations" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
                <ArrowLeft className="size-5" />
              </Link>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-bold text-slate-900">{quotation.quotation_number}</h1>
                  <span className={`rounded-md px-2.5 py-0.5 text-xs font-semibold ${stateOpt.color}`}>
                    {stateOpt.label}
                  </span>
                </div>
                <p className="text-sm text-slate-500">Quotation for {quotation.customer_full_name}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handlePrint}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
                title="Print quotation"
              >
                <Printer className="size-4" />
                <span className="hidden sm:inline">Print</span>
              </button>

              <button
                onClick={() => setEmailComposerOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#13a89a] transition-colors"
              >
                <Send className="size-4" />
                <span>Send</span>
              </button>

              <div className="h-6 w-px bg-slate-200 mx-1" />

              {canAcceptReject && (
                <>
                  <button onClick={handleAccept} className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 transition-colors">
                    <Check className="size-4" />
                    Accept
                  </button>
                  <button onClick={handleReject} className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-100 transition-colors">
                    <X className="size-4" />
                    Reject
                  </button>
                </>
              )}

              {canTransferToInvoice && (
                <button onClick={handleTransferToInvoice} className="inline-flex items-center gap-2 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#13a89a] transition-colors">
                  <FileText className="size-4" />
                  Transfer to Invoice
                </button>
              )}

              <div className="relative">
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  onBlur={() => setTimeout(() => setMenuOpen(false), 200)}
                  className={`rounded-lg border p-2 transition-colors ${menuOpen ? 'border-[#14B8A6] bg-[#14B8A6]/5 text-[#14B8A6]' : 'border-slate-200 text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                    }`}
                >
                  <span className="sr-only">Actions</span>
                  <svg className="size-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                  </svg>
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-xl">
                    <Link
                      href={`/dashboard/quotations/${id}/edit`}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <Pencil className="size-4" /> Edit quotation
                    </Link>
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        setDeleteDialogOpen(true);
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-rose-600 hover:bg-rose-50 transition-colors text-left"
                    >
                      <Trash2 className="size-4" /> Delete quotation
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Context Ribbon */}
        <div className="no-print border-b border-slate-200 bg-slate-50 px-8 py-3">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-2 text-sm">
            <div className="flex items-center gap-2 text-slate-600">
              <span className="font-medium text-slate-500">Customer:</span>
              <Link href={`/dashboard/customers/${quotation.customer_id}`} className="font-semibold text-[#14B8A6] hover:underline">
                {quotation.customer_full_name}
              </Link>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <span className="font-medium text-slate-500">Total:</span>
              <span className="font-bold text-slate-900">{formatCurrency(quotation.total_amount, quotation.currency)}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <span className="font-medium text-slate-500">Date:</span>
              <span className="font-medium text-slate-900">{formatDate(quotation.quotation_date)}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <span className="font-medium text-slate-500">Expires:</span>
              <span className="font-medium text-slate-900">{formatDate(quotation.valid_until)}</span>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="min-h-0 flex-1 overflow-y-auto print:overflow-visible">
          <div className="mx-auto max-w-6xl p-8 print:p-0">

            {/* Tabs Toggle */}
            <div className="no-print mb-6 flex gap-1 rounded-xl bg-slate-200/50 p-1 w-fit">
              <button
                onClick={() => setActiveTab('details')}
                className={`rounded-lg px-6 py-2 text-sm font-bold transition-all ${activeTab === 'details' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
              >
                Details
              </button>
              <button
                onClick={() => setActiveTab('notes')}
                className={`rounded-lg px-6 py-2 text-sm font-bold transition-all ${activeTab === 'notes' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
              >
                Notes & Communications
              </button>
            </div>

            {actionError && (
              <div className="mb-6 rounded-lg bg-rose-50 p-4 text-sm text-rose-700 font-medium no-print">
                {actionError}
              </div>
            )}

            {activeTab === 'details' ? (
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl print:shadow-none print:border-0">

                    {/* Quotation Header Decoration */}
                    <div
                      className="h-1.5 w-full"
                      style={{ background: `linear-gradient(to right, ${accentColor}, ${accentEndColor})` }}
                    />

                    <div className="relative border-b border-slate-200 bg-white px-8 py-10 print:border-b">
                      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex items-center gap-4">
                          <div className="relative size-14 shrink-0 overflow-hidden rounded-xl border border-slate-100 shadow-sm bg-white">
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
                              <div className="mt-3 space-y-0.5 text-xs text-slate-500 font-medium">
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

                    <div className="grid grid-cols-1 gap-8 px-8 py-8 sm:grid-cols-2 bg-slate-50/30">
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
                                <td className="px-5 py-4 text-right text-sm font-medium text-slate-500">{formatCurrency(item.unit_price, quotation.currency)}</td>
                                <td className="px-5 py-4 text-right text-sm font-bold text-slate-900">{formatCurrency(item.amount, quotation.currency)}</td>
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

                      <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-2 print:block">
                        <div className="space-y-6">
                          {quotation.notes && (
                            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-5 print-break-avoid print:mb-6">
                              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Service Notes</p>
                              <p className="text-sm font-medium leading-relaxed text-slate-600">{quotation.notes}</p>
                            </div>
                          )}
                          {s?.bank_details && (
                            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-5 print-break-avoid print:mb-6">
                              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Payment Information</p>
                              <p className="whitespace-pre-wrap text-sm font-medium leading-relaxed text-slate-600">{s.bank_details}</p>
                            </div>
                          )}
                        </div>
                        <div className="space-y-6">
                          {s?.terms_and_conditions && (
                            <div className="rounded-xl border border-slate-100 bg-slate-50/30 p-5 print-break-avoid print:mb-6">
                              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Terms & Conditions</p>
                              <p className="whitespace-pre-wrap text-[10px] leading-relaxed text-slate-500">{s.terms_and_conditions}</p>
                            </div>
                          )}
                          {s?.payment_terms && (
                            <div className="rounded-xl border border-slate-100 bg-slate-50/30 p-5 print-break-avoid">
                              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Payment Terms</p>
                              <p className="whitespace-pre-wrap text-xs font-medium leading-relaxed text-slate-600">{s.payment_terms}</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {s?.footer_text && (
                        <p className="mt-12 border-t border-slate-100 pt-8 text-center text-xs font-medium text-slate-400">{s.footer_text}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="no-print lg:col-span-1 space-y-6">
                  {/* Summary Card */}
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900">
                      <DollarSign className="size-5 text-[#14B8A6]" />
                      Quotation Summary
                    </h3>
                    <div className="space-y-4">
                      <div className="flex justify-between text-sm py-2 border-b border-slate-50">
                        <span className="text-slate-500 font-medium">Status</span>
                        <span className={`font-bold px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wider ${stateOpt.color}`}>
                          {stateOpt.label}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm py-2 border-b border-slate-50">
                        <span className="text-slate-500 font-medium">Subtotal</span>
                        <span className="font-bold text-slate-900">{formatCurrency(quotation.subtotal, quotation.currency)}</span>
                      </div>
                      <div className="flex justify-between text-sm py-2 border-b border-slate-50">
                        <span className="text-slate-500 font-medium">{taxLabel}</span>
                        <span className="font-bold text-slate-900">{formatCurrency(quotation.tax_amount, quotation.currency)}</span>
                      </div>
                      <div className="flex justify-between pt-2">
                        <span className="text-base font-bold text-slate-900">Total</span>
                        <span className="text-lg font-black text-[#14B8A6]">{formatCurrency(quotation.total_amount, quotation.currency)}</span>
                      </div>
                    </div>
                  </motion.div>

                  {/* Activity Preview */}
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                        <Clock className="size-5 text-[#14B8A6]" />
                        Recent Activity
                      </h3>
                      <button onClick={() => setActiveTab('notes')} className="text-xs font-bold text-[#14B8A6] hover:underline">View All</button>
                    </div>
                    <div className="space-y-4">
                      {quotation.activities.length === 0 ? (
                        <p className="text-sm text-slate-400 py-4 text-center italic">No activity yet</p>
                      ) : (
                        quotation.activities.slice(0, 5).map((a) => (
                          <div key={a.id} className="relative pl-6 pb-2 last:pb-0 border-l border-slate-100">
                            <div className="absolute left-[-5px] top-1.5 size-2.5 rounded-full border-2 border-white bg-[#14B8A6]" />
                            <p className="text-sm font-bold text-slate-900">{a.action.replace(/_/g, ' ')}</p>
                            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-tighter">{dayjs(a.created_at).fromNow()}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </motion.div>
                </div>
              </div>
            ) : (
              <QuotationNotesPanel
                quotationId={id}
                quotationNumber={quotation.quotation_number}
                customerName={quotation.customer_full_name}
                customerEmail={quotation.customer_email}
                customerPhone={quotation.customer_phone}
                activities={quotation.activities}
                onRefresh={() => fetchQuotation({ silent: true })}
                onPrintQuotation={handlePrint}
              />
            )}
          </div>
        </div>

        {/* Delete Dialog */}
        {deleteDialogOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
              <h3 className="text-lg font-bold text-slate-900">Delete quotation?</h3>
              <p className="mt-2 text-sm text-slate-500">This will permanently delete <strong>{quotation.quotation_number}</strong> and all related line items. This action cannot be undone.</p>
              {deleteError && <p className="mt-3 text-sm font-medium text-rose-600">{deleteError}</p>}
              <div className="mt-6 flex justify-end gap-3">
                <button disabled={deleting} onClick={() => setDeleteDialogOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
                <button disabled={deleting} onClick={handleDeleteQuotation} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50">
                  {deleting ? 'Deleting...' : 'Delete Quotation'}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        <QuotationEmailComposer
          open={emailComposerOpen}
          onClose={() => setEmailComposerOpen(false)}
          quotationId={id}
          onSent={() => fetchQuotation({ silent: true })}
        />

      </div>
    </>
  );
}
