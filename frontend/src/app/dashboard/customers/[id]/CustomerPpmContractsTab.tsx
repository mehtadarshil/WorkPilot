'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Briefcase } from 'lucide-react';
import { getJson, postJson } from '../../../apiClient';
import type { PpmContract } from '../../../../lib/ppmContractTypes';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso.slice(0, 10)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function CustomerPpmContractsTab({ customerId }: { customerId: number }) {
  const [contracts, setContracts] = useState<PpmContract[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await getJson<{ contracts: PpmContract[] }>(`/customers/${customerId}/ppm-contracts`);
      setContracts(d.contracts || []);
    } catch {
      setContracts([]);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    load();
  }, [load]);

  const createJob = async (contractId: number) => {
    try {
      const detail = await getJson<{ tasks: { id: number }[] }>(`/ppm-contracts/${contractId}`);
      const taskId = detail.tasks[0]?.id;
      if (!taskId) return;
      const res = await postJson<{ job: { id: number } }>(`/ppm-contracts/${contractId}/create-job`, { task_id: taskId });
      window.location.href = `/dashboard/jobs/${res.job.id}`;
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not create job');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">Maintenance contracts for this customer.</p>
        <Link
          href={`/dashboard/ppm-contracts/new?customer_id=${customerId}`}
          className="flex items-center gap-1 rounded-lg bg-[#14B8A6] px-3 py-1.5 text-sm font-medium text-white"
        >
          <Plus className="size-4" /> New contract
        </Link>
      </div>
      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : contracts.length === 0 ? (
        <p className="text-sm text-slate-500">No PPM contracts yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2">Contract</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Next due</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {contracts.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/ppm-contracts/${c.id}`} className="font-medium text-[#14B8A6] hover:underline">
                      {c.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 capitalize">{c.status}</td>
                  <td className="px-4 py-3">{formatDate(c.earliest_next_due)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => createJob(c.id)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-[#14B8A6]"
                    >
                      <Briefcase className="size-3" /> Create job
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
