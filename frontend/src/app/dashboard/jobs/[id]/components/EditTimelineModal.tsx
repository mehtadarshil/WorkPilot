'use client';

import { useState, useEffect } from 'react';
import { Loader2, Trash2, X, Plus } from 'lucide-react';
import dayjs from 'dayjs';
import { putJson } from '../../../../apiClient';
import type { VisitStatusLog, VisitTimesheetSegment } from '../visitStatusLabels';

interface Props {
  open: boolean;
  token: string;
  diaryEventId: number;
  initialStatusLogs: VisitStatusLog[];
  initialTimesheetEntries: VisitTimesheetSegment[];
  onClose: () => void;
  onSaved: () => void;
}

type EditableStatusLog = {
  status: string;
  timestamp: string; // YYYY-MM-DDTHH:mm:ss format
  latitude: number | null;
  longitude: number | null;
};

type EditableTimesheetSegment = {
  segment_type: string | null;
  clock_in: string; // YYYY-MM-DDTHH:mm:ss format
  clock_out: string | null; // YYYY-MM-DDTHH:mm:ss format or null
  notes: string | null;
  isInProgress: boolean;
};

function toLocalDatetimeString(isoString: string | null | undefined): string {
  if (!isoString) return '';
  const d = dayjs(isoString);
  return d.isValid() ? d.format('YYYY-MM-DDTHH:mm:ss') : '';
}

function fromLocalDatetimeString(localString: string): string {
  if (!localString) return new Date().toISOString();
  return dayjs(localString).toISOString();
}

function getDatePart(localString: string): string {
  if (!localString || localString.length < 10) return '';
  return localString.substring(0, 10);
}

function getTimePart(localString: string): string {
  if (!localString || localString.length < 16) return '';
  return localString.substring(11, 19);
}

function combineDateTimeParts(datePart: string, timePart: string): string {
  const d = datePart || dayjs().format('YYYY-MM-DD');
  const t = timePart || '00:00:00';
  const fullTime = t.split(':').length === 2 ? `${t}:00` : t;
  return `${d}T${fullTime}`;
}

export default function EditTimelineModal({
  open,
  token,
  diaryEventId,
  initialStatusLogs,
  initialTimesheetEntries,
  onClose,
  onSaved,
}: Props) {
  const [statusLogs, setStatusLogs] = useState<EditableStatusLog[]>([]);
  const [timesheetEntries, setTimesheetEntries] = useState<EditableTimesheetSegment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setStatusLogs(
      initialStatusLogs.map((log) => ({
        status: log.status,
        timestamp: toLocalDatetimeString(log.timestamp),
        latitude: log.latitude,
        longitude: log.longitude,
      })),
    );
    setTimesheetEntries(
      initialTimesheetEntries.map((entry) => ({
        segment_type: entry.segment_type,
        clock_in: toLocalDatetimeString(entry.clock_in),
        clock_out: entry.clock_out ? toLocalDatetimeString(entry.clock_out) : '',
        notes: entry.notes || '',
        isInProgress: !entry.clock_out,
      })),
    );
  }, [open, initialStatusLogs, initialTimesheetEntries]);

  if (!open) return null;

  const handleAddStatusLog = () => {
    setStatusLogs((prev) => [
      ...prev,
      {
        status: 'travelling_to_site',
        timestamp: toLocalDatetimeString(new Date().toISOString()),
        latitude: null,
        longitude: null,
      },
    ]);
  };

  const handleRemoveStatusLog = (index: number) => {
    setStatusLogs((prev) => prev.filter((_, i) => i !== index));
  };

  const handleStatusLogChange = (index: number, patch: Partial<EditableStatusLog>) => {
    setStatusLogs((prev) =>
      prev.map((log, i) => (i === index ? { ...log, ...patch } : log)),
    );
  };

  const handleAddTimesheetEntry = () => {
    setTimesheetEntries((prev) => [
      ...prev,
      {
        segment_type: 'travelling',
        clock_in: toLocalDatetimeString(new Date().toISOString()),
        clock_out: '',
        notes: '',
        isInProgress: true,
      },
    ]);
  };

  const handleRemoveTimesheetEntry = (index: number) => {
    setTimesheetEntries((prev) => prev.filter((_, i) => i !== index));
  };

  const handleTimesheetEntryChange = (index: number, patch: Partial<EditableTimesheetSegment>) => {
    setTimesheetEntries((prev) =>
      prev.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    );
  };

  const handleSave = async () => {
    setError(null);
    setBusy(true);

    try {
      // Basic validations
      for (const log of statusLogs) {
        if (!log.timestamp) {
          throw new Error('All status log entries must have a timestamp');
        }
      }
      for (const entry of timesheetEntries) {
        if (!entry.clock_in) {
          throw new Error('All timesheet segments must have a started time');
        }
        if (!entry.isInProgress && !entry.clock_out) {
          throw new Error('All completed timesheet segments must have an ended time');
        }
        if (!entry.isInProgress && entry.clock_in && entry.clock_out) {
          const start = dayjs(entry.clock_in);
          const end = dayjs(entry.clock_out);
          if (end.isBefore(start)) {
            throw new Error('Segment ended time cannot be before started time');
          }
        }
      }

      const payload = {
        status_logs: statusLogs.map((log) => ({
          status: log.status,
          timestamp: fromLocalDatetimeString(log.timestamp),
          latitude: log.latitude,
          longitude: log.longitude,
        })),
        timesheet_entries: timesheetEntries.map((entry) => ({
          segment_type: entry.segment_type,
          clock_in: fromLocalDatetimeString(entry.clock_in),
          clock_out: entry.isInProgress ? null : fromLocalDatetimeString(entry.clock_out || ''),
          notes: entry.notes || null,
        })),
      };

      await putJson(`/diary-events/${diaryEventId}/timeline`, payload, token);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update timeline');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="w-full max-w-5xl rounded-2xl bg-white p-6 shadow-2xl flex flex-col my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 font-sans">Edit travel &amp; status timeline</h2>
            <p className="text-xs text-slate-500 font-sans mt-0.5">Adjust status logs and timesheet segments to correct engineer times.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100">
            <X className="size-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-rose-600 font-medium font-sans">
            {error}
          </div>
        )}

        {/* Form Body - Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 overflow-y-auto max-h-[60vh] pb-4 pr-1">
          {/* Status Timeline Column */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-sm font-bold text-slate-700 font-sans uppercase tracking-wider">
                Travel &amp; Status Logs
              </h3>
              <button
                type="button"
                onClick={handleAddStatusLog}
                className="inline-flex items-center gap-1 text-xs font-bold text-[#14B8A6] hover:text-[#119f8e]"
              >
                <Plus className="size-3.5" /> Add Log
              </button>
            </div>

            {statusLogs.length === 0 ? (
              <p className="text-sm text-slate-400 italic py-4 text-center font-sans">No status logs recorded.</p>
            ) : (
              <div className="space-y-3">
                {statusLogs.map((log, index) => (
                  <div key={index} className="flex items-start gap-2 bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 flex-1">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 font-sans">
                          Status
                        </label>
                        <select
                          value={log.status}
                          onChange={(e) => handleStatusLogChange(index, { status: e.target.value })}
                          className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-[#14B8A6] font-sans"
                        >
                          <option value="travelling_to_site">Travelling to site</option>
                          <option value="arrived_at_site">Arrived at site</option>
                          <option value="job_report_submitted">Job report submitted</option>
                          <option value="completed">Completed</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 font-sans">
                          Timestamp
                        </label>
                        <div className="flex gap-1.5">
                          <input
                            type="date"
                            value={getDatePart(log.timestamp)}
                            onChange={(e) => {
                              const dateVal = e.target.value;
                              const timeVal = getTimePart(log.timestamp) || '00:00:00';
                              handleStatusLogChange(index, { timestamp: combineDateTimeParts(dateVal, timeVal) });
                            }}
                            className="flex-1 min-w-0 rounded border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-[#14B8A6] font-mono"
                          />
                          <input
                            type="time"
                            step="1"
                            value={getTimePart(log.timestamp) || ''}
                            onChange={(e) => {
                              const dateVal = getDatePart(log.timestamp) || dayjs().format('YYYY-MM-DD');
                              const timeVal = e.target.value;
                              handleStatusLogChange(index, { timestamp: combineDateTimeParts(dateVal, timeVal) });
                            }}
                            className="w-[100px] shrink-0 rounded border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-[#14B8A6] font-mono"
                          />
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveStatusLog(index)}
                      className="mt-5 p-1 text-rose-500 hover:bg-rose-50 rounded"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Timesheet Segments Column */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-sm font-bold text-slate-700 font-sans uppercase tracking-wider">
                Recorded Timesheet Segments
              </h3>
              <button
                type="button"
                onClick={handleAddTimesheetEntry}
                className="inline-flex items-center gap-1 text-xs font-bold text-[#14B8A6] hover:text-[#119f8e]"
              >
                <Plus className="size-3.5" /> Add Segment
              </button>
            </div>

            {timesheetEntries.length === 0 ? (
              <p className="text-sm text-slate-400 italic py-4 text-center font-sans">No timesheet segments recorded.</p>
            ) : (
              <div className="space-y-3">
                {timesheetEntries.map((entry, index) => (
                  <div key={index} className="space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <div className="flex items-start gap-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 flex-1">
                        <div className="sm:col-span-2">
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 font-sans">
                            Type
                          </label>
                          <select
                            value={entry.segment_type || ''}
                            onChange={(e) => handleTimesheetEntryChange(index, { segment_type: e.target.value })}
                            className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-[#14B8A6] font-sans"
                          >
                            <option value="travelling">Travelling</option>
                            <option value="on_site">On site</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 font-sans">
                            Started
                          </label>
                          <div className="flex gap-1.5">
                            <input
                              type="date"
                              value={getDatePart(entry.clock_in)}
                              onChange={(e) => {
                                const dateVal = e.target.value;
                                const timeVal = getTimePart(entry.clock_in) || '00:00:00';
                                handleTimesheetEntryChange(index, { clock_in: combineDateTimeParts(dateVal, timeVal) });
                              }}
                              className="flex-1 min-w-0 rounded border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-[#14B8A6] font-mono"
                            />
                            <input
                              type="time"
                              step="1"
                              value={getTimePart(entry.clock_in) || ''}
                              onChange={(e) => {
                                const dateVal = getDatePart(entry.clock_in) || dayjs().format('YYYY-MM-DD');
                                const timeVal = e.target.value;
                                handleTimesheetEntryChange(index, { clock_in: combineDateTimeParts(dateVal, timeVal) });
                              }}
                              className="w-[100px] shrink-0 rounded border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-[#14B8A6] font-mono"
                            />
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 font-sans">
                              Ended
                            </label>
                            <label className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={entry.isInProgress}
                                onChange={(e) =>
                                  handleTimesheetEntryChange(index, {
                                    isInProgress: e.target.checked,
                                    clock_out: e.target.checked ? '' : toLocalDatetimeString(new Date().toISOString()),
                                  })
                                }
                                className="rounded text-[#14B8A6] focus:ring-[#14B8A6]/30 size-3"
                              />
                              Open
                            </label>
                          </div>
                          <div className="flex gap-1.5">
                            <input
                              type="date"
                              value={getDatePart(entry.clock_out || '')}
                              disabled={entry.isInProgress}
                              onChange={(e) => {
                                const dateVal = e.target.value;
                                const timeVal = getTimePart(entry.clock_out || '') || '00:00:00';
                                handleTimesheetEntryChange(index, { clock_out: combineDateTimeParts(dateVal, timeVal) });
                              }}
                              className="flex-1 min-w-0 rounded border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-[#14B8A6] disabled:bg-slate-100 disabled:text-slate-400 font-mono"
                            />
                            <input
                              type="time"
                              step="1"
                              value={getTimePart(entry.clock_out || '') || ''}
                              disabled={entry.isInProgress}
                              onChange={(e) => {
                                const dateVal = getDatePart(entry.clock_out || '') || dayjs().format('YYYY-MM-DD');
                                const timeVal = e.target.value;
                                handleTimesheetEntryChange(index, { clock_out: combineDateTimeParts(dateVal, timeVal) });
                              }}
                              className="w-[100px] shrink-0 rounded border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-[#14B8A6] disabled:bg-slate-100 disabled:text-slate-400 font-mono"
                            />
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveTimesheetEntry(index)}
                        className="self-center p-1 text-rose-500 hover:bg-rose-50 rounded"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>

                    <div>
                      <input
                        value={entry.notes || ''}
                        onChange={(e) => handleTimesheetEntryChange(index, { notes: e.target.value })}
                        className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-[#14B8A6] font-sans"
                        placeholder="Segment notes (optional)"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 border-t border-slate-100 pt-4 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 font-sans"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleSave()}
            className="flex-1 inline-flex items-center justify-center rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-bold text-white hover:bg-[#119f8e] disabled:opacity-50 font-sans"
          >
            {busy ? <Loader2 className="size-4 animate-spin font-sans mr-2" /> : null}
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
