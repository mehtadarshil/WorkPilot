'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, User } from 'lucide-react';
import { getJson } from '../../apiClient';

export interface UserDetailSubject {
  id: number;
  full_name: string;
  role_position: string | null;
  department: string | null;
  phone: string | null;
  email: string | null;
  system_access_level: string | null;
  state: string;
  has_mobile_login?: boolean;
}

interface TimesheetEntry {
  id: number;
  officer_id: number;
  clock_in: string;
  clock_out: string | null;
  notes: string | null;
  segment_type: string | null;
  diary_event_id: number | null;
  duration_seconds: number;
}

function segmentTypeLabel(segment: string | null | undefined): string {
  if (!segment) return '—';
  if (segment === 'travelling') return 'Travelling';
  if (segment === 'on_site') return 'On site';
  return segment;
}

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

function formatDuration(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

const STATE_LABELS: Record<string, string> = {
  active: 'Active',
  inactive: 'Inactive',
  on_leave: 'On leave',
  suspended: 'Suspended',
  archived: 'Archived',
};

type TabId = 'overview' | 'timesheet';

export function UserDetailModal({
  user,
  token,
  onClose,
}: {
  user: UserDetailSubject;
  token: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<TabId>('overview');
  const [entries, setEntries] = useState<TimesheetEntry[]>([]);
  const [timesheetLoading, setTimesheetLoading] = useState(false);
  const [timesheetError, setTimesheetError] = useState<string | null>(null);
  const [timesheetFetched, setTimesheetFetched] = useState(false);

  const loadTimesheet = useCallback(async () => {
    setTimesheetLoading(true);
    setTimesheetError(null);
    try {
      const data = await getJson<{ entries: TimesheetEntry[] }>(
        `/officers/${user.id}/timesheet-history?limit=100`,
        token,
      );
      setEntries(data.entries ?? []);
      setTimesheetFetched(true);
    } catch (e) {
      setTimesheetError(e instanceof Error ? e.message : 'Failed to load timesheet');
      setEntries([]);
      setTimesheetFetched(true);
    } finally {
      setTimesheetLoading(false);
    }
  }, [user.id, token]);

  useEffect(() => {
    if (tab === 'timesheet' && !timesheetFetched) {
      void loadTimesheet();
    }
  }, [tab, timesheetFetched, loadTimesheet]);

  const openTimesheetTab = () => {
    setTab('timesheet');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900">User details</h3>
              <p className="mt-0.5 text-sm text-slate-600">{user.full_name}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-slate-500 hover:bg-slate-100"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <div className="mt-4 flex gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setTab('overview')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition ${
                tab === 'overview'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <User className="size-4" />
              Overview
            </button>
            <button
              type="button"
              onClick={openTimesheetTab}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition ${
                tab === 'timesheet'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clock className="size-4" />
              Timesheet
            </button>
          </div>
        </div>

        <div className="max-h-[calc(90vh-8rem)] overflow-y-auto px-6 py-5">
          {tab === 'overview' && (
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</dt>
                <dd className="mt-1 text-sm text-slate-900">{user.email || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Phone</dt>
                <dd className="mt-1 text-sm text-slate-900">{user.phone || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Role</dt>
                <dd className="mt-1 text-sm text-slate-900">{user.role_position || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Department</dt>
                <dd className="mt-1 text-sm text-slate-900">{user.department || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Access level</dt>
                <dd className="mt-1 text-sm capitalize text-slate-900">{user.system_access_level || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</dt>
                <dd className="mt-1 text-sm text-slate-900">
                  {STATE_LABELS[user.state] ?? user.state}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mobile app</dt>
                <dd className="mt-1 text-sm text-slate-900">
                  {user.has_mobile_login ? (
                    <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-800">
                      Enabled
                    </span>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
            </dl>
          )}

          {tab === 'timesheet' && (
            <div>
              <p className="mb-4 text-sm text-slate-600">
                Time segments from diary visit status (travelling, on site, completed), recorded automatically in the
                field app.
              </p>
              {timesheetLoading && entries.length === 0 && (
                <p className="py-8 text-center text-sm text-slate-500">Loading…</p>
              )}
              {timesheetError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                  {timesheetError}
                  <button
                    type="button"
                    onClick={() => {
                      setTimesheetError(null);
                      void loadTimesheet();
                    }}
                    className="ml-2 font-semibold underline"
                  >
                    Retry
                  </button>
                </div>
              )}
              {!timesheetLoading && !timesheetError && entries.length === 0 && (
                <p className="py-8 text-center text-sm text-slate-500">No timesheet entries yet.</p>
              )}
              {entries.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Start</th>
                        <th className="px-3 py-2">End</th>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2">Duration</th>
                        <th className="px-3 py-2">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {entries.map((row) => (
                        <tr key={row.id} className="bg-white">
                          <td className="whitespace-nowrap px-3 py-2.5 text-slate-800">
                            {formatDateTime(row.clock_in)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-slate-800">
                            {row.clock_out ? formatDateTime(row.clock_out) : (
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900">
                                In progress
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">
                            {segmentTypeLabel(row.segment_type)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 font-mono text-slate-700">
                            {formatDuration(row.duration_seconds)}
                          </td>
                          <td className="max-w-[200px] truncate px-3 py-2.5 text-slate-600" title={row.notes ?? ''}>
                            {row.notes || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
}
