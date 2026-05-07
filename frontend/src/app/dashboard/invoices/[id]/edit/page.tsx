'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { getJson, patchJson } from '../../../../apiClient';

type LineItemForm = { description: string; quantity: string; unit_price: string };

type InvoiceDetail = {
  id: number;
  invoice_number: string;
  customer_id: number;
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
  invoice_work_address_id?: number | null;
  customer_reference?: string | null;
  state: string;
  line_items: { description: string; quantity: number; unit_price: number }[];
};

type Customer = { id: number; full_name: string };
type Job = { id: number; title: string };

const INVOICE_STATES = [
  { value: 'draft', label: 'Draft' },
  { value: 'issued', label: 'Issued' },
  { value: 'pending_payment', label: 'Pending payment' },
  { value: 'partially_paid', label: 'Partially paid' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

export default function EditInvoicePage() {
  const router = useRouter();
  const params = useParams();
  const invoiceId = typeof params?.id === 'string' ? params.id : '';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);

  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [jobId, setJobId] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [description, setDescription] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [addressKind, setAddressKind] = useState<'customer' | 'custom'>('customer');
  /** Set at load when invoice was created from a work/site address — not editable here. */
  const [invoiceHasWorkSite, setInvoiceHasWorkSite] = useState(false);
  const [initialCustomerId, setInitialCustomerId] = useState('');
  const [customerReference, setCustomerReference] = useState('');
  const [state, setState] = useState('draft');
  const [totalPaid, setTotalPaid] = useState('');
  const [lineItems, setLineItems] = useState<LineItemForm[]>([{ description: '', quantity: '1', unit_price: '' }]);
  const [taxPercentage, setTaxPercentage] = useState(0);

  const load = useCallback(async () => {
    const token = window.localStorage.getItem('wp_token');
    if (!token || !invoiceId) return;
    setLoading(true);
    setError(null);
    try {
      const [invRes, custRes, jobRes] = await Promise.all([
        getJson<{ invoice: InvoiceDetail }>(`/invoices/${invoiceId}`, token),
        getJson<{ customers: Customer[] }>('/customers?limit=5000&page=1', token),
        getJson<{ jobs: { id: number; title: string }[] }>('/jobs?limit=500&page=1', token),
      ]);
      const inv = invRes.invoice;
      setInvoiceNumber(inv.invoice_number);
      setCustomerId(String(inv.customer_id));
      setInitialCustomerId(String(inv.customer_id));
      setJobId(inv.job_id ? String(inv.job_id) : '');
      setInvoiceDate(inv.invoice_date);
      setDueDate(inv.due_date);
      setCurrency(inv.currency);
      setDescription(inv.description ?? '');
      setCustomerReference(inv.customer_reference ?? '');
      if (inv.invoice_work_address_id) {
        setInvoiceHasWorkSite(true);
        setBillingAddress(inv.billing_address ?? '');
      } else if (inv.billing_address?.trim()) {
        setInvoiceHasWorkSite(false);
        setAddressKind('custom');
        setBillingAddress(inv.billing_address);
      } else {
        setInvoiceHasWorkSite(false);
        setAddressKind('customer');
        setBillingAddress('');
      }
      setState(inv.state);
      setTotalPaid(String(inv.total_paid));
      const items =
        inv.line_items.length > 0
          ? inv.line_items.map((li) => ({
              description: li.description,
              quantity: String(li.quantity),
              unit_price: String(li.unit_price),
            }))
          : [{ description: '', quantity: '1', unit_price: '' }];
      setLineItems(items);
      const tp =
        inv.subtotal > 0 ? Math.round((inv.tax_amount / inv.subtotal) * 10000) / 100 : 0;
      setTaxPercentage(tp);
      setCustomers(custRes.customers ?? []);
      setJobs((jobRes.jobs ?? []).map((j) => ({ id: j.id, title: j.title })));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load invoice');
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    load();
  }, [load]);

  const subtotal = lineItems.reduce((s, li) => s + (parseFloat(li.quantity) || 0) * (parseFloat(li.unit_price) || 0), 0);
  const taxAmount = Math.round(subtotal * (taxPercentage / 100) * 100) / 100;
  const totalAmount = subtotal + taxAmount;

  const updateLine = (i: number, field: keyof LineItemForm, value: string) => {
    setLineItems((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      return next;
    });
  };

  const addLine = () => setLineItems((p) => [...p, { description: '', quantity: '1', unit_price: '' }]);
  const removeLine = (i: number) => {
    if (lineItems.length <= 1) return;
    setLineItems((p) => p.filter((_, idx) => idx !== i));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = window.localStorage.getItem('wp_token');
    if (!token || !invoiceId) return;
    const validItems = lineItems.filter((li) => li.description.trim());
    if (validItems.length === 0) {
      setError('At least one line item with a description is required.');
      return;
    }
    if (!customerId) {
      setError('Customer is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const tp = parseFloat(totalPaid);
      const workSiteLocked =
        invoiceHasWorkSite && customerId === initialCustomerId;
      const addressPatch = workSiteLocked
        ? {}
        : {
            billing_address: (addressKind === 'custom' ? billingAddress.trim() || null : null) as string | null,
          };
      await patchJson(`/invoices/${invoiceId}`, {
        invoice_number: invoiceNumber.trim(),
        customer_id: parseInt(customerId, 10),
        job_id: jobId ? parseInt(jobId, 10) : null,
        invoice_date: invoiceDate,
        due_date: dueDate,
        currency: currency.trim(),
        description: description.trim() || null,
        ...addressPatch,
        customer_reference: customerReference.trim() || null,
        state,
        total_paid: Number.isFinite(tp) ? Math.max(0, tp) : 0,
        line_items: validItems.map((li) => ({
          description: li.description.trim(),
          quantity: parseFloat(li.quantity) || 1,
          unit_price: parseFloat(li.unit_price) || 0,
        })),
        tax_percentage: taxPercentage,
      }, token);
      router.push(`/dashboard/invoices/${invoiceId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex flex-1 items-center justify-center p-8 text-slate-500">Loading invoice…</div>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#f8fafc]">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 md:px-6">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
          aria-label="Back"
        >
          <ArrowLeft className="size-5" />
        </button>
        <nav className="min-w-0 text-sm text-slate-600">
          <Link href="/dashboard/invoices" className="hover:text-[#14B8A6] hover:underline">
            Invoices
          </Link>
          <span className="mx-2 text-slate-300">/</span>
          <Link href={`/dashboard/invoices/${invoiceId}`} className="hover:text-[#14B8A6] hover:underline">
            {invoiceNumber || 'Invoice'}
          </Link>
          <span className="mx-2 text-slate-300">/</span>
          <span className="font-semibold text-slate-900">Edit</span>
        </nav>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-2xl font-bold text-slate-900">Edit invoice</h1>
          <p className="mt-1 text-sm text-slate-500">Update every field including status, amounts, and line items.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Invoice number</span>
                <input
                  required
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Status</span>
                <select
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
                >
                  {INVOICE_STATES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="block text-sm sm:col-span-2">
                <span className="font-medium text-slate-700">Customer</span>
                <div className="mt-1 flex gap-2">
                  <select
                    required
                    value={customerId}
                    onChange={(e) => {
                      const next = e.target.value;
                      setCustomerId(next);
                      if (invoiceHasWorkSite && next !== initialCustomerId) {
                        setInvoiceHasWorkSite(false);
                        setAddressKind('customer');
                        setBillingAddress('');
                      } else {
                        setAddressKind('customer');
                      }
                    }}
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
                  >
                    <option value="">Select customer</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.full_name}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => window.open('/dashboard/customers/new', '_blank')} className="shrink-0 flex items-center justify-center size-[38px] rounded-lg border border-slate-200 text-[#14B8A6] hover:bg-[#14B8A6] hover:text-white transition-colors" title="Add new customer">
                    <Plus className="size-4" />
                  </button>
                </div>
              </div>
              <label className="block text-sm sm:col-span-2">
                <span className="font-medium text-slate-700">Job (optional)</span>
                <select
                  value={jobId}
                  onChange={(e) => setJobId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
                >
                  <option value="">None</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      #{j.id.toString().padStart(4, '0')} — {j.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Invoice date</span>
                <input
                  type="date"
                  required
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Due date</span>
                <input
                  type="date"
                  required
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Currency</span>
                <input
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm uppercase outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
                  maxLength={10}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Tax %</span>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  value={taxPercentage}
                  onChange={(e) => setTaxPercentage(parseFloat(e.target.value) || 0)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="font-medium text-slate-700">Total paid (manual adjustment)</span>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={totalPaid}
                  onChange={(e) => setTotalPaid(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
                />
                <span className="mt-1 block text-xs text-slate-500">
                  Use for corrections; payment history rows are unchanged. Subtotal after save: {subtotal.toFixed(2)} · Tax:{' '}
                  {taxAmount.toFixed(2)} · Total: {totalAmount.toFixed(2)}
                </span>
              </label>
              <div className="sm:col-span-2 space-y-3 rounded-lg border border-slate-100 bg-slate-50/60 p-4">
                <p className="text-sm font-medium text-slate-800">Address on invoice</p>
                {invoiceHasWorkSite && customerId === initialCustomerId ? (
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                    <p className="text-xs font-medium text-slate-500">Work / site address (from record)</p>
                    <p className="mt-1 whitespace-pre-wrap">{billingAddress || '—'}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      This invoice is tied to a work address and cannot be switched to another address here. Create a new invoice from a work address detail page to use a different site.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-4">
                      <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                        <input
                          type="radio"
                          name="invAddrEdit"
                          className="text-[#14B8A6] focus:ring-[#14B8A6]"
                          checked={addressKind === 'customer'}
                          onChange={() => setAddressKind('customer')}
                        />
                        Customer address
                      </label>
                      <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                        <input
                          type="radio"
                          name="invAddrEdit"
                          className="text-[#14B8A6] focus:ring-[#14B8A6]"
                          checked={addressKind === 'custom'}
                          onChange={() => setAddressKind('custom')}
                        />
                        Custom address
                      </label>
                    </div>
                    {addressKind === 'custom' && (
                      <label className="block text-sm">
                        <span className="font-medium text-slate-700">Custom text</span>
                        <textarea
                          value={billingAddress}
                          onChange={(e) => setBillingAddress(e.target.value)}
                          rows={3}
                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
                          placeholder="Shown on invoice"
                        />
                      </label>
                    )}
                  </>
                )}
              </div>
              <label className="block text-sm sm:col-span-2">
                <span className="font-medium text-slate-700">Customer reference (optional)</span>
                <input
                  type="text"
                  value={customerReference}
                  onChange={(e) => setCustomerReference(e.target.value)}
                  placeholder="Shown on invoice when entered; job reference also appears if set on the job"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="font-medium text-slate-700">Description (Project overview)</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
                  placeholder="Summarize the project scope or works involved..."
                />
              </label>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-800">Line items</span>
                <button
                  type="button"
                  onClick={addLine}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-[#14B8A6] hover:bg-slate-50"
                >
                  <Plus className="size-4" /> Add row
                </button>
              </div>
              <div className="space-y-3 rounded-lg border border-slate-200 p-3">
                {lineItems.map((li, i) => (
                  <div key={i} className="grid gap-2 sm:grid-cols-[1fr_80px_100px_auto] sm:items-end">
                    <label className="text-xs">
                      <span className="text-slate-500">Description</span>
                      <input
                        value={li.description}
                        onChange={(e) => updateLine(i, 'description', e.target.value)}
                        className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                      />
                    </label>
                    <label className="text-xs">
                      <span className="text-slate-500">Qty</span>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={li.quantity}
                        onChange={(e) => updateLine(i, 'quantity', e.target.value)}
                        className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                      />
                    </label>
                    <label className="text-xs">
                      <span className="text-slate-500">Unit price</span>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={li.unit_price}
                        onChange={(e) => updateLine(i, 'unit_price', e.target.value)}
                        placeholder="0"
                        className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => removeLine(i)}
                      disabled={lineItems.length <= 1}
                      className="flex justify-end rounded p-2 text-rose-600 hover:bg-rose-50 disabled:opacity-30"
                      aria-label="Remove line"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-4">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-[#14B8A6] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#119f90] disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              <button
                type="button"
                onClick={() => router.push(`/dashboard/invoices/${invoiceId}`)}
                className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
