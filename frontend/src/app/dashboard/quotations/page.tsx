'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, Quote, Plus, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getJson, postJson } from '../../apiClient';
import { groupBy, parseCsv, toObjects } from '../csvUtils';

interface Quotation {
  id: number;
  quotation_number: string;
  customer_id: number;
  customer_full_name: string | null;
  job_id: number | null;
  job_title: string | null;
  quotation_date: string;
  valid_until: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  currency: string;
  state: string;
  created_at: string;
}

interface QuotationsResponse {
  quotations: Quotation[];
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

interface QuotationSettings {
  default_currency: string;
  default_valid_days: number;
  default_tax_percentage: number;
}

interface QuotationImportRow {
  csvQuoteNumber: string;
  customerName: string;
  customerId: number | null;
  quotationDate: string;
  validUntil: string;
  notes: string;
  taxPercentage: number;
  currency: string;
  lineItems: { description: string; quantity: number; unit_price: number }[];
  missing: string[];
}

const PAGE_SIZE = 10;
const QUOTATION_STATES = [
  { value: 'draft', label: 'Draft', color: 'bg-slate-100 text-slate-600' },
  { value: 'sent', label: 'Sent', color: 'bg-blue-100 text-blue-800' },
  { value: 'accepted', label: 'Accepted', color: 'bg-emerald-100 text-emerald-800' },
  { value: 'rejected', label: 'Rejected', color: 'bg-rose-100 text-rose-800' },
  { value: 'expired', label: 'Expired', color: 'bg-slate-200 text-slate-500' },
] as const;

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

export default function QuotationsPage() {
  const router = useRouter();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
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
  const [importRows, setImportRows] = useState<QuotationImportRow[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const [formCustomerId, setFormCustomerId] = useState<string>('');
  const [formJobId, setFormJobId] = useState<string>('');
  const [formQuotationDate, setFormQuotationDate] = useState('');
  const [formValidUntil, setFormValidUntil] = useState('');
  const [formCurrency, setFormCurrency] = useState('USD');
  const [formNotes, setFormNotes] = useState('');
  const [formLineItems, setFormLineItems] = useState<{ description: string; quantity: number; unit_price: number }[]>([
    { description: '', quantity: 1, unit_price: 0 },
  ]);
  const [formTaxPercentage, setFormTaxPercentage] = useState(0);

  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  const fetchQuotations = useCallback(async () => {
    if (!token) return;
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));
      if (searchDebounced) params.set('search', searchDebounced);
      if (stateFilter) params.set('state', stateFilter);
      const data = await getJson<QuotationsResponse>(`/quotations?${params.toString()}`, token);
      setQuotations(data.quotations ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
      setStateCounts(data.stateCounts ?? {});
    } catch {
      setQuotations([]);
      setTotal(0);
      setTotalPages(1);
      setStateCounts({});
    }
  }, [token, page, searchDebounced, stateFilter]);

  const fetchCustomers = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getJson<{ customers: Customer[] }>('/customers?limit=100&page=1', token);
      setCustomers(data.customers ?? []);
    } catch {
      setCustomers([]);
    }
  }, [token]);

  const fetchJobs = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getJson<{ jobs: Job[] }>('/jobs?limit=100&page=1', token);
      setJobs(data.jobs ?? []);
    } catch {
      setJobs([]);
    }
  }, [token]);

  const fetchQuotationSettings = useCallback(async () => {
    if (!token) return null;
    try {
      const data = await getJson<{ settings: QuotationSettings }>('/settings/quotation', token);
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
    fetchQuotations();
  }, [fetchQuotations]);

  useEffect(() => {
    if (addModalOpen) {
      fetchCustomers();
      fetchJobs();
    }
  }, [addModalOpen, fetchCustomers, fetchJobs]);

  const start = (page - 1) * PAGE_SIZE;

  const resetForm = (settings: QuotationSettings | null) => {
    setFormCustomerId('');
    setFormJobId('');
    const today = new Date().toISOString().slice(0, 10);
    const validDays = settings?.default_valid_days ?? 30;
    const valid = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    setFormQuotationDate(today);
    setFormValidUntil(valid);
    setFormCurrency(settings?.default_currency ?? 'USD');
    setFormNotes('');
    setFormLineItems([{ description: '', quantity: 1, unit_price: 0 }]);
    setFormTaxPercentage(settings?.default_tax_percentage ?? 0);
  };

  const openAdd = async () => {
    setAddError(null);
    const settings = await fetchQuotationSettings();
    resetForm(settings);
    setAddModalOpen(true);
  };

  const openImport = async () => {
    await fetchCustomers();
    setImportRows([]);
    setImportError(null);
    setImportModalOpen(true);
  };

  const handleQuotationCsvFile = async (file: File) => {
    const text = await file.text();
    const objects = toObjects(parseCsv(text));
    const grouped = groupBy(objects, (o) => o['Quote No'] || '');
    const rows: QuotationImportRow[] = Object.keys(grouped).filter(Boolean).map((quoteNo) => {
      const g = grouped[quoteNo];
      const first = g[0];
      const customerName = first['Customer Name'] || '';
      const customer = customers.find((c) => c.full_name.trim().toLowerCase() === customerName.trim().toLowerCase());
      const taxRaw = first['Line Tax Rate Percentage'] || first['Tax'] || '0';
      const taxPercentage = parseFloat(String(taxRaw).replace(/[^\d.-]/g, '')) || 0;
      const lineItems = g.map((r) => ({
        description: r['Line Description'] || r['Description'] || `Imported item ${r['Line Number'] || ''}`.trim(),
        quantity: parseFloat(r['Line Quantity'] || '1') || 1,
        unit_price: parseFloat((r['Line Unit Price'] || r['Line Amount'] || '0').replace(/,/g, '')) || 0,
      }));
      const row: QuotationImportRow = {
        csvQuoteNumber: quoteNo,
        customerName,
        customerId: customer?.id ?? null,
        quotationDate: first['Quote Date'] || new Date().toISOString().slice(0, 10),
        validUntil: first['Expiry Date'] || new Date().toISOString().slice(0, 10),
        notes: first['Reference'] || first['Description'] || '',
        taxPercentage,
        currency: 'GBP',
        lineItems,
        missing: [],
      };
      const missing: string[] = [];
      if (!row.customerId) missing.push('Customer mapping');
      if (!row.quotationDate) missing.push('Quote date');
      if (!row.validUntil) missing.push('Expiry date');
      if (!row.lineItems.length || row.lineItems.every((li) => !li.description.trim())) missing.push('Line items');
      row.missing = missing;
      return row;
    });
    setImportRows(rows);
  };

  const updateImportRow = (idx: number, patch: Partial<QuotationImportRow>) => {
    setImportRows((prev) => prev.map((r, i) => {
      if (i !== idx) return r;
      const next = { ...r, ...patch };
      const missing: string[] = [];
      if (!next.customerId) missing.push('Customer mapping');
      if (!next.quotationDate) missing.push('Quote date');
      if (!next.validUntil) missing.push('Expiry date');
      if (!next.lineItems.length || next.lineItems.every((li) => !li.description.trim())) missing.push('Line items');
      next.missing = missing;
      return next;
    }));
  };

  const runQuotationImport = async () => {
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
        await postJson('/quotations', {
          customer_id: row.customerId,
          quotation_date: row.quotationDate,
          valid_until: row.validUntil,
          currency: row.currency,
          notes: row.notes || undefined,
          line_items: row.lineItems,
          tax_percentage: row.taxPercentage,
        }, token);
      }
      setImportModalOpen(false);
      setImportRows([]);
      fetchQuotations();
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
      const res = await postJson<{ quotation: Quotation }>(
        '/quotations',
        {
          customer_id: parseInt(formCustomerId, 10),
          job_id: formJobId ? parseInt(formJobId, 10) : undefined,
          quotation_date: formQuotationDate,
          valid_until: formValidUntil,
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
      fetchQuotations();
      if (res.quotation?.id) router.push(`/dashboard/quotations/${res.quotation.id}`);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to create quotation.');
    }
  };

  const stateBadge = (state: string) => {
    const opt = QUOTATION_STATES.find((s) => s.value === state) ?? QUOTATION_STATES[0];
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
          <h2 className="text-lg font-bold text-slate-900">Quotation Management</h2>
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
              <h1 className="text-3xl font-black tracking-tight text-slate-900">Quotation Management</h1>
              <p className="mt-1 text-slate-500">Create, send, and track quotations for your services.</p>
            </div>
            <motion.button
              type="button"
              onClick={openAdd}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#14B8A6] px-5 py-2.5 font-bold text-white shadow-sm transition hover:brightness-110"
            >
              <Plus className="size-5" />
              Create Quotation
            </motion.button>
            <button type="button" onClick={openImport} className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Import CSV
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {QUOTATION_STATES.map((s) => (
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
              <h2 className="text-lg font-bold text-slate-900">Quotations</h2>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search quotations..."
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
                  {QUOTATION_STATES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Quotation</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Customer</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Job</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Date</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Valid until</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Amount</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {quotations.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                        No quotations yet. Create one to get started.
                      </td>
                    </tr>
                  ) : (
                    <AnimatePresence>
                      {quotations.map((q, i) => (
                        <motion.tr
                          key={q.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: i * 0.02 }}
                          className="group transition-colors hover:bg-slate-50"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#14B8A6]/20">
                                <Quote className="size-5 text-[#14B8A6]" />
                              </div>
                              <span className="text-sm font-semibold text-slate-900">{q.quotation_number}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-700">{q.customer_full_name || '—'}</td>
                          <td className="px-6 py-4 text-sm text-slate-500">{q.job_id && q.job_title ? q.job_title : '—'}</td>
                          <td className="px-6 py-4 text-sm text-slate-500">{formatDate(q.quotation_date)}</td>
                          <td className="px-6 py-4 text-sm text-slate-500">{formatDate(q.valid_until)}</td>
                          <td className="px-6 py-4 text-sm font-medium text-slate-900">{formatCurrency(q.total_amount, q.currency)}</td>
                          <td className="px-6 py-4">{stateBadge(q.state)}</td>
                          <td className="px-6 py-4">
                            <Link
                              href={`/dashboard/quotations/${q.id}`}
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
                <span className="font-semibold text-slate-900">{total}</span> quotations
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
            <h3 className="text-lg font-bold text-slate-900">Create Quotation</h3>
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
                  <label className="block text-sm font-medium text-slate-700">Quotation date</label>
                  <input type="date" required value={formQuotationDate} onChange={(e) => setFormQuotationDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Valid until</label>
                  <input type="date" required value={formValidUntil} onChange={(e) => setFormValidUntil(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Currency</label>
                  <select value={formCurrency} onChange={(e) => setFormCurrency(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30">
                    {['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR', 'JPY'].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
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
                <textarea rows={2} value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Terms, validity, instructions..." className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30" />
              </div>
              {addError && <p className="text-sm text-red-600">{addError}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setAddModalOpen(false)} className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="submit" className="flex-1 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#13a89a]">Create Quotation</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {importModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setImportModalOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900">Import Quotations from CSV</h3>
            <input type="file" accept=".csv,text/csv" className="mt-4 block w-full text-sm" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleQuotationCsvFile(f); }} />
            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2">Quote</th>
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
                    <tr key={`${r.csvQuoteNumber}-${idx}`}>
                      <td className="px-3 py-2 font-medium">{r.csvQuoteNumber}</td>
                      <td className="px-3 py-2">
                        <select value={r.customerId ?? ''} onChange={(e) => updateImportRow(idx, { customerId: e.target.value ? parseInt(e.target.value, 10) : null })} className="w-full rounded border border-slate-200 px-2 py-1">
                          <option value="">Select customer</option>
                          {customers.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <input type="date" value={r.quotationDate} onChange={(e) => updateImportRow(idx, { quotationDate: e.target.value })} className="rounded border border-slate-200 px-2 py-1" />
                          <input type="date" value={r.validUntil} onChange={(e) => updateImportRow(idx, { validUntil: e.target.value })} className="rounded border border-slate-200 px-2 py-1" />
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
              <button onClick={runQuotationImport} disabled={importing} className="rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#13a89a] disabled:opacity-50">
                {importing ? 'Importing...' : 'Import valid rows'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
