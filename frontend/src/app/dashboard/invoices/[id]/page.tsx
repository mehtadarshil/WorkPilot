'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getJson, postJson, deleteRequest, patchJson } from '../../../apiClient';
import { Info, ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import dayjs from 'dayjs';
import Image from 'next/image';
import InvoiceNotesPanel from './InvoiceNotesPanel';
import InvoiceEmailComposer from './InvoiceEmailComposer';

const INVOICE_STATES = [
  { value: 'draft', label: 'Draft' },
  { value: 'issued', label: 'Issued' },
  { value: 'pending_payment', label: 'Pending payment' },
  { value: 'partially_paid', label: 'Partially paid' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

interface InvoiceDetails {
  id: number;
  invoice_number: string;
  customer_id: number;
  customer_full_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  invoice_work_address_id?: number | null;
  customer_reference?: string | null;
  job_customer_reference?: string | null;
  customer_reference_display?: string | null;
  work_site_name?: string | null;
  work_site_address?: string | null;
  invoice_custom_address?: string | null;
  job_id: number | null;
  job_title: string | null;
  invoice_date: string;
  due_date: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  total_paid: number;
  currency: string;
  notes: string | null;
  billing_address: string | null;
  state: string;
  created_at: string;
  updated_at: string;
  created_by: number;
  line_items: InvoiceLineItem[];
  payments: InvoicePayment[];
  activities: {
    id: number;
    action: string;
    details: Record<string, unknown>;
    created_at: string;
    created_by: number | null;
  }[];
  settings?: InvoiceSettings;
}

interface JobDetails {
  id: number;
  title: string;
  description_name: string | null;
  contact_name: string | null;
  customer_reference: string | null;
  user_group: string | null;
  business_unit: string | null;
}

interface InvoiceLineItem {
  id: number;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  sort_order: number;
}

interface InvoicePayment {
  id: number;
  amount: number;
  payment_method: string | null;
  payment_date: string;
  reference_number: string | null;
  created_at: string;
}

interface InvoiceSettings {
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
}

const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'cash', label: 'Cash' },
  { value: 'digital_payment', label: 'Digital Payment' },
  { value: 'check', label: 'Check' },
  { value: 'other', label: 'Other' },
];

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getActivityLabel(action: string, details?: Record<string, unknown>): string {
  if (action === 'comm_note') {
    const text = typeof details?.text === 'string' ? details.text.trim() : '';
    if (text.toLowerCase().startsWith('imported on')) return text;
  }
  const map: Record<string, string> = {
    created: 'Invoice was created',
    issued: 'Invoice was issued',
    updated: 'Invoice was updated',
    payment_added: 'Payment was added',
    comm_email: 'Invoice was sent by email',
    comm_sms: 'Invoice was sent by SMS',
    comm_phone: 'Phone call was logged',
    comm_note: 'Note was added',
    comm_print: 'Invoice was printed',
    sent_to_client: 'Invoice was sent to client',
  };
  return map[action] ?? `Activity: ${action.replaceAll('_', ' ')}`;
}

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount);
  } catch {
    return `£${amount.toFixed(2)}`;
  }
}

export default function InvoiceDetailsView() {
  const router = useRouter();
  const params = useParams();
  const invoiceId = typeof params?.id === 'string' ? params.id : String(params?.id || '');

  const [invoice, setInvoice] = useState<InvoiceDetails | null>(null);
  const [job, setJob] = useState<JobDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emailComposerOpen, setEmailComposerOpen] = useState(false);

  // Payment Modal
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'notes'>('details');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchInvoice = useCallback(async (opts?: { silent?: boolean }) => {
    const token = window.localStorage.getItem('wp_token');
    if (!token || !invoiceId) return;

    const silent = opts?.silent === true;
    try {
      if (!silent) setLoading(true);
      const res = await getJson<{ invoice: InvoiceDetails }>(`/invoices/${invoiceId}`, token);
      setInvoice(res.invoice);

      if (res.invoice.job_id) {
        getJson<{ job: JobDetails }>(`/jobs/${res.invoice.job_id}`, token)
          .then(jobRes => setJob(jobRes.job))
          .catch(() => { }); // silent fail if job fetch fails
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load invoice details');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    fetchInvoice();
  }, [fetchInvoice]);

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setPaymentError(null);
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) {
      setPaymentError('Valid payment amount is required.');
      return;
    }
    const token = window.localStorage.getItem('wp_token');
    if (!token || !invoice) return;
    if (amount > invoice.total_amount - invoice.total_paid) {
      setPaymentError('Amount exceeds remaining balance.');
      return;
    }
    try {
      await postJson(`/invoices/${invoiceId}/payments`, {
        amount,
        payment_method: paymentMethod,
        payment_date: paymentDate,
        reference_number: paymentRef.trim() || undefined,
      }, token);
      setPaymentModalOpen(false);
      setPaymentAmount('');
      setPaymentRef('');
      setPaymentDate(new Date().toISOString().slice(0, 10));
      fetchInvoice();
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : 'Failed to record payment.');
    }
  };

  const handleDeleteInvoice = async () => {
    const token = window.localStorage.getItem('wp_token');
    if (!token) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteRequest(`/invoices/${invoiceId}`, token);
      router.push('/dashboard/invoices');
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete invoice.');
    } finally {
      setDeleting(false);
    }
  };

  const handleStatusChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newState = e.target.value;
    const token = window.localStorage.getItem('wp_token');
    if (!token || !invoice) return;
    try {
      setLoading(true);
      await patchJson(`/invoices/${invoiceId}`, { state: newState }, token);
      await fetchInvoice();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
      setLoading(false);
    }
  };

  if (loading) return <div className="p-8 font-medium text-slate-500">Loading invoice details...</div>;
  if (error || !invoice) return <div className="p-8 text-rose-500">{error || 'Invoice not found'}</div>;

  const isOverdue = dayjs().isAfter(dayjs(invoice.due_date), 'day') && invoice.state !== 'paid';
  const overDueDays = dayjs().diff(dayjs(invoice.due_date), 'day');
  const balanceDue = invoice.total_amount - invoice.total_paid;
  const settings = invoice.settings;
  const companyName = settings?.company_name || 'WorkPilot';
  const taxLabel = settings?.tax_label || 'Tax';
  const customerAddrLine = invoice.customer_address?.trim() || '—';
  const accent =
    settings?.invoice_accent_color && /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(settings.invoice_accent_color)
      ? settings.invoice_accent_color
      : '#14B8A6';
  const accentEnd =
    settings?.invoice_accent_end_color && /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(settings.invoice_accent_end_color)
      ? settings.invoice_accent_end_color
      : '#0d9488';

  const handlePrint = () => {
    window.print();
  };

  const latestActivity = invoice.activities && invoice.activities.length > 0 ? invoice.activities[0] : null;
  const bannerText = latestActivity
    ? (() => {
      const detailsText = typeof latestActivity.details?.text === 'string' ? latestActivity.details.text.trim() : '';
      const isImportedNote = latestActivity.action === 'comm_note' && detailsText.toLowerCase().startsWith('imported on');
      if (isImportedNote) {
        const createdDate = dayjs(invoice.invoice_date).isValid()
          ? dayjs(invoice.invoice_date).format('DD MMM YYYY')
          : formatDate(invoice.invoice_date);
        const importedAt = dayjs(latestActivity.created_at).format('dddd D MMMM YYYY (hh:mm a)');
        return `${createdDate} created and ${importedAt} imported.`;
      }

      if (latestActivity.action === 'created') {
        const createdAt = dayjs(latestActivity.created_at);
        const invoiceDate = dayjs(invoice.invoice_date);
        if (invoiceDate.isValid() && createdAt.isValid() && createdAt.diff(invoiceDate, 'day') >= 1) {
          return `${invoiceDate.format('DD MMM YYYY')} created and ${createdAt.format('dddd D MMMM YYYY (hh:mm a)')} imported.`;
        }
      }

      return `${dayjs(latestActivity.created_at).format('dddd D MMMM YYYY (hh:mm a)')} ${getActivityLabel(latestActivity.action, latestActivity.details)}.`;
    })()
    : '';

  const InvoiceTemplateContent = () => (
    <div id="invoice-print" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
      <div className="relative border-b border-slate-200 bg-white px-8 py-10">
        <div
          className="absolute left-0 top-0 h-1 w-full"
          style={{ background: `linear-gradient(to right, ${accent}, ${accentEnd})` }}
        />
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
              {(settings?.company_address || settings?.company_phone || settings?.company_email || settings?.company_website || settings?.company_tax_id) && (
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
            <span className="mt-2 inline-block rounded-md bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{invoice.state.replace('_', ' ')}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 px-8 py-8 sm:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Invoice for</p>
            <p className="text-base font-semibold text-slate-900">{invoice.customer_full_name || '-'}</p>
            {invoice.customer_phone && <p className="text-sm text-slate-600">{invoice.customer_phone}</p>}
            {invoice.customer_reference_display?.trim() && (
              <p className="mt-1 text-sm text-slate-600">
                <span className="font-medium text-slate-700">Customer reference:</span> {invoice.customer_reference_display.trim()}
              </p>
            )}
            <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Customer address</p>
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
        <div className="mt-8 flex flex-col items-end gap-1.5 border-t-2 border-slate-200 pt-6 print-break-avoid">
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
          <div className="mt-6 rounded-lg border border-slate-100 bg-slate-50/50 p-4 print-break-avoid">
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
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 print:block">
            {settings?.payment_terms && (
              <div className="rounded-lg border border-slate-100 bg-slate-50/30 p-4 print-break-avoid print:mb-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Payment terms</p>
                <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600 leading-relaxed">{settings.payment_terms}</p>
              </div>
            )}
            {settings?.bank_details && (
              <div className="rounded-lg border border-slate-100 bg-slate-50/30 p-4 print-break-avoid">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Bank details</p>
                <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600 leading-relaxed">{settings.bank_details}</p>
              </div>
            )}
          </div>
        )}
        {settings?.footer_text && <p className="mt-6 text-center text-xs text-slate-500">{settings.footer_text}</p>}
      </div>
    </div>
  );

  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
        @media print {
          /* Force all parents to show full height and allow breaks */
          html, body, #wp-dashboard-root, #wp-dashboard-root > main, #invoice-detail-page, .invoice-page-body {
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
            display: block !important;
            position: static !important;
            background: #fff !important;
          }

          /* Hide UI elements */
          #wp-dashboard-root > header,
          #invoice-detail-page > header,
          #invoice-detail-page > .no-print,
          .no-print {
            display: none !important;
          }

          /* Print area cleanup */
          #invoice-print {
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            overflow: visible !important;
          }

          #invoice-print * {
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
      <div id="invoice-detail-page" className="flex h-full flex-col bg-background-light">
        {/* Header — matches job / dashboard detail pages */}
        <header className="no-print flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 md:px-6 shadow-sm z-10">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="shrink-0 rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100"
              aria-label="Go back"
            >
              <ArrowLeft className="size-5" />
            </button>
            <nav className="flex min-w-0 items-center overflow-x-auto text-sm font-medium text-slate-600 scrollbar-none">
              <Link href="/dashboard/customers" className="shrink-0 hover:text-slate-900 hover:underline">
                Customers
              </Link>
              <span className="mx-2 shrink-0 text-slate-300">/</span>
              <Link href="/dashboard/customers" className="hidden shrink-0 hover:text-slate-900 hover:underline sm:inline">
                Customers list
              </Link>
              <span className="mx-2 hidden shrink-0 text-slate-300 sm:inline">/</span>
              <Link
                href={`/dashboard/customers/${invoice.customer_id}`}
                className="max-w-[140px] shrink-0 truncate hover:text-slate-900 hover:underline sm:max-w-none"
              >
                {invoice.customer_full_name}
              </Link>
              {invoice.job_id && (
                <>
                  <span className="mx-2 shrink-0 text-slate-300">/</span>
                  <Link href={`/dashboard/jobs/${invoice.job_id}`} className="shrink-0 hover:text-slate-900 hover:underline">
                    Job no. {invoice.job_id.toString().padStart(4, '0')}
                  </Link>
                </>
              )}
              <span className="mx-2 shrink-0 text-slate-300">/</span>
              {invoice.job_id ? (
                <Link href={`/dashboard/jobs/${invoice.job_id}`} className="shrink-0 hover:text-slate-900 hover:underline">
                  Invoices
                </Link>
              ) : (
                <Link href="/dashboard/invoices" className="shrink-0 hover:text-slate-900 hover:underline">
                  Invoices
                </Link>
              )}
              <span className="mx-2 shrink-0 text-slate-300">/</span>
              <span className="shrink-0 font-semibold text-slate-900">
                {invoice.invoice_number}
              </span>
              <span className="mx-2 shrink-0 text-slate-300">/</span>
              <span className="shrink-0 text-slate-900">{activeTab === 'notes' ? 'Communications' : 'View'}</span>
            </nav>
          </div>
        </header>

        {/* Tabs — same pattern as job details */}
        <div className="no-print flex items-end justify-between overflow-x-auto border-b border-slate-200 bg-white px-6 pt-2">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('details')}
              className={`whitespace-nowrap rounded-t-md border-b-2 px-4 py-3 text-[13px] transition-all ${activeTab === 'details'
                  ? 'border-[#14B8A6] bg-emerald-50/30 font-semibold text-[#14B8A6]'
                  : 'border-transparent font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
            >
              Invoice Details
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('notes')}
              className={`whitespace-nowrap rounded-t-md border-b-2 px-4 py-3 text-[13px] transition-all ${activeTab === 'notes'
                  ? 'border-[#14B8A6] bg-emerald-50/30 font-semibold text-[#14B8A6]'
                  : 'border-transparent font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
            >
              Notes
            </button>
          </div>
          <div className="pb-2">
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
            >
              Quick links <span className="ml-1 opacity-50">▼</span>
            </button>
          </div>
        </div>

        {/* Context ribbon — matches job details info row */}
        <div className="no-print flex flex-wrap items-baseline gap-x-8 gap-y-2 border-b border-slate-200 bg-white px-6 py-3.5 text-[13px]">
          <span className="text-slate-500">
            Customer: <strong className="ml-1 font-bold text-slate-800">{invoice.customer_full_name}</strong>
          </span>
          {invoice.job_id && (
            <span className="text-slate-500">
              Job number: <strong className="ml-1 font-bold text-slate-800">{invoice.job_id.toString().padStart(4, '0')}</strong>
            </span>
          )}
          {job && job.description_name && (
            <span className="text-slate-500">
              Job description:{' '}
              <strong className="ml-1 inline-block max-w-[300px] truncate align-bottom font-bold text-slate-800">{job.description_name}</strong>
            </span>
          )}
          <span className="text-slate-500">
            Address:{' '}
            <strong className="ml-1 inline-block max-w-[400px] truncate align-bottom font-bold text-slate-800">
              {invoice.customer_address || 'N/A'}
            </strong>
          </span>
        </div>

        <div className="invoice-page-body flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl space-y-6">
            {activeTab === 'notes' ? (
              <InvoiceNotesPanel
                invoiceId={invoiceId}
                invoiceNumber={invoice.invoice_number}
                customerEmail={invoice.customer_email}
                customerPhone={invoice.customer_phone}
                customerName={invoice.customer_full_name}
                activities={invoice.activities}
                onRefresh={() => fetchInvoice({ silent: true })}
                onPrintInvoice={handlePrint}
              />
            ) : (
              <>
                {/* Notification Banner (latest real activity only) */}
                {latestActivity && (
                  <div className="no-print flex items-start gap-3 rounded-lg border border-[#14B8A6]/20 bg-[#14B8A6]/5 p-4 text-[13px] text-slate-700">
                    <div className="shrink-0 rounded-full bg-[#14B8A6]/15 p-1.5 text-[#14B8A6]">
                      <Info className="size-4" strokeWidth={2.5} />
                    </div>
                    <span><strong className="font-semibold text-slate-900">{bannerText}</strong></span>
                  </div>
                )}

                {/* Job Details Card */}
                {job && (
                  <div className="no-print overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
                    <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-3.5">
                      <h3 className="text-sm font-semibold text-slate-900">Job details</h3>
                    </div>
                    <div className="p-6 text-[13px] grid grid-cols-[180px_1fr] gap-y-3">
                      <span className="font-bold text-slate-800">Job number</span>
                      <div className="flex items-center gap-3 text-slate-700">
                        {job.id.toString().padStart(4, '0')}
                        <Link href={`/dashboard/jobs/${job.id}`} className="text-[#14B8A6] font-medium hover:underline flex items-center gap-1">View job</Link>
                      </div>

                      <span className="font-bold text-slate-800">Job description</span>
                      <span className="text-slate-700">{job.description_name || job.title}</span>

                      <span className="font-bold text-slate-800">Job contact</span>
                      <span className="text-slate-700">{job.contact_name || invoice.customer_full_name}</span>

                      <span className="font-bold text-slate-800">Customer reference</span>
                      <span className="text-slate-700">{job.customer_reference || '-'}</span>
                    </div>
                  </div>
                )}

                {/* Invoice Breakdown Card */}
                <div className="no-print rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-slate-900">Invoice breakdown</h3>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/dashboard/invoices/${invoiceId}/edit`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200"
                      >
                        <Pencil className="size-3.5" />
                        Edit invoice
                      </Link>
                      <button
                        type="button"
                        onClick={() => setEmailComposerOpen(true)}
                        className="rounded-lg bg-[#14B8A6] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#13a89a] focus:outline-none focus:ring-2 focus:ring-[#14B8A6]/40"
                      >
                        Email invoice
                      </button>
                      <button
                        type="button"
                        onClick={handlePrint}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200"
                      >
                        Print invoice
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteError(null);
                          setDeleteDialogOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 shadow-sm transition-colors hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-200"
                      >
                        <Trash2 className="size-3.5" />
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 text-[13px] text-slate-700 md:grid-cols-2">
                    <div className="rounded border border-slate-100 bg-slate-50 px-4 py-3">
                      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Invoice number</div>
                      <div className="mt-1 font-semibold text-slate-900">{invoice.invoice_number}</div>
                    </div>
                    <div className="rounded border border-slate-100 bg-slate-50 px-4 py-3">
                      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Created</div>
                      <div className="mt-1 font-semibold text-slate-900">{formatDateTime(invoice.created_at)}</div>
                    </div>
                    <div className="rounded border border-slate-100 bg-slate-50 px-4 py-3">
                      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Due date</div>
                      <div className="mt-1 font-semibold text-slate-900">{formatDate(invoice.due_date)}</div>
                    </div>
                    <div className="rounded border border-slate-100 bg-slate-50 px-4 py-3">
                      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Status</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                        <select
                          value={invoice.state}
                          onChange={handleStatusChange}
                          className="rounded-md border border-slate-200 py-1 pl-2 pr-6 text-sm font-semibold capitalize outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/30 bg-transparent"
                        >
                          {INVOICE_STATES.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                        {isOverdue && <span className="rounded-full bg-[#b91c1c] px-2 py-0.5 text-[10px] font-bold text-white whitespace-nowrap">Overdue by {overDueDays} days</span>}
                      </div>
                    </div>
                  </div>
                </div>

                <InvoiceTemplateContent />

                {/* Payment & allocation history Card */}
                <div className="no-print overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
                  <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-6 py-3">
                    <h3 className="text-sm font-semibold text-slate-900">Payment & allocation history</h3>
                    {balanceDue > 0 && (
                      <button
                        type="button"
                        onClick={() => setPaymentModalOpen(true)}
                        className="rounded-lg bg-[#14B8A6] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#13a89a] focus:outline-none focus:ring-2 focus:ring-[#14B8A6]/40"
                      >
                        Add new payment
                      </button>
                    )}
                  </div>

                  {invoice.payments && invoice.payments.length > 0 ? (
                    <div className="p-0">
                      <table className="w-full text-left text-[13px] border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="px-6 py-3 font-semibold text-slate-700">Date</th>
                            <th className="px-6 py-3 font-semibold text-slate-700">Method</th>
                            <th className="px-6 py-3 font-semibold text-slate-700">Ref</th>
                            <th className="px-6 py-3 font-semibold text-slate-700 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-600">
                          {invoice.payments.map(p => (
                            <tr key={p.id}>
                              <td className="px-6 py-3.5">{dayjs(p.payment_date).format('DD MMM YYYY')}</td>
                              <td className="px-6 py-3.5">{PAYMENT_METHODS.find(m => m.value === p.payment_method)?.label || p.payment_method}</td>
                              <td className="px-6 py-3.5">{p.reference_number || '-'}</td>
                              <td className="px-6 py-3.5 text-right font-medium text-slate-800">{formatCurrency(Number(p.amount), invoice.currency)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="relative flex flex-col items-center justify-center overflow-hidden p-16 text-center">
                      <div className="mb-4 flex size-16 items-center justify-center rounded-full border-[5px] border-[#14B8A6]/20">
                        <Info className="size-6 stroke-[3px] text-[#14B8A6]/50" />
                      </div>
                      <p className="text-[13px] font-medium tracking-tight text-slate-500">There are no payments for this invoice</p>
                      {balanceDue > 0 && (
                        <p className="mt-2 text-xs text-slate-400">Use <span className="font-semibold text-[#14B8A6]">Add new payment</span> above when there is a balance due.</p>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {paymentModalOpen && (
          <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setPaymentModalOpen(false)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-slate-900">Record Payment</h3>
              <p className="mt-1 text-sm text-slate-500">Balance due: {formatCurrency(balanceDue, invoice.currency)}</p>
              <form onSubmit={handleAddPayment} className="mt-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Amount *</label>
                  <input type="number" step="0.01" min={0} max={balanceDue} required value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder="0.00" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Payment method</label>
                  <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30">
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Payment date</label>
                  <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Reference number</label>
                  <input type="text" value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} placeholder="Check #, transaction ID..." className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30" />
                </div>
                {paymentError && <p className="text-sm text-red-600">{paymentError}</p>}
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setPaymentModalOpen(false)} className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">Cancel</button>
                  <button type="submit" className="flex-1 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#13a89a] transition-colors">Record Payment</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        <InvoiceEmailComposer
          open={emailComposerOpen}
          onClose={() => setEmailComposerOpen(false)}
          invoiceId={invoiceId}
          onSent={() => fetchInvoice({ silent: true })}
        />

        {deleteDialogOpen && (
          <div
            className="no-print fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 p-4"
            onClick={() => !deleting && setDeleteDialogOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-slate-900">Delete invoice?</h3>
              <p className="mt-2 text-sm text-slate-600">
                This will permanently delete <strong>{invoice.invoice_number}</strong> and related line items
                {invoice.payments.length > 0 ? ', payments, and payment history' : ''}. This cannot be undone.
              </p>
              {deleteError && <p className="mt-3 text-sm text-rose-600">{deleteError}</p>}
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setDeleteDialogOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={handleDeleteInvoice}
                  className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  {deleting ? 'Deleting…' : 'Delete invoice'}
                </button>
              </div>
            </motion.div>
          </div>
        )}

      </div>
    </>
  );
}
