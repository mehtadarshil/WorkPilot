'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, MoreVertical, Plus, Award, Printer } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { getJson, postJson, patchJson, deleteRequest } from '../../apiClient';

interface Officer {
  id: number;
  full_name: string;
  role_position: string | null;
  department: string | null;
  phone: string | null;
  email: string | null;
  system_access_level: string | null;
  certifications: string | null;
  assigned_responsibilities: string | null;
  state: string;
  created_at: string;
  updated_at: string;
}

interface OfficersResponse {
  officers: Officer[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  stateCounts: Record<string, number>;
}

const PAGE_SIZE = 10;
const OFFICER_STATES = [
  { value: 'active', label: 'Active', color: 'bg-emerald-100 text-emerald-800' },
  { value: 'inactive', label: 'Inactive', color: 'bg-slate-100 text-slate-600' },
  { value: 'on_leave', label: 'On Leave', color: 'bg-amber-100 text-amber-800' },
  { value: 'suspended', label: 'Suspended', color: 'bg-rose-100 text-rose-800' },
  { value: 'archived', label: 'Archived', color: 'bg-slate-200 text-slate-500' },
] as const;
const ACCESS_LEVELS = [
  { value: 'basic', label: 'Basic' },
  { value: 'standard', label: 'Standard' },
  { value: 'manager', label: 'Manager' },
  { value: 'admin', label: 'Admin' },
  { value: 'full', label: 'Full' },
] as const;

export default function OfficersPage() {
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [stateCounts, setStateCounts] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [page, setPage] = useState(1);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingOfficer, setEditingOfficer] = useState<Officer | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [actionMenu, setActionMenu] = useState<number | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [certsModalOfficer, setCertsModalOfficer] = useState<Officer | null>(null);

  const [formFullName, setFormFullName] = useState('');
  const [formRolePosition, setFormRolePosition] = useState('');
  const [formDepartment, setFormDepartment] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formSystemAccessLevel, setFormSystemAccessLevel] = useState('standard');
  const [formCertifications, setFormCertifications] = useState('');
  const [formAssignedResponsibilities, setFormAssignedResponsibilities] = useState('');
  const [formState, setFormState] = useState('active');

  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  const fetchOfficers = useCallback(async () => {
    if (!token) return;
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));
      if (searchDebounced) params.set('search', searchDebounced);
      if (stateFilter) params.set('state', stateFilter);
      const data = await getJson<OfficersResponse>(`/officers?${params.toString()}`, token);
      setOfficers(data.officers ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
      setStateCounts(data.stateCounts ?? {});
    } catch {
      setOfficers([]);
      setTotal(0);
      setTotalPages(1);
      setStateCounts({});
    }
  }, [token, page, searchDebounced, stateFilter]);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    fetchOfficers();
  }, [fetchOfficers]);

  useEffect(() => {
    if (actionMenu === null) return;
    const close = () => setActionMenu(null);
    const t = setTimeout(() => document.addEventListener('click', close), 100);
    return () => {
      clearTimeout(t);
      document.removeEventListener('click', close);
    };
  }, [actionMenu]);

  const start = (page - 1) * PAGE_SIZE;

  const resetForm = () => {
    setFormFullName('');
    setFormRolePosition('');
    setFormDepartment('');
    setFormPhone('');
    setFormEmail('');
    setFormSystemAccessLevel('standard');
    setFormCertifications('');
    setFormAssignedResponsibilities('');
    setFormState('active');
  };

  const openAdd = () => {
    setAddError(null);
    resetForm();
    setAddModalOpen(true);
  };

  const openEdit = (o: Officer) => {
    setAddError(null);
    setEditingOfficer(o);
    setFormFullName(o.full_name);
    setFormRolePosition(o.role_position ?? '');
    setFormDepartment(o.department ?? '');
    setFormPhone(o.phone ?? '');
    setFormEmail(o.email ?? '');
    setFormSystemAccessLevel(o.system_access_level ?? 'standard');
    setFormCertifications(o.certifications ?? '');
    setFormAssignedResponsibilities(o.assigned_responsibilities ?? '');
    setFormState(o.state);
    setActionMenu(null);
    setEditModalOpen(true);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    if (!formFullName.trim()) {
      setAddError('Officer name is required.');
      return;
    }
    if (!token) return;
    try {
      await postJson<{ officer: Officer }>(
        '/officers',
        {
          full_name: formFullName.trim(),
          role_position: formRolePosition.trim() || undefined,
          department: formDepartment.trim() || undefined,
          phone: formPhone.trim() || undefined,
          email: formEmail.trim() || undefined,
          system_access_level: formSystemAccessLevel,
          certifications: formCertifications.trim() || undefined,
          assigned_responsibilities: formAssignedResponsibilities.trim() || undefined,
          state: formState,
        },
        token,
      );
      setAddModalOpen(false);
      resetForm();
      fetchOfficers();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to create officer.');
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    if (!editingOfficer || !token) return;
    try {
      await patchJson<{ officer: Officer }>(
        `/officers/${editingOfficer.id}`,
        {
          full_name: formFullName.trim(),
          role_position: formRolePosition.trim() || null,
          department: formDepartment.trim() || null,
          phone: formPhone.trim() || null,
          email: formEmail.trim() || null,
          system_access_level: formSystemAccessLevel,
          certifications: formCertifications.trim() || null,
          assigned_responsibilities: formAssignedResponsibilities.trim() || null,
          state: formState,
        },
        token,
      );
      setEditModalOpen(false);
      setEditingOfficer(null);
      fetchOfficers();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to update officer.');
    }
  };

  const handleDelete = async (id: number) => {
    if (!token) return;
    try {
      await deleteRequest(`/officers/${id}`, token);
      setActionMenu(null);
      fetchOfficers();
    } catch {
      setAddError('Failed to delete officer.');
    }
  };

  const stateBadge = (state: string) => {
    const opt = OFFICER_STATES.find((s) => s.value === state) ?? OFFICER_STATES[1];
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${opt.color}`}>
        {opt.label}
      </span>
    );
  };

  const initials = (name: string) =>
    name
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

  return (
    <>
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
        <div className="flex items-center gap-6">
          <h2 className="text-lg font-bold text-slate-900">Officer Management</h2>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Quick search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border-0 bg-slate-100 py-1.5 pl-10 pr-4 text-sm outline-none ring-1 ring-transparent focus:ring-2 focus:ring-[#14B8A6]"
            />
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-6xl space-y-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-tight text-slate-900">Officer Management</h1>
              <p className="mt-1 text-slate-500">Manage people responsible for overseeing, coordinating, or executing work.</p>
            </div>
            <motion.button
              type="button"
              onClick={openAdd}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#14B8A6] px-5 py-2.5 font-bold text-white shadow-sm transition hover:brightness-110"
            >
              <Plus className="size-5" />
              Add Officer
            </motion.button>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {OFFICER_STATES.map((s) => (
              <motion.div
                key={s.value}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <p className="mb-1 text-xs font-medium text-slate-500">{s.label}</p>
                <h3 className="text-2xl font-bold text-slate-900">{stateCounts[s.value] ?? 0}</h3>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
          >
            <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-bold text-slate-900">Officers Directory</h2>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search officers..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-4 text-sm outline-none transition focus:ring-2 focus:ring-[#14B8A6] focus:border-transparent"
                  />
                </div>
                <select
                  value={stateFilter}
                  onChange={(e) => setStateFilter(e.target.value)}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium transition hover:bg-slate-50"
                >
                  <option value="">All states</option>
                  {OFFICER_STATES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Officer</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Role</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Department</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Contact</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Access Level</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {officers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                        No officers yet. Add one to get started.
                      </td>
                    </tr>
                  ) : (
                    <AnimatePresence>
                      {officers.map((o, i) => (
                        <motion.tr
                          key={o.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: i * 0.02 }}
                          className="relative transition-colors hover:bg-slate-50"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#14B8A6]/20 font-bold text-xs text-[#14B8A6]">
                                {initials(o.full_name)}
                              </div>
                              <span className="text-sm font-semibold text-slate-900">{o.full_name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-700">{o.role_position || '—'}</td>
                          <td className="px-6 py-4 text-sm text-slate-700">{o.department || '—'}</td>
                          <td className="px-6 py-4 text-sm text-slate-500">
                            <div>{o.email || '—'}</div>
                            {o.phone && <div className="text-xs">{o.phone}</div>}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-700 capitalize">{o.system_access_level || '—'}</td>
                          <td className="px-6 py-4">{stateBadge(o.state)}</td>
                          <td className="relative px-6 py-4 text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                if (actionMenu === o.id) {
                                  setActionMenu(null);
                                } else {
                                  const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                  setMenuPosition({ top: rect.bottom + 4, left: rect.right - 100 });
                                  setActionMenu(o.id);
                                }
                              }}
                              className="rounded p-1 transition hover:bg-slate-200"
                            >
                              <MoreVertical className="size-5 text-slate-500" />
                            </button>
                            {actionMenu === o.id && typeof document !== 'undefined' && createPortal(
                              <div
                                className="fixed z-[100] w-36 rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
                                style={{ top: menuPosition.top, left: menuPosition.left }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={() => { setCertsModalOfficer(o); setActionMenu(null); }}
                                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                                >
                                  <Award className="size-4" />
                                  Certifications
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openEdit(o)}
                                  className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(o.id)}
                                  className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                                >
                                  Delete
                                </button>
                              </div>,
                              document.body,
                            )}
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-4 border-t border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-slate-500">
                Showing <span className="font-semibold text-slate-900">{total === 0 ? 0 : start + 1}</span> to{' '}
                <span className="font-semibold text-slate-900">{Math.min(start + PAGE_SIZE, total)}</span> of{' '}
                <span className="font-semibold text-slate-900">{total}</span> officers
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Previous
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const p = i + 1;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPage(p)}
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                        page === p ? 'bg-[#14B8A6] text-white' : 'border border-transparent hover:bg-slate-100'
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
                {totalPages > 5 && (
                  <>
                    <span className="px-2 text-slate-400">...</span>
                    <button
                      type="button"
                      onClick={() => setPage(totalPages)}
                      className="rounded-lg border border-transparent px-3 py-1.5 text-sm font-medium hover:bg-slate-100"
                    >
                      {totalPages}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {addModalOpen && (
        <OfficerModal
          title="Add Officer"
          onSubmit={handleAdd}
          onClose={() => setAddModalOpen(false)}
          error={addError}
          formFullName={formFullName}
          setFormFullName={setFormFullName}
          formRolePosition={formRolePosition}
          setFormRolePosition={setFormRolePosition}
          formDepartment={formDepartment}
          setFormDepartment={setFormDepartment}
          formPhone={formPhone}
          setFormPhone={setFormPhone}
          formEmail={formEmail}
          setFormEmail={setFormEmail}
          formSystemAccessLevel={formSystemAccessLevel}
          setFormSystemAccessLevel={setFormSystemAccessLevel}
          formCertifications={formCertifications}
          setFormCertifications={setFormCertifications}
          formAssignedResponsibilities={formAssignedResponsibilities}
          setFormAssignedResponsibilities={setFormAssignedResponsibilities}
          formState={formState}
          setFormState={setFormState}
          submitLabel="Add"
        />
      )}

      {editModalOpen && editingOfficer && (
        <OfficerModal
          title="Edit Officer"
          onSubmit={handleEdit}
          onClose={() => { setEditModalOpen(false); setEditingOfficer(null); }}
          error={addError}
          formFullName={formFullName}
          setFormFullName={setFormFullName}
          formRolePosition={formRolePosition}
          setFormRolePosition={setFormRolePosition}
          formDepartment={formDepartment}
          setFormDepartment={setFormDepartment}
          formPhone={formPhone}
          setFormPhone={setFormPhone}
          formEmail={formEmail}
          setFormEmail={setFormEmail}
          formSystemAccessLevel={formSystemAccessLevel}
          setFormSystemAccessLevel={setFormSystemAccessLevel}
          formCertifications={formCertifications}
          setFormCertifications={setFormCertifications}
          formAssignedResponsibilities={formAssignedResponsibilities}
          setFormAssignedResponsibilities={setFormAssignedResponsibilities}
          formState={formState}
          setFormState={setFormState}
          submitLabel="Save Changes"
        />
      )}

      {certsModalOfficer && token && (
        <OfficerCertificationsModal
          officer={certsModalOfficer}
          token={token}
          onClose={() => setCertsModalOfficer(null)}
          onRefresh={fetchOfficers}
        />
      )}
    </>
  );
}

interface CertAssignment {
  id: number;
  certification_id: number;
  certification_name: string;
  issued_date: string;
  expiry_date: string;
  certificate_number: string | null;
  status: 'valid' | 'expiring_soon' | 'expired';
}

function OfficerCertificationsModal({ officer, token, onClose, onRefresh }: { officer: Officer; token: string; onClose: () => void; onRefresh: () => void }) {
  const [assignments, setAssignments] = useState<CertAssignment[]>([]);
  const [certifications, setCertifications] = useState<{ id: number; name: string; validity_months: number }[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addCertId, setAddCertId] = useState<number | null>(null);
  const [addIssued, setAddIssued] = useState(new Date().toISOString().slice(0, 10));
  const [addExpiry, setAddExpiry] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fetchAssignments = useCallback(async () => {
    try {
      const data = await getJson<{ assignments: CertAssignment[] }>(`/officers/${officer.id}/certifications`, token);
      setAssignments(data.assignments ?? []);
    } catch {
      setAssignments([]);
    }
  }, [officer.id, token]);

  const fetchCerts = useCallback(async () => {
    try {
      const data = await getJson<{ certifications: { id: number; name: string; validity_months: number }[] }>('/certifications', token);
      setCertifications(data.certifications ?? []);
    } catch {
      setCertifications([]);
    }
  }, [token]);

  useEffect(() => {
    fetchAssignments();
    fetchCerts();
  }, [fetchAssignments, fetchCerts]);

  const openAdd = () => {
    setError(null);
    setAddCertId(null);
    setAddIssued(new Date().toISOString().slice(0, 10));
    setAddExpiry('');
    setAddOpen(true);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!addCertId) return;
    setError(null);
    try {
      await postJson(`/officers/${officer.id}/certifications`, {
        certification_id: addCertId,
        issued_date: addIssued,
        expiry_date: addExpiry || undefined,
      }, token);
      setAddOpen(false);
      fetchAssignments();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign.');
    }
  };

  const handleRemove = async (id: number) => {
    try {
      await deleteRequest(`/officer-certifications/${id}`, token);
      fetchAssignments();
    } catch {
      setError('Failed to remove.');
    }
  };

  const statusBadge = (s: string) => {
    if (s === 'valid') return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">Valid</span>;
    if (s === 'expiring_soon') return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Expiring soon</span>;
    return <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800">Expired</span>;
  };

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const assignedIds = new Set(assignments.map((a) => a.certification_id));
  const availableCerts = certifications.filter((c) => !assignedIds.has(c.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">Certifications — {officer.full_name}</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100">×</button>
        </div>
        <div className="mt-4 space-y-3">
          {assignments.length === 0 ? (
            <p className="text-sm text-slate-500">No certifications assigned.</p>
          ) : (
            assignments.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/50 px-4 py-3">
                <div>
                  <p className="font-semibold text-slate-900">{a.certification_name}</p>
                  <p className="text-xs text-slate-500">Expires {formatDate(a.expiry_date)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/dashboard/certifications/certificate/${a.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <Printer className="size-3" />
                    Print
                  </Link>
                  {statusBadge(a.status)}
                  <button type="button" onClick={() => handleRemove(a.id)} className="text-xs text-rose-600 hover:underline">Remove</button>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={openAdd} disabled={availableCerts.length === 0} className="rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#13a89a] disabled:opacity-50">
            Add certification
          </button>
          {certifications.length === 0 && (
            <span className="text-xs text-slate-500">Create certifications in the Certifications page first.</span>
          )}
          {certifications.length > 0 && availableCerts.length === 0 && assignments.length > 0 && (
            <span className="text-xs text-slate-500">All certifications assigned.</span>
          )}
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Close</button>
        </div>

        {addOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6 border-t border-slate-200 pt-6">
            <h4 className="font-semibold text-slate-900">Assign certification</h4>
            <form onSubmit={handleAdd} className="mt-3 space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700">Certification</label>
                <select
                  value={addCertId ?? ''}
                  onChange={(e) => {
                    const id = e.target.value ? parseInt(e.target.value, 10) : null;
                    setAddCertId(id);
                    if (id) {
                      const cert = certifications.find((c) => c.id === id);
                      if (cert) {
                        const exp = new Date(addIssued);
                        exp.setMonth(exp.getMonth() + cert.validity_months);
                        setAddExpiry(exp.toISOString().slice(0, 10));
                      }
                    }
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  required
                >
                  <option value="">Select</option>
                  {availableCerts.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Issued date</label>
                  <input type="date" value={addIssued} onChange={(e) => setAddIssued(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Expiry date</label>
                  <input type="date" value={addExpiry} onChange={(e) => setAddExpiry(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                </div>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => setAddOpen(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium">Cancel</button>
                <button type="submit" className="rounded-lg bg-[#14B8A6] px-3 py-1.5 text-sm font-semibold text-white">Assign</button>
              </div>
            </form>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

function OfficerModal({
  title,
  onSubmit,
  onClose,
  error,
  formFullName,
  setFormFullName,
  formRolePosition,
  setFormRolePosition,
  formDepartment,
  setFormDepartment,
  formPhone,
  setFormPhone,
  formEmail,
  setFormEmail,
  formSystemAccessLevel,
  setFormSystemAccessLevel,
  formCertifications,
  setFormCertifications,
  formAssignedResponsibilities,
  setFormAssignedResponsibilities,
  formState,
  setFormState,
  submitLabel,
}: {
  title: string;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  error: string | null;
  formFullName: string;
  setFormFullName: (v: string) => void;
  formRolePosition: string;
  setFormRolePosition: (v: string) => void;
  formDepartment: string;
  setFormDepartment: (v: string) => void;
  formPhone: string;
  setFormPhone: (v: string) => void;
  formEmail: string;
  setFormEmail: (v: string) => void;
  formSystemAccessLevel: string;
  setFormSystemAccessLevel: (v: string) => void;
  formCertifications: string;
  setFormCertifications: (v: string) => void;
  formAssignedResponsibilities: string;
  setFormAssignedResponsibilities: (v: string) => void;
  formState: string;
  setFormState: (v: string) => void;
  submitLabel: string;
}) {
  const inputClass = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-slate-900">{title}</h3>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Officer name *</label>
            <input type="text" required value={formFullName} onChange={(e) => setFormFullName(e.target.value)} placeholder="Full name" className={inputClass} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">Role or position</label>
              <input type="text" value={formRolePosition} onChange={(e) => setFormRolePosition(e.target.value)} placeholder="e.g. Manager, Supervisor" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Department or team</label>
              <input type="text" value={formDepartment} onChange={(e) => setFormDepartment(e.target.value)} placeholder="e.g. Operations, Field Team" className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">Phone</label>
              <input type="tel" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="+1 234 567 8900" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Email</label>
              <input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="officer@company.com" className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">System access level</label>
              <select value={formSystemAccessLevel} onChange={(e) => setFormSystemAccessLevel(e.target.value)} className={inputClass}>
                {ACCESS_LEVELS.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Account status</label>
              <select value={formState} onChange={(e) => setFormState(e.target.value)} className={inputClass}>
                {OFFICER_STATES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Certifications or qualifications</label>
            <input type="text" value={formCertifications} onChange={(e) => setFormCertifications(e.target.value)} placeholder="e.g. OSHA, First Aid" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Assigned responsibilities</label>
            <textarea rows={2} value={formAssignedResponsibilities} onChange={(e) => setFormAssignedResponsibilities(e.target.value)} placeholder="Areas, teams, or job categories overseen" className={inputClass} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" className="flex-1 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#13a89a]">
              {submitLabel}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
