'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Calendar,
  List,
  ChevronLeft,
  ChevronRight,
  ChevronsLeftRight,
  Search,
  MoreVertical,
  Send,
  CalendarPlus,
  Plus,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { Calendar as BigCalendar, dateFnsLocalizer } from 'react-big-calendar';
import {
  format,
  parse,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isSameDay,
  getDay,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  addDays,
  startOfDay,
  addHours,
} from 'date-fns';
import { useSearchParams } from 'next/navigation';
import { CalendarDays, Map as MapIcon, Users, UserCircle2 } from 'lucide-react';
import { enUS } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { getJson, patchJson, postJson } from '../../apiClient';

interface ScheduledJob {
  id: number;
  title: string;
  description: string | null;
  priority: string;
  responsible_person: string | null;
  officer_id: number | null;
  officer_full_name: string | null;
  start_date: string | null;
  deadline: string | null;
  customer_id: number | null;
  customer_full_name: string | null;
  location: string | null;
  required_certifications: string | null;
  state: string;
  schedule_start: string | null;
  duration_minutes: number | null;
  scheduling_notes: string | null;
  dispatched_at: string | null;
  created_at: string;
  updated_at: string;
}

interface Officer {
  id: number;
  full_name: string;
  role_position: string | null;
  department: string | null;
  state: string;
}

interface Customer {
  id: number;
  full_name: string;
  email: string;
}

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales: { 'en-US': enUS },
});

const SCHEDULE_STATES = [
  { value: 'unscheduled', label: 'Unscheduled', color: 'bg-slate-100 text-slate-600' },
  { value: 'scheduled', label: 'Scheduled', color: 'bg-indigo-100 text-indigo-800' },
  { value: 'assigned', label: 'Assigned', color: 'bg-violet-100 text-violet-800' },
  { value: 'rescheduled', label: 'Rescheduled', color: 'bg-amber-100 text-amber-800' },
  { value: 'dispatched', label: 'Dispatched', color: 'bg-blue-100 text-blue-800' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-amber-100 text-amber-800' },
  { value: 'completed', label: 'Completed', color: 'bg-emerald-100 text-emerald-800' },
] as const;

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low', color: 'bg-slate-100 text-slate-600' },
  { value: 'medium', label: 'Medium', color: 'bg-blue-100 text-blue-800' },
  { value: 'high', label: 'High', color: 'bg-amber-100 text-amber-800' },
  { value: 'critical', label: 'Critical', color: 'bg-rose-100 text-rose-800' },
] as const;

/** Full day on the daily diary (scroll horizontally if the viewport is narrow). */
const DAILY_TIMELINE_START_HOUR = 0;
const DAILY_TIMELINE_END_HOUR = 24;
const DAILY_TIMELINE_HOUR_COUNT = DAILY_TIMELINE_END_HOUR - DAILY_TIMELINE_START_HOUR;
const DAILY_TIMELINE_MINUTES = DAILY_TIMELINE_HOUR_COUNT * 60;
const DAILY_TIMELINE_MIN_WIDTH_PX = DAILY_TIMELINE_HOUR_COUNT * 52;

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function jobToEvent(j: ScheduledJob): { id: number; title: string; start: Date; end: Date; job: ScheduledJob } {
  const start = j.schedule_start ? new Date(j.schedule_start) : (j.start_date ? new Date(j.start_date) : new Date());
  const duration = j.duration_minutes ?? 60;
  const end = new Date(start.getTime() + duration * 60 * 1000);
  return {
    id: j.id,
    title: `${j.title}${j.officer_full_name ? ` • ${j.officer_full_name}` : ''}`,
    start,
    end,
    job: j,
  };
}

export default function SchedulingPage() {
  const searchParams = useSearchParams();
  const initialJobId = searchParams.get('jobId');
  const [viewMode, setViewMode] = useState<'list' | 'calendar' | 'daily'>('daily');
  const [highlightedJob, setHighlightedJob] = useState<ScheduledJob | null>(null);
  const [activeMonthDate, setActiveMonthDate] = useState(new Date());
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [stateFilter, setStateFilter] = useState('');
  const [officerFilter, setOfficerFilter] = useState('');
  const [search, setSearch] = useState('');
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<ScheduledJob | null>(null);
  const [actionMenu, setActionMenu] = useState<number | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const [formScheduleStart, setFormScheduleStart] = useState('');
  const [formDuration, setFormDuration] = useState('60');
  const [formOfficerId, setFormOfficerId] = useState<string>('');
  const [formNotes, setFormNotes] = useState('');

  const [createTitle, setCreateTitle] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createPriority, setCreatePriority] = useState('medium');
  const [createCustomerId, setCreateCustomerId] = useState<string>('');
  const [createOfficerId, setCreateOfficerId] = useState<string>('');
  const [createLocation, setCreateLocation] = useState('');
  const [createScheduleStart, setCreateScheduleStart] = useState('');
  const [createDuration, setCreateDuration] = useState('60');
  const [createNotes, setCreateNotes] = useState('');

  const diaryTimelineScrollRef = useRef<HTMLDivElement>(null);
  const [diaryTimelineScrollHints, setDiaryTimelineScrollHints] = useState({ left: false, right: false });
  const [diaryTimelineHasOverflow, setDiaryTimelineHasOverflow] = useState(false);

  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  const updateDiaryTimelineScrollHints = useCallback(() => {
    const el = diaryTimelineScrollRef.current;
    if (!el) {
      setDiaryTimelineScrollHints({ left: false, right: false });
      setDiaryTimelineHasOverflow(false);
      return;
    }
    const { scrollLeft, clientWidth, scrollWidth } = el;
    const overflow = scrollWidth > clientWidth + 2;
    setDiaryTimelineHasOverflow(overflow);
    if (!overflow) {
      setDiaryTimelineScrollHints({ left: false, right: false });
      return;
    }
    const maxScroll = scrollWidth - clientWidth;
    const epsilon = 3;
    setDiaryTimelineScrollHints({
      left: scrollLeft > epsilon,
      right: scrollLeft < maxScroll - epsilon,
    });
  }, []);

  useEffect(() => {
    if (viewMode !== 'daily') return;
    updateDiaryTimelineScrollHints();
    const el = diaryTimelineScrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => updateDiaryTimelineScrollHints());
    ro.observe(el);
    window.addEventListener('resize', updateDiaryTimelineScrollHints);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateDiaryTimelineScrollHints);
    };
  }, [viewMode, calendarDate, officers.length, jobs.length, updateDiaryTimelineScrollHints]);

  useEffect(() => {
    setActiveMonthDate(calendarDate);
  }, [calendarDate]);

  useEffect(() => {
    if (initialJobId) {
       getJson<{ job: ScheduledJob }>(`/jobs/${initialJobId}`, token!).then(res => {
          if (res.job) setHighlightedJob(res.job);
       }).catch(console.error);
    }
  }, [initialJobId, token]);

  const fromDate = startOfMonth(activeMonthDate).toISOString().slice(0, 10);
  const toDate = endOfMonth(activeMonthDate).toISOString().slice(0, 10);

  const fetchScheduling = useCallback(async () => {
    if (!token) return;
    try {
      const params = new URLSearchParams();
      params.set('from', fromDate);
      params.set('to', toDate);
      params.set('include_unscheduled', 'true');
      if (stateFilter) params.set('state', stateFilter);
      if (officerFilter) params.set('officer_id', officerFilter);
      const data = await getJson<{ events: any[] }>(`/diary-events?${params.toString()}`, token);
      const mappedEvents = (data.events || []).map(e => ({
        id: e.diary_id,
        job_id: e.job_id,
        title: e.title || 'Untitled Job',
        description: e.description,
        officer_id: e.officer_id,
        officer_full_name: e.officer_full_name,
        customer_id: e.customer_id,
        customer_full_name: e.customer_full_name,
        location: e.location,
        state: e.event_status,
        schedule_start: e.start_time,
        duration_minutes: e.duration_minutes,
        scheduling_notes: e.notes
      })) as unknown as ScheduledJob[];
      setJobs(mappedEvents);
    } catch {
      setJobs([]);
    }
  }, [token, fromDate, toDate, stateFilter, officerFilter, activeMonthDate]);

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
    fetchScheduling();
  }, [fetchScheduling]);

  useEffect(() => {
    if (scheduleModalOpen) fetchOfficers();
  }, [scheduleModalOpen, fetchOfficers]);

  useEffect(() => {
    if (createModalOpen) {
      fetchOfficers();
      fetchCustomers();
    }
  }, [createModalOpen, fetchOfficers, fetchCustomers]);

  useEffect(() => {
    if (actionMenu === null) return;
    const close = () => setActionMenu(null);
    const t = setTimeout(() => document.addEventListener('click', close), 100);
    return () => {
      clearTimeout(t);
      document.removeEventListener('click', close);
    };
  }, [actionMenu]);

  const openScheduleModal = (job: ScheduledJob) => {
    setSelectedJob(job);
    setFormScheduleStart(job.schedule_start ? job.schedule_start.slice(0, 16) : '');
    setFormDuration(String(job.duration_minutes ?? 60));
    setFormOfficerId(job.officer_id ? String(job.officer_id) : '');
    setFormNotes(job.scheduling_notes ?? '');
    setScheduleError(null);
    setActionMenu(null);
    setScheduleModalOpen(true);
  };

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setScheduleError(null);
    if (!selectedJob || !token) return;
    try {
      await postJson<{ event: unknown }>(
        `/jobs/${selectedJob.id}/diary-events`,
        {
          start_time: formScheduleStart ? new Date(formScheduleStart).toISOString() : null,
          duration_minutes: parseInt(formDuration, 10) || 60,
          officer_id: formOfficerId ? parseInt(formOfficerId, 10) : null,
          notes: formNotes.trim() || null,
        },
        token,
      );
      setScheduleModalOpen(false);
      setSelectedJob(null);
      fetchScheduling();
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : 'Failed to schedule.');
    }
  };

  const handleDispatch = async (job: ScheduledJob) => {
    if (!token) return;
    try {
      await patchJson<{ job: unknown }>(`/jobs/${job.id}/dispatch`, {}, token);
      setActionMenu(null);
      fetchScheduling();
    } catch {
      setScheduleError('Failed to dispatch.');
    }
  };

  const resetCreateForm = () => {
    setCreateTitle('');
    setCreateDescription('');
    setCreatePriority('medium');
    setCreateCustomerId('');
    setCreateOfficerId('');
    setCreateLocation('');
    setCreateScheduleStart('');
    setCreateDuration('60');
    setCreateNotes('');
  };

  const handleTimelineClick = (officer: Officer, e: React.MouseEvent<HTMLDivElement>) => {
    if (!highlightedJob) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const pct = clickX / width;
    
    const dayMinutes = DAILY_TIMELINE_MINUTES;
    const clickedMinutes = pct * dayMinutes;
    const roundedMinutes = Math.round(clickedMinutes / 15) * 15;
    const maxStart = dayMinutes - 15;
    const clamped = Math.min(Math.max(roundedMinutes, 0), maxStart);
    const totalMinutesFromMidnight = DAILY_TIMELINE_START_HOUR * 60 + clamped;

    const clickedDate = startOfDay(calendarDate);
    clickedDate.setHours(
      Math.floor(totalMinutesFromMidnight / 60),
      totalMinutesFromMidnight % 60,
      0,
      0,
    );

    setSelectedJob(highlightedJob);
    // Use local formatting that works for inputs
    const zOffset = clickedDate.getTimezoneOffset() * 60000;
    const localIso = new Date(clickedDate.getTime() - zOffset).toISOString().slice(0,16);
    
    setFormScheduleStart(localIso);
    setFormDuration('60');
    setFormOfficerId(String(officer.id));
    setFormNotes('');
    setScheduleError(null);
    setActionMenu(null);
    setScheduleModalOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    if (!createTitle.trim()) {
      setCreateError('Job title is required.');
      return;
    }
    if (!token) return;
    try {
      const res = await postJson<{ job: { id: number } }>(
        '/jobs',
        {
          title: createTitle.trim(),
          description: createDescription.trim() || undefined,
          priority: createPriority,
          officer_id: createOfficerId ? parseInt(createOfficerId, 10) : undefined,
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
            officer_id: createOfficerId ? parseInt(createOfficerId, 10) : null,
            notes: createNotes.trim() || null,
        },
          token,
        );
      }
      setCreateModalOpen(false);
      resetCreateForm();
      fetchScheduling();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create job.');
    }
  };

  const stateBadge = (state: string) => {
    const opt = SCHEDULE_STATES.find((s) => s.value === state) ?? { label: state, color: 'bg-slate-100 text-slate-600' };
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

  const filteredJobs = jobs.filter((j) => {
    if (search) {
      const q = search.toLowerCase();
      if (
        !j.title.toLowerCase().includes(q) &&
        !(j.officer_full_name?.toLowerCase().includes(q)) &&
        !(j.customer_full_name?.toLowerCase().includes(q)) &&
        !(j.location?.toLowerCase().includes(q))
      )
        return false;
    }
    return true;
  });

  const events = filteredJobs
    .filter((j) => j.schedule_start || j.start_date)
    .map(jobToEvent);

  return (
    <>
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
        <div className="flex items-center gap-6">
          <h2 className="text-lg font-bold text-slate-900">Scheduling & Dispatch</h2>
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                viewMode === 'calendar' ? 'bg-[#14B8A6] text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Calendar className="size-4" />
              Calendar
            </button>
            <button
              type="button"
              onClick={() => setViewMode('daily')}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                viewMode === 'daily' ? 'bg-[#14B8A6] text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <CalendarDays className="size-4" />
              Daily
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                viewMode === 'list' ? 'bg-[#14B8A6] text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <List className="size-4" />
              List
            </button>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium"
          >
            <option value="">All states</option>
            {SCHEDULE_STATES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <select
            value={officerFilter}
            onChange={(e) => setOfficerFilter(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium"
          >
            <option value="">All users</option>
            {officers.map((o) => (
              <option key={o.id} value={String(o.id)}>{o.full_name}</option>
            ))}
          </select>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-7xl space-y-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-tight text-slate-900">Scheduling & Dispatch</h1>
              <p className="mt-1 text-slate-500">Plan, organize, and assign jobs to the right people at the right time.</p>
            </div>
            <motion.button
              type="button"
              onClick={() => {
                setCreateError(null);
                resetCreateForm();
                setCreateModalOpen(true);
              }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#14B8A6] px-5 py-2.5 font-bold text-white shadow-sm transition hover:brightness-110"
            >
              <Plus className="size-5" />
              Create New Job
            </motion.button>
          </div>

          {viewMode === 'calendar' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
            >
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCalendarDate((d) => subMonths(d, 1))}
                    className="rounded-lg p-2 transition hover:bg-slate-100"
                  >
                    <ChevronLeft className="size-5 text-slate-600" />
                  </button>
                  <h2 className="min-w-[200px] text-center text-lg font-bold text-slate-900">
                    {format(calendarDate, 'MMMM yyyy')}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setCalendarDate((d) => addMonths(d, 1))}
                    className="rounded-lg p-2 transition hover:bg-slate-100"
                  >
                    <ChevronRight className="size-5 text-slate-600" />
                  </button>
                </div>
              </div>
              <div className="p-4" style={{ height: 640 }}>
                <BigCalendar
                  localizer={localizer}
                  events={events}
                  startAccessor="start"
                  endAccessor="end"
                  titleAccessor="title"
                  view="month"
                  date={calendarDate}
                  onNavigate={(d) => setCalendarDate(d)}
                  onSelectEvent={(evt) => {
                    const j = (evt as { job?: ScheduledJob }).job;
                    if (j) openScheduleModal(j);
                  }}
                  eventPropGetter={() => ({
                    style: {
                      backgroundColor: '#14B8A6',
                      borderColor: '#0d9488',
                      borderRadius: '6px',
                    },
                  })}
                />
              </div>
            </motion.div>
          )}

          
          {viewMode === 'daily' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col md:flex-row h-[750px] font-sans"
            >
               {/* Main diary: fixed user column + scrollable 24h timeline */}
               <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
                  <div className="flex min-h-0 flex-1 overflow-hidden">
                     <div className="z-30 flex w-32 shrink-0 flex-col border-r border-slate-200 bg-white lg:w-40">
                        <div className="flex h-[53px] shrink-0 flex-col items-center justify-center border-b border-slate-200 px-2 text-center">
                           <div className="text-xs font-normal text-slate-500">Users</div>
                           <div className="text-sm font-semibold text-slate-700">{format(calendarDate, 'd MMM yyyy')}</div>
                        </div>
                        {officers.map((officer) => (
                           <div
                              key={officer.id}
                              className="flex min-h-[60px] items-center border-b border-slate-100 px-3 text-[13px] font-semibold text-slate-800"
                           >
                              {officer.full_name}
                           </div>
                        ))}
                     </div>
                     <div className="relative min-h-0 min-w-0 flex-1">
                        <div
                           ref={diaryTimelineScrollRef}
                           onScroll={updateDiaryTimelineScrollHints}
                           className="h-full overflow-auto scroll-smooth"
                        >
                           <div style={{ minWidth: DAILY_TIMELINE_MIN_WIDTH_PX }}>
                              <div className="sticky top-0 z-20 flex h-[53px] shrink-0 border-b border-slate-200 bg-white">
                                 {Array.from({ length: DAILY_TIMELINE_HOUR_COUNT }).map((_, i) => (
                                    <div
                                       key={i}
                                       className="flex-1 border-r border-slate-100 py-3 text-center text-[13px] font-bold text-slate-700 last:border-r-0"
                                    >
                                       {format(
                                          addHours(startOfDay(calendarDate), DAILY_TIMELINE_START_HOUR + i),
                                          'ha',
                                       ).toLowerCase()}
                                    </div>
                                 ))}
                              </div>
                              {officers.map((officer) => {
                                 const officerEvents = jobs.filter(
                                    (j) =>
                                       j.officer_id === officer.id &&
                                       j.schedule_start &&
                                       isSameDay(new Date(j.schedule_start), calendarDate),
                                 );
                                 return (
                                    <div
                                       key={officer.id}
                                       className="group relative flex min-h-[60px] border-b border-slate-100 hover:bg-slate-50"
                                    >
                                       <div
                                          className={`relative min-h-[60px] w-full cursor-pointer ${highlightedJob ? 'hover:bg-[#14B8A6]/5' : ''}`}
                                          onClick={(e) => handleTimelineClick(officer, e)}
                                       >
                                          <div className="pointer-events-none absolute inset-0 flex">
                                             {Array.from({ length: DAILY_TIMELINE_HOUR_COUNT }).map((_, i) => (
                                                <div
                                                   key={i}
                                                   className="flex-1 border-r border-slate-100 last:border-r-0"
                                                />
                                             ))}
                                          </div>
                                          {officerEvents.map((evt) => {
                                             const s = new Date(evt.schedule_start!);
                                             const startTotalMinutes = s.getHours() * 60 + s.getMinutes();
                                             const offsetMinutes =
                                                startTotalMinutes - DAILY_TIMELINE_START_HOUR * 60;
                                             const durMinutes = evt.duration_minutes || 60;
                                             const totalDayMinutes = DAILY_TIMELINE_MINUTES;

                                             let leftPct = (offsetMinutes / totalDayMinutes) * 100;
                                             if (leftPct < 0) leftPct = 0;

                                             let widthPct = (durMinutes / totalDayMinutes) * 100;
                                             if (leftPct + widthPct > 100) widthPct = 100 - leftPct;

                                             if (leftPct >= 100) return null;

                                             return (
                                                <div
                                                   key={evt.id}
                                                   className="absolute top-1 bottom-1 z-20 flex cursor-pointer flex-col justify-center overflow-hidden rounded border border-slate-300 bg-white p-1.5 text-[11px] leading-tight shadow-sm transition-colors hover:border-[#14B8A6] hover:shadow"
                                                   style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                                                   onClick={(ce) => {
                                                      ce.stopPropagation();
                                                      openScheduleModal(evt);
                                                   }}
                                                >
                                                   <div className="truncate font-bold text-slate-800">
                                                      {format(s, 'HH:mm')} -{' '}
                                                      {format(new Date(s.getTime() + durMinutes * 60000), 'HH:mm')}
                                                   </div>
                                                   <div className="truncate text-slate-600">{evt.title}</div>
                                                </div>
                                             );
                                          })}
                                       </div>
                                    </div>
                                 );
                              })}
                           </div>
                        </div>
                        {diaryTimelineScrollHints.left && (
                           <div
                              className="pointer-events-none absolute inset-y-0 left-0 top-0 z-[28] w-10 bg-gradient-to-r from-white from-30% to-transparent"
                              aria-hidden
                           />
                        )}
                        {diaryTimelineScrollHints.right && (
                           <div
                              className="pointer-events-none absolute inset-y-0 right-0 top-0 z-[28] w-14 bg-gradient-to-l from-white from-40% to-transparent"
                              aria-hidden
                           />
                        )}
                        {diaryTimelineHasOverflow && diaryTimelineScrollHints.left && (
                           <div className="pointer-events-none absolute bottom-0 left-0 top-[53px] z-[32] flex w-11 items-center justify-center">
                              <button
                                 type="button"
                                 aria-label="Scroll timeline left"
                                 className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-600 shadow-md backdrop-blur-sm transition hover:border-[#14B8A6] hover:text-[#14B8A6]"
                                 onClick={() => {
                                    const el = diaryTimelineScrollRef.current;
                                    if (!el) return;
                                    el.scrollBy({
                                       left: -Math.min(280, el.clientWidth * 0.6),
                                       behavior: 'smooth',
                                    });
                                 }}
                              >
                                 <ChevronLeft className="size-5" />
                              </button>
                           </div>
                        )}
                        {diaryTimelineHasOverflow && diaryTimelineScrollHints.right && (
                           <div className="pointer-events-none absolute bottom-0 right-0 top-[53px] z-[32] flex w-11 items-center justify-center">
                              <button
                                 type="button"
                                 aria-label="Scroll timeline right for later hours"
                                 className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-600 shadow-md backdrop-blur-sm transition hover:border-[#14B8A6] hover:text-[#14B8A6]"
                                 onClick={() => {
                                    const el = diaryTimelineScrollRef.current;
                                    if (!el) return;
                                    el.scrollBy({
                                       left: Math.min(280, el.clientWidth * 0.6),
                                       behavior: 'smooth',
                                    });
                                 }}
                              >
                                 <ChevronRight className="size-5" />
                              </button>
                           </div>
                        )}
                     </div>
                  </div>
                  {diaryTimelineHasOverflow && (
                     <div className="flex shrink-0 items-center justify-center gap-2 border-t border-slate-200 bg-slate-50/90 px-3 py-2 text-center text-xs font-medium text-slate-600">
                        <ChevronsLeftRight className="size-4 shrink-0 text-[#14B8A6]" aria-hidden />
                        <span>Scroll sideways or use the side arrows to see the full day (midnight–late evening).</span>
                     </div>
                  )}
               </div>

               {/* Right sidebar */}
               <div className="w-full md:w-[280px] shrink-0 border-t md:border-t-0 md:border-l border-slate-200 bg-slate-50 flex flex-col h-full">
                  <div className="border-b border-slate-200 p-4 bg-white">
                     <div className="text-xs font-bold text-[#14B8A6] uppercase mb-3 text-center tracking-wider">
                        {isSameDay(calendarDate, new Date()) ? 'TODAY' : format(calendarDate, 'EEEE d MMM')}
                     </div>
                     <MiniCalendar 
                        date={calendarDate} 
                        onSelect={(d) => { setCalendarDate(d); setActiveMonthDate(d); }} 
                        activeDate={activeMonthDate} 
                     />
                  </div>
                  
                  {/* Job Context Notice */}
                  {highlightedJob && (
                     <div className="p-4 border-b border-emerald-100 bg-emerald-50">
                        <p className="text-emerald-700 text-[13px] font-semibold italic">
                           You have just come from job no. {highlightedJob.id.toString().padStart(4, '0')}. To add this job to the diary you need to select a time slot for it. <br/><span className="font-normal opacity-80 mt-1 block">(Just like you do when adding a new event)</span>
                        </p>
                        <button 
                           onClick={() => setHighlightedJob(null)}
                           className="mt-3 text-xs text-emerald-600 hover:text-emerald-800 font-bold underline"
                        >
                           Clear selection
                        </button>
                     </div>
                  )}

                  {/* Filters */}
                  <div className="p-4 flex-1 overflow-y-auto">
                     <h4 className="font-bold text-slate-800 text-sm mb-3">Filters</h4>
                     <div className="space-y-3">
                         <button className="flex items-center justify-between w-full text-left text-[13px] text-[#14B8A6] font-semibold hover:underline">
                             <div className="flex items-center gap-2"><Users className="size-4"/> Users</div>
                             <span className="text-slate-500 font-normal">({officers.length} out of {officers.length})</span>
                         </button>
                         <button className="flex items-center justify-between w-full text-left text-[13px] text-[#14B8A6] font-semibold hover:underline">
                             <div className="flex items-center gap-2"><UserCircle2 className="size-4"/> User groups</div>
                         </button>
                         <button className="flex items-center justify-between w-full text-left text-[13px] text-[#14B8A6] font-semibold hover:underline">
                             <div className="flex items-center gap-2"><CalendarDays className="size-4"/> Skills</div>
                             <span className="text-slate-500 font-normal">(selected 1 out of 6)</span>
                         </button>
                     </div>
                     
                     <h4 className="font-bold text-slate-800 text-sm mt-8 mb-3">More</h4>
                     <button className="flex items-center gap-2 w-full text-left text-[13px] text-[#14B8A6] font-semibold hover:underline">
                        <MapIcon className="size-4"/> Nearby events
                     </button>
                  </div>
               </div>
            </motion.div>
          )}

          {viewMode === 'list' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
            >
              <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
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
                      <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredJobs.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                          No jobs in this schedule range. Create jobs in Job Management first.
                        </td>
                      </tr>
                    ) : (
                      <AnimatePresence>
                        {filteredJobs.map((j, i) => (
                          <motion.tr
                            key={j.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: i * 0.02 }}
                            className="relative transition-colors hover:bg-slate-50"
                          >
                            <td className="px-6 py-4">
                              <div>
                                <span className="text-sm font-semibold text-slate-900">{j.title}</span>
                                <span className="block max-w-[200px] truncate text-xs text-slate-500">{j.description || '—'}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">{stateBadge(j.state)}</td>
                            <td className="px-6 py-4">{priorityBadge(j.priority)}</td>
                            <td className="px-6 py-4 text-sm text-slate-700">{j.officer_full_name || j.responsible_person || '—'}</td>
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
                              {actionMenu === j.id && typeof document !== 'undefined' && createPortal(
                                <div
                                  className="fixed z-[100] w-36 rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
                                  style={{ top: menuPosition.top, left: menuPosition.left }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    onClick={() => openScheduleModal(j)}
                                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                                  >
                                    <CalendarPlus className="size-4" />
                                    Schedule
                                  </button>
                                  {['assigned', 'scheduled', 'rescheduled'].includes(j.state) && (
                                    <button
                                      type="button"
                                      onClick={() => handleDispatch(j)}
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
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {scheduleModalOpen && selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-slate-900">Schedule Job</h3>
            <p className="mt-1 text-sm text-slate-500">{selectedJob.title}</p>
            <form onSubmit={handleSchedule} className="mt-6 space-y-4">
              {scheduleError && (
                <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{scheduleError}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700">Schedule date & time</label>
                <p className="mt-1 text-xs text-slate-500">
                  The diary shows midnight–11:45pm (scroll horizontally on smaller screens). Clicking the timeline snaps to
                  15-minute steps—adjust the exact start time here if you need finer control.
                </p>
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
                <label className="block text-sm font-medium text-slate-700">Assigned officer</label>
                <select
                  value={formOfficerId}
                  onChange={(e) => setFormOfficerId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">— Select —</option>
                  {officers.map((o) => (
                    <option key={o.id} value={String(o.id)}>{o.full_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Notes</label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Additional instructions..."
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setScheduleModalOpen(false)}
                  className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-bold text-white hover:brightness-110"
                >
                  Save schedule
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setCreateModalOpen(false)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-slate-900">Create New Job</h3>
            <form onSubmit={handleCreate} className="mt-6 space-y-4">
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
                  placeholder="e.g. Service Request #123"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Description</label>
                <textarea
                  rows={2}
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  placeholder="Brief description"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Priority</label>
                  <select value={createPriority} onChange={(e) => setCreatePriority(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    {PRIORITY_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Customer</label>
                  <select value={createCustomerId} onChange={(e) => setCreateCustomerId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <option value="">— None —</option>
                    {customers.map((c) => (
                      <option key={c.id} value={String(c.id)}>{c.full_name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Assigned officer</label>
                <select value={createOfficerId} onChange={(e) => setCreateOfficerId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <option value="">— Unassigned —</option>
                  {officers.filter((o) => o.state === 'active').map((o) => (
                    <option key={o.id} value={String(o.id)}>{o.full_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Location</label>
                <input
                  type="text"
                  value={createLocation}
                  onChange={(e) => setCreateLocation(e.target.value)}
                  placeholder="Address or site name"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="border-t border-slate-200 pt-4">
                <p className="mb-2 text-sm font-medium text-slate-700">Schedule now (optional)</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-500">Date & time</label>
                    <input
                      type="datetime-local"
                      value={createScheduleStart}
                      onChange={(e) => setCreateScheduleStart(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500">Duration (min)</label>
                    <input
                      type="number"
                      min={15}
                      step={15}
                      value={createDuration}
                      onChange={(e) => setCreateDuration(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div className="mt-2">
                  <label className="block text-xs text-slate-500">Notes</label>
                  <textarea
                    value={createNotes}
                    onChange={(e) => setCreateNotes(e.target.value)}
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder="Additional instructions..."
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-bold text-white hover:brightness-110"
                >
                  Create Job
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </>
  );
}

function MiniCalendar({ date, onSelect, activeDate }: { date: Date, onSelect: (d: Date) => void, activeDate: Date }) {
   const monthStart = startOfMonth(activeDate);
   const monthEnd = endOfMonth(monthStart);
   const startDate = startOfWeek(monthStart);
   const endDate = endOfWeek(monthEnd);
   
   const calendarDays = [];
   let day = startDate;
   while (day <= endDate) {
      calendarDays.push(day);
      day = addDays(day, 1);
   }

   const weeks = [];
   for (let i = 0; i < calendarDays.length; i += 7) {
      weeks.push(calendarDays.slice(i, i + 7));
   }
   
   const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
   
   return (
     <div className="w-full">
        <div className="flex justify-between items-center mb-2 px-1">
           <button onClick={() => onSelect(subMonths(activeDate, 1))} className="text-slate-400 hover:text-slate-700"><ChevronLeft className="size-4"/></button>
           <span className="text-[13px] font-bold text-slate-700">{format(activeDate, "MMMM yyyy")}</span>
           <button onClick={() => onSelect(addMonths(activeDate, 1))} className="text-slate-400 hover:text-slate-700"><ChevronRight className="size-4"/></button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-[11px] font-bold text-slate-400 mb-2 text-center">
           {dayNames.map(n => <div key={n}>{n}</div>)}
        </div>
        {weeks.map((week, wIndex) => (
           <div key={`week-${format(week[0], 'yyyy-MM-dd')}`} className="grid grid-cols-7 gap-1 mb-1">
              {week.map((d, dIndex) => (
                 <div key={`cell-${format(d, 'yyyy-MM-dd')}-${wIndex}-${dIndex}`} 
                      onClick={() => onSelect(d)}
                      className={`flex items-center justify-center p-1 text-[12px] font-medium cursor-pointer aspect-square rounded-full transition-colors ${!isSameMonth(d, monthStart) ? "text-slate-300" : "text-slate-700"} ${isSameDay(d, date) ? "bg-[#14B8A6] text-white" : "hover:bg-slate-100"}`}
                 >
                    {format(d, "d")}
                 </div>
              ))}
           </div>
        ))}
     </div>
   );
}
