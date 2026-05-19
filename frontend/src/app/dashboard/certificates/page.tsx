'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FileCheck2, Plus, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getJson, postJson } from '../../apiClient';
import { Pagination } from '../Pagination';
import ImportCustomerSelect from '../ImportCustomerSelect';
import WorkAddressSelect from '../WorkAddressSelect';
import { CERTIFICATE_TYPE_CATALOG } from '@/lib/electricalCertificates/types';
import type { ElectricalCertificate } from '@/lib/electricalCertificates/types';

const PAGE_SIZE = 15;

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
  const [jobNumber, setJobNumber] = useState('');
  const [workAddressOptions, setWorkAddressOptions] = useState<{ id: number; label: string }[]>([]);
  const [customers, setCustomers] = useState<{ id: number; full_name: string }[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    if (createOpen) void fetchCustomers();
  }, [createOpen, fetchCustomers]);

  useEffect(() => {
    if (customerId) {
      void fetchWorkAddresses(customerId);
      setWorkAddressId(null);
    } else {
      setWorkAddressOptions([]);
      setWorkAddressId(null);
    }
  }, [customerId, fetchWorkAddresses]);

  const openCreate = () => {
    setCreateStep('type');
    setSelectedType('eicr_18e_a3');
    setCustomerId(null);
    setWorkAddressId(null);
    setJobNumber('');
    setError(null);
    setCreateOpen(true);
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
          job_number: jobNumber.trim() || null,
        },
        token,
      );
      setCreateOpen(false);
      router.push(`/dashboard/certificates/${res.certificate.id}/installation-details`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create certificate');
    } finally {
      setCreating(false);
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
                  No certificates yet. Create your first EICR.
                </td>
              </tr>
            ) : (
              rows.map((c) => (
                <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-mono font-semibold text-slate-900">{c.certificate_number}</td>
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
                    <Link
                      href={`/dashboard/certificates/${c.id}/installation-details`}
                      className="font-semibold text-[#14B8A6] hover:underline"
                    >
                      Open
                    </Link>
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
                        <label className="block text-sm font-medium text-slate-700">Work address</label>
                        <WorkAddressSelect
                          options={workAddressOptions}
                          value={workAddressId}
                          onChange={setWorkAddressId}
                          className="mt-1 w-full"
                          emptyButtonLabel="Default installation address"
                        />
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
    </div>
  );
}
