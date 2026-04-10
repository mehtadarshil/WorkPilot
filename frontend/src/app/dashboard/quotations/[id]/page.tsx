'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
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
  Trash2,
  ExternalLink,
  Copy,
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
import QuotationPrintTemplate from './QuotationPrintTemplate';

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
  public_token?: string | null;
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
  const [appOrigin, setAppOrigin] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);

  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  useEffect(() => {
    if (typeof window !== 'undefined') setAppOrigin(window.location.origin);
  }, []);

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
  const taxLabel = s?.tax_label ?? 'Tax';

  const stateOpt = QUOTATION_STATES.find((st) => st.value === quotation.state) ?? QUOTATION_STATES[0];

  const canAcceptReject = quotation.state === 'sent';
  const canTransferToInvoice = quotation.state === 'accepted';

  const publicCustomerUrl =
    quotation.public_token && appOrigin ? `${appOrigin}/public/quotations/${quotation.public_token}` : null;
  const printPageHref =
    token && appOrigin ? `${appOrigin}/quotation-print/${id}?token=${encodeURIComponent(token)}` : null;

  const handleCopyPublicLink = async () => {
    if (!publicCustomerUrl || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(publicCustomerUrl);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
        @media print {
          /* Force entire document structure to full width but keep it clean */
          html, body, #wp-dashboard-root, #wp-dashboard-root > main, #quotation-detail-page, .quotation-page-body, .quotation-page-root, .quotation-page-container {
            height: auto !important;
            min-height: 0 !important;
            width: 100% !important;
            max-width: none !important;
            display: block !important;
            overflow: visible !important;
            overflow-x: visible !important;
            position: static !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            box-sizing: border-box !important;
          }

          #wp-dashboard-root > main {
            flex: none !important;
            min-width: 0 !important;
          }

          /* Hide ALL non-essential elements */
          .no-print, header, aside, .context-ribbon, .no-print-important, [class*="no-print"] {
            display: none !important;
            height: 0 !important;
            width: 0 !important;
            overflow: hidden !important;
          }

          /*
           * Collapse the details + sidebar grid so the quotation uses the full page width.
           * At lg breakpoints the template is 2/3 + 1/3; without this, print stays ~66% wide and left-aligned.
           */
          .quotation-print-layout {
            display: block !important;
            grid-template-columns: none !important;
            width: 100% !important;
            max-width: none !important;
          }

          .quotation-print-layout > *:not(.no-print) {
            width: 100% !important;
            max-width: none !important;
            grid-column: auto !important;
            display: block !important;
            margin-left: 0 !important;
            margin-right: 0 !important;
          }

          /* Target the specific layout grid that separates sidebar (fallback) */
          .quotation-page-body .grid.lg\:grid-cols-3 {
            display: block !important;
            grid-template-columns: none !important;
            width: 100% !important;
          }

          /* Ensure the content column takes full width */
          .lg\:col-span-2, .lg\:col-span-3 {
            width: 100% !important;
            max-width: none !important;
            display: block !important;
            margin: 0 !important;
            padding: 0 !important;
            grid-column: auto !important;
          }

          /* Targeted printable area cleanup */
          #quotation-print {
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            display: block !important;
            visibility: visible !important;
            overflow: visible !important;
            box-sizing: border-box !important;
          }

          #quotation-print table {
            width: 100% !important;
            table-layout: auto !important;
          }

          /* Preserve specific UI boxes during print */
          .rounded-xl, .rounded-2xl {
            border: 1px solid #e2e8f0 !important;
            background-color: #f8fafc !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* Ensure internal spacing stays balanced */
          .px-8 { padding-left: 2rem !important; padding-right: 2rem !important; }
          .py-10 { padding-top: 2.5rem !important; padding-bottom: 2.5rem !important; }
          .py-8 { padding-top: 2rem !important; padding-bottom: 2rem !important; }

          /* Ensure internal grids (like Bill To) still work */
          #quotation-print .grid {
            display: grid !important;
          }

          /* Ensure colors and backgrounds print */
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

          /* Equal inset on left and right; browsers map this to the printable area */
          @page {
            margin: 12mm;
          }
        }
      `}} />

      <div id="quotation-detail-page" className="quotation-page-root flex flex-1 flex-col overflow-hidden bg-[#f8fafc] print:bg-white">

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
            {publicCustomerUrl ? (
              <div className="flex w-full flex-col gap-2 border-t border-slate-200/80 pt-3 mt-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-slate-500">Customer link </span>
                  <span className="break-all text-xs text-slate-700">{publicCustomerUrl}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyPublicLink}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    <Copy className="size-3.5" />
                    {linkCopied ? 'Copied' : 'Copy link'}
                  </button>
                  <a
                    href={publicCustomerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    <ExternalLink className="size-3.5" />
                    Open customer page
                  </a>
                  {printPageHref ? (
                    <a
                      href={printPageHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                    >
                      <Printer className="size-3.5" />
                      Print layout
                    </a>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Main Content */}
        <div className="quotation-page-body min-h-0 flex-1 overflow-y-auto print:overflow-visible">
          <div className="quotation-page-container mx-auto max-w-6xl p-8 print:p-0">

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
              <div className="quotation-print-layout grid grid-cols-1 gap-8 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <QuotationPrintTemplate
                    quotation={{
                      quotation_number: quotation.quotation_number,
                      customer_full_name: quotation.customer_full_name,
                      customer_email: quotation.customer_email,
                      customer_phone: quotation.customer_phone,
                      customer_address: quotation.customer_address,
                      quotation_date: quotation.quotation_date,
                      valid_until: quotation.valid_until,
                      subtotal: quotation.subtotal,
                      tax_amount: quotation.tax_amount,
                      total_amount: quotation.total_amount,
                      currency: quotation.currency,
                      notes: quotation.notes,
                      billing_address: quotation.billing_address,
                      line_items: quotation.line_items,
                    }}
                    settings={s}
                  />
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
