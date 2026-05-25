'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Copy, FileCheck2, MoreVertical, Plus, Search, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { deleteRequest, getJson, postJson } from '../../apiClient';
import { cloneDocument } from '@/lib/electricalCertificates/documentHelpers';
import { Pagination } from '../Pagination';
import ImportCustomerSelect from '../ImportCustomerSelect';
import WorkAddressSelect from '../WorkAddressSelect';
import { CERTIFICATE_TYPE_CATALOG } from '@/lib/electricalCertificates/types';
import type { ElectricalCertificate } from '@/lib/electricalCertificates/types';
import { ConvertCertificateModal } from './components/ConvertCertificateModal';
import { downloadCertificatePdf } from '@/lib/electricalCertificates/certificateExport';

const PAGE_SIZE = 15;

type CertificateJobOption = {
  id: number;
  title: string;
  state: string;
  work_address_id: number | null;
  updated_at: string;
};

function certificateEditorHref(cert: ElectricalCertificate) {
  if (cert.type_slug === 'portable_appliance_test') {
    return `/dashboard/certificates/${cert.id}/pat`;
  }
  if (cert.type_slug === 'fi_insp_2025') {
    return `/dashboard/certificates/${cert.id}/fire-alarm`;
  }
  if (cert.type_slug === 'dfi_insp_2019_a1') {
    return `/dashboard/certificates/${cert.id}/domestic-fire-alarm`;
  }
  if (cert.type_slug === 'dfi_inst_2019_a1') {
    return `/dashboard/certificates/${cert.id}/domestic-fire-alarm-install`;
  }
  if (cert.type_slug === 'fi_extinsp_5306') {
    return `/dashboard/certificates/${cert.id}/fire-extinguisher`;
  }
  return `/dashboard/certificates/${cert.id}/installation-details`;
}

export default function ElectricalCertificatesPage() {
  const router = useRouter();
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;
  const [rows, setRows] = useState<ElectricalCertificate[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createStep, setCreateStep] = useState<'type' | 'client'>('type');
  const [selectedType, setSelectedType] = useState('eicr_18e_a3');
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [workAddressId, setWorkAddressId] = useState<number | null>(null);
  const [addingWorkAddress, setAddingWorkAddress] = useState(false);
  const [workAddressForm, setWorkAddressForm] = useState({
    name: '',
    address_line_1: '',
    address_line_2: '',
    town: '',
    county: '',
    postcode: '',
  });
  const [savingWorkAddress, setSavingWorkAddress] = useState(false);
  const [workAddressError, setWorkAddressError] = useState<string | null>(null);
  const [jobNumber, setJobNumber] = useState('');
  const [jobId, setJobId] = useState<number | null>(null);
  const [jobOptions, setJobOptions] = useState<CertificateJobOption[]>([]);
  const [workAddressOptions, setWorkAddressOptions] = useState<{ id: number; label: string }[]>([]);
  const [customers, setCustomers] = useState<{ id: number; full_name: string }[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowMenuId, setRowMenuId] = useState<number | null>(null);
  const [rowMenuPosition, setRowMenuPosition] = useState({ top: 0, left: 0 });
  const [duplicatingId, setDuplicatingId] = useState<number | null>(null);
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertSource, setConvertSource] = useState<ElectricalCertificate | null>(null);
  const [pdfBusyId, setPdfBusyId] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearchDebounced(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchList = useCallback(async () => {
    if (!token) return;
    try {
      const q = new URLSearchParams();
      q.set('page', String(page));
      q.set('limit', String(PAGE_SIZE));
      if (searchDebounced) q.set('search', searchDebounced);
      if (statusFilter) q.set('status', statusFilter);
      const data = await getJson<{
        certificates: ElectricalCertificate[];
        total: number;
        totalPages: number;
      }>(`/electrical-certificates?${q}`, token);
      setRows(data.certificates ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch {
      setRows([]);
      setTotal(0);
      setTotalPages(1);
    }
  }, [token, page, searchDebounced, statusFilter]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const fetchCustomers = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getJson<{ customers: { id: number; full_name: string }[] }>(
        '/customers?limit=5000&page=1',
        token,
      );
      setCustomers(data.customers ?? []);
    } catch {
      setCustomers([]);
    }
  }, [token]);

  const fetchWorkAddresses = useCallback(
    async (cid: number) => {
      if (!token) {
        setWorkAddressOptions([]);
        return;
      }
      try {
        const res = await getJson<{
          work_addresses: { id: number; name: string; address_line_1?: string; town?: string; postcode?: string }[];
        }>(`/customers/${cid}/work-addresses?status=active`, token);
        setWorkAddressOptions(
          (res.work_addresses ?? []).map((w) => {
            const addr = [w.address_line_1, w.town, w.postcode].filter(Boolean).join(', ');
            return { id: w.id, label: [w.name || `Site #${w.id}`, addr].filter(Boolean).join(' — ') };
          }),
        );
      } catch {
        setWorkAddressOptions([]);
      }
    },
    [token],
  );

  const fetchJobOptions = useCallback(
    async (cid: number, siteId: number | null) => {
      if (!token) {
        setJobOptions([]);
        return;
      }
      try {
        const q = new URLSearchParams({ customer_id: String(cid), limit: '100', page: '1' });
        if (siteId) q.set('work_address_id', String(siteId));
        const res = await getJson<{ jobs: CertificateJobOption[] }>(`/jobs?${q.toString()}`, token);
        setJobOptions(res.jobs ?? []);
      } catch {
        setJobOptions([]);
      }
    },
    [token],
  );

  useEffect(() => {
    if (createOpen) void fetchCustomers();
  }, [createOpen, fetchCustomers]);

  useEffect(() => {
    if (customerId) {
      void fetchWorkAddresses(customerId);
      void fetchJobOptions(customerId, null);
      setWorkAddressId(null);
      setJobId(null);
    } else {
      setWorkAddressOptions([]);
      setJobOptions([]);
      setWorkAddressId(null);
      setJobId(null);
    }
  }, [customerId, fetchJobOptions, fetchWorkAddresses]);

  useEffect(() => {
    if (!customerId) return;
    void fetchJobOptions(customerId, workAddressId);
    setJobId(null);
  }, [customerId, fetchJobOptions, workAddressId]);

  const openCreate = () => {
    setCreateStep('type');
    setSelectedType('eicr_18e_a3');
    setCustomerId(null);
    setWorkAddressId(null);
    setAddingWorkAddress(false);
    setWorkAddressForm({ name: '', address_line_1: '', address_line_2: '', town: '', county: '', postcode: '' });
    setWorkAddressError(null);
    setJobNumber('');
    setJobId(null);
    setJobOptions([]);
    setError(null);
    setCreateOpen(true);
  };

  const handleCopyConvert = async (
    cert: ElectricalCertificate,
    typeSlug: string,
    _mode: 'copy' | 'convert',
  ) => {
    if (!token) return;
    setDuplicatingId(cert.id);
    try {
      const full = await getJson<{ certificate: ElectricalCertificate }>(
        `/electrical-certificates/${cert.id}`,
        token,
      );
      const doc = cloneDocument(full.certificate.document);
      doc.typeSlug = typeSlug as typeof doc.typeSlug;
      const res = await postJson<{ certificate: ElectricalCertificate }>(
        '/electrical-certificates',
        {
          customer_id: full.certificate.customer_id,
          work_address_id: full.certificate.work_address_id,
          job_id: full.certificate.job_id,
          job_number: full.certificate.job_number,
          type_slug: typeSlug,
          document: doc,
        },
        token,
      );
      setRowMenuId(null);
      setConvertOpen(false);
      setConvertSource(null);
      router.push(certificateEditorHref(res.certificate));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to create certificate');
    } finally {
      setDuplicatingId(null);
    }
  };

  const handleDelete = async (cert: ElectricalCertificate) => {
    if (!token) return;
    if (!window.confirm(`Delete certificate ${cert.certificate_number}? This cannot be undone.`)) {
      return;
    }
    try {
      await deleteRequest(`/electrical-certificates/${cert.id}`, token);
      setRowMenuId(null);
      void fetchList();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const handleCreate = async () => {
    if (!token || !customerId) {
      setError('Select a client');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await postJson<{ certificate: ElectricalCertificate }>(
        '/electrical-certificates',
        {
          type_slug: selectedType,
          customer_id: customerId,
          work_address_id: workAddressId,
          job_id: jobId,
          job_number: jobNumber.trim() || null,
        },
        token,
      );
      setCreateOpen(false);
      router.push(certificateEditorHref(res.certificate));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create certificate');
    } finally {
      setCreating(false);
    }
  };

  const handleAddWorkAddress = async () => {
    if (!token || !customerId) return;
    const name = workAddressForm.name.trim();
    const addressLine1 = workAddressForm.address_line_1.trim();
    if (!name || !addressLine1) {
      setWorkAddressError('Site name and address line 1 are required');
      return;
    }
    setSavingWorkAddress(true);
    setWorkAddressError(null);
    try {
      const res = await postJson<{ work_address: { id: number } }>(
        `/customers/${customerId}/work-addresses`,
        {
          name,
          address_line_1: addressLine1,
          address_line_2: workAddressForm.address_line_2.trim() || null,
          town: workAddressForm.town.trim() || null,
          county: workAddressForm.county.trim() || null,
          postcode: workAddressForm.postcode.trim() || null,
          is_active: true,
        },
        token,
      );
      const id = res.work_address.id;
      const addr = [addressLine1, workAddressForm.town.trim(), workAddressForm.postcode.trim()].filter(Boolean).join(', ');
      const label = [name, addr].filter(Boolean).join(' — ');
      setWorkAddressOptions((prev) => [...prev.filter((option) => option.id !== id), { id, label }]);
      setWorkAddressId(id);
      setAddingWorkAddress(false);
      setWorkAddressForm({ name: '', address_line_1: '', address_line_2: '', town: '', county: '', postcode: '' });
      void fetchWorkAddresses(customerId);
    } catch (e) {
      setWorkAddressError(e instanceof Error ? e.message : 'Failed to add site address');
    } finally {
      setSavingWorkAddress(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col p-4 md:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Electrical certificates</h1>
          <p className="text-sm text-slate-600">EICR and installation condition reports (BS 7671)</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-2 rounded-lg bg-[#14B8A6] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0d9488]"
        >
          <Plus className="size-4" /> New certificate
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search certificate, job, client…"
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-[#14B8A6]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="in_progress">In progress</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Certificate</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Installation</th>
              <th className="px-4 py-3">Job</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                  No certificates yet. Create your first certificate.
                </td>
              </tr>
            ) : (
              rows.map((c) => (
                <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/80">
                  <td className="px-4 py-3">
                    <p className="font-mono font-semibold text-slate-900">{c.certificate_number}</p>
                    {(() => {
                      const type = CERTIFICATE_TYPE_CATALOG.find((t) => t.slug === c.type_slug);
                      return (
                        <p className="text-xs text-slate-500">
                          {type?.shortLabel ?? c.type_slug}
                          {type?.standard ? ` · Standard: ${type.standard}` : ''}
                          {type?.revision ? ` · Revision: ${type.revision}` : ''}
                        </p>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3">{c.customer_full_name ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{c.installation_label ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{c.job_number ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        c.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {c.status === 'completed' ? 'Completed' : 'In progress'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="relative inline-flex items-center gap-2">
                      <Link
                        href={certificateEditorHref(c)}
                        className="font-semibold text-[#14B8A6] hover:underline"
                      >
                        Open
                      </Link>
                      <button
                        type="button"
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setRowMenuPosition({
                            top: rect.bottom + 6,
                            left: Math.max(8, rect.right - 180),
                          });
                          setRowMenuId((id) => (id === c.id ? null : c.id));
                        }}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                        aria-label="More actions"
                      >
                        <MoreVertical className="size-4" />
                      </button>
                      {rowMenuId === c.id && (
                        <ul
                          className="fixed z-[100] min-w-[180px] rounded-lg border border-slate-200 bg-white py-1 text-left shadow-lg"
                          style={{ top: rowMenuPosition.top, left: rowMenuPosition.left }}
                        >
                          <li>
                            <button
                              type="button"
                              disabled={duplicatingId === c.id}
                              onClick={() => {
                                setConvertSource(c);
                                setConvertOpen(true);
                                setRowMenuId(null);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
                            >
                              <Copy className="size-4" /> Copy / convert…
                            </button>
                          </li>
                          <li>
                            <button
                              type="button"
                              disabled={pdfBusyId === c.id}
                              onClick={() => {
                                if (!token) return;
                                setPdfBusyId(c.id);
                                void downloadCertificatePdf(c.id, c.certificate_number, token)
                                  .catch((e) => alert(e instanceof Error ? e.message : 'PDF failed'))
                                  .finally(() => setPdfBusyId(null));
                                setRowMenuId(null);
                              }}
                              className="flex w-full px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50"
                            >
                              {pdfBusyId === c.id ? 'Generating PDF…' : 'Download PDF'}
                            </button>
                          </li>
                          <li className="my-1 border-t border-slate-100" />
                          <li>
                            <button
                              type="button"
                              onClick={() => void handleDelete(c)}
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
                            >
                              <Trash2 className="size-4" /> Delete
                            </button>
                          </li>
                        </ul>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          itemName="certificates"
        />
      )}

      <AnimatePresence>
        {createOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
            onClick={() => setCreateOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-bold text-slate-900">New certificate</h2>
              {createStep === 'type' ? (
                <>
                  <p className="mt-1 text-sm text-slate-600">Choose certificate type</p>
                  <ul className="mt-4 space-y-2">
                    {CERTIFICATE_TYPE_CATALOG.map((t) => (
                      <li key={t.slug}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedType(t.slug);
                            setCreateStep('client');
                          }}
                          className={`w-full rounded-xl border p-4 text-left transition-colors ${
                            selectedType === t.slug
                              ? 'border-[#14B8A6] bg-[#14B8A6]/5'
                              : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <FileCheck2 className="mt-0.5 size-5 text-[#14B8A6]" />
                            <div>
                              <p className="font-bold text-slate-900">{t.shortLabel}</p>
                              <p className="text-sm text-slate-700">{t.title}</p>
                              <p className="text-xs text-slate-500">{t.subtitle}</p>
                              {'standard' in t && t.standard && (
                                <p className="mt-1 text-xs font-semibold text-slate-600">
                                  Standard: {t.standard} · Revision: {t.revision}
                                </p>
                              )}
                            </div>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="mt-2 text-sm text-[#14B8A6] hover:underline"
                    onClick={() => setCreateStep('type')}
                  >
                    ← Change type
                  </button>
                  <p className="mt-2 text-sm text-slate-600">Client & installation</p>
                  <div className="mt-4 space-y-4">
                    <ImportCustomerSelect
                      customers={customers}
                      value={customerId}
                      onChange={setCustomerId}
                    />
                    {customerId && (
                      <div>
                        <div className="flex items-center justify-between gap-3">
                          <label className="block text-sm font-medium text-slate-700">Work address</label>
                          <button
                            type="button"
                            onClick={() => {
                              setAddingWorkAddress((open) => !open);
                              setWorkAddressError(null);
                            }}
                            className="text-xs font-semibold text-[#14B8A6] hover:underline"
                          >
                            {addingWorkAddress ? 'Cancel add site' : '+ Add site address'}
                          </button>
                        </div>
                        <WorkAddressSelect
                          options={workAddressOptions}
                          value={workAddressId}
                          onChange={setWorkAddressId}
                          className="mt-1 w-full"
                          emptyButtonLabel="Default installation address"
                        />
                        {addingWorkAddress && (
                          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <div className="grid gap-3 sm:grid-cols-2">
                              <label className="text-xs font-medium text-slate-700">
                                Site name
                                <input
                                  value={workAddressForm.name}
                                  onChange={(e) => setWorkAddressForm((f) => ({ ...f, name: e.target.value }))}
                                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                  placeholder="e.g. 206 Willesden Lane"
                                />
                              </label>
                              <label className="text-xs font-medium text-slate-700">
                                Address line 1
                                <input
                                  value={workAddressForm.address_line_1}
                                  onChange={(e) => setWorkAddressForm((f) => ({ ...f, address_line_1: e.target.value }))}
                                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                  placeholder="Street address"
                                />
                              </label>
                              <label className="text-xs font-medium text-slate-700">
                                Address line 2
                                <input
                                  value={workAddressForm.address_line_2}
                                  onChange={(e) => setWorkAddressForm((f) => ({ ...f, address_line_2: e.target.value }))}
                                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                />
                              </label>
                              <label className="text-xs font-medium text-slate-700">
                                Town
                                <input
                                  value={workAddressForm.town}
                                  onChange={(e) => setWorkAddressForm((f) => ({ ...f, town: e.target.value }))}
                                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                />
                              </label>
                              <label className="text-xs font-medium text-slate-700">
                                County
                                <input
                                  value={workAddressForm.county}
                                  onChange={(e) => setWorkAddressForm((f) => ({ ...f, county: e.target.value }))}
                                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                />
                              </label>
                              <label className="text-xs font-medium text-slate-700">
                                Postcode
                                <input
                                  value={workAddressForm.postcode}
                                  onChange={(e) => setWorkAddressForm((f) => ({ ...f, postcode: e.target.value }))}
                                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                />
                              </label>
                            </div>
                            {workAddressError && <p className="mt-2 text-xs text-rose-600">{workAddressError}</p>}
                            <button
                              type="button"
                              disabled={savingWorkAddress}
                              onClick={() => void handleAddWorkAddress()}
                              className="mt-3 w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                            >
                              {savingWorkAddress ? 'Adding site...' : 'Add site and select'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    {customerId && (
                      <div>
                        <label className="block text-sm font-medium text-slate-700">Linked job (optional)</label>
                        <select
                          value={jobId ?? ''}
                          onChange={(e) => setJobId(e.target.value ? Number(e.target.value) : null)}
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                        >
                          <option value="">No linked job</option>
                          {jobOptions.map((job) => (
                            <option key={job.id} value={job.id}>
                              #{job.id} · {job.title || 'Untitled job'} · {job.state.replace(/_/g, ' ')}
                            </option>
                          ))}
                        </select>
                        <p className="mt-1 text-xs text-slate-500">
                          Linked certificates will appear in that job&apos;s Files tab and email composer.
                        </p>
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-slate-700">Job number (optional)</label>
                      <input
                        value={jobNumber}
                        onChange={(e) => setJobNumber(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        placeholder="e.g. WP-001"
                      />
                    </div>
                    {error && <p className="text-sm text-rose-600">{error}</p>}
                    <button
                      type="button"
                      disabled={creating || !customerId}
                      onClick={() => void handleCreate()}
                      className="w-full rounded-lg bg-[#14B8A6] py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {creating ? 'Creating…' : 'Create & open editor'}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConvertCertificateModal
        open={convertOpen}
        source={convertSource}
        onClose={() => {
          setConvertOpen(false);
          setConvertSource(null);
        }}
        onConfirm={async (typeSlug, mode) => {
          if (!convertSource) return;
          await handleCopyConvert(convertSource, typeSlug, mode);
        }}
      />
    </div>
  );
}
