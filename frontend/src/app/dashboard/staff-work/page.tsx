'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Briefcase, CalendarDays, Clock3, Gauge, ReceiptText, Route } from 'lucide-react';
import { getJson, patchJson } from '../../apiClient';

type OfficerWorkRow = {
  id: number;
  full_name: string;
  role_position: string | null;
  department: string | null;
  state: string;
  days_worked: number;
  total_seconds: number;
  travelling_seconds: number;
  on_site_seconds: number;
  expenses_total: number;
  expenses_count: number;
  pending_expenses_total: number;
  pending_expenses_count: number;
};

type ExpenseRow = {
  id: number;
  job_id: number;
  officer_id: number | null;
  officer_name: string | null;
  job_title: string | null;
  job_number: string | null;
  customer_name: string | null;
  expense_date: string;
  category: string;
  description: string | null;
  amount: number;
  status: string;
  created_at: string | null;
};

type StaffWorkSummary = {
  from: string;
  to: string;
  officers: OfficerWorkRow[];
  totals: {
    days_worked: number;
    total_seconds: number;
    travelling_seconds: number;
    on_site_seconds: number;
    expenses_total: number;
    expenses_count: number;
    pending_expenses_total: number;
    pending_expenses_count: number;
  };
};

function monthStart(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatHours(seconds: number): string {
  const hours = seconds / 3600;
  return `${hours.toFixed(hours >= 10 ? 1 : 2)}h`;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value || 0);
}

export default function StaffWorkPage() {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [summary, setSummary] = useState<StaffWorkSummary | null>(null);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingExpenseId, setUpdatingExpenseId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ from, to }).toString();
      const [summaryRes, expensesRes] = await Promise.all([
        getJson<StaffWorkSummary>(`/staff-work/summary?${q}`, token),
        getJson<{ expenses: ExpenseRow[] }>(`/staff-work/expenses?${q}`, token),
      ]);
      setSummary(summaryRes);
      setExpenses(expensesRes.expenses ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load staff work');
      setSummary(null);
      setExpenses([]);
    } finally {
      setLoading(false);
    }
  }, [from, to, token]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const sortedOfficers = useMemo(
    () => [...(summary?.officers ?? [])].sort((a, b) => b.total_seconds - a.total_seconds),
    [summary],
  );

  const totals = summary?.totals;
  const pendingExpenses = expenses.filter((e) => e.status === 'submitted');
  const approvedExpenses = expenses.filter((e) => e.status === 'approved');

  const updateExpenseStatus = async (expenseId: number, status: 'approved' | 'rejected') => {
    if (!token) return;
    setUpdatingExpenseId(expenseId);
    setError(null);
    try {
      await patchJson(`/job-expenses/${expenseId}`, { status }, token);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update expense');
    } finally {
      setUpdatingExpenseId(null);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#14B8A6]">Work</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Staff Work</h1>
          <p className="mt-1 text-sm text-slate-600">
            Officer working time, travelling time, days worked, and approved expenses outstanding for pay.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-3">
          <label className="text-xs font-semibold uppercase text-slate-500">
            From
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <label className="text-xs font-semibold uppercase text-slate-500">
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <button
            type="button"
            onClick={() => void fetchData()}
            className="rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0d9488]"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard icon={<Clock3 className="size-5" />} label="Hours worked" value={formatHours(totals?.total_seconds ?? 0)} />
        <SummaryCard icon={<Route className="size-5" />} label="Travelling" value={formatHours(totals?.travelling_seconds ?? 0)} />
        <SummaryCard icon={<Gauge className="size-5" />} label="On site" value={formatHours(totals?.on_site_seconds ?? 0)} />
        <SummaryCard icon={<CalendarDays className="size-5" />} label="Days worked" value={`${totals?.days_worked ?? 0}`} />
        <SummaryCard icon={<ReceiptText className="size-5" />} label="Approved expenses due" value={formatMoney(totals?.expenses_total ?? 0)} />
      </div>

      <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-900">Officer hours</h2>
          <p className="text-sm text-slate-500">Totals come from mobile diary visit statuses: travelling and on site.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Officer</th>
                <th className="px-5 py-3">Days</th>
                <th className="px-5 py-3">Hours worked</th>
                <th className="px-5 py-3">Travelling</th>
                <th className="px-5 py-3">On site</th>
                <th className="px-5 py-3">Expenses</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td className="px-5 py-6 text-slate-500" colSpan={6}>Loading staff work…</td></tr>
              ) : sortedOfficers.length === 0 ? (
                <tr><td className="px-5 py-6 text-slate-500" colSpan={6}>No officers found.</td></tr>
              ) : (
                sortedOfficers.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-900">{o.full_name}</p>
                      <p className="text-xs text-slate-500">{[o.role_position, o.department].filter(Boolean).join(' · ') || o.state}</p>
                    </td>
                    <td className="px-5 py-4 font-semibold text-slate-700">{o.days_worked}</td>
                    <td className="px-5 py-4 font-semibold text-slate-900">{formatHours(o.total_seconds)}</td>
                    <td className="px-5 py-4 text-slate-700">{formatHours(o.travelling_seconds)}</td>
                    <td className="px-5 py-4 text-slate-700">{formatHours(o.on_site_seconds)}</td>
                    <td className="px-5 py-4">
                      <span className="font-semibold text-slate-900">{formatMoney(o.expenses_total)}</span>
                      <span className="ml-2 text-xs text-slate-500">approved ({o.expenses_count})</span>
                      {o.pending_expenses_count > 0 && (
                        <p className="text-xs font-semibold text-amber-700">
                          Pending: {formatMoney(o.pending_expenses_total)} ({o.pending_expenses_count})
                        </p>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-900">Pending expenses to approve</h2>
          <p className="text-sm text-slate-500">Officer-submitted parking, travel, and other job expenses. Approve to add them to outstanding pay and job costs.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Officer</th>
                <th className="px-5 py-3">Job</th>
                <th className="px-5 py-3">Expense</th>
                <th className="px-5 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pendingExpenses.length === 0 ? (
                <tr><td className="px-5 py-6 text-slate-500" colSpan={5}>No pending expenses for this period.</td></tr>
              ) : (
                pendingExpenses.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4 text-slate-600">{e.expense_date}</td>
                    <td className="px-5 py-4 font-semibold text-slate-900">{e.officer_name || 'Unassigned'}</td>
                    <td className="px-5 py-4">
                      <Link href={`/dashboard/jobs/${e.job_id}`} className="inline-flex items-center gap-1 font-semibold text-[#14B8A6] hover:underline">
                        <Briefcase className="size-3.5" />
                        {e.job_number || `Job #${e.job_id}`}
                      </Link>
                      <p className="text-xs text-slate-500">{e.customer_name || e.job_title || ''}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-800">{e.category}</p>
                      {e.description && <p className="text-xs text-slate-500">{e.description}</p>}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <p className="font-bold text-slate-900">{formatMoney(e.amount)}</p>
                      <div className="mt-2 flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={updatingExpenseId === e.id}
                          onClick={() => void updateExpenseStatus(e.id, 'rejected')}
                          className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          disabled={updatingExpenseId === e.id}
                          onClick={() => void updateExpenseStatus(e.id, 'approved')}
                          className="rounded-md bg-[#14B8A6] px-2 py-1 text-xs font-semibold text-white hover:bg-[#0d9488] disabled:opacity-50"
                        >
                          Approve
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-900">Approved expenses outstanding</h2>
          <p className="text-sm text-slate-500">These are approved and included in officer outstanding balance and job Costs tab.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Officer</th>
                <th className="px-5 py-3">Job</th>
                <th className="px-5 py-3">Expense</th>
                <th className="px-5 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {approvedExpenses.length === 0 ? (
                <tr><td className="px-5 py-6 text-slate-500" colSpan={5}>No approved outstanding expenses for this period.</td></tr>
              ) : (
                approvedExpenses.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4 text-slate-600">{e.expense_date}</td>
                    <td className="px-5 py-4 font-semibold text-slate-900">{e.officer_name || 'Unassigned'}</td>
                    <td className="px-5 py-4">
                      <Link href={`/dashboard/jobs/${e.job_id}`} className="inline-flex items-center gap-1 font-semibold text-[#14B8A6] hover:underline">
                        <Briefcase className="size-3.5" />
                        {e.job_number || `Job #${e.job_id}`}
                      </Link>
                      <p className="text-xs text-slate-500">{e.customer_name || e.job_title || ''}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-800">{e.category}</p>
                      {e.description && <p className="text-xs text-slate-500">{e.description}</p>}
                    </td>
                    <td className="px-5 py-4 text-right font-bold text-slate-900">{formatMoney(e.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-[#14B8A6]/10 text-[#14B8A6]">{icon}</div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
