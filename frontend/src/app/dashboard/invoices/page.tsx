'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, FileText, Plus, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getJson } from '../../apiClient';
import { Pagination } from '../Pagination';

interface Invoice {
  id: number;
  invoice_number: string;
  customer_id: number;
  customer_full_name: string | null;
  job_id: number | null;
  job_title: string | null;
  work_site_name?: string | null;
  work_site_address?: string | null;
  work_address_name?: string | null;
  invoice_date: string;
  due_date: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  total_paid: number;
  currency: string;
  state: string;
  created_at: string;
  profit?: number;
}

interface ExpenseStats {
  company_total: number;
  company_count: number;
  personal_total: number;
  personal_count: number;
  approved_total: number;
  approved_count: number;
  general_overhead_total?: number;
  general_overhead_count?: number;
}

interface InvoicesResponse {
  invoices: Invoice[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  stateStats: Record<string, { count: number; total_amount: number }>;
  overallOutstanding: number;
  overallProfit?: number;
  overallNetProfit?: number;
  expenseStats?: ExpenseStats;
}

const PAGE_SIZE = 10;
const REPORT_METRICS_STORAGE_KEY = 'wp_invoice_report_metrics';

type ReportMetricKey =
  | 'outstanding'
  | 'net_profit'
  | 'company_expenses'
  | 'general_overheads'
  | 'personal_expenses'
  | 'approved_expenses'
  | `state:${string}`;

const DEFAULT_REPORT_METRICS: Record<ReportMetricKey, boolean> = {
  outstanding: true,
  net_profit: true,
  company_expenses: true,
  general_overheads: true,
  personal_expenses: true,
  approved_expenses: false,
  'state:draft': true,
  'state:issued': true,
  'state:pending_payment': true,
  'state:partially_paid': true,
  'state:paid': true,
  'state:overdue': true,
  'state:cancelled': true,
};

const REPORT_METRIC_LABELS: Record<Exclude<ReportMetricKey, `state:${string}`>, string> = {
  outstanding: 'Outstanding',
  net_profit: 'Net profit',
  company_expenses: 'Company expenses',
  general_overheads: 'General overheads',
  personal_expenses: 'Personal expenses due',
  approved_expenses: 'All approved expenses',
};

function loadReportMetrics(): Record<ReportMetricKey, boolean> {
  const defaults = { ...DEFAULT_REPORT_METRICS };
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = window.localStorage.getItem(REPORT_METRICS_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<Record<ReportMetricKey, boolean>>;
    const merged = { ...defaults };
    for (const key of Object.keys(defaults) as ReportMetricKey[]) {
      if (typeof parsed[key] === 'boolean') merged[key] = parsed[key]!;
    }
    return merged;
  } catch {
    return defaults;
  }
}
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

function siteWorkAddressLabel(row: {
  work_site_name?: string | null;
  work_site_address?: string | null;
  work_address_name?: string | null;
}): string {
  const name = row.work_site_name?.trim() || row.work_address_name?.trim() || '';
  const address = row.work_site_address?.trim() || '';
  if (name && address) return `${name} — ${address}`;
  return name || address || '—';
}

export default function InvoicesPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [stateStats, setStateStats] = useState<Record<string, { count: number; total_amount: number }>>({});
  const [overallOutstanding, setOverallOutstanding] = useState(0);
  const [overallNetProfit, setOverallNetProfit] = useState(0);
  const [expenseStats, setExpenseStats] = useState<ExpenseStats | null>(null);
  const [reportMetrics, setReportMetrics] = useState<Record<ReportMetricKey, boolean>>(DEFAULT_REPORT_METRICS);
  const [metricsMenuOpen, setMetricsMenuOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [page, setPage] = useState(1);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState('');
  const [deleteAllError, setDeleteAllError] = useState<string | null>(null);
  const [deleteAllBusy, setDeleteAllBusy] = useState(false);

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
      setOverallNetProfit(data.overallNetProfit ?? data.overallProfit ?? 0);
      setExpenseStats(data.expenseStats ?? null);
    } catch {
      setInvoices([]);
      setTotal(0);
      setTotalPages(1);
      setStateStats({});
      setOverallOutstanding(0);
      setOverallNetProfit(0);
      setExpenseStats(null);
    }
  }, [token, page, searchDebounced, stateFilter]);

  useEffect(() => {
    setReportMetrics(loadReportMetrics());
  }, []);

  const toggleReportMetric = (key: ReportMetricKey) => {
    setReportMetrics((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(REPORT_METRICS_STORAGE_KEY, JSON.stringify(next));
      }
      return next;
    });
  };

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
              onClick={() => router.push('/dashboard/invoices/new')}
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

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">Reporting summary</p>
            <div className="relative">
              <button
                type="button"
                onClick={() => setMetricsMenuOpen((open) => !open)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <SlidersHorizontal className="size-4" />
                Customize metrics
              </button>
              {metricsMenuOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Close metrics menu"
                    className="fixed inset-0 z-10 cursor-default"
                    onClick={() => setMetricsMenuOpen(false)}
                  />
                  <div className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
                    <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Show on dashboard</p>
                    <div className="space-y-2">
                      {(Object.keys(REPORT_METRIC_LABELS) as Array<Exclude<ReportMetricKey, `state:${string}`>>).map((key) => (
                        <label key={key} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={reportMetrics[key]}
                            onChange={() => toggleReportMetric(key)}
                            className="rounded border-slate-300 text-[#14B8A6] focus:ring-[#14B8A6]"
                          />
                          {REPORT_METRIC_LABELS[key]}
                        </label>
                      ))}
                      <div className="my-2 border-t border-slate-100 pt-2">
                        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Invoice states</p>
                        {INVOICE_STATES.map((s) => {
                          const key = `state:${s.value}` as ReportMetricKey;
                          return (
                            <label key={s.value} className="mb-2 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                              <input
                                type="checkbox"
                                checked={reportMetrics[key]}
                                onChange={() => toggleReportMetric(key)}
                                className="rounded border-slate-300 text-[#14B8A6] focus:ring-[#14B8A6]"
                              />
                              {s.label}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-9">
            {reportMetrics.outstanding && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border-l-[6px] border-rose-500 bg-white p-4 shadow-sm"
            >
              <p className="mb-0.5 text-[11px] font-bold uppercase tracking-wider text-rose-500">Outstanding</p>
              <h3 className="text-2xl font-black text-slate-900">{formatCurrency(overallOutstanding, 'GBP')}</h3>
              <p className="text-[10px] text-slate-400">across all invoices</p>
            </motion.div>
            )}

            {reportMetrics.net_profit && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border-l-[6px] border-emerald-500 bg-white p-4 shadow-sm"
            >
              <p className="mb-0.5 text-[11px] font-bold uppercase tracking-wider text-emerald-600">Net Profit</p>
              <h3 className="text-2xl font-black text-slate-900">{formatCurrency(overallNetProfit, 'GBP')}</h3>
              <p className="text-[10px] text-slate-400">after job costs &amp; general overheads</p>
            </motion.div>
            )}

            {reportMetrics.company_expenses && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border-l-[6px] border-amber-500 bg-white p-4 shadow-sm"
            >
              <p className="mb-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-600">Company Expenses</p>
              <h3 className="text-2xl font-black text-slate-900">{formatCurrency(expenseStats?.company_total ?? 0, 'GBP')}</h3>
              <p className="text-[10px] text-slate-400">{expenseStats?.company_count ?? 0} approved job expenses</p>
            </motion.div>
            )}

            {reportMetrics.general_overheads && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border-l-[6px] border-orange-500 bg-white p-4 shadow-sm"
            >
              <p className="mb-0.5 text-[11px] font-bold uppercase tracking-wider text-orange-600">General Overheads</p>
              <h3 className="text-2xl font-black text-slate-900">{formatCurrency(expenseStats?.general_overhead_total ?? 0, 'GBP')}</h3>
              <p className="text-[10px] text-slate-400">{expenseStats?.general_overhead_count ?? 0} insurance, rent, etc.</p>
            </motion.div>
            )}

            {reportMetrics.personal_expenses && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border-l-[6px] border-violet-500 bg-white p-4 shadow-sm"
            >
              <p className="mb-0.5 text-[11px] font-bold uppercase tracking-wider text-violet-600">Personal Expenses</p>
              <h3 className="text-2xl font-black text-slate-900">{formatCurrency(expenseStats?.personal_total ?? 0, 'GBP')}</h3>
              <p className="text-[10px] text-slate-400">{expenseStats?.personal_count ?? 0} approved reimbursements</p>
            </motion.div>
            )}

            {reportMetrics.approved_expenses && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border-l-[6px] border-slate-500 bg-white p-4 shadow-sm"
            >
              <p className="mb-0.5 text-[11px] font-bold uppercase tracking-wider text-slate-600">Approved Expenses</p>
              <h3 className="text-2xl font-black text-slate-900">{formatCurrency(expenseStats?.approved_total ?? 0, 'GBP')}</h3>
              <p className="text-[10px] text-slate-400">{expenseStats?.approved_count ?? 0} total approved</p>
            </motion.div>
            )}

            {INVOICE_STATES.filter((s) => reportMetrics[`state:${s.value}` as ReportMetricKey]).map((s) => (
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
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Site / work address</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Job</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Date</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Due</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Amount</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Profit</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {invoices.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-6 py-12 text-center text-slate-500">
                        No invoices yet. Create one to get started.
                      </td>
                    </tr>
                  ) : (
                    invoices.map((inv) => (
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
                        <td className="max-w-[220px] px-6 py-4 text-sm text-slate-600">
                          <span className="line-clamp-2" title={siteWorkAddressLabel(inv)}>
                            {siteWorkAddressLabel(inv)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-500">{inv.job_id && inv.job_title ? inv.job_title : '—'}</td>
                        <td className="px-6 py-4 text-sm text-slate-500">{formatDate(inv.invoice_date)}</td>
                        <td className="px-6 py-4 text-sm text-slate-500">{formatDate(inv.due_date)}</td>
                        <td className="px-6 py-4 text-sm font-medium text-slate-900">{formatCurrency(inv.total_amount, inv.currency)}</td>
                        <td className="px-6 py-4 text-sm font-semibold">
                          {inv.profit != null ? (
                            <span className={inv.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                              {formatCurrency(inv.profit, inv.currency)}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
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
    </>
  );
}
