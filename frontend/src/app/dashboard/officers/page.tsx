'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, MoreVertical, Plus, Award, Printer } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { getJson, postJson, patchJson, deleteRequest } from '../../apiClient';
import { Pagination } from '../Pagination';
import { UserDetailModal } from '../settings/UserDetailModal';
import CustomerSiteReportSignaturePad from '../customers/[id]/CustomerSiteReportSignaturePad';

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
  signature_data_url?: string | null;
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
  const [detailOfficer, setDetailOfficer] = useState<Officer | null>(null);

  const [formFullName, setFormFullName] = useState('');
  const [formRolePosition, setFormRolePosition] = useState('');
  const [formDepartment, setFormDepartment] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formSystemAccessLevel, setFormSystemAccessLevel] = useState('standard');
  const [formCertifications, setFormCertifications] = useState('');
  const [formAssignedResponsibilities, setFormAssignedResponsibilities] = useState('');
  const [formState, setFormState] = useState('active');
  const [formSignatureDataUrl, setFormSignatureDataUrl] = useState<string | null>(null);

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
    const t = setTimeout(() => {
      setSearchDebounced(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [stateFilter]);

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
    setFormSignatureDataUrl(null);
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
    setFormSignatureDataUrl(o.signature_data_url ?? null);
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
          signature_data_url: formSignatureDataUrl || undefined,
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
          signature_data_url: formSignatureDataUrl,
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
                              <div className="flex flex-col gap-0.5">
                                <span className="text-sm font-semibold text-slate-900">{o.full_name}</span>
                                {o.signature_data_url && (
                                  <span className="w-fit inline-flex items-center rounded-full bg-teal-50 px-1.5 py-0.5 text-[10px] font-medium text-teal-700 ring-1 ring-inset ring-teal-600/10">
                                    Signature saved
                                  </span>
                                )}
                              </div>
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
                                className="fixed z-[100] w-40 rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
                                style={{ top: menuPosition.top, left: menuPosition.left }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={() => { setDetailOfficer(o); setActionMenu(null); }}
                                  className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                                >
                                  View details
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

            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              itemName="officers"
            />
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
          formSignatureDataUrl={formSignatureDataUrl}
          setFormSignatureDataUrl={setFormSignatureDataUrl}
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
          formSignatureDataUrl={formSignatureDataUrl}
          setFormSignatureDataUrl={setFormSignatureDataUrl}
          submitLabel="Save Changes"
        />
      )}

      {detailOfficer && token && (
        <UserDetailModal
          user={{
            id: detailOfficer.id,
            full_name: detailOfficer.full_name,
            role_position: detailOfficer.role_position,
            department: detailOfficer.department,
            phone: detailOfficer.phone,
            email: detailOfficer.email,
            system_access_level: detailOfficer.system_access_level,
            state: detailOfficer.state,
          }}
          token={token}
          onClose={() => setDetailOfficer(null)}
        />
      )}

    </>
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
  formSignatureDataUrl,
  setFormSignatureDataUrl,
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
  formSignatureDataUrl: string | null;
  setFormSignatureDataUrl: (v: string | null) => void;
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
          <div>
            <label className="block text-sm font-medium text-slate-700">Signature</label>
            <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50/50 p-4">
              {formSignatureDataUrl ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="rounded border border-slate-200 bg-white p-2">
                    <img src={formSignatureDataUrl} alt="Officer signature" className="h-16 object-contain" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormSignatureDataUrl(null)}
                    className="text-xs font-semibold text-rose-600 hover:underline"
                  >
                    Clear saved signature
                  </button>
                </div>
              ) : (
                <div>
                  <p className="mb-2 text-xs text-slate-500">Draw signature below to request or save officer's signature:</p>
                  <CustomerSiteReportSignaturePad
                    busy={false}
                    saveLabel="Confirm signature drawing"
                    onSave={async (blob) => {
                      const dataUrl = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => {
                          if (typeof reader.result === 'string') resolve(reader.result);
                          else reject(new Error('Could not read signature'));
                        };
                        reader.onerror = () => reject(reader.error ?? new Error('Could not read signature'));
                        reader.readAsDataURL(blob);
                      });
                      setFormSignatureDataUrl(dataUrl);
                    }}
                  />
                </div>
              )}
            </div>
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
