'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search, CalendarClock, Briefcase, Pause, Play, RefreshCw, XCircle } from 'lucide-react';
import { getJson, postJson } from '../../apiClient';
import { PPM_FILTER_TABS, type PpmContract, type PpmListFilter } from '../../../lib/ppmContractTypes';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso.slice(0, 10)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function statusBadge(c: PpmContract): { label: string; className: string } {
  if (c.status === 'expired' || (c.days_until_expiry != null && c.days_until_expiry < 0)) {
    return { label: 'Expired', className: 'bg-slate-200 text-slate-600' };
  }
  if (c.days_until_due != null && c.days_until_due < 0) {
    return { label: 'Overdue', className: 'bg-rose-100 text-rose-800' };
  }
  if (c.days_until_due != null && c.days_until_due <= 30) {
    return { label: `Due in ${c.days_until_due} days`, className: 'bg-amber-100 text-amber-800' };
  }
  if (c.days_until_expiry != null && c.days_until_expiry >= 0) {
    return { label: `Active — expires in ${c.days_until_expiry} days`, className: 'bg-emerald-100 text-emerald-800' };
  }
  return { label: 'Active', className: 'bg-emerald-100 text-emerald-800' };
}

export default function PpmContractsPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<PpmListFilter>('active');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [contracts, setContracts] = useState<PpmContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingJob, setCreatingJob] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkLoading, setBulkLoading] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    active_contracts: number;
    overdue_tasks: number;
    due_soon_tasks: number;
    compliance_percent: number | null;
    total_invoiced: number;
    currency: string;
  } | null>(null);

  useEffect(() => {
    getJson<{
      summary: {
        active_contracts: number;
        overdue_tasks: number;
        due_soon_tasks: number;
        compliance_percent: number | null;
        total_invoiced: number;
        currency: string;
      };
    }>('/ppm-contracts/reporting/summary')
      .then((d) => setSummary(d.summary))
      .catch(() => setSummary(null));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ filter });
      if (debounced) q.set('search', debounced);
      const d = await getJson<{ contracts: PpmContract[] }>(`/ppm-contracts?${q}`);
      setContracts(d.contracts || []);
    } catch {
      setContracts([]);
    } finally {
      setLoading(false);
    }
  }, [filter, debounced]);

  useEffect(() => {
    load();
    setSelected(new Set());
  }, [load]);

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === contracts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(contracts.map((c) => c.id)));
    }
  };

  const bulkAction = async (action: 'suspend' | 'activate' | 'expire' | 'renew') => {
    if (selected.size === 0) return;
    const label = action === 'renew' ? 'renew for 12 months' : action;
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} ${selected.size} contract(s) (${label})?`)) return;
    setBulkLoading(action);
    try {
      await postJson('/ppm-contracts/bulk', {
        action,
        contract_ids: Array.from(selected),
        extend_months: 12,
      });
      setSelected(new Set());
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Bulk action failed');
    } finally {
      setBulkLoading(null);
    }
  };

  const createJob = async (contractId: number, taskId?: number) => {
    setCreatingJob(contractId);
    try {
      const detail = await getJson<{ tasks: { id: number }[] }>(`/ppm-contracts/${contractId}`);
      const tid = taskId ?? detail.tasks[0]?.id;
      if (!tid) return;
      const res = await postJson<{ job: { id: number } }>(`/ppm-contracts/${contractId}/create-job`, { task_id: tid });
      router.push(`/dashboard/jobs/${res.job.id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not create job');
    } finally {
      setCreatingJob(null);
    }
  };

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">PPM Contracts</h1>
          <p className="text-sm text-slate-500">Planned preventative maintenance agreements</p>
        </div>
        <Link
          href="/dashboard/ppm-contracts/new"
          className="flex items-center gap-2 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white"
        >
          <Plus className="size-4" /> New contract
        </Link>
      </header>

      {summary && (
        <div className="grid grid-cols-2 gap-3 border-b border-slate-200 bg-white px-6 py-4 md:grid-cols-5">
          <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-500">Active contracts</p>
            <p className="text-lg font-bold text-slate-900">{summary.active_contracts}</p>
          </div>
          <div className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2">
            <p className="text-xs text-rose-600">Overdue tasks</p>
            <p className="text-lg font-bold text-rose-800">{summary.overdue_tasks}</p>
          </div>
          <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
            <p className="text-xs text-amber-700">Due in 30 days</p>
            <p className="text-lg font-bold text-amber-900">{summary.due_soon_tasks}</p>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-500">Compliance</p>
            <p className="text-lg font-bold text-slate-900">
              {summary.compliance_percent != null ? `${summary.compliance_percent}%` : '—'}
            </p>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 col-span-2 md:col-span-1">
            <p className="text-xs text-slate-500">PPM revenue</p>
            <p className="text-lg font-bold text-slate-900">
              {new Intl.NumberFormat('en-GB', { style: 'currency', currency: summary.currency || 'GBP' }).format(summary.total_invoiced)}
            </p>
          </div>
        </div>
      )}

      <div className="border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex gap-1">
            {PPM_FILTER_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setFilter(tab.value)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  filter === tab.value ? 'bg-[#14B8A6]/10 text-[#14B8A6]' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm"
              placeholder="Search contracts…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-teal-50 px-6 py-3">
          <span className="text-sm font-medium text-teal-900">{selected.size} selected</span>
          <button
            type="button"
            disabled={!!bulkLoading}
            onClick={() => bulkAction('suspend')}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            <Pause className="size-3.5" /> {bulkLoading === 'suspend' ? '…' : 'Suspend'}
          </button>
          <button
            type="button"
            disabled={!!bulkLoading}
            onClick={() => bulkAction('activate')}
            className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 disabled:opacity-50"
          >
            <Play className="size-3.5" /> {bulkLoading === 'activate' ? '…' : 'Activate'}
          </button>
          <button
            type="button"
            disabled={!!bulkLoading}
            onClick={() => bulkAction('renew')}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            <RefreshCw className="size-3.5" /> {bulkLoading === 'renew' ? '…' : 'Renew +12mo'}
          </button>
          <button
            type="button"
            disabled={!!bulkLoading}
            onClick={() => bulkAction('expire')}
            className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-800 disabled:opacity-50"
          >
            <XCircle className="size-3.5" /> {bulkLoading === 'expire' ? '…' : 'Expire'}
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto text-sm font-medium text-teal-700 hover:underline"
          >
            Clear
          </button>
        </div>
      )}

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <p className="text-slate-500">Loading…</p>
        ) : contracts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <CalendarClock className="mx-auto size-10 text-slate-300" />
            <p className="mt-3 text-slate-600">No contracts in this view</p>
            <Link href="/dashboard/ppm-contracts/new" className="mt-4 inline-block text-sm font-medium text-[#14B8A6]">
              Create your first PPM contract
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-center gap-2">
              <input
                type="checkbox"
                checked={contracts.length > 0 && selected.size === contracts.length}
                onChange={toggleSelectAll}
                className="size-4 rounded border-slate-300"
                aria-label="Select all contracts"
              />
              <span className="text-sm text-slate-500">Select all</span>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {contracts.map((c) => {
              const badge = statusBadge(c);
              const isSelected = selected.has(c.id);
              return (
                <div
                  key={c.id}
                  className={`rounded-xl border bg-white p-5 shadow-sm ${
                    isSelected ? 'border-[#14B8A6] ring-1 ring-[#14B8A6]/30' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <label className="flex cursor-pointer items-start gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(c.id)}
                        className="mt-1 size-4 rounded border-slate-300"
                        aria-label={`Select ${c.title}`}
                      />
                    <div>
                      <h2 className="font-semibold text-slate-900">{c.title}</h2>
                      {c.reference && <p className="text-xs text-slate-500">Ref: {c.reference}</p>}
                    </div>
                    </label>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                      {badge.label}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{c.customer_name}</p>
                  {c.work_address_name && <p className="text-xs text-slate-500">{c.work_address_name}</p>}
                  <p className="mt-3 text-sm">
                    <span className="text-slate-500">Next due: </span>
                    <span className="font-medium">{formatDate(c.earliest_next_due)}</span>
                  </p>
                  <div className="mt-4 flex gap-2">
                    <Link
                      href={`/dashboard/ppm-contracts/${c.id}`}
                      className="flex-1 rounded-lg border border-slate-200 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Open
                    </Link>
                    <button
                      type="button"
                      disabled={creatingJob === c.id}
                      onClick={() => createJob(c.id)}
                      className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-[#14B8A6] py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      <Briefcase className="size-4" />
                      {creatingJob === c.id ? '…' : 'Create job'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          </>
        )}
      </div>
    </div>
  );
}
