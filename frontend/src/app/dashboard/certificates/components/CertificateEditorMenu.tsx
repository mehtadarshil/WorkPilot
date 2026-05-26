'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronDown,
  FileDown,
  Home,
  MoreVertical,
  Trash2,
  CheckCircle2,
  RotateCcw,
  Copy,
} from 'lucide-react';
import { deleteRequest, getJson, postJson } from '../../../apiClient';
import { prepareCopiedCertificateDocument } from '@/lib/electricalCertificates/documentHelpers';
import { downloadCertificatePdf, openCertificatePdfPreviewWindow, previewCertificatePdf } from '@/lib/electricalCertificates/certificateExport';
import { useCertificateEditor } from '../CertificateEditorContext';
import { ConvertCertificateModal } from './ConvertCertificateModal';
import ImportCustomerSelect from '../../ImportCustomerSelect';
import WorkAddressSelect from '../../WorkAddressSelect';

type CertificateJobOption = {
  id: number;
  title: string;
  state: string;
  work_address_id: number | null;
  updated_at: string;
};

export function CertificateEditorMenu() {
  const router = useRouter();
  const { certificate, patchMeta, runValidate, setValidateOpen, saveDocument } = useCertificateEditor();
  const [open, setOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  const handleDelete = async () => {
    if (!token) return;
    if (!window.confirm(`Delete certificate ${certificate.certificate_number}? This cannot be undone.`)) {
      return;
    }
    try {
      await deleteRequest(`/electrical-certificates/${certificate.id}`, token);
      router.push('/dashboard/certificates');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        <MoreVertical className="size-4" /> Menu
        <ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul className="absolute right-0 z-50 mt-1 min-w-[200px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          <li className="px-3 py-1.5 text-xs font-semibold uppercase text-slate-400">Status</li>
          <li>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
              onClick={() => {
                setOpen(false);
                setDetailsOpen(true);
              }}
            >
              Edit client / job details
            </button>
          </li>
          <li>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
              onClick={() => {
                void patchMeta({ status: 'in_progress' });
                setOpen(false);
              }}
            >
              <RotateCcw className="size-4 text-amber-600" /> Mark in progress
            </button>
          </li>
          <li>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
              onClick={() => {
                void patchMeta({ status: 'completed' });
                setOpen(false);
              }}
            >
              <CheckCircle2 className="size-4 text-emerald-600" /> Mark completed
            </button>
          </li>
          <li className="my-1 border-t border-slate-100" />
          <li>
            <button
              type="button"
              className="flex w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
              onClick={async () => {
                await runValidate();
                setValidateOpen(true);
                setOpen(false);
              }}
            >
              Validate
            </button>
          </li>
          <li>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
              onClick={() => {
                if (!token) return;
                const previewWindow = openCertificatePdfPreviewWindow();
                setPdfBusy(true);
                void saveDocument()
                  .then(() => previewCertificatePdf(certificate.id, token, previewWindow))
                  .catch((e) => alert(e instanceof Error ? e.message : 'PDF preview failed'))
                  .finally(() => {
                    setPdfBusy(false);
                    setOpen(false);
                  });
              }}
            >
              <FileDown className="size-4" /> {pdfBusy ? 'Generating preview…' : 'Print preview'}
            </button>
          </li>
          <li>
            <button
              type="button"
              disabled={pdfBusy}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50"
              onClick={() => {
                if (!token) return;
                setPdfBusy(true);
                void saveDocument()
                  .then(() => downloadCertificatePdf(certificate.id, certificate.certificate_number, token))
                  .catch((e) => alert(e instanceof Error ? e.message : 'PDF download failed'))
                  .finally(() => {
                    setPdfBusy(false);
                    setOpen(false);
                  });
              }}
            >
              <FileDown className="size-4" /> {pdfBusy ? 'Generating PDF…' : 'Download PDF'}
            </button>
          </li>
          <li>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
              onClick={() => {
                setOpen(false);
                setConvertOpen(true);
              }}
            >
              <Copy className="size-4" /> Copy / convert…
            </button>
          </li>
          <li>
            <button
              type="button"
              className="flex w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
              onClick={() => {
                router.push('/dashboard/settings?tab=company');
                setOpen(false);
              }}
            >
              Company branding (settings)
            </button>
          </li>
          <li className="my-1 border-t border-slate-100" />
          <li>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
              onClick={() => {
                setOpen(false);
                void handleDelete();
              }}
            >
              <Trash2 className="size-4" /> Delete certificate
            </button>
          </li>
          <li className="my-1 border-t border-slate-100" />
          <li>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
              onClick={() => {
                router.push('/dashboard/certificates');
                setOpen(false);
              }}
            >
              <Home className="size-4" /> Back to list
            </button>
          </li>
        </ul>
      )}
      <ConvertCertificateModal
        open={convertOpen}
        source={certificate}
        onClose={() => setConvertOpen(false)}
        onConfirm={async (typeSlug, mode) => {
          if (!token) return;
          const full = await getJson<{ certificate: typeof certificate }>(
            `/electrical-certificates/${certificate.id}`,
            token,
          );
          const targetTypeSlug = (mode === 'copy' ? full.certificate.type_slug : typeSlug) as typeof full.certificate.document.typeSlug;
          const doc = prepareCopiedCertificateDocument(full.certificate.document, targetTypeSlug);
          const res = await postJson<{ certificate: typeof certificate }>(
            '/electrical-certificates',
            {
              customer_id: full.certificate.customer_id,
              work_address_id: full.certificate.work_address_id,
              job_id: full.certificate.job_id,
              job_number: full.certificate.job_number,
              type_slug: targetTypeSlug,
              document: doc,
            },
            token,
          );
          setConvertOpen(false);
          const href =
            res.certificate.type_slug === 'portable_appliance_test'
              ? `/dashboard/certificates/${res.certificate.id}/pat`
              : res.certificate.type_slug === 'fi_insp_2025'
                ? `/dashboard/certificates/${res.certificate.id}/fire-alarm`
                : res.certificate.type_slug === 'dfi_insp_2019_a1'
                  ? `/dashboard/certificates/${res.certificate.id}/domestic-fire-alarm`
                  : res.certificate.type_slug === 'dfi_inst_2019_a1'
                    ? `/dashboard/certificates/${res.certificate.id}/domestic-fire-alarm-install`
                    : res.certificate.type_slug === 'fi_extinsp_5306'
                      ? `/dashboard/certificates/${res.certificate.id}/fire-extinguisher`
                      : res.certificate.type_slug === 'em_pir_2025'
                        ? `/dashboard/certificates/${res.certificate.id}/emergency-lighting`
                      : res.certificate.type_slug === 'eic_18e_a3'
                        ? `/dashboard/certificates/${res.certificate.id}/eic`
                        : `/dashboard/certificates/${res.certificate.id}/installation-details`;
          router.push(href);
        }}
      />
      <EditCertificateDetailsModal
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        onSaved={() => setDetailsOpen(false)}
      />
    </div>
  );
}

function EditCertificateDetailsModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { certificate, patchMeta } = useCertificateEditor();
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;
  const [customers, setCustomers] = useState<{ id: number; full_name: string }[]>([]);
  const [workAddresses, setWorkAddresses] = useState<{ id: number; label: string }[]>([]);
  const [jobs, setJobs] = useState<CertificateJobOption[]>([]);
  const [customerId, setCustomerId] = useState<number | null>(certificate.customer_id);
  const [workAddressId, setWorkAddressId] = useState<number | null>(certificate.work_address_id);
  const [jobId, setJobId] = useState<number | null>(certificate.job_id);
  const [jobNumber, setJobNumber] = useState(certificate.job_number ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCustomerId(certificate.customer_id);
    setWorkAddressId(certificate.work_address_id);
    setJobId(certificate.job_id);
    setJobNumber(certificate.job_number ?? '');
    setError(null);
  }, [certificate, open]);

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
    void getJson<{ jobs: CertificateJobOption[] }>(`/jobs?${q.toString()}`, token)
      .then((res) => setJobs(res.jobs ?? []))
      .catch(() => setJobs([]));
  }, [customerId, open, token, workAddressId]);

  if (!open) return null;

  const save = async () => {
    if (!customerId) {
      setError('Select a client');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await patchMeta({
        customer_id: customerId,
        work_address_id: workAddressId,
        job_id: jobId,
        job_number: jobNumber,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update certificate details');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-slate-900">Edit certificate details</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Client</label>
            <ImportCustomerSelect
              customers={customers}
              value={customerId}
              onChange={(id) => {
                setCustomerId(id);
                setWorkAddressId(null);
                setJobId(null);
              }}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Installation / work address</label>
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
            <label className="mb-1 block text-sm font-medium text-slate-700">Linked job</label>
            <select
              value={jobId ?? ''}
              onChange={(e) => {
                const next = e.target.value ? Number(e.target.value) : null;
                setJobId(next);
                const job = jobs.find((item) => item.id === next);
                if (job?.work_address_id) setWorkAddressId(job.work_address_id);
              }}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
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
            <label className="mb-1 block text-sm font-medium text-slate-700">Job number</label>
            <input
              value={jobNumber}
              onChange={(e) => setJobNumber(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="Optional"
            />
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy}
              className="rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? 'Saving...' : 'Save details'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
