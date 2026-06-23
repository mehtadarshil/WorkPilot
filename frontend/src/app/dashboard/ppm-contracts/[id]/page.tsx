'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Briefcase, AlertTriangle, Pencil, Plus, Receipt, Pause, Play, RefreshCw, History } from 'lucide-react';
import { getJson, patchJson, postJson } from '../../../apiClient';
import type { PpmContract, PpmContractTask } from '../../../../lib/ppmContractTypes';

type TaskHistoryRow = {
  id: number;
  task_name: string;
  job_id: number | null;
  job_number: string | null;
  completed_at: string;
  previous_due_date: string | null;
  next_due_date: string | null;
};

type LinkedInvoice = {
  id: number;
  invoice_number: string;
  total_amount: number;
  currency: string;
  state: string;
  job_id: number;
  invoice_date: string;
};

type LinkedJob = {
  id: number;
  job_number: string;
  title: string;
  state: string;
  created_at: string;
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso.slice(0, 10)).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

function monthLabels(count: number): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < count; i++) {
    out.push(d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }));
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

export default function PpmContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const contractId = parseInt(id, 10);
  const router = useRouter();
  const [contract, setContract] = useState<PpmContract | null>(null);
  const [tasks, setTasks] = useState<PpmContractTask[]>([]);
  const [jobs, setJobs] = useState<LinkedJob[]>([]);
  const [invoices, setInvoices] = useState<LinkedInvoice[]>([]);
  const [history, setHistory] = useState<TaskHistoryRow[]>([]);
  const [missed, setMissed] = useState<PpmContractTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingJob, setCreatingJob] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const months = useMemo(() => monthLabels(12), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await getJson<{
        contract: PpmContract & { compliance_percent?: number | null; invoiced_total?: number };
        tasks: PpmContractTask[];
        jobs: LinkedJob[];
        invoices: LinkedInvoice[];
        task_history: TaskHistoryRow[];
      }>(`/ppm-contracts/${contractId}`);
      setContract(d.contract);
      setTasks(d.tasks || []);
      setJobs(d.jobs || []);
      setInvoices(d.invoices || []);
      setHistory(d.task_history || []);
      const m = await getJson<{ tasks: PpmContractTask[] }>(`/ppm-contracts/${contractId}/missed-tasks`);
      setMissed(m.tasks || []);
    } catch {
      setContract(null);
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  useEffect(() => {
    load();
  }, [load]);

  const checkMissedTasks = async () => {
    setActionLoading('missed');
    try {
      const m = await getJson<{ tasks: PpmContractTask[] }>(`/ppm-contracts/${contractId}/missed-tasks`);
      setMissed(m.tasks || []);
    } finally {
      setActionLoading(null);
    }
  };

  const setContractStatus = async (status: 'active' | 'suspended' | 'expired') => {
    setActionLoading(status);
    try {
      await patchJson(`/ppm-contracts/${contractId}`, { status });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setActionLoading(null);
    }
  };

  const renewContract = async () => {
    setActionLoading('renew');
    try {
      await postJson('/ppm-contracts/bulk', {
        action: 'renew',
        contract_ids: [contractId],
        extend_months: 12,
      });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Renew failed');
    } finally {
      setActionLoading(null);
    }
  };

  const createJob = async (taskId: number) => {
    setCreatingJob(taskId);
    try {
      const res = await postJson<{ job: { id: number } }>(`/ppm-contracts/${contractId}/create-job`, { task_id: taskId });
      router.push(`/dashboard/jobs/${res.job.id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not create job');
    } finally {
      setCreatingJob(null);
    }
  };

  const occurrenceInMonth = (occurrences: string[] | undefined, monthIndex: number): boolean => {
    if (!occurrences?.length) return false;
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + monthIndex);
    const y = d.getFullYear();
    const m = d.getMonth();
    return occurrences.some((o) => {
      const od = new Date(o.slice(0, 10));
      return od.getFullYear() === y && od.getMonth() === m;
    });
  };

  if (loading) return <div className="p-8 text-slate-500">Loading…</div>;
  if (!contract) return <div className="p-8 text-rose-600">Contract not found</div>;

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/ppm-contracts" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <ArrowLeft className="size-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{contract.title}</h1>
            <p className="text-sm text-slate-500">
              {contract.customer_name}
              {contract.work_address_name ? ` · ${contract.work_address_name}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {contract.status === 'active' ? (
            <button
              type="button"
              disabled={!!actionLoading}
              onClick={() => setContractStatus('suspended')}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
            >
              <Pause className="size-4" /> {actionLoading === 'suspended' ? '…' : 'Suspend'}
            </button>
          ) : contract.status === 'suspended' ? (
            <button
              type="button"
              disabled={!!actionLoading}
              onClick={() => setContractStatus('active')}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 disabled:opacity-50"
            >
              <Play className="size-4" /> {actionLoading === 'active' ? '…' : 'Activate'}
            </button>
          ) : null}
          <button
            type="button"
            disabled={!!actionLoading}
            onClick={() => renewContract()}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            <RefreshCw className="size-4" /> {actionLoading === 'renew' ? '…' : 'Renew +12mo'}
          </button>
          <Link
            href={`/dashboard/ppm-contracts/${contractId}/edit`}
            className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700"
          >
            <Pencil className="size-4" /> Edit
          </Link>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-6">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Status</p>
            <p className="font-semibold capitalize">{contract.status}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Next due</p>
            <p className="font-semibold">{formatDate(contract.earliest_next_due)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Contract end</p>
            <p className="font-semibold">{contract.end_date ? formatDate(contract.end_date) : 'Open-ended'}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Tasks</p>
            <p className="font-semibold">{contract.task_count ?? tasks.length}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Compliance</p>
            <p className="font-semibold">
              {contract.compliance_percent != null ? `${contract.compliance_percent}%` : '—'}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Invoiced</p>
            <p className="font-semibold">
              {contract.invoiced_total != null
                ? new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(contract.invoiced_total)
                : '—'}
            </p>
          </div>
        </div>

        {missed.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
            <AlertTriangle className="size-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-amber-900">{missed.length} missed task(s)</p>
              <ul className="mt-1 text-sm text-amber-800">
                {missed.map((t) => (
                  <li key={t.id}>{t.name} — due {formatDate(t.next_due_date)}</li>
                ))}
              </ul>
            </div>
            <button
              type="button"
              onClick={checkMissedTasks}
              disabled={actionLoading === 'missed'}
              className="text-sm font-medium text-amber-900 underline disabled:opacity-50"
            >
              Refresh
            </button>
          </div>
        )}
        {missed.length === 0 && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={checkMissedTasks}
              disabled={actionLoading === 'missed'}
              className="text-sm font-medium text-[#14B8A6] hover:underline disabled:opacity-50"
            >
              {actionLoading === 'missed' ? 'Checking…' : 'Check missed tasks'}
            </button>
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">PPM schedule</h2>
            <Link
              href={`/dashboard/ppm-contracts/${contractId}/edit?step=3`}
              className="flex items-center gap-1 text-sm font-medium text-[#14B8A6] hover:underline"
            >
              <Plus className="size-4" /> Add task
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="sticky left-0 bg-slate-50 px-3 py-2 text-left font-medium text-slate-600">Task</th>
                  <th className="px-2 py-2 text-left font-medium text-slate-600">Next due</th>
                  {months.map((m) => (
                    <th key={m} className="px-1 py-2 text-center font-medium text-slate-500 w-14">{m}</th>
                  ))}
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id} className="border-b border-slate-50">
                    <td className="sticky left-0 bg-white px-3 py-2 font-medium text-slate-800">
                      {t.name}
                      {t.is_overdue && <span className="ml-2 text-rose-600">Overdue</span>}
                    </td>
                    <td className="px-2 py-2 text-slate-600">{formatDate(t.next_due_date)}</td>
                    {months.map((m, mi) => (
                      <td key={m} className="px-1 py-2 text-center">
                        {occurrenceInMonth(t.calendar_occurrences, mi) ? (
                          <span className="inline-block size-3 rounded-sm bg-[#14B8A6]" title={m} />
                        ) : (
                          <span className="inline-block size-3 rounded-sm bg-slate-100" />
                        )}
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        disabled={creatingJob === t.id}
                        onClick={() => t.id && createJob(t.id)}
                        className="flex items-center gap-1 text-[#14B8A6] font-medium hover:underline disabled:opacity-50"
                      >
                        <Briefcase className="size-3" />
                        Job
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {history.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-3 flex items-center gap-2">
              <History className="size-4 text-slate-500" />
              <h2 className="font-semibold text-slate-900">Completion history</h2>
            </div>
            <ul className="divide-y divide-slate-100 text-sm">
              {history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div>
                    <p className="font-medium text-slate-800">{h.task_name}</p>
                    <p className="text-xs text-slate-500">
                      {formatDate(h.previous_due_date)} → {formatDate(h.next_due_date)}
                      {h.job_number ? ` · Job ${h.job_number}` : ''}
                    </p>
                  </div>
                  <span className="text-xs text-slate-400">
                    {new Date(h.completed_at).toLocaleDateString('en-GB')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="font-semibold text-slate-900">Linked jobs</h2>
          </div>
          {jobs.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">No jobs created from this contract yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {jobs.map((j) => (
                <li key={j.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <Link href={`/dashboard/jobs/${j.id}`} className="font-medium text-[#14B8A6] hover:underline">
                      {j.job_number} — {j.title}
                    </Link>
                    <p className="text-xs text-slate-500 capitalize">{j.state.replace(/_/g, ' ')}</p>
                  </div>
                  <span className="text-xs text-slate-400">{formatDate(j.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="font-semibold text-slate-900">Linked invoices</h2>
          </div>
          {invoices.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">No invoices from PPM jobs yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {invoices.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Receipt className="size-4 text-slate-400" />
                    <div>
                      <Link href={`/dashboard/invoices/${inv.id}`} className="font-medium text-[#14B8A6] hover:underline">
                        {inv.invoice_number}
                      </Link>
                      <p className="text-xs text-slate-500 capitalize">{inv.state}</p>
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-medium">
                      {new Intl.NumberFormat('en-GB', { style: 'currency', currency: inv.currency || 'GBP' }).format(inv.total_amount)}
                    </p>
                    <p className="text-xs text-slate-400">{formatDate(inv.invoice_date)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
