'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  MoreVertical,
  Send,
  CalendarPlus,
  Plus,
} from 'lucide-react';
import {
  startOfMonth,
  endOfMonth,
} from 'date-fns';
import { getJson, patchJson, postJson } from '../../apiClient';
import { GeneralDiaryEventModal, type GeneralDiaryEventForm } from '../diary/GeneralDiaryEventModal';

type ScheduledRow = {
  id: number;
  job_id: number | null;
  is_general?: boolean;
  title: string;
  description: string | null;
  priority: string;
  officer_id: number | null;
  officer_full_name: string | null;
  officers?: { id: number; full_name: string; is_primary?: boolean }[];
  customer_full_name: string | null;
  location: string | null;
  state: string;
  schedule_start: string | null;
  duration_minutes: number | null;
  scheduling_notes: string | null;
  job_number?: string | null;
};

type Officer = {
  id: number;
  full_name: string;
  state: string;
};

type Customer = { id: number; full_name: string };

const SCHEDULE_STATES = [
  { value: 'unscheduled', label: 'Unscheduled', color: 'bg-slate-100 text-slate-600' },
  { value: 'scheduled', label: 'Scheduled', color: 'bg-indigo-100 text-indigo-800' },
  { value: 'assigned', label: 'Assigned', color: 'bg-violet-100 text-violet-800' },
  { value: 'rescheduled', label: 'Rescheduled', color: 'bg-amber-100 text-amber-800' },
  { value: 'dispatched', label: 'Dispatched', color: 'bg-blue-100 text-blue-800' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-amber-100 text-amber-800' },
  { value: 'completed', label: 'Completed', color: 'bg-emerald-100 text-emerald-800' },
  { value: 'need_to_be_rescheduled', label: 'Need to be rescheduling', color: 'bg-orange-100 text-orange-800' },
  { value: 'parts_need_ordering', label: 'Parts need ordering', color: 'bg-orange-100 text-orange-800' },
  { value: 'awaiting_parts_delivery', label: 'Awaiting parts delivery', color: 'bg-orange-100 text-orange-800' },
] as const;

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low', color: 'bg-slate-100 text-slate-600' },
  { value: 'medium', label: 'Medium', color: 'bg-blue-100 text-blue-800' },
  { value: 'high', label: 'High', color: 'bg-amber-100 text-amber-800' },
  { value: 'critical', label: 'Critical', color: 'bg-rose-100 text-rose-800' },
] as const;

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function jobApiId(row: ScheduledRow): number | null {
  if (row.job_id != null) return row.job_id;
  if (!row.is_general) return row.id;
  return null;
}

type Props = {
  token: string | null;
  onChanged?: () => void;
};

export function DispatchPanel({ token, onChanged }: Props) {
  const [rows, setRows] = useState<ScheduledRow[]>([]);
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stateFilter, setStateFilter] = useState('');
  const [officerFilter, setOfficerFilter] = useState('');
  const [search, setSearch] = useState('');
  const [actionMenu, setActionMenu] = useState<number | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selected, setSelected] = useState<ScheduledRow | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const [formScheduleStart, setFormScheduleStart] = useState('');
  const [formDuration, setFormDuration] = useState('60');
  const [formOfficerIds, setFormOfficerIds] = useState<number[]>([]);
  const [formNotes, setFormNotes] = useState('');

  const [createTitle, setCreateTitle] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createPriority, setCreatePriority] = useState('medium');
  const [createCustomerId, setCreateCustomerId] = useState('');
  const [createOfficerIds, setCreateOfficerIds] = useState<number[]>([]);
  const [createLocation, setCreateLocation] = useState('');
  const [createScheduleStart, setCreateScheduleStart] = useState('');
  const [createDuration, setCreateDuration] = useState('60');
  const [createNotes, setCreateNotes] = useState('');

  const [generalModalOpen, setGeneralModalOpen] = useState(false);
  const [generalForm, setGeneralForm] = useState<GeneralDiaryEventForm>({
    title: '',
    start_time: '',
    duration_minutes: 60,
    officer_ids: [],
    notes: '',
    location: '',
  });

  const fetchRows = useCallback(async () => {
    if (!token) return;
    const monthStart = startOfMonth(new Date());
    const monthEnd = endOfMonth(new Date());
    const params = new URLSearchParams({
      range_start: new Date(
        monthStart.getFullYear(),
        monthStart.getMonth(),
        monthStart.getDate(),
        0,
        0,
        0,
        0,
      ).toISOString(),
      range_end: new Date(
        monthEnd.getFullYear(),
        monthEnd.getMonth(),
        monthEnd.getDate(),
        23,
        59,
        59,
        999,
      ).toISOString(),
      include_unscheduled: 'true',
      include_completed: '1',
      scope: 'team',
    });
    if (stateFilter) params.set('state', stateFilter);
    if (officerFilter) params.set('officer_id', officerFilter);
    try {
      const data = await getJson<{ events: Record<string, unknown>[] }>(
        `/diary-events?${params.toString()}`,
        token,
      );
      setRows(
        (data.events || []).map((e) => ({
          id: Number(e.diary_id),
          job_id: e.job_id != null ? Number(e.job_id) : null,
          is_general: e.is_general === true,
          title: String(e.title || 'Untitled Job'),
          description: (e.description as string | null) ?? null,
          priority: String(e.priority || 'medium'),
          officer_id: e.officer_id != null ? Number(e.officer_id) : null,
          officer_full_name: (e.officer_full_name as string | null) ?? null,
          officers: e.officers as ScheduledRow['officers'],
          customer_full_name: (e.customer_full_name as string | null) ?? null,
          location: (e.location as string | null) || (e.customer_address as string | null) || null,
          state: String(e.event_status || 'scheduled'),
          schedule_start: (e.start_time as string | null) ?? null,
          duration_minutes: e.duration_minutes != null ? Number(e.duration_minutes) : null,
          scheduling_notes: (e.notes as string | null) ?? null,
          job_number: (e.job_number as string | null) ?? null,
        })),
      );
    } catch {
      setRows([]);
    }
  }, [token, stateFilter, officerFilter]);

  const fetchOfficers = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getJson<{ officers: Officer[] }>('/officers/list', token);
      setOfficers(data.officers ?? []);
    } catch {
      setOfficers([]);
    }
  }, [token]);

  const fetchCustomers = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getJson<{ customers: Customer[] }>('/customers?limit=100&page=1', token);
      setCustomers(data.customers ?? []);
    } catch {
      setCustomers([]);
    }
  }, [token]);

  useEffect(() => {
    void fetchRows();
    void fetchOfficers();
  }, [fetchRows, fetchOfficers]);

  useEffect(() => {
    if (actionMenu === null) return;
    const close = () => setActionMenu(null);
    const t = setTimeout(() => document.addEventListener('click', close), 100);
    return () => {
      clearTimeout(t);
      document.removeEventListener('click', close);
    };
  }, [actionMenu]);

  const openScheduleModal = (row: ScheduledRow) => {
    setSelected(row);
    setFormScheduleStart(row.schedule_start ? row.schedule_start.slice(0, 16) : '');
    setFormDuration(String(row.duration_minutes ?? 60));
    const existingIds = row.officers?.map((o) => o.id) ?? (row.officer_id ? [row.officer_id] : []);
    const primaryId = row.officers?.find((o) => o.is_primary)?.id ?? existingIds[0];
    setFormOfficerIds(primaryId ? [primaryId, ...existingIds.filter((id) => id !== primaryId)] : []);
    setFormNotes(row.scheduling_notes ?? '');
    setScheduleError(null);
    setActionMenu(null);
    setScheduleModalOpen(true);
  };

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !token) return;
    const jid = jobApiId(selected);
    if (jid == null) {
      setScheduleError('Cannot schedule a general event from Dispatch. Use Calendar mode.');
      return;
    }
    setScheduleError(null);
    try {
      await postJson(
        `/jobs/${jid}/diary-events`,
        {
          start_time: formScheduleStart ? new Date(formScheduleStart).toISOString() : null,
          duration_minutes: parseInt(formDuration, 10) || 60,
          officer_ids: formOfficerIds.length > 0 ? formOfficerIds : null,
          notes: formNotes.trim() || null,
        },
        token,
      );
      setScheduleModalOpen(false);
      setSelected(null);
      await fetchRows();
      onChanged?.();
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : 'Failed to schedule.');
    }
  };

  const handleDispatch = async (row: ScheduledRow) => {
    if (!token) return;
    const jid = jobApiId(row);
    if (jid == null) return;
    try {
      await patchJson(`/jobs/${jid}/dispatch`, {}, token);
      setActionMenu(null);
      await fetchRows();
      onChanged?.();
    } catch {
      setScheduleError('Failed to dispatch.');
    }
  };

  const resetCreateForm = () => {
    setCreateTitle('');
    setCreateDescription('');
    setCreatePriority('medium');
    setCreateCustomerId('');
    setCreateOfficerIds([]);
    setCreateLocation('');
    setCreateScheduleStart('');
    setCreateDuration('60');
    setCreateNotes('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    if (!createTitle.trim() || !token) {
      setCreateError('Job title is required.');
      return;
    }
    try {
      const res = await postJson<{ job: { id: number } }>(
        '/jobs',
        {
          title: createTitle.trim(),
          description: createDescription.trim() || undefined,
          priority: createPriority,
          officer_ids: createOfficerIds.length > 0 ? createOfficerIds : undefined,
          customer_id: createCustomerId ? parseInt(createCustomerId, 10) : undefined,
          location: createLocation.trim() || undefined,
          state: 'unscheduled',
        },
        token,
      );
      const newJobId = res.job?.id;
      if (newJobId && createScheduleStart) {
        await postJson(
          `/jobs/${newJobId}/diary-events`,
          {
            start_time: new Date(createScheduleStart).toISOString(),
            duration_minutes: parseInt(createDuration, 10) || 60,
            officer_ids: createOfficerIds.length > 0 ? createOfficerIds : null,
            notes: createNotes.trim() || null,
          },
          token,
        );
      }
      setCreateModalOpen(false);
      resetCreateForm();
      await fetchRows();
      onChanged?.();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create job.');
    }
  };

  const filtered = rows.filter((j) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const officerNames = j.officers?.map((o) => o.full_name.toLowerCase()).join(' ') ?? '';
    return (
      j.title.toLowerCase().includes(q) ||
      (j.officer_full_name?.toLowerCase().includes(q) ?? false) ||
      officerNames.includes(q) ||
      (j.customer_full_name?.toLowerCase().includes(q) ?? false) ||
      (j.location?.toLowerCase().includes(q) ?? false)
    );
  });

  const stateBadge = (state: string) => {
    const opt = SCHEDULE_STATES.find((s) => s.value === state) ?? {
      label: state,
      color: 'bg-slate-100 text-slate-600',
    };
    return (
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${opt.color}`}>
        {opt.label}
      </span>
    );
  };

  const priorityBadge = (priority: string) => {
    const opt = PRIORITY_OPTIONS.find((p) => p.value === priority) ?? PRIORITY_OPTIONS[1];
    return (
      <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${opt.color}`}>
        {opt.label}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium"
          >
            <option value="">All states</option>
            {SCHEDULE_STATES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <select
            value={officerFilter}
            onChange={(e) => setOfficerFilter(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium"
          >
            <option value="">All users</option>
            {officers.map((o) => (
              <option key={o.id} value={String(o.id)}>
                {o.full_name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              const now = new Date();
              const tz = now.getTimezoneOffset() * 60000;
              setGeneralForm({
                title: '',
                start_time: new Date(now.getTime() - tz).toISOString().slice(0, 16),
                duration_minutes: 60,
                officer_ids: officers[0] ? [officers[0].id] : [],
                notes: '',
                location: '',
              });
              setGeneralModalOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-bold text-violet-900 hover:bg-violet-100"
          >
            <CalendarPlus className="size-4" />
            Add general event
          </button>
          <button
            type="button"
            onClick={() => {
              setCreateError(null);
              resetCreateForm();
              void fetchCustomers();
              setCreateModalOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-bold text-white hover:brightness-110"
          >
            <Plus className="size-4" />
            Create New Job
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search jobs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-4 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#14B8A6]"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Job</th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">State</th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Priority</th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Assigned</th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Schedule</th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Customer</th>
                <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    No jobs in this schedule range.
                  </td>
                </tr>
              ) : (
                filtered.map((j) => (
                  <tr key={j.id} className="transition-colors hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <span className="text-sm font-semibold text-slate-900">{j.title}</span>
                      <span className="block max-w-[200px] truncate text-xs text-slate-500">
                        {j.description || '—'}
                      </span>
                    </td>
                    <td className="px-6 py-4">{stateBadge(j.state)}</td>
                    <td className="px-6 py-4">{priorityBadge(j.priority)}</td>
                    <td className="px-6 py-4 text-sm text-slate-700">
                      {j.officers && j.officers.length > 0
                        ? j.officers.map((o) => o.full_name).join(', ')
                        : j.officer_full_name || '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-700">{formatDateTime(j.schedule_start)}</td>
                    <td className="px-6 py-4 text-sm text-slate-700">{j.customer_full_name || '—'}</td>
                    <td className="relative px-6 py-4 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          if (actionMenu === j.id) setActionMenu(null);
                          else {
                            const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                            setMenuPosition({ top: rect.bottom + 4, left: rect.right - 140 });
                            setActionMenu(j.id);
                          }
                        }}
                        className="rounded p-1 transition hover:bg-slate-200"
                      >
                        <MoreVertical className="size-5 text-slate-500" />
                      </button>
                      {actionMenu === j.id &&
                        typeof document !== 'undefined' &&
                        createPortal(
                          <div
                            className="fixed z-[100] w-36 rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
                            style={{ top: menuPosition.top, left: menuPosition.left }}
                            onClick={(ev) => ev.stopPropagation()}
                          >
                            {jobApiId(j) != null && (
                              <button
                                type="button"
                                onClick={() => openScheduleModal(j)}
                                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                              >
                                <CalendarPlus className="size-4" />
                                Schedule
                              </button>
                            )}
                            {jobApiId(j) != null &&
                              ['assigned', 'scheduled', 'rescheduled'].includes(j.state) && (
                                <button
                                  type="button"
                                  onClick={() => void handleDispatch(j)}
                                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                                >
                                  <Send className="size-4" />
                                  Dispatch
                                </button>
                              )}
                          </div>,
                          document.body,
                        )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {scheduleModalOpen && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Schedule Job</h3>
            <p className="mt-1 text-sm text-slate-500">{selected.title}</p>
            <form onSubmit={(e) => void handleSchedule(e)} className="mt-6 space-y-4">
              {scheduleError && (
                <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{scheduleError}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700">Schedule date & time</label>
                <input
                  type="datetime-local"
                  value={formScheduleStart}
                  onChange={(e) => setFormScheduleStart(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Duration (minutes)</label>
                <input
                  type="number"
                  min={15}
                  step={15}
                  value={formDuration}
                  onChange={(e) => setFormDuration(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Assigned officers</label>
                <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 p-2">
                  {officers.map((o) => {
                    const checked = formOfficerIds.includes(o.id);
                    const isPrimary = formOfficerIds[0] === o.id;
                    return (
                      <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) setFormOfficerIds([...formOfficerIds, o.id]);
                            else setFormOfficerIds(formOfficerIds.filter((id) => id !== o.id));
                          }}
                          className="rounded border-slate-300 text-[#14B8A6]"
                        />
                        <span className="flex-1 text-sm text-slate-700">{o.full_name}</span>
                        {checked && (
                          <input
                            type="radio"
                            name="primary_officer"
                            checked={isPrimary}
                            onChange={() =>
                              setFormOfficerIds([o.id, ...formOfficerIds.filter((id) => id !== o.id)])
                            }
                            className="text-[#14B8A6]"
                          />
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Notes</label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setScheduleModalOpen(false)}
                  className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-bold text-white"
                >
                  Save schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {createModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setCreateModalOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-slate-900">Create New Job</h3>
            <form onSubmit={(e) => void handleCreate(e)} className="mt-6 space-y-4">
              {createError && (
                <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{createError}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700">Job title *</label>
                <input
                  type="text"
                  required
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Description</label>
                <textarea
                  rows={2}
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Priority</label>
                  <select
                    value={createPriority}
                    onChange={(e) => setCreatePriority(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    {PRIORITY_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Customer</label>
                  <select
                    value={createCustomerId}
                    onChange={(e) => setCreateCustomerId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="">— None —</option>
                    {customers.map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {c.full_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Assigned officers</label>
                <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 p-2">
                  {officers
                    .filter((o) => o.state === 'active')
                    .map((o) => {
                      const checked = createOfficerIds.includes(o.id);
                      const isPrimary = createOfficerIds[0] === o.id;
                      return (
                        <label
                          key={o.id}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) setCreateOfficerIds([...createOfficerIds, o.id]);
                              else setCreateOfficerIds(createOfficerIds.filter((id) => id !== o.id));
                            }}
                            className="rounded border-slate-300 text-[#14B8A6]"
                          />
                          <span className="flex-1 text-sm text-slate-700">{o.full_name}</span>
                          {checked && (
                            <input
                              type="radio"
                              name="create_primary_officer"
                              checked={isPrimary}
                              onChange={() =>
                                setCreateOfficerIds([
                                  o.id,
                                  ...createOfficerIds.filter((id) => id !== o.id),
                                ])
                              }
                              className="text-[#14B8A6]"
                            />
                          )}
                        </label>
                      );
                    })}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Location</label>
                <input
                  type="text"
                  value={createLocation}
                  onChange={(e) => setCreateLocation(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="border-t border-slate-200 pt-4">
                <p className="mb-2 text-sm font-medium text-slate-700">Schedule now (optional)</p>
                <div className="grid grid-cols-2 gap-4">
                  <input
                    type="datetime-local"
                    value={createScheduleStart}
                    onChange={(e) => setCreateScheduleStart(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                  <input
                    type="number"
                    min={15}
                    step={15}
                    value={createDuration}
                    onChange={(e) => setCreateDuration(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                <textarea
                  value={createNotes}
                  onChange={(e) => setCreateNotes(e.target.value)}
                  rows={2}
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Notes"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-bold text-white"
                >
                  Create job
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <GeneralDiaryEventModal
        open={generalModalOpen}
        initialForm={generalForm}
        officers={officers.map((o) => ({ id: o.id, full_name: o.full_name }))}
        token={token}
        onClose={() => setGeneralModalOpen(false)}
        onSaved={() => {
          setGeneralModalOpen(false);
          void fetchRows();
          onChanged?.();
        }}
      />
    </div>
  );
}
