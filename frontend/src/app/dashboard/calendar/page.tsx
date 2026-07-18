'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CalendarDays, List, Loader2 } from 'lucide-react';
import { getJson, postJson } from '../../apiClient';
import { GeneralDiaryEventModal, type GeneralDiaryEventForm } from '../diary/GeneralDiaryEventModal';
import { diaryEventToVisit } from '../diary/calendarVisit';
import { DispatchPanel } from './DispatchPanel';
import { EventLayersBar } from './EventLayersBar';
import { OpsCalendarGrid } from './OpsCalendarGrid';
import { useCalendarData } from './useCalendarData';
import type {
  CalendarOfficer,
  CalendarViewMode,
  CalendarWorkspaceMode,
  EventLayers,
  HighlightedJob,
  MergedCalendarEvent,
} from './calendarTypes';

function toLocalInputValue(d: Date): string {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

function CalendarPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialJobId = searchParams.get('jobId');
  const initialMode = searchParams.get('mode') === 'dispatch' ? 'dispatch' : 'calendar';

  const [workspaceMode, setWorkspaceMode] = useState<CalendarWorkspaceMode>(initialMode);
  const [date, setDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<CalendarViewMode>('daily');
  const [layers, setLayers] = useState<EventLayers>({ leave: true, holidays: true });

  const { token, officers, events, loading, error, refresh, holidayLayersAllowed } = useCalendarData(
    date,
    viewMode,
    layers,
  );

  const [highlightedJob, setHighlightedJob] = useState<HighlightedJob | null>(null);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleForm, setScheduleForm] = useState({
    start_time: '',
    duration_minutes: 60,
    officer_ids: [] as number[],
    notes: '',
  });

  const [generalModalOpen, setGeneralModalOpen] = useState(false);
  const [generalForm, setGeneralForm] = useState<GeneralDiaryEventForm>({
    title: '',
    start_time: '',
    duration_minutes: 60,
    officer_ids: [],
    notes: '',
    location: '',
  });

  const [selectedEvent, setSelectedEvent] = useState<MergedCalendarEvent | null>(null);

  useEffect(() => {
    if (!initialJobId || !token) return;
    void getJson<{ job: HighlightedJob }>(`/jobs/${initialJobId}`, token)
      .then((res) => {
        if (res.job) setHighlightedJob(res.job);
      })
      .catch(() => undefined);
  }, [initialJobId, token]);

  useEffect(() => {
    if (searchParams.get('mode') === 'dispatch') setWorkspaceMode('dispatch');
  }, [searchParams]);

  const clearHighlight = useCallback(() => {
    setHighlightedJob(null);
    router.replace('/dashboard/calendar');
  }, [router]);

  const openSlot = useCallback(
    (officer: CalendarOfficer, localDateTime: Date) => {
      const localIso = toLocalInputValue(localDateTime);
      if (highlightedJob) {
        setScheduleForm({
          start_time: localIso,
          duration_minutes: 60,
          officer_ids: [officer.id],
          notes: '',
        });
        setScheduleError(null);
        setScheduleModalOpen(true);
        return;
      }
      setGeneralForm({
        title: '',
        start_time: localIso,
        duration_minutes: 60,
        officer_ids: [officer.id],
        notes: '',
        location: '',
      });
      setGeneralModalOpen(true);
    },
    [highlightedJob],
  );

  const handleBookJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!highlightedJob || !token) return;
    setScheduleSaving(true);
    setScheduleError(null);
    try {
      await postJson(
        `/jobs/${highlightedJob.id}/diary-events`,
        {
          start_time: scheduleForm.start_time
            ? new Date(scheduleForm.start_time).toISOString()
            : null,
          duration_minutes: scheduleForm.duration_minutes,
          officer_ids: scheduleForm.officer_ids.length > 0 ? scheduleForm.officer_ids : null,
          notes: scheduleForm.notes.trim() || null,
        },
        token,
      );
      setScheduleModalOpen(false);
      clearHighlight();
      await refresh();
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : 'Failed to book visit');
    } finally {
      setScheduleSaving(false);
    }
  };

  const highlightBanner = highlightedJob ? (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-[13px] text-emerald-800">
      <p className="font-semibold">
        Booking job {highlightedJob.job_number || `#${highlightedJob.id}`}: {highlightedJob.title}
      </p>
      <p className="mt-1 text-emerald-700">
        Select a time slot on the daily timeline to place this visit.
      </p>
      <button
        type="button"
        onClick={clearHighlight}
        className="mt-2 text-xs font-bold underline hover:text-emerald-950"
      >
        Clear selection
      </button>
    </div>
  ) : null;

  const selectedDiaryVisit =
    selectedEvent?.type === 'diary' && selectedEvent.raw
      ? diaryEventToVisit(selectedEvent.raw as Parameters<typeof diaryEventToVisit>[0])
      : null;

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">Calendar</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Visits, leave overlays, and dispatch in one place.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => {
                  setWorkspaceMode('calendar');
                  router.replace(
                    highlightedJob
                      ? `/dashboard/calendar?jobId=${highlightedJob.id}`
                      : '/dashboard/calendar',
                  );
                }}
                className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-bold ${
                  workspaceMode === 'calendar'
                    ? 'bg-white text-[#14B8A6] shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <CalendarDays className="size-4" />
                Calendar
              </button>
              <button
                type="button"
                onClick={() => {
                  setWorkspaceMode('dispatch');
                  router.replace('/dashboard/calendar?mode=dispatch');
                }}
                className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-bold ${
                  workspaceMode === 'dispatch'
                    ? 'bg-white text-[#14B8A6] shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <List className="size-4" />
                Dispatch
              </button>
            </div>
            {workspaceMode === 'calendar' && (
              <EventLayersBar
                showLeaveToggle={holidayLayersAllowed}
                leave={layers.leave}
                holidays={layers.holidays}
                onChange={setLayers}
              />
            )}
          </div>
        </div>
      </div>

      <div className="w-full px-3 py-4 sm:px-4 lg:px-6">
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {workspaceMode === 'dispatch' ? (
          <DispatchPanel token={token} onChanged={() => void refresh()} />
        ) : loading && events.length === 0 ? (
          <div className="flex items-center justify-center py-24 text-slate-400">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : (
          <OpsCalendarGrid
            officers={officers}
            events={events}
            date={date}
            onDateChange={setDate}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onSelectEvent={setSelectedEvent}
            onSlotClick={openSlot}
            highlightBanner={highlightBanner}
          />
        )}
      </div>

      {selectedEvent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSelectedEvent(null)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {selectedDiaryVisit ? (
              <>
                <h3 className="text-lg font-bold text-slate-900">{selectedDiaryVisit.title}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedDiaryVisit.customerName}
                  {selectedDiaryVisit.jobNumber ? ` · ${selectedDiaryVisit.jobNumber}` : ''}
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  {new Date(selectedDiaryVisit.startTime).toLocaleString()} ·{' '}
                  {selectedDiaryVisit.durationMinutes} min
                </p>
                {selectedDiaryVisit.officerNames && (
                  <p className="mt-1 text-sm text-slate-500">{selectedDiaryVisit.officerNames}</p>
                )}
                {selectedDiaryVisit.notes && (
                  <p className="mt-3 text-sm text-slate-600">{selectedDiaryVisit.notes}</p>
                )}
              </>
            ) : (
              <>
                <h3 className="text-lg font-bold text-slate-900">{selectedEvent.title}</h3>
                <p className="mt-2 text-sm text-slate-500">
                  {selectedEvent.allDay
                    ? 'All day'
                    : `${selectedEvent.start.toLocaleString()} – ${selectedEvent.end.toLocaleString()}`}
                </p>
              </>
            )}
            <button
              type="button"
              className="mt-4 rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700"
              onClick={() => setSelectedEvent(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {scheduleModalOpen && highlightedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Book visit</h3>
            <p className="mt-1 text-sm text-slate-500">{highlightedJob.title}</p>
            <form onSubmit={(e) => void handleBookJob(e)} className="mt-6 space-y-4">
              {scheduleError && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{scheduleError}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700">Start</label>
                <input
                  type="datetime-local"
                  value={scheduleForm.start_time}
                  onChange={(e) =>
                    setScheduleForm((f) => ({ ...f, start_time: e.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Duration (min)</label>
                <input
                  type="number"
                  min={15}
                  step={15}
                  value={scheduleForm.duration_minutes}
                  onChange={(e) =>
                    setScheduleForm((f) => ({
                      ...f,
                      duration_minutes: parseInt(e.target.value, 10) || 60,
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Officers</label>
                <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 p-2">
                  {officers.map((o) => (
                    <label key={o.id} className="flex items-center gap-2 px-1 py-1 text-sm">
                      <input
                        type="checkbox"
                        checked={scheduleForm.officer_ids.includes(o.id)}
                        onChange={(e) => {
                          setScheduleForm((f) => ({
                            ...f,
                            officer_ids: e.target.checked
                              ? [...f.officer_ids, o.id]
                              : f.officer_ids.filter((id) => id !== o.id),
                          }));
                        }}
                      />
                      {o.full_name}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Notes</label>
                <textarea
                  value={scheduleForm.notes}
                  onChange={(e) => setScheduleForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setScheduleModalOpen(false)}
                  className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={scheduleSaving}
                  className="flex-1 rounded-lg bg-[#14B8A6] py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                  {scheduleSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <GeneralDiaryEventModal
        open={generalModalOpen}
        initialForm={generalForm}
        officers={officers}
        token={token}
        onClose={() => setGeneralModalOpen(false)}
        onSaved={() => {
          setGeneralModalOpen(false);
          void refresh();
        }}
      />
    </main>
  );
}

export default function CalendarPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-slate-400">
          <Loader2 className="size-6 animate-spin" />
        </div>
      }
    >
      <CalendarPageInner />
    </Suspense>
  );
}
