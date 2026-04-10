'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, FileText, Plus, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getJson, postJson } from '../../apiClient';
import { Pagination } from '../Pagination';
import ImportCustomerSelect from '../ImportCustomerSelect';

interface Invoice {
  id: number;
  invoice_number: string;
  customer_id: number;
  customer_full_name: string | null;
  job_id: number | null;
  job_title: string | null;
  invoice_date: string;
  due_date: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  total_paid: number;
  currency: string;
  state: string;
  created_at: string;
}

interface InvoicesResponse {
  invoices: Invoice[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  stateStats: Record<string, { count: number; total_amount: number }>;
  overallOutstanding: number;
}

interface Customer {
  id: number;
  full_name: string;
  email: string;
  address_line_1?: string;
  address_line_2?: string;
  town?: string;
  county?: string;
  postcode?: string;
}

interface Job {
  id: number;
  title: string;
  state: string;
}

interface InvoiceSettings {
  default_currency: string;
  default_due_days: number;
  default_tax_percentage: number;
}

const PAGE_SIZE = 10;
const INVOICE_STATES = [
  { value: 'draft', label: 'Draft', color: 'bg-slate-100 text-slate-600' },
  { value: 'issued', label: 'Issued', color: 'bg-blue-100 text-blue-800' },
  { value: 'pending_payment', label: 'Pending Payment', color: 'bg-amber-100 text-amber-800' },
  { value: 'partially_paid', label: 'Partially Paid', color: 'bg-violet-100 text-violet-800' },
  { value: 'paid', label: 'Paid', color: 'bg-emerald-100 text-emerald-800' },
  { value: 'overdue', label: 'Overdue', color: 'bg-rose-100 text-rose-800' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-slate-200 text-slate-500' },
] as const;

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

function formatCustomerAddress(c: Customer): string {
  return [c.address_line_1, c.address_line_2, c.town, c.county, c.postcode]
    .filter((p) => typeof p === 'string' && p.trim() !== '')
    .join(', ');
}

export default function InvoicesPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [stateStats, setStateStats] = useState<Record<string, { count: number; total_amount: number }>>({});
  const [overallOutstanding, setOverallOutstanding] = useState(0);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [page, setPage] = useState(1);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState('');
  const [deleteAllError, setDeleteAllError] = useState<string | null>(null);
  const [deleteAllBusy, setDeleteAllBusy] = useState(false);

  const [formCustomerId, setFormCustomerId] = useState<number | null>(null);
  const [formJobId, setFormJobId] = useState<string>('');
  const [formInvoiceDate, setFormInvoiceDate] = useState('');
  const [formDueDate, setFormDueDate] = useState('');
  const [formCurrency, setFormCurrency] = useState('USD');
  const [formNotes, setFormNotes] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formLineItems, setFormLineItems] = useState<{ description: string; quantity: number; unit_price: number }[]>([
    { description: '', quantity: 1, unit_price: 0 },
  ]);
  const [formTaxPercentage, setFormTaxPercentage] = useState(0);
  const [formCustomerReference, setFormCustomerReference] = useState('');

  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  const fetchInvoices = useCallback(async () => {
    if (!token) return;
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));
      if (searchDebounced) params.set('search', searchDebounced);
      if (stateFilter) params.set('state', stateFilter);
      const data = await getJson<InvoicesResponse>(`/invoices?${params.toString()}`, token);
      setInvoices(data.invoices ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
      setStateStats(data.stateStats ?? {});
      setOverallOutstanding(data.overallOutstanding ?? 0);
    } catch {
      setInvoices([]);
      setTotal(0);
      setTotalPages(1);
      setStateStats({});
      setOverallOutstanding(0);
    }
  }, [token, page, searchDebounced, stateFilter]);

  const fetchCustomers = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getJson<{ customers: Customer[] }>('/customers?limit=5000&page=1', token);
      setCustomers(data.customers ?? []);
    } catch {
      setCustomers([]);
    }
  }, [token]);

  const fetchJobs = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getJson<{ jobs: Job[] }>('/jobs?limit=100&page=1', token);
      setJobs((data.jobs ?? []).filter((j) => j.state === 'completed' || j.state === 'closed'));
    } catch {
      setJobs([]);
    }
  }, [token]);

  const fetchInvoiceSettings = useCallback(async () => {
    if (!token) return null;
    try {
      const data = await getJson<{ settings: InvoiceSettings }>('/settings/invoice', token);
      return data.settings ?? null;
    } catch {
      return null;
    }
  }, [token]);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearchDebounced(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [stateFilter]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  useEffect(() => {
    if (addModalOpen) {
      fetchCustomers();
      fetchJobs();
    }
  }, [addModalOpen, fetchCustomers, fetchJobs]);

  const resetForm = (settings: InvoiceSettings | null) => {
    setFormCustomerId(null);
    setFormJobId('');
    const today = new Date().toISOString().slice(0, 10);
    const dueDays = settings?.default_due_days ?? 30;
    const due = new Date(Date.now() + dueDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    setFormInvoiceDate(today);
    setFormDueDate(due);
    setFormCurrency(settings?.default_currency ?? 'USD');
    setFormNotes('');
    setFormDescription('');
    setFormLineItems([{ description: '', quantity: 1, unit_price: 0 }]);
    setFormTaxPercentage(settings?.default_tax_percentage ?? 0);
    setFormCustomerReference('');
  };

  const openAdd = async () => {
    setAddError(null);
    const settings = await fetchInvoiceSettings();
    resetForm(settings);
    setAddModalOpen(true);
  };

  const addLineItem = () => {
    setFormLineItems((prev) => [...prev, { description: '', quantity: 1, unit_price: 0 }]);
  };

  const updateLineItem = (i: number, field: 'description' | 'quantity' | 'unit_price', value: string | number) => {
    setFormLineItems((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      return next;
    });
  };

  const removeLineItem = (i: number) => {
    if (formLineItems.length <= 1) return;
    setFormLineItems((prev) => prev.filter((_, idx) => idx !== i));
  };

  const subtotal = formLineItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const taxAmount = Math.round(subtotal * (formTaxPercentage / 100) * 100) / 100;
  const totalAmount = subtotal + taxAmount;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    if (formCustomerId === null) {
      setAddError('Customer is required.');
      return;
    }
    const validItems = formLineItems.filter((item) => item.description.trim());
    if (validItems.length === 0) {
      setAddError('At least one line item with description is required.');
      return;
    }
    if (!token) return;
    try {
      const res = await postJson<{ invoice: Invoice }>(
        '/invoices',
        {
          customer_id: formCustomerId,
          job_id: formJobId ? parseInt(formJobId, 10) : undefined,
          invoice_date: formInvoiceDate,
          due_date: formDueDate,
          currency: formCurrency,
          notes: formNotes.trim() || undefined,
          description: formDescription.trim() || undefined,
          line_items: validItems.map((item) => ({
            description: item.description.trim(),
            quantity: item.quantity,
            unit_price: item.unit_price,
          })),
          tax_percentage: formTaxPercentage,
          ...(formCustomerReference.trim() ? { customer_reference: formCustomerReference.trim() } : {}),
        },
        token,
      );
      setAddModalOpen(false);
      resetForm(null);
      fetchInvoices();
      if (res.invoice?.id) router.push(`/dashboard/invoices/${res.invoice.id}`);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to create invoice.');
    }
  };

  const stateBadge = (state: string) => {
    const opt = INVOICE_STATES.find((s) => s.value === state) ?? INVOICE_STATES[0];
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${opt.color}`}>
        {opt.label}
      </span>
    );
  };

  return (
    <>
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
        <div className="flex items-center gap-6">
          <h2 className="text-lg font-bold text-slate-900">Invoice Management</h2>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Quick search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border-0 bg-slate-100 py-1.5 pl-10 pr-4 text-sm outline-none ring-1 ring-transparent focus:ring-2 focus:ring-[#14B8A6]"
            />
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-full space-y-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-tight text-slate-900">Invoice Management</h1>
              <p className="mt-1 text-slate-500">Create, manage, send, and track payments for services and completed jobs.</p>
            </div>
            <motion.button
              type="button"
              onClick={openAdd}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#14B8A6] px-5 py-2.5 font-bold text-white shadow-sm transition hover:brightness-110"
            >
              <Plus className="size-5" />
              Create Invoice
            </motion.button>
            <button
              type="button"
              onClick={() => {
                setDeleteAllOpen(true);
                setDeleteAllConfirm('');
                setDeleteAllError(null);
              }}
              className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50"
            >
              Delete all invoices
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border-l-[6px] border-rose-500 bg-white p-4 shadow-sm"
            >
              <p className="mb-0.5 text-[11px] font-bold uppercase tracking-wider text-rose-500">Outstanding</p>
              <h3 className="text-2xl font-black text-slate-900">{formatCurrency(overallOutstanding, 'GBP')}</h3>
              <p className="text-[10px] text-slate-400">across all invoices</p>
            </motion.div>

            {INVOICE_STATES.map((s) => (
              <motion.div
                key={s.value}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">{s.label}</p>
                <div className="flex items-baseline gap-1.5">
                  <h3 className="text-2xl font-black text-slate-900">{stateStats[s.value]?.count ?? 0}</h3>
                  <span className="text-[11px] font-bold text-slate-400 italic">inv</span>
                </div>
                <p className="mt-1 text-base font-bold text-slate-600">{formatCurrency(stateStats[s.value]?.total_amount ?? 0, 'GBP')}</p>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
          >
            <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-bold text-slate-900">Invoices</h2>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search invoices..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-4 text-sm outline-none transition focus:ring-2 focus:ring-[#14B8A6] focus:border-transparent"
                  />
                </div>
                <select
                  value={stateFilter}
                  onChange={(e) => setStateFilter(e.target.value)}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium transition hover:bg-slate-50"
                >
                  <option value="">All states</option>
                  {INVOICE_STATES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Invoice</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Customer</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Job</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Date</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Due</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Amount</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {invoices.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                        No invoices yet. Create one to get started.
                      </td>
                    </tr>
                  ) : (
                    invoices.map((inv, i) => (
                      <tr
                        key={inv.id}
                        className="group transition-colors outline-none hover:bg-slate-50 border-b border-slate-50 last:border-0"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#14B8A6]/20">
                              <FileText className="size-5 text-[#14B8A6]" />
                            </div>
                            <span className="text-sm font-semibold text-slate-900">{inv.invoice_number}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-700">{inv.customer_full_name || '—'}</td>
                        <td className="px-6 py-4 text-sm text-slate-500">{inv.job_id && inv.job_title ? inv.job_title : '—'}</td>
                        <td className="px-6 py-4 text-sm text-slate-500">{formatDate(inv.invoice_date)}</td>
                        <td className="px-6 py-4 text-sm text-slate-500">{formatDate(inv.due_date)}</td>
                        <td className="px-6 py-4 text-sm font-medium text-slate-900">{formatCurrency(inv.total_amount, inv.currency)}</td>
                        <td className="px-6 py-4">{stateBadge(inv.state)}</td>
                        <td className="px-6 py-4">
                          <Link
                            href={`/dashboard/invoices/${inv.id}`}
                            className="inline-flex items-center gap-1 rounded p-1 text-slate-500 transition hover:bg-slate-200 hover:text-slate-900"
                          >
                            View <ChevronRight className="size-4" />
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              itemName="invoices"
            />
          </motion.div>
        </div>
      </div>

      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setAddModalOpen(false)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-slate-900">Create Invoice</h3>
            <form onSubmit={handleAdd} className="mt-6 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Customer *</label>
                  <div className="mt-1 flex gap-2">
                    <div className="flex-1">
                      <ImportCustomerSelect
                        customers={customers}
                        value={formCustomerId}
                        onChange={setFormCustomerId}
                        className="w-full"
                      />
                    </div>
                    <button type="button" onClick={() => window.open('/dashboard/customers/new', '_blank')} className="shrink-0 flex items-center justify-center size-[38px] rounded-lg border border-slate-200 text-[#14B8A6] hover:bg-[#14B8A6] hover:text-white transition-colors" title="Add new customer">
                      <Plus className="size-4" />
                    </button>
                  </div>
                  {formCustomerId && (
                    <div className="mt-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                      {(() => {
                        const c = customers.find(x => x.id === formCustomerId);
                        if (!c) return null;
                        const addr = formatCustomerAddress(c);
                        return (
                          <div className="flex flex-col gap-1">
                            <p className="font-semibold text-slate-800">{c.full_name}</p>
                            <p>{c.email}</p>
                            {addr && <p className="mt-1 border-t border-slate-200 pt-1 text-slate-500">{addr}</p>}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Related job</label>
                  <select value={formJobId} onChange={(e) => setFormJobId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30">
                    <option value="">None</option>
                    {jobs.map((j) => (
                      <option key={j.id} value={j.id}>{j.title}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Invoice date</label>
                  <input type="date" required value={formInvoiceDate} onChange={(e) => setFormInvoiceDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Due date</label>
                  <input type="date" required value={formDueDate} onChange={(e) => setFormDueDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Currency</label>
                  <select value={formCurrency} onChange={(e) => setFormCurrency(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30">
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-4 sm:col-span-2">
                <p className="text-sm font-medium text-slate-800">Address on invoice</p>
                <p className="mt-1 text-xs text-slate-500">
                  Uses the customer&apos;s default billing address. To bill a specific work or site address, create the invoice from that work address&apos;s detail page.
                </p>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700">Customer reference (optional)</label>
                <input
                  type="text"
                  value={formCustomerReference}
                  onChange={(e) => setFormCustomerReference(e.target.value)}
                  placeholder="Shown on invoice when entered"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
                />
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="block text-sm font-medium text-slate-700">Line items</label>
                  <button type="button" onClick={addLineItem} className="text-sm font-medium text-[#14B8A6] hover:underline">+ Add item</button>
                </div>
                <div className="space-y-2">
                  {formLineItems.map((item, i) => (
                    <div key={i} className="flex gap-2">
                      <input type="text" value={item.description} onChange={(e) => updateLineItem(i, 'description', e.target.value)} placeholder="Description" className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                      <input type="number" min={0} step={0.01} value={item.quantity} onChange={(e) => updateLineItem(i, 'quantity', parseFloat(e.target.value) || 0)} className="w-20 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                      <input type="number" min={0} step={0.01} value={item.unit_price} onChange={(e) => updateLineItem(i, 'unit_price', parseFloat(e.target.value) || 0)} placeholder="Price" className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                      <button type="button" onClick={() => removeLineItem(i)} className="rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-red-600">×</button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Tax (%)</label>
                  <input type="number" min={0} max={100} step={0.01} value={formTaxPercentage} onChange={(e) => setFormTaxPercentage(parseFloat(e.target.value) || 0)} className="mt-1 w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30" placeholder="0" />
                </div>
                <div className="flex flex-col justify-end gap-0.5">
                  {formTaxPercentage > 0 && (
                    <p className="text-xs text-slate-500">Tax: {formatCurrency(taxAmount, formCurrency)}</p>
                  )}
                  <p className="text-sm font-semibold text-slate-700">Total: {formatCurrency(totalAmount, formCurrency)}</p>
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700">Project Description</label>
                <textarea rows={3} value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Overview of the project scope..." className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700">Internal Notes</label>
                <textarea rows={2} value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Payment terms, instructions..." className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30" />
              </div>
              {addError && <p className="text-sm text-red-600">{addError}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setAddModalOpen(false)} className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="submit" className="flex-1 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#13a89a]">Create Invoice</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </>
  );
}
