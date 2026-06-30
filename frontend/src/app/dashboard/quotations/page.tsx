'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, Quote, Plus, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getJson, postJson } from '../../apiClient';
import { localDateAndTimeToIso } from '@/lib/localDateTime';
import { Pagination } from '../Pagination';
import ImportCustomerSelect from '../ImportCustomerSelect';
import WorkAddressSelect from '../WorkAddressSelect';

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
  address_line_1?: string;
  address_line_2?: string;
  town?: string;
  county?: string;
  postcode?: string;
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
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [stateCounts, setStateCounts] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [page, setPage] = useState(1);

  const [visitModalOpen, setVisitModalOpen] = useState(false);
  const [visitError, setVisitError] = useState<string | null>(null);
  const [visitCustomerId, setVisitCustomerId] = useState<number | null>(null);
  const [visitOfficerId, setVisitOfficerId] = useState<number | null>(null);
  const [visitDate, setVisitDate] = useState('');
  const [visitTime, setVisitTime] = useState('09:00');
  const [visitDuration, setVisitDuration] = useState(60);
  const [visitNotes, setVisitNotes] = useState('');
  const [visitWorkAddressId, setVisitWorkAddressId] = useState<number | null>(null);
  const [visitWorkAddressOptions, setVisitWorkAddressOptions] = useState<{ id: number; label: string }[]>([]);
  const [officers, setOfficers] = useState<{ id: number; full_name: string; state: string }[]>([]);

  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  const fetchWorkAddressesForCustomer = useCallback(
    async (customerId: number, setter: (options: { id: number; label: string }[]) => void) => {
      if (!token) {
        setter([]);
        return;
      }
      try {
        const res = await getJson<{
          work_addresses: {
            id: number;
            name: string;
            address_line_1?: string | null;
            town?: string | null;
            postcode?: string | null;
          }[];
        }>(`/customers/${customerId}/work-addresses?status=active`, token);
        const rows = res.work_addresses ?? [];
        setter(
          rows.map((w) => {
            const addr = [w.address_line_1, w.town, w.postcode].filter((x): x is string => Boolean(x && String(x).trim())).join(', ');
            const label = [w.name?.trim() || `Site #${w.id}`, addr].filter(Boolean).join(' — ');
            return { id: w.id, label: label || `Work #${w.id}` };
          }),
        );
      } catch {
        setter([]);
      }
    },
    [token],
  );

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
      const data = await getJson<{ customers: Customer[] }>('/customers?limit=5000&page=1', token);
      setCustomers(data.customers ?? []);
    } catch {
      setCustomers([]);
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
    const t = setTimeout(() => {
      void fetchQuotations();
    }, 0);
    return () => clearTimeout(t);
  }, [fetchQuotations]);

  useEffect(() => {
    if (visitModalOpen) {
      const t = setTimeout(() => {
        void fetchCustomers();
      }, 0);
      return () => clearTimeout(t);
    }
  }, [visitModalOpen, fetchCustomers]);

  const stateBadge = (state: string) => {
    const opt = QUOTATION_STATES.find((s) => s.value === state) ?? QUOTATION_STATES[0];
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${opt.color}`}>
        {opt.label}
      </span>
    );
  };

  const resetVisitForm = () => {
    setVisitCustomerId(null);
    setVisitOfficerId(null);
    setVisitWorkAddressId(null);
    setVisitWorkAddressOptions([]);
    setVisitDate('');
    setVisitTime('09:00');
    setVisitDuration(60);
    setVisitNotes('');
    setVisitError(null);
  };

  const handleVisitCustomerChange = (customerId: number | null) => {
    setVisitCustomerId(customerId);
    setVisitWorkAddressId(null);
    setVisitWorkAddressOptions([]);
    if (customerId) {
      void fetchWorkAddressesForCustomer(customerId, setVisitWorkAddressOptions);
    }
  };

  const openVisitModal = async () => {
    setVisitError(null);
    resetVisitForm();
    if (token) {
      try {
        const data = await getJson<{ officers: { id: number; full_name: string; state: string }[] }>('/officers/list', token);
        setOfficers(data.officers?.filter((o) => o.state === 'active') ?? []);
      } catch {
        setOfficers([]);
      }
    }
    setVisitModalOpen(true);
  };

  const handleCreateVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    setVisitError(null);
    if (!visitCustomerId) {
      setVisitError('Customer is required.');
      return;
    }
    if (!visitOfficerId) {
      setVisitError('Officer is required.');
      return;
    }
    if (!visitDate || !visitTime) {
      setVisitError('Date and time are required.');
      return;
    }
    if (!token) return;
    try {
      const startTime = localDateAndTimeToIso(visitDate, visitTime);
      const res = await postJson<{
        job: { id: number };
        diary_event: { id: number };
      }>(
        '/quotation-visits',
        {
          customer_id: visitCustomerId,
          officer_id: visitOfficerId,
          ...(visitWorkAddressId != null ? { work_address_id: visitWorkAddressId } : {}),
          start_time: startTime,
          duration_minutes: visitDuration,
          notes: visitNotes.trim() || undefined,
        },
        token,
      );
      setVisitModalOpen(false);
      resetVisitForm();
      const jobId = res.job?.id;
      if (jobId) {
        router.push(`/dashboard/quotation-visits/${jobId}`);
      }
    } catch (err) {
      setVisitError(err instanceof Error ? err.message : 'Failed to create quotation visit.');
    }
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
            <div className="flex items-center gap-3">
              <motion.button
                type="button"
                onClick={openVisitModal}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-5 py-2.5 font-bold text-amber-900 shadow-sm transition hover:bg-amber-100"
              >
                <Plus className="size-5" />
                Create Quotation Visit
              </motion.button>
              <motion.button
                type="button"
                onClick={() => router.push('/dashboard/quotations/new')}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#14B8A6] px-5 py-2.5 font-bold text-white shadow-sm transition hover:brightness-110"
              >
                <Plus className="size-5" />
                Create Quotation
              </motion.button>
            </div>
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
                  onChange={(e) => {
                    setStateFilter(e.target.value);
                    setPage(1);
                  }}
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
                      <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
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
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              itemName="quotations"
            />
          </motion.div>
        </div>
      </div>

      {visitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setVisitModalOpen(false)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-slate-900">Create Quotation Visit</h3>
            <p className="mt-1 text-sm text-slate-500">Book a site survey so an officer can visit and create a quotation.</p>
            <form onSubmit={handleCreateVisit} className="mt-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Customer *</label>
                <div className="mt-1">
                  <ImportCustomerSelect
                    customers={customers}
                    value={visitCustomerId}
                    onChange={handleVisitCustomerChange}
                    className="w-full"
                  />
                </div>
              </div>
              {visitCustomerId && (
                <div>
                  <label className="block text-sm font-medium text-slate-700">Work / site address (optional)</label>
                  <div className="mt-1 flex gap-2">
                    <div className="min-w-0 flex-1">
                      <WorkAddressSelect
                        options={visitWorkAddressOptions}
                        value={visitWorkAddressId}
                        onChange={setVisitWorkAddressId}
                        emptyButtonLabel="None — use customer main address"
                        emptyMenuLabel="None — customer main address"
                        className="w-full"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        window.open(
                          `/dashboard/customers/${visitCustomerId}?tab=${encodeURIComponent('Work address')}`,
                          '_blank',
                        )
                      }
                      className="flex size-[38px] shrink-0 items-center justify-center rounded-lg border border-slate-200 text-[#14B8A6] transition-colors hover:bg-[#14B8A6] hover:text-white"
                      title="Add work / site address"
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
                  {visitWorkAddressOptions.length === 0 && (
                    <p className="mt-1 text-xs text-slate-500">This customer has no active work addresses yet.</p>
                  )}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700">Officer *</label>
                <select
                  value={visitOfficerId ?? ''}
                  onChange={(e) => setVisitOfficerId(e.target.value ? Number(e.target.value) : null)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
                >
                  <option value="">-- Select officer --</option>
                  {officers.map((o) => (
                    <option key={o.id} value={o.id}>{o.full_name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Date *</label>
                  <input type="date" required value={visitDate} onChange={(e) => setVisitDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Time *</label>
                  <input type="time" required value={visitTime} onChange={(e) => setVisitTime(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Duration (minutes)</label>
                <input type="number" min={15} step={15} value={visitDuration} onChange={(e) => setVisitDuration(Number(e.target.value) || 60)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Notes</label>
                <textarea rows={3} value={visitNotes} onChange={(e) => setVisitNotes(e.target.value)} placeholder="Any special instructions for the officer..." className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30" />
              </div>
              {visitError && <p className="text-sm text-red-600">{visitError}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setVisitModalOpen(false)} className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="submit" className="flex-1 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600">Create Visit</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </>
  );
}
