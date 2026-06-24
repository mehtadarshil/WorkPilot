'use client';

import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { getJson, patchJson } from '../../../apiClient';
import ImportCustomerSelect from '../../ImportCustomerSelect';
import WorkAddressSelect from '../../WorkAddressSelect';

type Props = {
  open: boolean;
  token: string;
  reportId: number;
  initialCustomerId: number;
  initialWorkAddressId: number | null;
  initialJobId: number | null;
  initialReportTitle: string | null;
  onClose: () => void;
  onSaved: (
    nextCustomerName: string,
    nextWorkAddressLabel: string,
    nextJobNumber: string | null,
    nextJobId: number | null,
    nextCustomerId: number,
    nextWorkAddressId: number | null,
    nextReportTitle: string | null
  ) => void;
};

type JobOption = {
  id: number;
  title: string;
  state: string;
  job_number?: string | null;
  work_address_id: number | null;
};

export default function EditSiteReportDetailsModal({
  open,
  token,
  reportId,
  initialCustomerId,
  initialWorkAddressId,
  initialJobId,
  initialReportTitle,
  onClose,
  onSaved,
}: Props) {
  const [customers, setCustomers] = useState<{ id: number; full_name: string }[]>([]);
  const [workAddresses, setWorkAddresses] = useState<{ id: number; label: string }[]>([]);
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [customerId, setCustomerId] = useState<number>(initialCustomerId);
  const [workAddressId, setWorkAddressId] = useState<number | null>(initialWorkAddressId);
  const [jobId, setJobId] = useState<number | null>(initialJobId);
  const [reportTitle, setReportTitle] = useState(initialReportTitle ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCustomerId(initialCustomerId);
    setWorkAddressId(initialWorkAddressId);
    setJobId(initialJobId);
    setReportTitle(initialReportTitle ?? '');
    setError(null);
  }, [open, initialCustomerId, initialWorkAddressId, initialJobId, initialReportTitle]);

  useEffect(() => {
    if (!open || !token) return;
    void getJson<{ customers: { id: number; full_name: string }[] }>('/customers?limit=5000&page=1', token)
      .then((res) => setCustomers(res.customers ?? []))
      .catch(() => setCustomers([]));
  }, [open, token]);

  useEffect(() => {
    if (!open || !token || !customerId) {
      setWorkAddresses([]);
      setJobs([]);
      return;
    }
    void getJson<{
      work_addresses: { id: number; name: string; address_line_1?: string; town?: string; postcode?: string }[];
    }>(`/customers/${customerId}/work-addresses?status=active`, token)
      .then((res) =>
        setWorkAddresses(
          (res.work_addresses ?? []).map((w) => {
            const addr = [w.address_line_1, w.town, w.postcode].filter(Boolean).join(', ');
            return { id: w.id, label: [w.name || `Site #${w.id}`, addr].filter(Boolean).join(' - ') };
          }),
        ),
      )
      .catch(() => setWorkAddresses([]));
  }, [customerId, open, token]);

  useEffect(() => {
    if (!open || !token || !customerId) {
      setJobs([]);
      return;
    }
    const q = new URLSearchParams({ customer_id: String(customerId), limit: '100', page: '1' });
    if (workAddressId) q.set('work_address_id', String(workAddressId));
    void getJson<{ jobs: JobOption[] }>(`/jobs?${q.toString()}`, token)
      .then((res) => setJobs(res.jobs ?? []))
      .catch(() => setJobs([]));
  }, [customerId, open, token, workAddressId]);

  if (!open) return null;

  const handleSave = async () => {
    if (!customerId) {
      setError('Select a client');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await patchJson(
        `/site-reports/${reportId}`,
        {
          customer_id: customerId,
          work_address_id: workAddressId,
          job_id: jobId,
          report_title: reportTitle.trim() || null,
        },
        token,
      );

      const customerName = customers.find((c) => c.id === customerId)?.full_name || 'Client';
      const addressLabel = workAddresses.find((w) => w.id === workAddressId)?.label || 'No address';
      const selectedJob = jobs.find((j) => j.id === jobId);
      const jobNumber = selectedJob?.job_number || (selectedJob ? `#${selectedJob.id}` : null);

      onSaved(customerName, addressLabel, jobNumber, jobId, customerId, workAddressId, reportTitle.trim() || null);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update site report details');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 font-sans" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900 font-sans">Edit report details</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100">
            <X className="size-5" />
          </button>
        </div>

        {error && (
          <p className="mb-4 text-sm text-rose-600 font-medium font-sans">{error}</p>
        )}

        <div className="mt-4 space-y-4 font-sans">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 font-sans">Client</label>
            <ImportCustomerSelect
              customers={customers}
              value={customerId}
              onChange={(id) => {
                if (id) {
                  setCustomerId(id);
                  setWorkAddressId(null);
                  setJobId(null);
                }
              }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 font-sans">Installation / work address</label>
            <WorkAddressSelect
              options={workAddresses}
              value={workAddressId}
              onChange={(id) => {
                setWorkAddressId(id);
                setJobId(null);
              }}
              disabled={!customerId}
              emptyButtonLabel="Use customer's main address"
              emptyMenuLabel="Use customer's main address"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 font-sans">Linked job</label>
            <select
              value={jobId ?? ''}
              onChange={(e) => {
                const next = e.target.value ? Number(e.target.value) : null;
                setJobId(next);
                const job = jobs.find((item) => item.id === next);
                if (job?.work_address_id) setWorkAddressId(job.work_address_id);
              }}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30 font-sans"
              disabled={!customerId}
            >
              <option value="">No linked job</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  #{job.id} - {job.title} ({job.state})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 font-sans">Report title (print)</label>
            <input
              value={reportTitle}
              onChange={(e) => setReportTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30 font-sans"
              placeholder="Report title"
            />
          </div>

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 font-sans"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || !customerId}
              onClick={() => void handleSave()}
              className="flex-1 inline-flex items-center justify-center rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-bold text-white hover:bg-[#119f8e] disabled:opacity-50 font-sans"
            >
              {busy ? <Loader2 className="size-4 animate-spin font-sans" /> : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
