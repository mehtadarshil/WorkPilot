'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { Search, MoreVertical, Briefcase, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getJson, patchJson, deleteRequest } from '../../apiClient';
import { Pagination } from '../Pagination';
import ImportCustomerSelect from '../ImportCustomerSelect';

interface Job {
  id: number;
  job_number: string | null;
  title: string;
  description: string | null;
  priority: string;
  responsible_person: string | null;
  officer_id: number | null;
  officer_full_name: string | null;
  officers?: { id: number; full_name: string; is_primary?: boolean }[];
  start_date: string | null;
  deadline: string | null;
  customer_id: number | null;
  customer_full_name: string | null;
  installation_label?: string | null;
  work_site_address?: string | null;
  location: string | null;
  required_certifications: string | null;
  attachments: { filename?: string; url?: string }[];
  state: string;
  created_at: string;
  updated_at: string;
  is_quotation_visit?: boolean;
  charge_type?: string;
  profit?: number;
  invoice_summary?: {
    total: number;
    draft: number;
    issued: number;
    awaiting_payment: number;
    paid: number;
    cancelled: number;
    label: string;
  };
}

interface JobsResponse {
  jobs: Job[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  stateCounts: Record<string, number>;
}

interface Customer {
  id: number;
  full_name: string;
  email: string;
}

interface Officer {
  id: number;
  full_name: string;
  role_position: string | null;
  department: string | null;
  state: string;
}

const PAGE_SIZE = 10;
const JOB_STATES = [
  { value: 'draft', label: 'Draft', color: 'bg-slate-100 text-slate-600' },
  { value: 'created', label: 'Created', color: 'bg-blue-100 text-blue-800' },
  { value: 'unscheduled', label: 'Unscheduled', color: 'bg-slate-100 text-slate-600' },
  { value: 'scheduled', label: 'Scheduled', color: 'bg-indigo-100 text-indigo-800' },
  { value: 'assigned', label: 'Assigned', color: 'bg-violet-100 text-violet-800' },
  { value: 'rescheduled', label: 'Rescheduled', color: 'bg-amber-100 text-amber-800' },
  { value: 'dispatched', label: 'Dispatched', color: 'bg-blue-100 text-blue-800' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-amber-100 text-amber-800' },
  { value: 'paused', label: 'Paused', color: 'bg-orange-100 text-orange-800' },
  { value: 'completed', label: 'Completed', color: 'bg-emerald-100 text-emerald-800' },
  { value: 'need_to_be_rescheduled', label: 'Need to be rescheduling', color: 'bg-orange-100 text-orange-800' },
  { value: 'parts_need_ordering', label: 'Parts need ordering', color: 'bg-orange-100 text-orange-800' },
  { value: 'awaiting_parts_delivery', label: 'Awaiting parts delivery', color: 'bg-orange-100 text-orange-800' },
  { value: 'closed', label: 'Closed', color: 'bg-slate-200 text-slate-600' },
] as const;
const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low', color: 'bg-slate-100 text-slate-600' },
  { value: 'medium', label: 'Medium', color: 'bg-blue-100 text-blue-800' },
  { value: 'high', label: 'High', color: 'bg-amber-100 text-amber-800' },
  { value: 'critical', label: 'Critical', color: 'bg-rose-100 text-rose-800' },
] as const;

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(val || 0);
}

export default function JobsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [stateCounts, setStateCounts] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [page, setPage] = useState(1);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [actionMenu, setActionMenu] = useState<number | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPriority, setFormPriority] = useState('medium');
  const [formOfficerIds, setFormOfficerIds] = useState<number[]>([]);
  const [formStartDate, setFormStartDate] = useState('');
  const [formDeadline, setFormDeadline] = useState('');
  const [formCustomerId, setFormCustomerId] = useState<number | null>(null);
  const [formLocation, setFormLocation] = useState('');
  const [formRequiredCertifications, setFormRequiredCertifications] = useState('');
  const [formState, setFormState] = useState('draft');
  const [formChargeType, setFormChargeType] = useState('chargeable');

  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  const fetchJobs = useCallback(async () => {
    if (!token) return;
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));
      if (searchDebounced) params.set('search', searchDebounced);
      if (stateFilter) params.set('state', stateFilter);
      if (priorityFilter) params.set('priority', priorityFilter);
      params.set('exclude_quotation_visits', 'true');
      const data = await getJson<JobsResponse>(`/jobs?${params.toString()}`, token);
      setJobs(data.jobs ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
      setStateCounts(data.stateCounts ?? {});
    } catch {
      setJobs([]);
      setTotal(0);
      setTotalPages(1);
      setStateCounts({});
    }
  }, [token, page, searchDebounced, stateFilter, priorityFilter]);

  const fetchCustomersForDropdown = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getJson<{ customers: Customer[] }>('/customers?limit=5000&page=1', token);
      setCustomers(data.customers ?? []);
    } catch {
      setCustomers([]);
    }
  }, [token]);

  const fetchOfficersForDropdown = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getJson<{ officers: Officer[] }>('/officers/list', token);
      setOfficers(data.officers ?? []);
    } catch {
      setOfficers([]);
    }
  }, [token]);

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
    fetchJobs();
  }, [fetchJobs]);

  useEffect(() => {
    if (editModalOpen) {
      fetchCustomersForDropdown();
      fetchOfficersForDropdown();
    }
  }, [editModalOpen, fetchCustomersForDropdown, fetchOfficersForDropdown]);

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
    setFormTitle('');
    setFormDescription('');
    setFormPriority('medium');
    setFormOfficerIds([]);
    setFormStartDate('');
    setFormDeadline('');
    setFormCustomerId(null);
    setFormLocation('');
    setFormRequiredCertifications('');
    setFormState('draft');
    setFormChargeType('chargeable');
  };

  const openEdit = (j: Job) => {
    setAddError(null);
    setEditingJob(j);
    setFormTitle(j.title);
    setFormDescription(j.description ?? '');
    setFormPriority(j.priority);
    const existingIds = j.officers?.map((o) => o.id) ?? (j.officer_id ? [j.officer_id] : []);
    const primaryId = j.officers?.find((o) => o.is_primary)?.id ?? existingIds[0];
    setFormOfficerIds(primaryId ? [primaryId, ...existingIds.filter((id) => id !== primaryId)] : []);
    setFormStartDate(j.start_date ? j.start_date.slice(0, 16) : '');
    setFormDeadline(j.deadline ? j.deadline.slice(0, 16) : '');
    setFormCustomerId(j.customer_id);
    setFormLocation(j.location ?? '');
    setFormRequiredCertifications(j.required_certifications ?? '');
    setFormState(j.state);
    setFormChargeType(j.charge_type || 'chargeable');
    setActionMenu(null);
    setEditModalOpen(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    if (!editingJob || !token) return;
    try {
      await patchJson<{ job: Job }>(
        `/jobs/${editingJob.id}`,
        {
          title: formTitle.trim(),
          description: formDescription.trim() || null,
          priority: formPriority,
          officer_ids: formOfficerIds.length > 0 ? formOfficerIds : null,
          start_date: formStartDate ? new Date(formStartDate).toISOString() : null,
          deadline: formDeadline ? new Date(formDeadline).toISOString() : null,
          customer_id: formCustomerId,
          location: formLocation.trim() || null,
          required_certifications: formRequiredCertifications.trim() || null,
          state: formState,
          charge_type: formChargeType,
        },
        token,
      );
      setEditModalOpen(false);
      setEditingJob(null);
      fetchJobs();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to update job.');
    }
  };

  const handleDelete = async (id: number) => {
    if (!token) return;
    try {
      await deleteRequest(`/jobs/${id}`, token);
      setActionMenu(null);
      fetchJobs();
    } catch {
      setAddError('Failed to delete job.');
    }
  };

  const handleQuickStateChange = async (job: Job, newState: string) => {
    if (!token) return;
    try {
      await patchJson<{ job: Job }>(`/jobs/${job.id}`, { state: newState }, token);
      setActionMenu(null);
      fetchJobs();
    } catch {
      setAddError('Failed to update job state.');
    }
  };

  const stateBadge = (state: string) => {
    const opt = JOB_STATES.find((s) => s.value === state) ?? JOB_STATES[0];
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${opt.color}`}>
        {opt.label}
      </span>
    );
  };

  const priorityBadge = (priority: string) => {
    const opt = PRIORITY_OPTIONS.find((p) => p.value === priority) ?? PRIORITY_OPTIONS[1];
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${opt.color}`}>
        {opt.label}
      </span>
    );
  };

  return (
    <>
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
        <div className="flex items-center gap-6">
          <h2 className="text-lg font-bold text-slate-900">Job Management</h2>
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
        <div className="w-full space-y-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-tight text-slate-900">Job Management</h1>
              <p className="mt-1 text-slate-500">
                Organize, track, and complete work. Create a job with full descriptions, pricing, and options — or add one from a customer profile.
              </p>
            </div>
            <motion.button
              type="button"
              onClick={() => router.push('/dashboard/jobs/new')}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-[#14B8A6] px-5 py-2.5 font-bold text-white shadow-sm transition hover:brightness-110"
            >
              <Plus className="size-5" />
              Create job
            </motion.button>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
            {JOB_STATES.map((s) => (
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
              <h2 className="text-lg font-bold text-slate-900">Jobs Directory</h2>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search jobs..."
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
                  {JOB_STATES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium transition hover:bg-slate-50"
                >
                  <option value="">All priorities</option>
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Job</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">State</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Invoicing</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Priority</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Assigned</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Customer</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Work/Site Address</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Profit</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Deadline</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {jobs.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-6 py-12 text-center text-slate-500">
                        No jobs yet. Create one to get started.
                      </td>
                    </tr>
                  ) : (
                    <AnimatePresence>
                      {jobs.map((j, i) => (
                        <motion.tr
                          key={j.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: i * 0.02 }}
                          className="relative transition-colors hover:bg-slate-50"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#14B8A6]/20">
                                <Briefcase className="size-5 text-[#14B8A6]" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="inline-flex shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                                    {j.job_number?.trim() || `#${j.id.toString().padStart(4, '0')}`}
                                  </span>
                                  <button
                                    onClick={() => router.push(`/dashboard/jobs/${j.id}`)}
                                    className="text-sm font-semibold text-slate-900 hover:text-[#14B8A6] hover:underline text-left block"
                                  >
                                    {j.title}
                                  </button>
                                  {j.charge_type === 'free' && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                                      Free of Charge
                                    </span>
                                  )}
                                  {j.charge_type === 'callback' && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">
                                      Call Back
                                    </span>
                                  )}
                                </div>
                                <span className="block max-w-[200px] truncate text-xs text-slate-500">{j.description || '—'}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">{stateBadge(j.state)}</td>
                          <td className="px-6 py-4">
                            <span
                              className={`inline-flex max-w-[220px] items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                                !j.invoice_summary || j.invoice_summary.total === 0
                                  ? 'bg-slate-100 text-slate-500'
                                  : j.invoice_summary.draft > 0
                                    ? 'bg-amber-50 text-amber-800'
                                    : j.invoice_summary.awaiting_payment > 0
                                      ? 'bg-rose-50 text-rose-700'
                                      : j.invoice_summary.paid > 0
                                        ? 'bg-emerald-50 text-emerald-700'
                                        : 'bg-blue-50 text-blue-700'
                              }`}
                              title={j.invoice_summary?.label || '0 invoices'}
                            >
                              {j.invoice_summary?.label || '0 invoices'}
                            </span>
                          </td>
                          <td className="px-6 py-4">{priorityBadge(j.priority)}</td>
                          <td className="px-6 py-4 text-sm text-slate-700">
                            {(() => {
                              const names =
                                j.officers && j.officers.length > 0
                                  ? j.officers.map((o) => o.full_name).filter(Boolean)
                                  : [];
                              if (names.length > 0) return names.join(', ');
                              return j.officer_full_name || j.responsible_person || '—';
                            })()}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-700">{j.customer_full_name || '—'}</td>
                          <td className="max-w-[220px] px-6 py-4 text-sm text-slate-600">
                            <span className="line-clamp-2" title={j.work_site_address || undefined}>
                              {j.work_site_address?.trim() || '—'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm font-semibold">
                            {j.profit != null ? (
                              <span className={j.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                                {formatCurrency(j.profit)}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-500">{formatDate(j.deadline)}</td>
                          <td className="relative px-6 py-4 text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                if (actionMenu === j.id) {
                                  setActionMenu(null);
                                } else {
                                  const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                  setMenuPosition({ top: rect.bottom + 4, left: rect.right - 140 });
                                  setActionMenu(j.id);
                                }
                              }}
                              className="rounded p-1 transition hover:bg-slate-200"
                            >
                              <MoreVertical className="size-5 text-slate-500" />
                            </button>
                            {actionMenu === j.id && typeof document !== 'undefined' && createPortal(
                              <div
                                className="fixed z-[100] w-36 rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
                                style={{ top: menuPosition.top, left: menuPosition.left }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={() => router.push(`/dashboard/jobs/${j.id}`)}
                                  className="block w-full px-4 py-2 text-left text-sm text-[#14B8A6] font-bold hover:bg-slate-50"
                                >
                                  View Details
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openEdit(j)}
                                  className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                                >
                                  Edit
                                </button>
                                {j.state !== 'closed' && (
                                  <button
                                    type="button"
                                    onClick={() => handleQuickStateChange(j, 'closed')}
                                    className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                                  >
                                    Mark Closed
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleDelete(j.id)}
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
              itemName="jobs"
            />
          </motion.div>
        </div>
      </div>

      {editModalOpen && editingJob && (
        <JobModal
          title="Edit Job"
          onSubmit={handleEdit}
          onClose={() => { setEditModalOpen(false); setEditingJob(null); }}
          error={addError}
          customers={customers}
          officers={officers}
          formTitle={formTitle}
          setFormTitle={setFormTitle}
          formDescription={formDescription}
          setFormDescription={setFormDescription}
          formPriority={formPriority}
          setFormPriority={setFormPriority}
          formOfficerIds={formOfficerIds}
          setFormOfficerIds={setFormOfficerIds}
          formStartDate={formStartDate}
          setFormStartDate={setFormStartDate}
          formDeadline={formDeadline}
          setFormDeadline={setFormDeadline}
          formCustomerId={formCustomerId}
          setFormCustomerId={setFormCustomerId}
          formLocation={formLocation}
          setFormLocation={setFormLocation}
          formRequiredCertifications={formRequiredCertifications}
          setFormRequiredCertifications={setFormRequiredCertifications}
          formState={formState}
          setFormState={setFormState}
          formChargeType={formChargeType}
          setFormChargeType={setFormChargeType}
          submitLabel="Save Changes"
        />
      )}
    </>
  );
}

function JobModal({
  title,
  onSubmit,
  onClose,
  error,
  customers,
  officers,
  formTitle,
  setFormTitle,
  formDescription,
  setFormDescription,
  formPriority,
  setFormPriority,
  formOfficerIds,
  setFormOfficerIds,
  formStartDate,
  setFormStartDate,
  formDeadline,
  setFormDeadline,
  formCustomerId,
  setFormCustomerId,
  formLocation,
  setFormLocation,
  formRequiredCertifications,
  setFormRequiredCertifications,
  formState,
  setFormState,
  formChargeType,
  setFormChargeType,
  submitLabel,
}: {
  title: string;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  error: string | null;
  customers: Customer[];
  officers: Officer[];
  formTitle: string;
  setFormTitle: (v: string) => void;
  formDescription: string;
  setFormDescription: (v: string) => void;
  formPriority: string;
  setFormPriority: (v: string) => void;
  formOfficerIds: number[];
  setFormOfficerIds: (v: number[]) => void;
  formStartDate: string;
  setFormStartDate: (v: string) => void;
  formDeadline: string;
  setFormDeadline: (v: string) => void;
  formCustomerId: number | null;
  setFormCustomerId: (v: number | null) => void;
  formLocation: string;
  setFormLocation: (v: string) => void;
  formRequiredCertifications: string;
  setFormRequiredCertifications: (v: string) => void;
  formState: string;
  setFormState: (v: string) => void;
  formChargeType: string;
  setFormChargeType: (v: string) => void;
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
            <label className="block text-sm font-medium text-slate-700">Job title *</label>
            <input type="text" required value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="e.g. Service Request #123" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Description</label>
            <textarea rows={3} value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Detailed explanation of the work to be performed" className={inputClass} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-slate-700">Priority</label>
              <select value={formPriority} onChange={(e) => setFormPriority(e.target.value)} className={inputClass}>
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">State</label>
              <select value={formState} onChange={(e) => setFormState(e.target.value)} className={inputClass}>
                {JOB_STATES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Charge option</label>
              <select value={formChargeType} onChange={(e) => setFormChargeType(e.target.value)} className={inputClass}>
                <option value="chargeable">Chargeable</option>
                <option value="free">Free of Charge</option>
                <option value="callback">Call Back</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Assigned users</label>
            <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
              {officers.filter((o) => o.state === 'active').length === 0 && (
                <p className="px-2 py-1 text-sm text-slate-400">No active users</p>
              )}
              {officers.filter((o) => o.state === 'active').map((o) => {
                const checked = formOfficerIds.includes(o.id);
                const isPrimary = formOfficerIds[0] === o.id;
                return (
                  <label
                    key={o.id}
                    className="flex items-center gap-2 py-1.5 px-2 hover:bg-slate-50 rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFormOfficerIds([...formOfficerIds, o.id]);
                        } else {
                          const next = formOfficerIds.filter((id) => id !== o.id);
                          setFormOfficerIds(next);
                        }
                      }}
                      className="rounded border-slate-300 text-[#14B8A6] focus:ring-[#14B8A6]"
                    />
                    <span className="text-sm text-slate-700 flex-1">
                      {o.full_name}
                      {o.role_position ? ` (${o.role_position})` : ''}
                      {o.department ? ` - ${o.department}` : ''}
                    </span>
                    {checked && (
                      <input
                        type="radio"
                        name="primary_officer"
                        checked={isPrimary}
                        onChange={() => {
                          setFormOfficerIds([o.id, ...formOfficerIds.filter((id) => id !== o.id)]);
                        }}
                        title="Primary"
                        className="text-[#14B8A6] focus:ring-[#14B8A6]"
                      />
                    )}
                    {checked && isPrimary && (
                      <span className="text-[10px] font-bold uppercase text-[#14B8A6]">Primary</span>
                    )}
                  </label>
                );
              })}
            </div>
            {formOfficerIds.length > 0 && (
              <p className="mt-1 text-xs text-slate-500">
                {formOfficerIds.length} selected. The radio marks the primary assignee.
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">Start date</label>
              <input type="datetime-local" value={formStartDate} onChange={(e) => setFormStartDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Deadline</label>
              <input type="datetime-local" value={formDeadline} onChange={(e) => setFormDeadline(e.target.value)} className={inputClass} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Related customer</label>
            <div className="mt-1">
              <ImportCustomerSelect
                customers={customers}
                value={formCustomerId}
                onChange={setFormCustomerId}
                className="w-full"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Location</label>
            <input type="text" value={formLocation} onChange={(e) => setFormLocation(e.target.value)} placeholder="Address or site name" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Required certifications or skills</label>
            <input type="text" value={formRequiredCertifications} onChange={(e) => setFormRequiredCertifications(e.target.value)} placeholder="e.g. OSHA, First Aid" className={inputClass} />
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
