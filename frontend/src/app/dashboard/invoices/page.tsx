'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, FileText, Plus, ChevronRight, Upload } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getJson, postJson } from '../../apiClient';
import { groupBy, normalizeCsvDateToIso, parseCsv, toObjects } from '../csvUtils';
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
  stateCounts: Record<string, number>;
}

interface Customer {
  id: number;
  full_name: string;
  email: string;
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

interface InvoiceImportRow {
  csvInvoiceNumber: string;
  customerName: string;
  customerId: number | null;
  invoiceDate: string;
  dueDate: string;
  notes: string;
  taxPercentage: number;
  currency: string;
  enteredOn: string;
  lineItems: { description: string; quantity: number; unit_price: number }[];
  missing: string[];
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

export default function InvoicesPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [stateCounts, setStateCounts] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [page, setPage] = useState(1);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importRows, setImportRows] = useState<InvoiceImportRow[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState('');
  const [deleteAllError, setDeleteAllError] = useState<string | null>(null);
  const [deleteAllBusy, setDeleteAllBusy] = useState(false);
  const importCsvInputRef = useRef<HTMLInputElement>(null);
  const [importCsvFileName, setImportCsvFileName] = useState<string | null>(null);

  const [formCustomerId, setFormCustomerId] = useState<string>('');
  const [formJobId, setFormJobId] = useState<string>('');
  const [formInvoiceDate, setFormInvoiceDate] = useState('');
  const [formDueDate, setFormDueDate] = useState('');
  const [formCurrency, setFormCurrency] = useState('USD');
  const [formNotes, setFormNotes] = useState('');
  const [formLineItems, setFormLineItems] = useState<{ description: string; quantity: number; unit_price: number }[]>([
    { description: '', quantity: 1, unit_price: 0 },
  ]);
  const [formTaxPercentage, setFormTaxPercentage] = useState(0);

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
      setStateCounts(data.stateCounts ?? {});
    } catch {
      setInvoices([]);
      setTotal(0);
      setTotalPages(1);
      setStateCounts({});
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
    const t = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  useEffect(() => {
    if (addModalOpen) {
      fetchCustomers();
      fetchJobs();
    }
  }, [addModalOpen, fetchCustomers, fetchJobs]);

  const start = (page - 1) * PAGE_SIZE;

  const resetForm = (settings: InvoiceSettings | null) => {
    setFormCustomerId('');
    setFormJobId('');
    const today = new Date().toISOString().slice(0, 10);
    const dueDays = settings?.default_due_days ?? 30;
    const due = new Date(Date.now() + dueDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    setFormInvoiceDate(today);
    setFormDueDate(due);
    setFormCurrency(settings?.default_currency ?? 'USD');
    setFormNotes('');
    setFormLineItems([{ description: '', quantity: 1, unit_price: 0 }]);
    setFormTaxPercentage(settings?.default_tax_percentage ?? 0);
  };

  const openAdd = async () => {
    setAddError(null);
    const settings = await fetchInvoiceSettings();
    resetForm(settings);
    setAddModalOpen(true);
  };

  const openImport = async () => {
    await fetchCustomers();
    setImportRows([]);
    setImportError(null);
    setImportCsvFileName(null);
    setImportModalOpen(true);
  };

  const handleInvoiceCsvFile = async (file: File) => {
    const text = await file.text();
    const objects = toObjects(parseCsv(text));
    const grouped = groupBy(objects, (o) => o['Invoice Number'] || '');
    const rows: InvoiceImportRow[] = Object.keys(grouped).filter(Boolean).map((invoiceNo) => {
      const g = grouped[invoiceNo];
      const first = g[0];
      const customerName = first['Customer'] || '';
      const customer = customers.find((c) => c.full_name.trim().toLowerCase() === customerName.trim().toLowerCase());
      const taxRaw = first['Line Tax Rate Percentage'] || first['Tax'] || '0';
      const taxPercentage = parseFloat(String(taxRaw).replace(/[^\d.-]/g, '')) || 0;
      const lineItems = g.map((r) => ({
        description: r['Line Description'] || r['Description'] || `Imported item ${r['Line Number'] || ''}`.trim(),
        quantity: parseFloat(r['Line Quantity'] || '1') || 1,
        unit_price: parseFloat((r['Line Unit Price'] || r['Line Amount'] || '0').replace(/,/g, '')) || 0,
      }));
      const invoiceDateRaw =
        first['Invoice Date'] || first['Invoice date'] || first['invoice_date'] || first['Date'] || '';
      const dueDateRaw = first['Due Date'] || first['Due date'] || first['due_date'] || first['Payment due'] || '';
      const invoiceDateParsed = normalizeCsvDateToIso(invoiceDateRaw);
      const dueDateParsed = normalizeCsvDateToIso(dueDateRaw);
      const row: InvoiceImportRow = {
        csvInvoiceNumber: invoiceNo,
        customerName,
        customerId: customer?.id ?? null,
        invoiceDate: invoiceDateParsed ?? new Date().toISOString().slice(0, 10),
        dueDate: dueDateParsed ?? new Date().toISOString().slice(0, 10),
        notes: first['Reference'] || '',
        taxPercentage,
        currency: 'GBP',
        enteredOn: first['Entered On'] || '',
        lineItems,
        missing: [],
      };
      const missing: string[] = [];
      if (!row.customerId) missing.push('Customer mapping');
      if (invoiceDateRaw && !invoiceDateParsed) missing.push('Invoice date (unrecognised format)');
      if (dueDateRaw && !dueDateParsed) missing.push('Due date (unrecognised format)');
      if (!row.invoiceDate) missing.push('Invoice date');
      if (!row.dueDate) missing.push('Due date');
      if (!row.lineItems.length || row.lineItems.every((li) => !li.description.trim())) missing.push('Line items');
      row.missing = missing;
      return row;
    });
    setImportRows(rows);
  };

  const updateImportRow = (idx: number, patch: Partial<InvoiceImportRow>) => {
    setImportRows((prev) => prev.map((r, i) => {
      if (i !== idx) return r;
      const next = { ...r, ...patch };
      const missing: string[] = [];
      if (!next.customerId) missing.push('Customer mapping');
      if (!next.invoiceDate) missing.push('Invoice date');
      if (!next.dueDate) missing.push('Due date');
      if (!next.lineItems.length || next.lineItems.every((li) => !li.description.trim())) missing.push('Line items');
      next.missing = missing;
      return next;
    }));
  };

  const runInvoiceImport = async () => {
    if (!token) return;
    const validRows = importRows.filter((r) => r.missing.length === 0);
    if (validRows.length === 0) {
      setImportError('No valid rows to import. Please fix missing fields first.');
      return;
    }
    setImporting(true);
    setImportError(null);
    try {
      for (const row of validRows) {
        const invIso = normalizeCsvDateToIso(row.invoiceDate) ?? row.invoiceDate;
        const dueIso = normalizeCsvDateToIso(row.dueDate) ?? row.dueDate;
        const csvInvNo = row.csvInvoiceNumber.trim();
        const created = await postJson<{ invoice?: { id: number } }>('/invoices', {
          customer_id: row.customerId,
          invoice_date: invIso,
          due_date: dueIso,
          currency: row.currency,
          notes: row.notes || undefined,
          line_items: row.lineItems,
          tax_percentage: row.taxPercentage,
          ...(csvInvNo ? { invoice_number: csvInvNo } : {}),
        }, token);
        if (row.enteredOn.trim()) {
          const parsedEntered = new Date(row.enteredOn);
          const labelDate = Number.isNaN(parsedEntered.getTime()) ? row.enteredOn : parsedEntered.toLocaleString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
          if (created.invoice?.id) {
            await postJson(`/invoices/${created.invoice.id}/communications`, { type: 'note', text: `Imported on ${labelDate}` }, token);
          }
        }
      }
      setImportModalOpen(false);
      setImportRows([]);
      fetchInvoices();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
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
    if (!formCustomerId) {
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
          customer_id: parseInt(formCustomerId, 10),
          job_id: formJobId ? parseInt(formJobId, 10) : undefined,
          invoice_date: formInvoiceDate,
          due_date: formDueDate,
          currency: formCurrency,
          notes: formNotes.trim() || undefined,
          line_items: validItems.map((item) => ({
            description: item.description.trim(),
            quantity: item.quantity,
            unit_price: item.unit_price,
          })),
          tax_percentage: formTaxPercentage,
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
        <div className="mx-auto max-w-6xl space-y-8">
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
            <button type="button" onClick={openImport} className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Import CSV
            </button>
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

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
            {INVOICE_STATES.map((s) => (
              <motion.div
                key={s.value}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <p className="mb-1 text-xs font-medium text-slate-500">{s.label}</p>
                <h3 className="text-2xl font-bold text-slate-900">{stateCounts[s.value] ?? 0}</h3>
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
                    <AnimatePresence>
                      {invoices.map((inv, i) => (
                        <motion.tr
                          key={inv.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: i * 0.02 }}
                          className="group transition-colors hover:bg-slate-50"
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
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-4 border-t border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-slate-500">
                Showing <span className="font-semibold text-slate-900">{total === 0 ? 0 : start + 1}</span> to{' '}
                <span className="font-semibold text-slate-900">{Math.min(start + PAGE_SIZE, total)}</span> of{' '}
                <span className="font-semibold text-slate-900">{total}</span> invoices
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Previous
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const p = i + 1;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPage(p)}
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                        page === p ? 'bg-[#14B8A6] text-white' : 'border border-transparent hover:bg-slate-100'
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
                {totalPages > 5 && (
                  <>
                    <span className="px-2 text-slate-400">...</span>
                    <button
                      type="button"
                      onClick={() => setPage(totalPages)}
                      className="rounded-lg border border-transparent px-3 py-1.5 text-sm font-medium hover:bg-slate-100"
                    >
                      {totalPages}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
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
                  <select required value={formCustomerId} onChange={(e) => setFormCustomerId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30">
                    <option value="">Select customer</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>{c.full_name} ({c.email})</option>
                    ))}
                  </select>
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
              <div>
                <label className="block text-sm font-medium text-slate-700">Notes</label>
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

      {importModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setImportModalOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900">Import Invoices from CSV</h3>
            <p className="mt-2 text-xs text-slate-500">
              If the CSV includes an invoice number column, values are normalized to your prefix format (e.g. INV545 → INV-000545). Invoice date and due date columns accept{' '}
              <span className="font-medium text-slate-700">YYYY-MM-DD</span>,{' '}
              <span className="font-medium text-slate-700">DD/MM/YYYY</span> (UK), month names (e.g. 15 Mar 2024), or Excel serial numbers. Headers: Invoice Date, Due Date.
            </p>
            <div className="mt-4">
              <input
                ref={importCsvInputRef}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setImportCsvFileName(f.name);
                    handleInvoiceCsvFile(f);
                  }
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => importCsvInputRef.current?.click()}
                className="inline-flex w-full max-w-md items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#14B8A6] bg-emerald-50 px-5 py-3.5 text-sm font-semibold text-[#0d9488] shadow-sm transition hover:bg-emerald-100/80 hover:shadow focus:outline-none focus:ring-2 focus:ring-[#14B8A6]/40"
              >
                <Upload className="size-5 shrink-0" aria-hidden />
                Choose CSV file
              </button>
              <p className="mt-2 text-xs text-slate-500">Click to browse — CSV files only</p>
              {importCsvFileName && (
                <p className="mt-2 text-sm text-slate-700">
                  <span className="text-slate-500">Selected:</span>{' '}
                  <span className="font-medium text-slate-900">{importCsvFileName}</span>
                </p>
              )}
            </div>
            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2">Invoice</th>
                    <th className="px-3 py-2">Customer</th>
                    <th className="px-3 py-2">Dates</th>
                    <th className="px-3 py-2">Items</th>
                    <th className="px-3 py-2">Missing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {importRows.length === 0 ? (
                    <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">Upload a CSV file to preview imports.</td></tr>
                  ) : importRows.map((r, idx) => (
                    <tr key={`${r.csvInvoiceNumber}-${idx}`}>
                      <td className="px-3 py-2 font-medium">{r.csvInvoiceNumber}</td>
                      <td className="px-3 py-2">
                        <ImportCustomerSelect
                          customers={customers}
                          value={r.customerId}
                          onChange={(id) => updateImportRow(idx, { customerId: id })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <input type="date" value={r.invoiceDate} onChange={(e) => updateImportRow(idx, { invoiceDate: e.target.value })} className="rounded border border-slate-200 px-2 py-1" />
                          <input type="date" value={r.dueDate} onChange={(e) => updateImportRow(idx, { dueDate: e.target.value })} className="rounded border border-slate-200 px-2 py-1" />
                        </div>
                      </td>
                      <td className="px-3 py-2">{r.lineItems.length}</td>
                      <td className="px-3 py-2">
                        {r.missing.length === 0 ? <span className="text-emerald-600">Ready</span> : <span className="text-rose-600">{r.missing.join(', ')}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {importError && <p className="mt-3 text-sm text-rose-600">{importError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setImportModalOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Close</button>
              <button onClick={runInvoiceImport} disabled={importing} className="rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#13a89a] disabled:opacity-50">
                {importing ? 'Importing...' : 'Import valid rows'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteAllOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => !deleteAllBusy && setDeleteAllOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-slate-900">Delete all invoices</h3>
            <p className="mt-2 text-sm text-slate-600">
              This removes every invoice you can access (for your account: all invoices you created; super admins: all invoices in the system), including line items and payments. Type the phrase below to confirm.
            </p>
            <p className="mt-3 font-mono text-xs font-semibold text-rose-700">DELETE ALL INVOICES</p>
            <input
              type="text"
              value={deleteAllConfirm}
              onChange={(e) => setDeleteAllConfirm(e.target.value)}
              placeholder="Type confirmation phrase"
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
              autoComplete="off"
            />
            {deleteAllError && <p className="mt-2 text-sm text-rose-600">{deleteAllError}</p>}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={deleteAllBusy}
                onClick={() => setDeleteAllOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteAllBusy || deleteAllConfirm !== 'DELETE ALL INVOICES'}
                onClick={async () => {
                  if (!token) return;
                  setDeleteAllBusy(true);
                  setDeleteAllError(null);
                  try {
                    await postJson('/invoices/delete-all', { confirmation: 'DELETE ALL INVOICES' }, token);
                    setDeleteAllOpen(false);
                    setDeleteAllConfirm('');
                    setPage(1);
                    fetchInvoices();
                  } catch (e) {
                    setDeleteAllError(e instanceof Error ? e.message : 'Delete failed');
                  } finally {
                    setDeleteAllBusy(false);
                  }
                }}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {deleteAllBusy ? 'Deleting…' : 'Delete all'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </>
  );
}
