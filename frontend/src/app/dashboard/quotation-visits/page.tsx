'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, Plus, ChevronRight, MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getJson } from '../../apiClient';
import { Pagination } from '../Pagination';

interface QuotationVisit {
  id: number;
  title: string;
  state: string;
  customer_id: number | null;
  customer_full_name: string | null;
  officer_id: number | null;
  officer_full_name: string | null;
  location: string | null;
  diary_event_id: number | null;
  latest_visit_start: string | null;
  latest_visit_status: string | null;
  quotation_id: number | null;
  quotation_number: string | null;
  quotation_state: string | null;
  created_at: string;
}

interface VisitsResponse {
  visits: QuotationVisit[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const PAGE_SIZE = 10;

const VISIT_STATUS_COLORS: Record<string, string> = {
  completed: 'bg-emerald-100 text-emerald-800',
  'arrived_at_site': 'bg-blue-100 text-blue-800',
  arrived: 'bg-blue-100 text-blue-800',
  'travelling_to_site': 'bg-amber-100 text-amber-800',
  travelling: 'bg-amber-100 text-amber-800',
  cancelled: 'bg-rose-100 text-rose-800',
  aborted: 'bg-rose-100 text-rose-800',
};

const QUOTATION_STATE_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  sent: 'bg-blue-100 text-blue-800',
  accepted: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-800',
  expired: 'bg-slate-200 text-slate-500',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatStatus(raw: string | null): string {
  if (!raw || raw === 'No status') return 'Scheduled';
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function QuotationVisitsPage() {
  const router = useRouter();
  const [visits, setVisits] = useState<QuotationVisit[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchVisits = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (searchDebounced) params.set('search', searchDebounced);
      const data = await getJson<VisitsResponse>(`/quotation-visits?${params}`, token);
      setVisits(data.visits || []);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch {
      setVisits([]);
    } finally {
      setLoading(false);
    }
  }, [token, page, searchDebounced]);

  useEffect(() => {
    void fetchVisits();
  }, [fetchVisits]);

  return (
    <>
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
        <div className="flex items-center gap-6">
          <h2 className="text-lg font-bold text-slate-900">Quotation Visits</h2>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search visits..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full rounded-lg border-0 bg-slate-100 py-1.5 pl-10 pr-4 text-sm outline-none ring-1 ring-transparent focus:ring-2 focus:ring-[#14B8A6]"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/quotations"
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            Quotations
          </Link>
          <motion.button
            type="button"
            onClick={() => router.push('/dashboard/quotations')}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 font-bold text-amber-900 shadow-sm hover:bg-amber-100"
          >
            <Plus className="size-4" />
            Schedule visit
          </motion.button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900">Quotation Visits</h1>
            <p className="mt-1 text-slate-500">
              Site survey visits scheduled for officers. Officer notes appear here for manual quotation creation.
            </p>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Visit</th>
                    <th className="px-5 py-3">Customer</th>
                    <th className="px-5 py-3">Officer</th>
                    <th className="px-5 py-3">Scheduled</th>
                    <th className="px-5 py-3">Visit status</th>
                    <th className="px-5 py-3">Quotation</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center text-slate-500">Loading…</td>
                    </tr>
                  ) : visits.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center text-slate-500">
                        No quotation visits yet.{' '}
                        <Link href="/dashboard/quotations" className="font-semibold text-[#14B8A6] hover:underline">
                          Schedule one from Quotations
                        </Link>
                      </td>
                    </tr>
                  ) : (
                    <AnimatePresence>
                      {visits.map((v) => {
                        const statusKey = (v.latest_visit_status || '').toLowerCase();
                        const statusColor = VISIT_STATUS_COLORS[statusKey] ?? 'bg-slate-100 text-slate-600';
                        const qColor = v.quotation_state ? (QUOTATION_STATE_COLORS[v.quotation_state] ?? 'bg-slate-100 text-slate-600') : '';
                        return (
                          <motion.tr
                            key={v.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="hover:bg-slate-50/80"
                          >
                            <td className="px-5 py-3">
                              <div className="font-semibold text-slate-900">{v.title}</div>
                              {v.location && (
                                <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                                  <MapPin className="size-3" />
                                  {v.location}
                                </div>
                              )}
                            </td>
                            <td className="px-5 py-3 text-slate-700">{v.customer_full_name ?? '—'}</td>
                            <td className="px-5 py-3 text-slate-700">{v.officer_full_name ?? '—'}</td>
                            <td className="px-5 py-3 text-slate-600">{formatDate(v.latest_visit_start)}</td>
                            <td className="px-5 py-3">
                              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColor}`}>
                                {formatStatus(v.latest_visit_status)}
                              </span>
                            </td>
                            <td className="px-5 py-3">
                              {v.quotation_id ? (
                                <Link
                                  href={`/dashboard/quotations/${v.quotation_id}`}
                                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold hover:underline ${qColor}`}
                                >
                                  {v.quotation_number} · {v.quotation_state}
                                </Link>
                              ) : (
                                <span className="text-xs text-slate-400">None</span>
                              )}
                            </td>
                            <td className="px-5 py-3 text-right">
                              <Link
                                href={`/dashboard/quotation-visits/${v.id}`}
                                className="inline-flex items-center gap-1 text-sm font-semibold text-[#14B8A6] hover:underline"
                              >
                                View <ChevronRight className="size-4" />
                              </Link>
                            </td>
                          </motion.tr>
                        );
                      })}
                    </AnimatePresence>
                  )}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="border-t border-slate-200 px-5 py-3">
                <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} itemName="visits" />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
