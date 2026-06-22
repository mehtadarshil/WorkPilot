'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Briefcase,
  CalendarDays,
  Clock3,
  Gauge,
  ReceiptText,
  Route,
  CheckCircle,
  Plus,
  Trash2,
  XCircle,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { format, parse, startOfWeek, endOfWeek, startOfMonth, endOfMonth, endOfDay, addDays, getDay, addMonths, addHours, startOfDay, isSameDay } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { Calendar as BigCalendar, dateFnsLocalizer } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { getJson, postJson, patchJson, deleteRequest } from '../../apiClient';

// --- Type Definitions ---
type OfficerWorkRow = {
  id: number;
  full_name: string;
  role_position: string | null;
  department: string | null;
  state: string;
  days_worked: number;
  total_seconds: number;
  travelling_seconds: number;
  on_site_seconds: number;
  expenses_total: number;
  expenses_count: number;
  pending_expenses_total: number;
  pending_expenses_count: number;
};

type ExpenseRow = {
  id: number;
  job_id: number;
  officer_id: number | null;
  officer_name: string | null;
  job_title: string | null;
  job_number: string | null;
  customer_name: string | null;
  expense_date: string;
  category: string;
  description: string | null;
  amount: number;
  status: string;
  expense_type: string;
  created_at: string | null;
};

type StaffWorkSummary = {
  from: string;
  to: string;
  officers: OfficerWorkRow[];
  totals: {
    days_worked: number;
    total_seconds: number;
    travelling_seconds: number;
    on_site_seconds: number;
    expenses_total: number;
    expenses_count: number;
    pending_expenses_total: number;
    pending_expenses_count: number;
  };
};

type Holiday = {
  id: number;
  title: string;
  description: string | null;
  holiday_date: string;
  is_recurring: boolean;
  created_by: number | null;
  created_at: string | null;
};

type HolidayRequest = {
  id: number;
  officer_id: number;
  officer_name: string | null;
  start_date: string;
  end_date: string;
  leave_type: string;
  reason: string | null;
  status: string;
  approved_by: number | null;
  approved_by_name: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string | null;
  days_count: number | null;
};

type Officer = {
  id: number;
  full_name: string;
  role_position: string | null;
  state: string;
};

type CalendarEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  color: string;
  borderColor: string;
};

// --- Helpers ---
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales: { 'en-US': enUS },
});

function monthStart(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatHours(seconds: number): string {
  const hours = seconds / 3600;
  return `${hours.toFixed(hours >= 10 ? 1 : 2)}h`;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value || 0);
}

function statusColor(status: string) {
  if (status === 'approved') return 'bg-emerald-100 text-emerald-800';
  if (status === 'rejected') return 'bg-rose-100 text-rose-800';
  return 'bg-amber-100 text-amber-800';
}

function formatDate(d: string) {
  const dateObj = new Date(d.includes('T') ? d : d + 'T00:00:00');
  if (Number.isNaN(dateObj.getTime())) return d;
  return dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTimeString(d: string) {
  const dateObj = new Date(d.includes('T') ? d : d + 'T00:00:00');
  if (Number.isNaN(dateObj.getTime())) return d;
  const dateStr = dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  if (d.includes('T') && !d.endsWith('T00:00:00') && !d.endsWith('T00:00:00.000Z')) {
    const timeStr = dateObj.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return `${dateStr} at ${timeStr}`;
  }
  return dateStr;
}

const inputClass = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30';
const selectClass = inputClass;

// --- Component ---
export default function StaffWorkPage() {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<'summary' | 'calendar' | 'holidays'>('summary');

  // --- Work Summary Tab States ---
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [summary, setSummary] = useState<StaffWorkSummary | null>(null);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [updatingExpenseId, setUpdatingExpenseId] = useState<number | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // --- Holidays Tab States ---
  const [holidaySubTab, setHolidaySubTab] = useState<'requests' | 'holidays'>('requests');
  const [requests, setRequests] = useState<HolidayRequest[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [loadingHolidays, setLoadingHolidays] = useState(false);
  const [holidayError, setHolidayError] = useState<string | null>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [updatingHolidayId, setUpdatingHolidayId] = useState<number | null>(null);
  const [reqForm, setReqForm] = useState({ officer_id: '', start_date: '', end_date: '', leave_type: 'annual', reason: '' });
  const [holidayForm, setHolidayForm] = useState({ title: '', holiday_date: '', description: '', is_recurring: false });

  // --- Calendar Tab States ---
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [calendarView, setCalendarView] = useState<'month' | 'week' | 'day' | 'agenda'>('month');
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const dateRange = useMemo(() => {
    let start: Date;
    let end: Date;

    if (calendarView === 'month') {
      const monthStart = startOfMonth(calendarDate);
      const monthEnd = endOfMonth(calendarDate);
      start = startOfWeek(monthStart, { weekStartsOn: 1 }); // Monday start
      end = endOfWeek(monthEnd, { weekStartsOn: 1 });
    } else if (calendarView === 'week') {
      start = startOfWeek(calendarDate, { weekStartsOn: 1 });
      end = endOfWeek(calendarDate, { weekStartsOn: 1 });
    } else if (calendarView === 'day') {
      start = startOfDay(calendarDate);
      end = endOfDay(calendarDate);
    } else {
      // agenda - show 1 month range
      start = startOfMonth(calendarDate);
      end = endOfMonth(calendarDate);
    }
    return { start, end };
  }, [calendarDate, calendarView]);

  // --- API Fetch Functions ---
  const fetchSummaryData = useCallback(async () => {
    if (!token) return;
    setLoadingSummary(true);
    setSummaryError(null);
    try {
      const q = new URLSearchParams({ from, to }).toString();
      const [summaryRes, expensesRes] = await Promise.all([
        getJson<StaffWorkSummary>(`/staff-work/summary?${q}`, token),
        getJson<{ expenses: ExpenseRow[] }>(`/staff-work/expenses?${q}`, token),
      ]);
      setSummary(summaryRes);
      setExpenses(expensesRes.expenses ?? []);
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : 'Could not load staff work summary');
      setSummary(null);
      setExpenses([]);
    } finally {
      setLoadingSummary(false);
    }
  }, [from, to, token]);

  const fetchHolidaysData = useCallback(async () => {
    if (!token) return;
    setLoadingHolidays(true);
    setHolidayError(null);
    try {
      const [reqRes, holRes] = await Promise.all([
        getJson<{ requests: HolidayRequest[] }>('/holiday-requests', token),
        getJson<{ holidays: Holiday[] }>('/holidays', token),
      ]);
      setRequests(reqRes.requests ?? []);
      setHolidays(holRes.holidays ?? []);
      try {
        const offRes = await getJson<{ officers: Officer[] }>('/officers/list', token);
        setOfficers(offRes.officers ?? []);
      } catch {
        setOfficers([]);
      }
    } catch (err) {
      setHolidayError(err instanceof Error ? err.message : 'Could not load holidays');
    } finally {
      setLoadingHolidays(false);
    }
  }, [token]);

  const fetchCalendarEvents = useCallback(async () => {
    if (!token) return;
    try {
      const startIso = dateRange.start.toISOString();
      const endIso = dateRange.end.toISOString();
      const startYmd = dateRange.start.toISOString().slice(0, 10);
      const endYmd = dateRange.end.toISOString().slice(0, 10);

      const diaryQ = new URLSearchParams({ range_start: startIso, range_end: endIso }).toString();
      const holQ = new URLSearchParams({ from: startYmd, to: endYmd }).toString();

      const [eventsRes, reqRes, holRes] = await Promise.all([
        getJson<{ events: any[] }>(`/diary-events?${diaryQ}`, token),
        getJson<{ requests: HolidayRequest[] }>('/holiday-requests', token),
        getJson<{ holidays: Holiday[] }>(`/holidays?${holQ}`, token),
      ]);

      const diaryEvts = (eventsRes.events ?? []).map((e: any) => {
        const start = new Date(e.start_time);
        const end = new Date(start.getTime() + (e.duration_minutes || 60) * 60000);
        return {
          id: `diary-${e.diary_id}`,
          title: `🔧 ${e.job_number || 'Job'} (${e.officer_full_name || 'Staff'})`,
          start,
          end,
          color: 'bg-[#14B8A6] text-white',
          borderColor: '#0d9488',
          type: 'diary',
          raw: e,
        };
      });

      const companyHols = (holRes.holidays ?? []).map((h: any) => ({
        id: `holiday-${h.id}`,
        title: `🎉 Holiday: ${h.title}`,
        start: new Date(h.holiday_date + 'T00:00:00'),
        end: new Date(h.holiday_date + 'T23:59:59'),
        allDay: true,
        color: 'bg-indigo-600 text-white',
        borderColor: '#4f46e5',
        type: 'holiday',
        raw: h,
      }));

      const leaveEvts = (reqRes.requests ?? [])
        .filter((r: any) => r.status === 'approved' || r.status === 'pending')
        .filter((r: any) => {
          const start = new Date(r.start_date);
          const end = new Date(r.end_date);
          return start <= dateRange.end && end >= dateRange.start;
        })
        .map((r: any) => ({
          id: `leave-${r.id}`,
          title: `${r.status === 'approved' ? '✈️' : '⏳'} ${r.officer_name} Leave`,
          start: new Date(r.start_date),
          end: new Date(r.end_date),
          allDay: false,
          color: r.status === 'approved' ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white',
          borderColor: r.status === 'approved' ? '#059669' : '#d97706',
          type: 'leave',
          raw: r,
        }));

      setCalendarEvents([...diaryEvts, ...companyHols, ...leaveEvts]);
    } catch (e) {
      console.error('Error loading calendar events:', e);
    }
  }, [dateRange, token]);

  // Trigger loads based on active tab
  useEffect(() => {
    if (activeTab === 'summary') {
      void fetchSummaryData();
    } else if (activeTab === 'holidays') {
      void fetchHolidaysData();
    } else if (activeTab === 'calendar') {
      void fetchCalendarEvents();
    }
  }, [activeTab, fetchSummaryData, fetchHolidaysData, fetchCalendarEvents]);

  // Expenses management
  const updateExpenseStatus = async (expenseId: number, status: 'approved' | 'rejected') => {
    if (!token) return;
    setUpdatingExpenseId(expenseId);
    setSummaryError(null);
    try {
      await patchJson(`/job-expenses/${expenseId}`, { status }, token);
      await fetchSummaryData();
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : 'Could not update expense');
    } finally {
      setUpdatingExpenseId(null);
    }
  };

  const updateExpenseType = async (expenseId: number, expenseType: 'personal' | 'company') => {
    if (!token) return;
    setUpdatingExpenseId(expenseId);
    setSummaryError(null);
    try {
      await patchJson(`/job-expenses/${expenseId}`, { expense_type: expenseType }, token);
      await fetchSummaryData();
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : 'Could not update expense type');
    } finally {
      setUpdatingExpenseId(null);
    }
  };

  // Holidays management
  const submitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setHolidayError(null);
    try {
      await postJson('/holiday-requests', {
        officer_id: reqForm.officer_id ? Number(reqForm.officer_id) : undefined,
        start_date: reqForm.start_date,
        end_date: reqForm.end_date,
        leave_type: reqForm.leave_type,
        reason: reqForm.reason || undefined,
      }, token);
      setShowRequestModal(false);
      setReqForm({ officer_id: '', start_date: '', end_date: '', leave_type: 'annual', reason: '' });
      void fetchHolidaysData();
    } catch (err) {
      setHolidayError(err instanceof Error ? err.message : 'Could not submit request');
    }
  };

  const submitHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setHolidayError(null);
    try {
      await postJson('/holidays', {
        title: holidayForm.title,
        holiday_date: holidayForm.holiday_date,
        description: holidayForm.description || undefined,
        is_recurring: holidayForm.is_recurring,
      }, token);
      setShowHolidayModal(false);
      setHolidayForm({ title: '', holiday_date: '', description: '', is_recurring: false });
      void fetchHolidaysData();
    } catch (err) {
      setHolidayError(err instanceof Error ? err.message : 'Could not add holiday');
    }
  };

  const updateHolidayRequestStatus = async (id: number, status: 'approved' | 'rejected') => {
    if (!token) return;
    setUpdatingHolidayId(id);
    setHolidayError(null);
    try {
      await patchJson(`/holiday-requests/${id}`, { status }, token);
      void fetchHolidaysData();
    } catch (err) {
      setHolidayError(err instanceof Error ? err.message : 'Could not update request');
    } finally {
      setUpdatingHolidayId(null);
    }
  };

  const deleteHoliday = async (id: number) => {
    if (!token || !confirm('Delete this holiday?')) return;
    try {
      await deleteRequest(`/holidays/${id}`, token);
      void fetchHolidaysData();
    } catch (err) {
      setHolidayError(err instanceof Error ? err.message : 'Could not delete holiday');
    }
  };

  // Lists & Computations
  const sortedOfficers = useMemo(
    () => [...(summary?.officers ?? [])].sort((a, b) => b.total_seconds - a.total_seconds),
    [summary],
  );

  const totals = summary?.totals;
  const pendingExpenses = expenses.filter((e) => e.status === 'submitted');
  const approvedExpenses = expenses.filter((e) => e.status === 'approved');

  const pendingHolidays = requests.filter((r) => r.status === 'pending');
  const processedHolidays = requests.filter((r) => r.status !== 'pending');

  const dateText = useMemo(() => {
    if (calendarView === 'month' || calendarView === 'agenda') {
      return format(calendarDate, 'MMMM yyyy');
    } else if (calendarView === 'week') {
      const start = startOfWeek(calendarDate, { weekStartsOn: 1 });
      const end = addDays(start, 6);
      return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
    } else {
      return format(calendarDate, 'EEEE, MMM d, yyyy');
    }
  }, [calendarDate, calendarView]);

  const handlePrev = () => {
    if (calendarView === 'month' || calendarView === 'agenda') {
      setCalendarDate((d) => addMonths(d, -1));
    } else if (calendarView === 'week') {
      setCalendarDate((d) => addDays(d, -7));
    } else {
      setCalendarDate((d) => addDays(d, -1));
    }
  };

  const handleNext = () => {
    if (calendarView === 'month' || calendarView === 'agenda') {
      setCalendarDate((d) => addMonths(d, 1));
    } else if (calendarView === 'week') {
      setCalendarDate((d) => addDays(d, 7));
    } else {
      setCalendarDate((d) => addDays(d, 1));
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      {/* Title section */}
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#14B8A6]">Staff</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Staff Work</h1>
          <p className="mt-1 text-sm text-slate-600 font-medium">
            Manage officer working hours, expenses, calendar scheduling, and time-off requests.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 w-fit">
          <button
            type="button"
            onClick={() => setActiveTab('summary')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === 'summary' ? 'bg-[#14B8A6] text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Clock3 className="size-4" /> Work Summary
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('calendar')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === 'calendar' ? 'bg-[#14B8A6] text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <CalendarIcon className="size-4" /> Calendar
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('holidays')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === 'holidays' ? 'bg-[#14B8A6] text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <CalendarDays className="size-4" /> Holidays
          </button>
        </div>
      </div>

      {summaryError && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{summaryError}</div>}
      {holidayError && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{holidayError}</div>}

      {/* --- TAB CONTENT: WORK SUMMARY --- */}
      {activeTab === 'summary' && (
        <>
          {/* Filters for Summary */}
          <div className="mb-6 flex justify-end">
            <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <label className="text-xs font-semibold uppercase text-slate-500">
                From
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:ring-1 focus:ring-[#14B8A6]"
                />
              </label>
              <label className="text-xs font-semibold uppercase text-slate-500">
                To
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:ring-1 focus:ring-[#14B8A6]"
                />
              </label>
              <button
                type="button"
                onClick={() => void fetchSummaryData()}
                className="rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0d9488]"
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <SummaryCard icon={<Clock3 className="size-5" />} label="Hours worked" value={formatHours(totals?.total_seconds ?? 0)} />
            <SummaryCard icon={<Route className="size-5" />} label="Travelling" value={formatHours(totals?.travelling_seconds ?? 0)} />
            <SummaryCard icon={<Gauge className="size-5" />} label="On site" value={formatHours(totals?.on_site_seconds ?? 0)} />
            <SummaryCard icon={<CalendarDays className="size-5" />} label="Days worked" value={`${totals?.days_worked ?? 0}`} />
            <SummaryCard icon={<ReceiptText className="size-5" />} label="Approved expenses due" value={formatMoney(totals?.expenses_total ?? 0)} />
          </div>

          {/* Table: Officer hours */}
          <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-bold text-slate-900">Officer hours</h2>
              <p className="text-sm text-slate-500">Totals come from mobile diary visit statuses: travelling and on site.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Officer</th>
                    <th className="px-5 py-3">Days</th>
                    <th className="px-5 py-3">Hours worked</th>
                    <th className="px-5 py-3">Travelling</th>
                    <th className="px-5 py-3">On site</th>
                    <th className="px-5 py-3">Expenses</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingSummary ? (
                    <tr><td className="px-5 py-6 text-slate-500" colSpan={6}>Loading staff work…</td></tr>
                  ) : sortedOfficers.length === 0 ? (
                    <tr><td className="px-5 py-6 text-slate-500" colSpan={6}>No officers found.</td></tr>
                  ) : (
                    sortedOfficers.map((o) => (
                      <tr key={o.id} className="hover:bg-slate-50">
                        <td className="px-5 py-4">
                          <p className="font-semibold text-slate-900">{o.full_name}</p>
                          <p className="text-xs text-slate-500">{[o.role_position, o.department].filter(Boolean).join(' · ') || o.state}</p>
                        </td>
                        <td className="px-5 py-4 font-semibold text-slate-700">{o.days_worked}</td>
                        <td className="px-5 py-4 font-semibold text-slate-900">{formatHours(o.total_seconds)}</td>
                        <td className="px-5 py-4 text-slate-700">{formatHours(o.travelling_seconds)}</td>
                        <td className="px-5 py-4 text-slate-700">{formatHours(o.on_site_seconds)}</td>
                        <td className="px-5 py-4">
                          <span className="font-semibold text-slate-900">{formatMoney(o.expenses_total)}</span>
                          <span className="ml-2 text-xs text-slate-500">approved ({o.expenses_count})</span>
                          {o.pending_expenses_count > 0 && (
                            <p className="text-xs font-semibold text-amber-700">
                              Pending: {formatMoney(o.pending_expenses_total)} ({o.pending_expenses_count})
                            </p>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Table: Pending expenses */}
          <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-bold text-slate-900">Pending expenses to approve</h2>
              <p className="text-sm text-slate-500">Officer-submitted parking, travel, and other job expenses. Approve to add them to outstanding pay and job costs.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Officer</th>
                    <th className="px-5 py-3">Job</th>
                    <th className="px-5 py-3">Expense</th>
                    <th className="px-5 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pendingExpenses.length === 0 ? (
                    <tr><td className="px-5 py-6 text-slate-500" colSpan={5}>No pending expenses for this period.</td></tr>
                  ) : (
                    pendingExpenses.map((e) => (
                      <tr key={e.id} className="hover:bg-slate-50">
                        <td className="px-5 py-4 text-slate-600">{e.expense_date}</td>
                        <td className="px-5 py-4 font-semibold text-slate-900">{e.officer_name || 'Unassigned'}</td>
                        <td className="px-5 py-4">
                          <Link href={`/dashboard/jobs/${e.job_id}`} className="inline-flex items-center gap-1 font-semibold text-[#14B8A6] hover:underline">
                            <Briefcase className="size-3.5" />
                            {e.job_number || `Job #${e.job_id}`}
                          </Link>
                          <p className="text-xs text-slate-500">{e.customer_name || e.job_title || ''}</p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-medium text-slate-800">{e.category}</p>
                          {e.description && <p className="text-xs text-slate-500">{e.description}</p>}
                          <div className="mt-1 flex items-center gap-1.5">
                            <span className="text-xs text-slate-500">Type:</span>
                            <select
                              value={e.expense_type || 'personal'}
                              disabled={updatingExpenseId === e.id}
                              onChange={(evt) => void updateExpenseType(e.id, evt.target.value as any)}
                              className="text-xs font-semibold text-slate-700 bg-slate-100 rounded px-1.5 py-0.5 border border-slate-200 outline-none cursor-pointer focus:border-[#14B8A6]"
                            >
                              <option value="personal">Personal</option>
                              <option value="company">Company</option>
                            </select>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <p className="font-bold text-slate-900">{formatMoney(e.amount)}</p>
                          <div className="mt-2 flex justify-end gap-2">
                            <button
                              type="button"
                              disabled={updatingExpenseId === e.id}
                              onClick={() => void updateExpenseStatus(e.id, 'rejected')}
                              className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                            >
                              Reject
                            </button>
                            <button
                              type="button"
                              disabled={updatingExpenseId === e.id}
                              onClick={() => void updateExpenseStatus(e.id, 'approved')}
                              className="rounded-md bg-[#14B8A6] px-2 py-1 text-xs font-semibold text-white hover:bg-[#0d9488] disabled:opacity-50"
                            >
                              Approve
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Table: Approved expenses */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-bold text-slate-900">Approved expenses outstanding</h2>
              <p className="text-sm text-slate-500">These are approved and included in officer outstanding balance and job Costs tab.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Officer</th>
                    <th className="px-5 py-3">Job</th>
                    <th className="px-5 py-3">Expense</th>
                    <th className="px-5 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {approvedExpenses.length === 0 ? (
                    <tr><td className="px-5 py-6 text-slate-500" colSpan={5}>No approved outstanding expenses for this period.</td></tr>
                  ) : (
                    approvedExpenses.map((e) => (
                      <tr key={e.id} className="hover:bg-slate-50">
                        <td className="px-5 py-4 text-slate-600">{e.expense_date}</td>
                        <td className="px-5 py-4 font-semibold text-slate-900">{e.officer_name || 'Unassigned'}</td>
                        <td className="px-5 py-4">
                          <Link href={`/dashboard/jobs/${e.job_id}`} className="inline-flex items-center gap-1 font-semibold text-[#14B8A6] hover:underline">
                            <Briefcase className="size-3.5" />
                            {e.job_number || `Job #${e.job_id}`}
                          </Link>
                          <p className="text-xs text-slate-500">{e.customer_name || e.job_title || ''}</p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-medium text-slate-800">{e.category}</p>
                          {e.description && <p className="text-xs text-slate-500">{e.description}</p>}
                          <div className="mt-1 flex items-center gap-1.5">
                            <span className="text-xs text-slate-500">Type:</span>
                            <select
                              value={e.expense_type || 'personal'}
                              disabled={updatingExpenseId === e.id}
                              onChange={(evt) => void updateExpenseType(e.id, evt.target.value as any)}
                              className="text-xs font-semibold text-slate-700 bg-slate-100 rounded px-1.5 py-0.5 border border-slate-200 outline-none cursor-pointer focus:border-[#14B8A6]"
                            >
                              <option value="personal">Personal</option>
                              <option value="company">Company</option>
                            </select>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right font-bold text-slate-900">{formatMoney(e.amount)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* --- TAB CONTENT: CALENDAR --- */}
      {activeTab === 'calendar' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Work Calendar</h2>
              <p className="text-sm text-slate-500">Overview of all scheduled diary jobs and company/staff holidays.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrev}
                className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50 transition animate-press"
              >
                <ChevronLeft className="size-5 text-slate-600" />
              </button>
              <span className="min-w-[200px] text-center font-bold text-slate-800">
                {dateText}
              </span>
              <button
                type="button"
                onClick={handleNext}
                className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50 transition animate-press"
              >
                <ChevronRight className="size-5 text-slate-600" />
              </button>
            </div>
          </div>

          <div style={{ height: 600 }} className="mt-4">
            <BigCalendar
              localizer={localizer}
              events={calendarEvents}
              startAccessor="start"
              endAccessor="end"
              titleAccessor="title"
              view={calendarView}
              onView={(v) => setCalendarView(v as any)}
              date={calendarDate}
              onNavigate={(d) => setCalendarDate(d)}
              onSelectEvent={(evt) => {
                setSelectedEvent(evt);
                setShowDetailModal(true);
              }}
              views={['month', 'week', 'day', 'agenda']}
              eventPropGetter={(evt: any) => {
                let classes = 'bg-[#14B8A6] border-[#0d9488]';
                if (evt.color) classes = evt.color;
                return {
                  className: `${classes} text-white font-semibold text-xs px-2 py-0.5 rounded shadow-sm cursor-pointer hover:opacity-90 transition`,
                };
              }}
            />
          </div>
        </div>
      )}

      {/* --- TAB CONTENT: HOLIDAYS --- */}
      {activeTab === 'holidays' && (
        <>
          {/* Header Controls for Holidays */}
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 w-fit shadow-sm">
              {(['requests', 'holidays'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setHolidaySubTab(t)}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                    holidaySubTab === t ? 'bg-[#14B8A6] text-white' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {t === 'requests' ? `Requests${pendingHolidays.length > 0 ? ` (${pendingHolidays.length})` : ''}` : 'Company Holidays'}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowRequestModal(true)}
                className="flex items-center gap-2 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0d9488] shadow-sm"
              >
                <Plus className="size-4" /> Request Holiday
              </button>
              <button
                type="button"
                onClick={() => setShowHolidayModal(true)}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
              >
                <Plus className="size-4" /> Add Company Holiday
              </button>
            </div>
          </div>

          {/* Sub-tab: Requests */}
          {holidaySubTab === 'requests' && (
            <div className="space-y-6">
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-5 py-4">
                  <h2 className="text-lg font-bold text-slate-900">Pending Requests</h2>
                  <p className="text-sm text-slate-500">Review and approve or reject holiday requests.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-100 text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-5 py-3">Staff Member</th>
                        <th className="px-5 py-3">Dates</th>
                        <th className="px-5 py-3">Days</th>
                        <th className="px-5 py-3">Type</th>
                        <th className="px-5 py-3">Reason</th>
                        <th className="px-5 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {loadingHolidays ? (
                        <tr><td className="px-5 py-6 text-slate-500" colSpan={6}>Loading…</td></tr>
                      ) : pendingHolidays.length === 0 ? (
                        <tr><td className="px-5 py-6 text-slate-500" colSpan={6}>No pending requests.</td></tr>
                      ) : (
                        pendingHolidays.map((r) => (
                          <tr key={r.id} className="hover:bg-slate-50">
                            <td className="px-5 py-4 font-semibold text-slate-900">{r.officer_name || 'Unknown'}</td>
                            <td className="px-5 py-4 text-slate-700">
                              {formatDateTimeString(r.start_date)}{r.start_date !== r.end_date && <> – {formatDateTimeString(r.end_date)}</>}
                            </td>
                            <td className="px-5 py-4 font-semibold text-slate-900">{r.days_count ?? '–'}</td>
                            <td className="px-5 py-4 capitalize text-slate-700">{r.leave_type}</td>
                            <td className="px-5 py-4 text-slate-600 max-w-[200px] truncate">{r.reason || '–'}</td>
                            <td className="px-5 py-4 text-right">
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  disabled={updatingHolidayId === r.id}
                                  onClick={() => void updateHolidayRequestStatus(r.id, 'rejected')}
                                  className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                                >
                                  <XCircle className="mr-1 inline size-3" /> Reject
                                </button>
                                <button
                                  type="button"
                                  disabled={updatingHolidayId === r.id}
                                  onClick={() => void updateHolidayRequestStatus(r.id, 'approved')}
                                  className="rounded-md bg-[#14B8A6] px-2 py-1 text-xs font-semibold text-white hover:bg-[#0d9488] disabled:opacity-50"
                                >
                                  <CheckCircle className="mr-1 inline size-3" /> Approve
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-5 py-4">
                  <h2 className="text-lg font-bold text-slate-900">Processed Requests</h2>
                  <p className="text-sm text-slate-500">Previously approved or rejected requests.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-100 text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-5 py-3">Staff Member</th>
                        <th className="px-5 py-3">Dates</th>
                        <th className="px-5 py-3">Days</th>
                        <th className="px-5 py-3">Type</th>
                        <th className="px-5 py-3">Status</th>
                        <th className="px-5 py-3">Reviewed By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {processedHolidays.length === 0 ? (
                        <tr><td className="px-5 py-6 text-slate-500" colSpan={6}>No processed requests yet.</td></tr>
                      ) : (
                        processedHolidays.map((r) => (
                          <tr key={r.id} className="hover:bg-slate-50">
                            <td className="px-5 py-4 font-semibold text-slate-900">{r.officer_name || 'Unknown'}</td>
                            <td className="px-5 py-4 text-slate-700">
                              {formatDateTimeString(r.start_date)}{r.start_date !== r.end_date && <> – {formatDateTimeString(r.end_date)}</>}
                            </td>
                            <td className="px-5 py-4 font-semibold text-slate-900">{r.days_count ?? '–'}</td>
                            <td className="px-5 py-4 capitalize text-slate-700">{r.leave_type}</td>
                            <td className="px-5 py-4">
                              <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColor(r.status)}`}>
                                {r.status}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-slate-600">{r.approved_by_name || '–'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          {/* Sub-tab: Company Holidays */}
          {holidaySubTab === 'holidays' && (
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="text-lg font-bold text-slate-900">Company Holidays</h2>
                <p className="text-sm text-slate-500">Bank holidays and company-wide days off.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Date</th>
                      <th className="px-5 py-3">Title</th>
                      <th className="px-5 py-3">Description</th>
                      <th className="px-5 py-3">Recurring</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loadingHolidays ? (
                      <tr><td className="px-5 py-6 text-slate-500" colSpan={5}>Loading…</td></tr>
                    ) : holidays.length === 0 ? (
                      <tr><td className="px-5 py-6 text-slate-500" colSpan={5}>No company holidays added yet.</td></tr>
                    ) : (
                      holidays.map((h) => (
                        <tr key={h.id} className="hover:bg-slate-50">
                          <td className="px-5 py-4 font-semibold text-slate-900">{formatDate(h.holiday_date)}</td>
                          <td className="px-5 py-4 text-slate-900">{h.title}</td>
                          <td className="px-5 py-4 text-slate-600 max-w-[300px] truncate">{h.description || '–'}</td>
                          <td className="px-5 py-4 text-slate-700">{h.is_recurring ? 'Yes' : 'No'}</td>
                          <td className="px-5 py-4 text-right">
                            <button
                              type="button"
                              onClick={() => void deleteHoliday(h.id)}
                              className="rounded-md border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {/* --- MODAL: REQUEST TIME OFF --- */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowRequestModal(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900">Request Holiday</h3>
            <form onSubmit={submitRequest} className="mt-4 space-y-4">
              <label className="block">
                <span className="text-xs font-bold uppercase text-slate-500">Staff Member</span>
                <select
                  value={reqForm.officer_id}
                  onChange={(e) => setReqForm({ ...reqForm, officer_id: e.target.value })}
                  required
                  className={selectClass}
                >
                  <option value="">-- Choose member --</option>
                  {officers.map((o) => (
                    <option key={o.id} value={o.id}>{o.full_name}</option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-bold uppercase text-slate-500">Start Date & Time</span>
                  <input
                    type="datetime-local"
                    value={reqForm.start_date}
                    onChange={(e) => setReqForm({ ...reqForm, start_date: e.target.value })}
                    required
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase text-slate-500">End Date & Time</span>
                  <input
                    type="datetime-local"
                    value={reqForm.end_date}
                    onChange={(e) => setReqForm({ ...reqForm, end_date: e.target.value })}
                    required
                    className={inputClass}
                  />
                </label>
              </div>
              <label className="block">
                <span className="text-xs font-bold uppercase text-slate-500">Leave Type</span>
                <select
                  value={reqForm.leave_type}
                  onChange={(e) => setReqForm({ ...reqForm, leave_type: e.target.value })}
                  className={selectClass}
                >
                  <option value="annual">Annual Leave</option>
                  <option value="sick">Sick Leave</option>
                  <option value="unpaid">Unpaid Leave</option>
                  <option value="other">Other time off</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase text-slate-500">Reason / Notes</span>
                <textarea
                  value={reqForm.reason}
                  onChange={(e) => setReqForm({ ...reqForm, reason: e.target.value })}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
                />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRequestModal(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0d9488]"
                >
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: ADD COMPANY HOLIDAY --- */}
      {showHolidayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowHolidayModal(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900">Add Company Holiday</h3>
            <form onSubmit={submitHoliday} className="mt-4 space-y-4">
              <label className="block">
                <span className="text-xs font-bold uppercase text-slate-500">Holiday Title</span>
                <input
                  type="text"
                  value={holidayForm.title}
                  onChange={(e) => setHolidayForm({ ...holidayForm, title: e.target.value })}
                  placeholder="e.g. Christmas Day"
                  required
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase text-slate-500">Date</span>
                <input
                  type="date"
                  value={holidayForm.holiday_date}
                  onChange={(e) => setHolidayForm({ ...holidayForm, holiday_date: e.target.value })}
                  required
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase text-slate-500">Description / Details</span>
                <textarea
                  value={holidayForm.description}
                  onChange={(e) => setHolidayForm({ ...holidayForm, description: e.target.value })}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
                />
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={holidayForm.is_recurring}
                  onChange={(e) => setHolidayForm({ ...holidayForm, is_recurring: e.target.checked })}
                  className="size-4 rounded text-[#14B8A6] focus:ring-[#14B8A6]"
                />
                <span className="text-sm text-slate-700">Repeats every year on this date</span>
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowHolidayModal(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0d9488]"
                >
                  Save Holiday
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* --- MODAL: EVENT DETAIL --- */}
      {showDetailModal && selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowDetailModal(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowDetailModal(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 transition"
            >
              <X className="size-5" />
            </button>

            {selectedEvent.type === 'diary' && (
              <div>
                <span className="inline-block rounded-full bg-[#14B8A6]/10 px-2.5 py-0.5 text-xs font-semibold text-[#14B8A6] mb-3">
                  Job Visit
                </span>
                <h3 className="text-xl font-bold text-slate-900">
                  {selectedEvent.raw.job_number || 'Job'}
                </h3>
                {selectedEvent.raw.title && (
                  <p className="mt-1 text-md font-semibold text-slate-700">{selectedEvent.raw.title}</p>
                )}

                <div className="mt-4 space-y-3 border-t border-slate-100 pt-4 text-sm text-slate-600">
                  {selectedEvent.raw.customer_full_name && (
                    <div>
                      <span className="font-bold text-slate-900 block text-xs uppercase tracking-wider">Customer</span>
                      <p className="mt-0.5 text-slate-800">{selectedEvent.raw.customer_full_name}</p>
                    </div>
                  )}

                  {selectedEvent.raw.customer_address && (
                    <div>
                      <span className="font-bold text-slate-900 block text-xs uppercase tracking-wider">Site Address</span>
                      <p className="mt-0.5 text-slate-800">{selectedEvent.raw.customer_address}</p>
                    </div>
                  )}

                  {selectedEvent.raw.site_contact_name && (
                    <div>
                      <span className="font-bold text-slate-900 block text-xs uppercase tracking-wider">Site Contact</span>
                      <p className="mt-0.5 text-slate-800">{selectedEvent.raw.site_contact_name}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="font-bold text-slate-900 block text-xs uppercase tracking-wider">Time Slot</span>
                      <p className="mt-0.5 text-slate-800">
                        {format(new Date(selectedEvent.start), 'HH:mm')} – {format(new Date(selectedEvent.end), 'HH:mm')}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {format(new Date(selectedEvent.start), 'EEEE, d MMMM yyyy')}
                      </p>
                    </div>
                    <div>
                      <span className="font-bold text-slate-900 block text-xs uppercase tracking-wider">Duration</span>
                      <p className="mt-0.5 text-slate-800">{selectedEvent.raw.duration_minutes || 60} mins</p>
                    </div>
                  </div>

                  <div>
                    <span className="font-bold text-slate-900 block text-xs uppercase tracking-wider">Staff Assigned</span>
                    <p className="mt-0.5 text-slate-800">
                      {selectedEvent.raw.officers && selectedEvent.raw.officers.length > 0
                        ? selectedEvent.raw.officers.map((o: any) => `${o.full_name}${o.is_primary ? ' (Primary)' : ''}`).join(', ')
                        : selectedEvent.raw.officer_full_name || 'Unassigned'}
                    </p>
                  </div>

                  {selectedEvent.raw.notes && (
                    <div>
                      <span className="font-bold text-slate-900 block text-xs uppercase tracking-wider">Notes</span>
                      <p className="mt-0.5 text-slate-800 bg-slate-50 border border-slate-100 rounded-lg p-2 text-xs italic">{selectedEvent.raw.notes}</p>
                    </div>
                  )}

                  {selectedEvent.raw.event_status && (
                    <div>
                      <span className="font-bold text-slate-900 block text-xs uppercase tracking-wider">Status</span>
                      <span className={`inline-block mt-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        selectedEvent.raw.event_status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : selectedEvent.raw.event_status === 'aborted'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {selectedEvent.raw.event_status}
                      </span>
                      {selectedEvent.raw.abort_reason && (
                        <p className="text-xs text-rose-600 mt-1">Reason: {selectedEvent.raw.abort_reason}</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
                  <button
                    onClick={() => setShowDetailModal(false)}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
                  >
                    Close
                  </button>
                  <Link
                    href={`/dashboard/jobs/${selectedEvent.raw.job_id}`}
                    className="rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0d9488] transition inline-flex items-center gap-1.5 shadow-sm"
                  >
                    <Briefcase className="size-4" /> View Job Details
                  </Link>
                </div>
              </div>
            )}

            {selectedEvent.type === 'holiday' && (
              <div>
                <span className="inline-block rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-800 mb-3">
                  Company Holiday
                </span>
                <h3 className="text-xl font-bold text-slate-900">
                  {selectedEvent.raw.title}
                </h3>

                <div className="mt-4 space-y-3 border-t border-slate-100 pt-4 text-sm text-slate-600">
                  <div>
                    <span className="font-bold text-slate-900 block text-xs uppercase tracking-wider">Date</span>
                    <p className="mt-0.5 text-slate-800">{format(new Date(selectedEvent.start), 'EEEE, d MMMM yyyy')}</p>
                  </div>

                  {selectedEvent.raw.description && (
                    <div>
                      <span className="font-bold text-slate-900 block text-xs uppercase tracking-wider">Description</span>
                      <p className="mt-0.5 text-slate-800">{selectedEvent.raw.description}</p>
                    </div>
                  )}

                  <div>
                    <span className="font-bold text-slate-900 block text-xs uppercase tracking-wider">Recurring</span>
                    <p className="mt-0.5 text-slate-800">{selectedEvent.raw.is_recurring ? 'Yes, repeats annually' : 'No'}</p>
                  </div>
                </div>

                <div className="mt-6 flex justify-end border-t border-slate-100 pt-4">
                  <button
                    onClick={() => setShowDetailModal(false)}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            {selectedEvent.type === 'leave' && (
              <div>
                <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold mb-3 ${
                  selectedEvent.raw.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}>
                  Staff Leave ({selectedEvent.raw.status})
                </span>
                <h3 className="text-xl font-bold text-slate-900">
                  {selectedEvent.raw.officer_name || 'Staff Member'}
                </h3>

                <div className="mt-4 space-y-3 border-t border-slate-100 pt-4 text-sm text-slate-600">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="font-bold text-slate-900 block text-xs uppercase tracking-wider">Start Date</span>
                      <p className="mt-0.5 text-slate-800">{format(new Date(selectedEvent.raw.start_date + 'T00:00:00'), 'EEE, d MMM yyyy')}</p>
                    </div>
                    <div>
                      <span className="font-bold text-slate-900 block text-xs uppercase tracking-wider">End Date</span>
                      <p className="mt-0.5 text-slate-800">{format(new Date(selectedEvent.raw.end_date + 'T00:00:00'), 'EEE, d MMM yyyy')}</p>
                    </div>
                  </div>

                  <div>
                    <span className="font-bold text-slate-900 block text-xs uppercase tracking-wider">Leave Duration</span>
                    <p className="mt-0.5 text-slate-800">{selectedEvent.raw.days_count ?? '–'} Days</p>
                  </div>

                  <div>
                    <span className="font-bold text-slate-900 block text-xs uppercase tracking-wider">Leave Type</span>
                    <p className="mt-0.5 text-slate-800 capitalize">{selectedEvent.raw.leave_type}</p>
                  </div>

                  {selectedEvent.raw.reason && (
                    <div>
                      <span className="font-bold text-slate-900 block text-xs uppercase tracking-wider">Reason</span>
                      <p className="mt-0.5 text-slate-800 bg-slate-50 border border-slate-100 rounded-lg p-2 text-xs italic">{selectedEvent.raw.reason}</p>
                    </div>
                  )}

                  {selectedEvent.raw.status === 'approved' && selectedEvent.raw.approved_by_name && (
                    <div>
                      <span className="font-bold text-slate-900 block text-xs uppercase tracking-wider">Approved By</span>
                      <p className="mt-0.5 text-slate-800">{selectedEvent.raw.approved_by_name}</p>
                    </div>
                  )}
                </div>

                <div className="mt-6 flex justify-end border-t border-slate-100 pt-4">
                  <button
                    onClick={() => setShowDetailModal(false)}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-[#14B8A6]/10 text-[#14B8A6]">{icon}</div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
