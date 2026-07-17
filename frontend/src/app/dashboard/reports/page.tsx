'use client';

import { useCallback, useEffect, useState } from 'react';
import { Briefcase, Download, Users } from 'lucide-react';
import { getBlob, getJson } from '../../apiClient';

// --- Type Definitions ---
type StaffRow = {
  officer_id: number;
  full_name: string;
  days_worked: number;
  total_seconds: number;
  travelling_seconds: number;
  on_site_seconds: number;
};

type RevenueCustomerRow = {
  customer_id: number;
  customer_name: string;
  invoice_count: number;
  total: number;
};

type TopJobRow = {
  title: string;
  count: number;
};

type WorkCustomerRow = {
  customer_id: number;
  customer_name: string;
  job_count: number;
  total_seconds: number;
  travelling_seconds: number;
  on_site_seconds: number;
};

type ReportsOverview = {
  from: string;
  to: string;
  staff: StaffRow[];
  totals: {
    total_seconds: number;
    travelling_seconds: number;
    on_site_seconds: number;
  };
  revenueByCustomer: RevenueCustomerRow[];
  topJobs: TopJobRow[];
  workByCustomer: WorkCustomerRow[];
  financials: {
    turnover: number;
    invoice_count: number;
    profit: number;
    overheads: number;
    overhead_count: number;
    net_profit: number;
  };
};

type Preset = 'this_month' | 'last_month' | 'last_3_months' | 'this_year';

// --- Helpers ---
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function monthStart(): string {
  const d = new Date();
  return isoDay(new Date(d.getFullYear(), d.getMonth(), 1));
}

function todayStr(): string {
  return isoDay(new Date());
}

function formatHours(seconds: number): string {
  const hours = seconds / 3600;
  return `${hours.toFixed(hours >= 10 ? 1 : 2)}h`;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value || 0);
}

export default function ReportsPage() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayStr());
  const [activePreset, setActivePreset] = useState<Preset>('this_month');
  const [data, setData] = useState<ReportsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  const fetchReport = useCallback(async () => {
    if (!token) {
      setError('You are not signed in.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from, to });
      const res = await getJson<ReportsOverview>(`/reports/overview?${params.toString()}`, token);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [token, from, to]);

  useEffect(() => {
    void fetchReport();
  }, [fetchReport]);

  async function handleExportPdf() {
    if (!token || downloadingPdf) return;
    setDownloadingPdf(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from, to });
      const blob = await getBlob(`/reports/overview.pdf?${params.toString()}`, token);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-${from}-to-${to}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to export PDF');
    } finally {
      setDownloadingPdf(false);
    }
  }

  function applyPreset(preset: Preset) {
    const now = new Date();
    setActivePreset(preset);
    if (preset === 'this_month') {
      setFrom(isoDay(new Date(now.getFullYear(), now.getMonth(), 1)));
      setTo(isoDay(now));
    } else if (preset === 'last_month') {
      setFrom(isoDay(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
      setTo(isoDay(new Date(now.getFullYear(), now.getMonth(), 0)));
    } else if (preset === 'last_3_months') {
      setFrom(isoDay(new Date(now.getFullYear(), now.getMonth() - 2, 1)));
      setTo(isoDay(now));
    } else {
      setFrom(isoDay(new Date(now.getFullYear(), 0, 1)));
      setTo(isoDay(now));
    }
  }

  const fin = data?.financials;
  const maxRevenue = Math.max(0, ...(data?.revenueByCustomer.map((r) => r.total) ?? [0]));
  const maxJobCount = Math.max(0, ...(data?.topJobs.map((r) => r.count) ?? [0]));
  const maxWorkJobs = Math.max(0, ...(data?.workByCustomer.map((r) => r.job_count) ?? [0]));

  const presets: { id: Preset; label: string }[] = [
    { id: 'this_month', label: 'This month' },
    { id: 'last_month', label: 'Last month' },
    { id: 'last_3_months', label: 'Last 3 months' },
    { id: 'this_year', label: 'This year' },
  ];

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      {/* Title section */}
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#14B8A6]">Business</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Reports</h1>
          <p className="mt-1 text-sm font-medium text-slate-600">
            Staff hours, travel time, revenue, turnover and profit for the selected period.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  activePreset === p.id ? 'bg-[#14B8A6] text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <label className="text-xs font-semibold uppercase text-slate-500">
            From
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setActivePreset('' as Preset);
              }}
              className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:ring-1 focus:ring-[#14B8A6]"
            />
          </label>
          <label className="text-xs font-semibold uppercase text-slate-500">
            To
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setActivePreset('' as Preset);
              }}
              className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:ring-1 focus:ring-[#14B8A6]"
            />
          </label>
          <button
            type="button"
            onClick={() => void handleExportPdf()}
            disabled={downloadingPdf || loading}
            className="flex items-center gap-2 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0d9488] disabled:opacity-50"
          >
            <Download className="size-4" />
            {downloadingPdf ? 'Exporting…' : 'Export PDF'}
          </button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      {/* KPI cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Turnover"
          value={formatMoney(fin?.turnover ?? 0)}
          sub={`${fin?.invoice_count ?? 0} invoices in period`}
          accent="border-teal-500"
          loading={loading}
        />
        <KpiCard
          label="Profit"
          value={formatMoney(fin?.profit ?? 0)}
          sub="after job costs, before overheads"
          accent="border-emerald-500"
          loading={loading}
        />
        <KpiCard
          label="General overheads"
          value={formatMoney(fin?.overheads ?? 0)}
          sub={`${fin?.overhead_count ?? 0} entries in period`}
          accent="border-orange-500"
          loading={loading}
        />
        <KpiCard
          label="Net profit"
          value={formatMoney(fin?.net_profit ?? 0)}
          sub="after job costs & overheads"
          accent={(fin?.net_profit ?? 0) < 0 ? 'border-rose-500' : 'border-emerald-600'}
          loading={loading}
        />
        <KpiCard
          label="Hours worked"
          value={formatHours(data?.totals.total_seconds ?? 0)}
          sub={`${formatHours(data?.totals.on_site_seconds ?? 0)} on site`}
          accent="border-slate-500"
          loading={loading}
        />
        <KpiCard
          label="Travel time"
          value={formatHours(data?.totals.travelling_seconds ?? 0)}
          sub={
            data && data.totals.total_seconds > 0
              ? `${Math.round((data.totals.travelling_seconds / data.totals.total_seconds) * 100)}% of all hours`
              : 'of all hours'
          }
          accent="border-amber-500"
          loading={loading}
        />
      </div>

      {/* Staff hours & travel */}
      <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-900">Staff hours &amp; travel</h2>
          <p className="text-sm text-slate-500">Who worked what hours in the period, split by on-site and travelling time.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Officer</th>
                <th className="px-5 py-3">Days</th>
                <th className="px-5 py-3">On site</th>
                <th className="px-5 py-3">Travelling</th>
                <th className="px-5 py-3">Total hours</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td className="px-5 py-6 text-slate-500" colSpan={5}>Loading staff hours…</td></tr>
              ) : !data || data.staff.length === 0 ? (
                <tr><td className="px-5 py-6 text-slate-500" colSpan={5}>No officers found.</td></tr>
              ) : (
                data.staff.map((o) => (
                  <tr key={o.officer_id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-semibold text-slate-900">{o.full_name}</td>
                    <td className="px-5 py-3 text-slate-600">{o.days_worked}</td>
                    <td className="px-5 py-3 text-slate-600">{formatHours(o.on_site_seconds)}</td>
                    <td className="px-5 py-3 text-slate-600">{formatHours(o.travelling_seconds)}</td>
                    <td className="px-5 py-3 font-semibold text-slate-900">{formatHours(o.total_seconds)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Revenue by customer */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-[#14B8A6]" />
              <h2 className="text-lg font-bold text-slate-900">Revenue by customer</h2>
            </div>
            <p className="text-sm text-slate-500">Invoiced totals per customer in the period.</p>
          </div>
          <div className="divide-y divide-slate-100">
            {loading ? (
              <p className="px-5 py-6 text-sm text-slate-500">Loading revenue…</p>
            ) : !data || data.revenueByCustomer.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">No invoices in this period.</p>
            ) : (
              data.revenueByCustomer.map((r) => (
                <div key={r.customer_id} className="px-5 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate text-sm font-semibold text-slate-900">{r.customer_name}</p>
                    <p className="text-sm font-bold text-slate-900">{formatMoney(r.total)}</p>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-[#14B8A6]"
                      style={{ width: `${maxRevenue > 0 ? (r.total / maxRevenue) * 100 : 0}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{r.invoice_count} invoice{r.invoice_count === 1 ? '' : 's'}</p>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Most-done jobs */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-2">
              <Briefcase className="size-4 text-[#14B8A6]" />
              <h2 className="text-lg font-bold text-slate-900">Jobs done the most</h2>
            </div>
            <p className="text-sm text-slate-500">Most frequent job types created in the period.</p>
          </div>
          <div className="divide-y divide-slate-100">
            {loading ? (
              <p className="px-5 py-6 text-sm text-slate-500">Loading jobs…</p>
            ) : !data || data.topJobs.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">No jobs in this period.</p>
            ) : (
              data.topJobs.map((r) => (
                <div key={r.title} className="px-5 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate text-sm font-semibold text-slate-900">{r.title}</p>
                    <p className="text-sm font-bold text-slate-900">{r.count}×</p>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-violet-500"
                      style={{ width: `${maxJobCount > 0 ? (r.count / maxJobCount) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Most-worked customers */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:col-span-2">
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-[#14B8A6]" />
              <h2 className="text-lg font-bold text-slate-900">Customers worked for the most</h2>
            </div>
            <p className="text-sm text-slate-500">Job count and hours spent per customer in the period.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Jobs</th>
                  <th className="px-5 py-3">On site</th>
                  <th className="px-5 py-3">Travelling</th>
                  <th className="px-5 py-3">Total hours</th>
                  <th className="px-5 py-3 w-1/3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td className="px-5 py-6 text-slate-500" colSpan={6}>Loading customers…</td></tr>
                ) : !data || data.workByCustomer.length === 0 ? (
                  <tr><td className="px-5 py-6 text-slate-500" colSpan={6}>No jobs in this period.</td></tr>
                ) : (
                  data.workByCustomer.map((r) => (
                    <tr key={r.customer_id} className="hover:bg-slate-50">
                      <td className="px-5 py-3 font-semibold text-slate-900">{r.customer_name}</td>
                      <td className="px-5 py-3 text-slate-600">{r.job_count}</td>
                      <td className="px-5 py-3 text-slate-600">{formatHours(r.on_site_seconds)}</td>
                      <td className="px-5 py-3 text-slate-600">{formatHours(r.travelling_seconds)}</td>
                      <td className="px-5 py-3 font-semibold text-slate-900">{formatHours(r.total_seconds)}</td>
                      <td className="px-5 py-3">
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-amber-500"
                            style={{ width: `${maxWorkJobs > 0 ? (r.job_count / maxWorkJobs) * 100 : 0}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function KpiCard({
  label,
  value,
  sub,
  accent,
  loading,
}: {
  label: string;
  value: string;
  sub?: string;
  accent: string;
  loading?: boolean;
}) {
  return (
    <div className={`rounded-xl border-l-[6px] ${accent} bg-white p-4 shadow-sm`}>
      <p className="mb-0.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <h3 className="text-2xl font-black text-slate-900">{loading ? '…' : value}</h3>
      {sub && <p className="text-[10px] text-slate-400">{sub}</p>}
    </div>
  );
}
