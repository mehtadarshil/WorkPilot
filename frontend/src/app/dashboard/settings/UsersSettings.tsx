'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, MoreVertical, Plus, Award, Printer } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { getJson, postJson, patchJson, deleteRequest } from '../../apiClient';
import { Pagination } from '../Pagination';

interface User {
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

interface UsersResponse {
  officers: User[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  stateCounts: Record<string, number>;
}

const PAGE_SIZE = 10;
const USER_STATES = [
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

export default function UsersSettings() {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [stateCounts, setStateCounts] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [page, setPage] = useState(1);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [actionMenu, setActionMenu] = useState<number | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [certsModalUser, setCertsModalUser] = useState<User | null>(null);

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

  const fetchUsers = useCallback(async () => {
    if (!token) return;
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));
      if (searchDebounced) params.set('search', searchDebounced);
      if (stateFilter) params.set('state', stateFilter);
      const data = await getJson<UsersResponse>(`/officers?${params.toString()}`, token);
      setUsers(data.officers ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
      setStateCounts(data.stateCounts ?? {});
    } catch {
      setUsers([]);
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
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (actionMenu === null) return;
    const close = () => setActionMenu(null);
    const t = setTimeout(() => document.addEventListener('click', close), 100);
    return () => {
      clearTimeout(t);
      document.removeEventListener('click', close);
    };
  }, [actionMenu]);

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

  const openEdit = (u: User) => {
    setAddError(null);
    setEditingUser(u);
    setFormFullName(u.full_name);
    setFormRolePosition(u.role_position ?? '');
    setFormDepartment(u.department ?? '');
    setFormPhone(u.phone ?? '');
    setFormEmail(u.email ?? '');
    setFormSystemAccessLevel(u.system_access_level ?? 'standard');
    setFormCertifications(u.certifications ?? '');
    setFormAssignedResponsibilities(u.assigned_responsibilities ?? '');
    setFormState(u.state);
    setActionMenu(null);
    setEditModalOpen(true);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    if (!formFullName.trim()) {
      setAddError('User name is required.');
      return;
    }
    if (!token) return;
    try {
      await postJson<{ officer: User }>(
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
      fetchUsers();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to create user.');
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    if (!editingUser || !token) return;
    try {
      await patchJson<{ officer: User }>(
        `/officers/${editingUser.id}`,
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
      setEditingUser(null);
      fetchUsers();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to update user.');
    }
  };

  const handleDelete = async (id: number) => {
    if (!token) return;
    try {
      await deleteRequest(`/officers/${id}`, token);
      setActionMenu(null);
      fetchUsers();
    } catch {
      setAddError('Failed to delete user.');
    }
  };

  const stateBadge = (state: string) => {
    const opt = USER_STATES.find((s) => s.value === state) ?? USER_STATES[1];
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
    <div className="mt-8 space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">User Management</h2>
          <p className="mt-1 text-sm text-slate-500">Manage people responsible for overseeing, coordinating, or executing work.</p>
        </div>
        <motion.button
          type="button"
          onClick={openAdd}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#14B8A6] px-5 py-2.5 font-bold text-white shadow-sm transition hover:brightness-110"
        >
          <Plus className="size-5" />
          Add User
        </motion.button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {USER_STATES.map((s) => (
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
          <h2 className="text-lg font-bold text-slate-900">Users Directory</h2>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search users..."
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
              {USER_STATES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">User</th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Role</th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Department</th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Contact</th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Access Level</th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    No users yet. Add one to get started.
                  </td>
                </tr>
              ) : (
                <AnimatePresence>
                  {users.map((u, i) => (
                    <motion.tr
                      key={u.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.02 }}
                      className="relative transition-colors hover:bg-slate-50"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#14B8A6]/20 font-bold text-xs text-[#14B8A6]">
                            {initials(u.full_name)}
                          </div>
                          <span className="text-sm font-semibold text-slate-900">{u.full_name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-700">{u.role_position || '—'}</td>
                      <td className="px-6 py-4 text-sm text-slate-700">{u.department || '—'}</td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        <div>{u.email || '—'}</div>
                        {u.phone && <div className="text-xs">{u.phone}</div>}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-700 capitalize">{u.system_access_level || '—'}</td>
                      <td className="px-6 py-4">{stateBadge(u.state)}</td>
                      <td className="relative px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            if (actionMenu === u.id) {
                              setActionMenu(null);
                            } else {
                              const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                              setMenuPosition({ top: rect.bottom + 4, left: rect.right - 100 });
                              setActionMenu(u.id);
                            }
                          }}
                          className="rounded p-1 transition hover:bg-slate-200"
                        >
                          <MoreVertical className="size-5 text-slate-500" />
                        </button>
                        {actionMenu === u.id && typeof document !== 'undefined' && createPortal(
                          <div
                            className="fixed z-[100] w-36 rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
                            style={{ top: menuPosition.top, left: menuPosition.left }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => { setCertsModalUser(u); setActionMenu(null); }}
                              className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                            >
                              <Award className="size-4" />
                              Certifications
                            </button>
                            <button
                              type="button"
                              onClick={() => openEdit(u)}
                              className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(u.id)}
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
          itemName="users"
        />
      </motion.div>

      {addModalOpen && (
        <UserModal
          title="Add User"
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

      {editModalOpen && editingUser && (
        <UserModal
          title="Edit User"
          onSubmit={handleEdit}
          onClose={() => { setEditModalOpen(false); setEditingUser(null); }}
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

      {certsModalUser && token && (
        <UserCertificationsModal
          user={certsModalUser}
          token={token}
          onClose={() => setCertsModalUser(null)}
          onRefresh={fetchUsers}
        />
      )}
    </div>
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

function UserCertificationsModal({ user, token, onClose, onRefresh }: { user: User; token: string; onClose: () => void; onRefresh: () => void }) {
  const [assignments, setAssignments] = useState<CertAssignment[]>([]);
  const [certifications, setCertifications] = useState<{ id: number; name: string; validity_months: number }[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addCertId, setAddCertId] = useState<number | null>(null);
  const [addIssued, setAddIssued] = useState(new Date().toISOString().slice(0, 10));
  const [addExpiry, setAddExpiry] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fetchAssignments = useCallback(async () => {
    try {
      const data = await getJson<{ assignments: CertAssignment[] }>(`/officers/${user.id}/certifications`, token);
      setAssignments(data.assignments ?? []);
    } catch {
      setAssignments([]);
    }
  }, [user.id, token]);

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
    try {
      await postJson(`/officers/${user.id}/certifications`, {
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
          <h3 className="text-lg font-bold text-slate-900">Certifications — {user.full_name}</h3>
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

function UserModal({
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
            <label className="block text-sm font-medium text-slate-700">User name *</label>
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
              <input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="user@company.com" className={inputClass} />
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
              <label className="block text-sm font-medium text-slate-700">Status</label>
              <select value={formState} onChange={(e) => setFormState(e.target.value)} className={inputClass}>
                {USER_STATES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Certifications (text description)</label>
            <textarea rows={2} value={formCertifications} onChange={(e) => setFormCertifications(e.target.value)} placeholder="e.g. First Aid, Safety Level 2" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Assigned responsibilities</label>
            <textarea rows={3} value={formAssignedResponsibilities} onChange={(e) => setFormAssignedResponsibilities(e.target.value)} placeholder="Main duties and focus areas..." className={inputClass} />
          </div>

          <div className="mt-8 flex items-center justify-end gap-3 border-t border-slate-100 pt-6">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" className="rounded-lg bg-[#14B8A6] px-6 py-2 text-sm font-bold text-white shadow-sm transition hover:brightness-110">
              {submitLabel}
            </button>
          </div>
          {error && <p className="mt-2 text-center text-sm font-medium text-rose-600">{error}</p>}
        </form>
      </motion.div>
    </div>
  );
}
