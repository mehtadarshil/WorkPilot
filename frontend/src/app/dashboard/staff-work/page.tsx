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
  ImageIcon,
  Wallet,
  Edit2,
} from 'lucide-react';
import { format, parse, startOfWeek, endOfWeek, startOfMonth, endOfMonth, endOfDay, addDays, getDay, addMonths, addHours, startOfDay, isSameDay } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { Calendar as BigCalendar, dateFnsLocalizer } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { getBlob, getJson, postJson, patchJson, deleteRequest } from '../../apiClient';
import SearchableSelect from '../SearchableSelect';

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
  company_expenses_total: number;
  company_expenses_count: number;
  pending_expenses_total: number;
  pending_expenses_count: number;
  personal_approved_all_time: number;
  personal_paid_total: number;
  personal_paid_count: number;
  personal_outstanding: number;
};

type ExpenseProof = {
  stored_filename: string;
  original_filename: string;
  content_type: string;
  href: string;
};

type ExpenseRow = {
  id: number;
  job_id: number;
  officer_id: number | null;
  officer_name: string | null;
  claimed_by_name: string | null;
  job_title: string | null;
  job_number: string | null;
  customer_name: string | null;
  expense_date: string;
  category: string;
  description: string | null;
  amount: number;
  status: string;
  expense_type: string;
  proof_files?: ExpenseProof[];
  created_at: string | null;
};

type GeneralOverheadExpense = {
  id: number;
  expense_date: string;
  category: string;
  description: string | null;
  amount: number;
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
    company_expenses_total: number;
    company_expenses_count: number;
    pending_expenses_total: number;
    pending_expenses_count: number;
    personal_paid_total: number;
    personal_outstanding: number;
    general_overhead_total?: number;
    general_overhead_count?: number;
    general_overhead_all_time?: number;
  };
};

const GENERAL_OVERHEAD_CATEGORIES = [
  'Insurance',
  'Rent',
  'Utilities',
  'Vehicle costs',
  'Software & subscriptions',
  'Office',
  'Professional fees',
  'General',
];

type OfficerPaymentRow = {
  id: number;
  amount: number;
  payment_method: string;
  payment_date: string;
  reference_number: string | null;
  notes: string | null;
  created_at: string | null;
  created_by_name: string | null;
};

type OfficerPaymentSummary = {
  approved_total: number;
  approved_count: number;
  paid_total: number;
  paid_count: number;
  outstanding: number;
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
  calendar_color?: string | null;
};

type CalendarEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  officerKey?: string;
  officerLabel?: string;
  type?: string;
  raw?: unknown;
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

const ENGINEER_CALENDAR_PALETTE = [
  { color: 'bg-[#14B8A6] text-white', borderColor: '#0d9488', swatch: 'bg-[#14B8A6]' },
  { color: 'bg-blue-600 text-white', borderColor: '#2563eb', swatch: 'bg-blue-600' },
  { color: 'bg-violet-600 text-white', borderColor: '#7c3aed', swatch: 'bg-violet-600' },
  { color: 'bg-rose-600 text-white', borderColor: '#e11d48', swatch: 'bg-rose-600' },
  { color: 'bg-amber-600 text-white', borderColor: '#d97706', swatch: 'bg-amber-600' },
  { color: 'bg-cyan-600 text-white', borderColor: '#0891b2', swatch: 'bg-cyan-600' },
  { color: 'bg-fuchsia-600 text-white', borderColor: '#c026d3', swatch: 'bg-fuchsia-600' },
  { color: 'bg-lime-700 text-white', borderColor: '#65a30d', swatch: 'bg-lime-700' },
  { color: 'bg-orange-600 text-white', borderColor: '#ea580c', swatch: 'bg-orange-600' },
  { color: 'bg-sky-600 text-white', borderColor: '#0284c7', swatch: 'bg-sky-600' },
  { color: 'bg-pink-600 text-white', borderColor: '#db2777', swatch: 'bg-pink-600' },
  { color: 'bg-teal-700 text-white', borderColor: '#0f766e', swatch: 'bg-teal-700' },
] as const;

function officerColorKey(id: number | string | null | undefined, name?: string | null): string {
  if (id != null && id !== '' && Number.isFinite(Number(id))) return `id:${id}`;
  const n = (name ?? '').trim().toLowerCase();
  return n ? `name:${n}` : 'unassigned';
}

function officerCalendarColors(key: string) {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return ENGINEER_CALENDAR_PALETTE[hash % ENGINEER_CALENDAR_PALETTE.length]!;
}

function officerCalendarStyle(key: string, customColor?: string | null) {
  if (customColor && /^#[0-9A-Fa-f]{6}$/i.test(customColor)) {
    return { backgroundColor: customColor, borderColor: customColor, textColor: '#ffffff' };
  }
  const palette = officerCalendarColors(key);
  return { backgroundColor: palette.borderColor, borderColor: palette.borderColor, textColor: '#ffffff' };
}

function diaryEventOfficerKey(e: Record<string, unknown>): string {
  if (e.officer_id != null && Number.isFinite(Number(e.officer_id))) {
    return officerColorKey(Number(e.officer_id));
  }
  const officers = Array.isArray(e.officers) ? e.officers : [];
  const primary = officers.find((o) => o && typeof o === 'object' && (o as { is_primary?: boolean }).is_primary) ?? officers[0];
  if (primary && typeof primary === 'object') {
    const p = primary as { id?: number; full_name?: string };
    return officerColorKey(p.id ?? null, p.full_name ?? null);
  }
  return officerColorKey(null, typeof e.officer_full_name === 'string' ? e.officer_full_name : null);
}

function diaryEventOfficerLabel(e: Record<string, unknown>): string {
  if (typeof e.officer_full_name === 'string' && e.officer_full_name.trim()) return e.officer_full_name.trim();
  const officers = Array.isArray(e.officers) ? e.officers : [];
  const names = officers
    .map((o) => (o && typeof o === 'object' ? (o as { full_name?: string }).full_name : null))
    .filter((n): n is string => typeof n === 'string' && n.trim().length > 0);
  if (names.length > 0) return names.join(', ');
  return 'Unassigned';
}

// --- Component ---
export default function StaffWorkPage() {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<'summary' | 'calendar' | 'holidays'>('calendar');

  // --- Work Summary Tab States ---
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [summary, setSummary] = useState<StaffWorkSummary | null>(null);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [overheadExpenses, setOverheadExpenses] = useState<GeneralOverheadExpense[]>([]);
  const [overheadForm, setOverheadForm] = useState({
    expense_date: today(),
    category: 'Insurance',
    description: '',
    amount: '',
  });
  const [savingOverhead, setSavingOverhead] = useState(false);
  const [overheadError, setOverheadError] = useState<string | null>(null);
  const [editingOverheadId, setEditingOverheadId] = useState<number | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [updatingExpenseId, setUpdatingExpenseId] = useState<number | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [proofPreviewUrl, setProofPreviewUrl] = useState<string | null>(null);
  const [paymentModalOfficer, setPaymentModalOfficer] = useState<OfficerWorkRow | null>(null);
  const [paymentHistoryOfficer, setPaymentHistoryOfficer] = useState<OfficerWorkRow | null>(null);
  const [officerPayments, setOfficerPayments] = useState<OfficerPaymentRow[]>([]);
  const [officerPaymentSummary, setOfficerPaymentSummary] = useState<OfficerPaymentSummary | null>(null);
  const [loadingOfficerPayments, setLoadingOfficerPayments] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    payment_method: 'bank_transfer',
    payment_date: today(),
    reference_number: '',
    notes: '',
  });
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

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
  const [calendarOfficerFilter, setCalendarOfficerFilter] = useState<string>('all');
  const [officerColorMap, setOfficerColorMap] = useState<Map<string, string>>(new Map());
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
      const [summaryRes, expensesRes, overheadRes] = await Promise.all([
        getJson<StaffWorkSummary>(`/staff-work/summary?${q}`, token),
        getJson<{ expenses: ExpenseRow[] }>(`/staff-work/expenses?${q}`, token),
        getJson<{ expenses: GeneralOverheadExpense[] }>(`/company-overhead-expenses?${q}`, token),
      ]);
      setSummary(summaryRes);
      setExpenses(expensesRes.expenses ?? []);
      setOverheadExpenses(overheadRes.expenses ?? []);
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : 'Could not load staff work summary');
      setSummary(null);
      setExpenses([]);
      setOverheadExpenses([]);
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

      const [eventsRes, reqRes, holRes, offRes] = await Promise.all([
        getJson<{ events: any[] }>(`/diary-events?${diaryQ}`, token),
        getJson<{ requests: HolidayRequest[] }>('/holiday-requests', token),
        getJson<{ holidays: Holiday[] }>(`/holidays?${holQ}`, token),
        getJson<{ officers: Officer[] }>('/officers/list', token),
      ]);

      const colorMap = new Map<string, string>();
      for (const officer of offRes.officers ?? []) {
        if (officer.calendar_color) {
          colorMap.set(officerColorKey(officer.id), officer.calendar_color);
        }
      }
      setOfficerColorMap(colorMap);

      const diaryEvts = (eventsRes.events ?? []).map((e: any) => {
        const start = new Date(e.start_time);
        const end = new Date(start.getTime() + (e.duration_minutes || 60) * 60000);
        const oKey = diaryEventOfficerKey(e);
        const palette = officerCalendarStyle(oKey, colorMap.get(oKey));
        const officerLabel = diaryEventOfficerLabel(e);
        return {
          id: `diary-${e.diary_id}`,
          title: `🔧 ${e.job_number || 'Job'} (${officerLabel})`,
          start,
          end,
          backgroundColor: palette.backgroundColor,
          borderColor: palette.borderColor,
          textColor: palette.textColor,
          officerKey: oKey,
          officerLabel,
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
        backgroundColor: '#4f46e5',
        borderColor: '#4f46e5',
        textColor: '#ffffff',
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
        .map((r: any) => {
          const oKey = officerColorKey(r.officer_id, r.officer_name);
          const palette = officerCalendarStyle(oKey, colorMap.get(oKey));
          return {
            id: `leave-${r.id}`,
            title: `${r.status === 'approved' ? '✈️' : '⏳'} ${r.officer_name} Leave`,
            start: new Date(r.start_date),
            end: new Date(r.end_date),
            allDay: false,
            backgroundColor: palette.backgroundColor,
            borderColor: palette.borderColor,
            textColor: palette.textColor,
            officerKey: oKey,
            officerLabel: r.officer_name || 'Leave',
            type: 'leave',
            raw: r,
          };
        });

      setCalendarEvents([...diaryEvts, ...companyHols, ...leaveEvts]);
    } catch (e) {
      console.error('Error loading calendar events:', e);
    }
  }, [dateRange, token]);

  // Load summary totals for expense badges even when another tab is active.
  useEffect(() => {
    void fetchSummaryData();
  }, [fetchSummaryData]);

  useEffect(() => {
    if (activeTab === 'holidays') {
      void fetchHolidaysData();
    } else if (activeTab === 'calendar') {
      void fetchCalendarEvents();
    }
  }, [activeTab, fetchHolidaysData, fetchCalendarEvents]);

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

  const updateExpenseOfficer = async (expenseId: number, officerId: number | null) => {
    if (!token) return;
    setUpdatingExpenseId(expenseId);
    setSummaryError(null);
    try {
      await patchJson(`/job-expenses/${expenseId}`, { officer_id: officerId }, token);
      await fetchSummaryData();
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : 'Could not update expense officer');
    } finally {
      setUpdatingExpenseId(null);
    }
  };

  const resetOverheadForm = () => {
    setOverheadForm({ expense_date: today(), category: 'Insurance', description: '', amount: '' });
    setEditingOverheadId(null);
    setOverheadError(null);
  };

  const startEditOverhead = (expense: GeneralOverheadExpense) => {
    setEditingOverheadId(expense.id);
    setOverheadForm({
      expense_date: expense.expense_date,
      category: expense.category,
      description: expense.description ?? '',
      amount: String(expense.amount),
    });
    setOverheadError(null);
  };

  const saveOverheadExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    const amount = parseFloat(overheadForm.amount.replace(/,/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) {
      setOverheadError('Enter a valid amount greater than zero');
      return;
    }
    setSavingOverhead(true);
    setOverheadError(null);
    try {
      const payload = {
        expense_date: overheadForm.expense_date,
        category: overheadForm.category.trim() || 'General',
        description: overheadForm.description.trim() || null,
        amount,
      };
      if (editingOverheadId) {
        await patchJson(`/company-overhead-expenses/${editingOverheadId}`, payload, token);
      } else {
        await postJson('/company-overhead-expenses', payload, token);
      }
      resetOverheadForm();
      await fetchSummaryData();
    } catch (err) {
      setOverheadError(err instanceof Error ? err.message : 'Could not save expense');
    } finally {
      setSavingOverhead(false);
    }
  };

  const deleteOverheadExpense = async (id: number) => {
    if (!token) return;
    if (!confirm('Delete this general company expense?')) return;
    try {
      await deleteRequest(`/company-overhead-expenses/${id}`, token);
      if (editingOverheadId === id) resetOverheadForm();
      await fetchSummaryData();
    } catch (err) {
      setOverheadError(err instanceof Error ? err.message : 'Could not delete expense');
    }
  };

  const openExpenseProof = async (href: string) => {
    if (!token) return;
    try {
      const blob = await getBlob(href, token);
      const url = URL.createObjectURL(blob);
      setProofPreviewUrl(url);
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : 'Could not open receipt');
    }
  };

  const closeExpenseProof = () => {
    if (proofPreviewUrl) URL.revokeObjectURL(proofPreviewUrl);
    setProofPreviewUrl(null);
  };

  const expenseClaimerLabel = (e: ExpenseRow) => e.claimed_by_name || e.officer_name || 'Unknown';

  const paymentMethodLabel = (method: string) =>
    method.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const fetchOfficerPayments = useCallback(async (officerId: number) => {
    if (!token) return;
    setLoadingOfficerPayments(true);
    try {
      const data = await getJson<{ payments: OfficerPaymentRow[]; summary: OfficerPaymentSummary }>(
        `/officers/${officerId}/payments`,
        token,
      );
      setOfficerPayments(data.payments ?? []);
      setOfficerPaymentSummary(data.summary ?? null);
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : 'Could not load officer payments');
      setOfficerPayments([]);
      setOfficerPaymentSummary(null);
    } finally {
      setLoadingOfficerPayments(false);
    }
  }, [token]);

  const openPaymentModal = (officer: OfficerWorkRow) => {
    setPaymentModalOfficer(officer);
    setPaymentError(null);
    setPaymentForm({
      amount: officer.personal_outstanding > 0 ? officer.personal_outstanding.toFixed(2) : '',
      payment_method: 'bank_transfer',
      payment_date: today(),
      reference_number: '',
      notes: '',
    });
  };

  const openPaymentHistory = (officer: OfficerWorkRow) => {
    setPaymentHistoryOfficer(officer);
    void fetchOfficerPayments(officer.id);
  };

  const submitOfficerPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !paymentModalOfficer) return;
    setPaymentError(null);
    const amount = parseFloat(paymentForm.amount.replace(/,/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) {
      setPaymentError('Enter a valid payment amount greater than zero.');
      return;
    }
    setPaymentSubmitting(true);
    const officerId = paymentModalOfficer.id;
    try {
      await postJson(
        `/officers/${officerId}/payments`,
        {
          amount,
          payment_method: paymentForm.payment_method,
          payment_date: paymentForm.payment_date,
          reference_number: paymentForm.reference_number.trim() || undefined,
          notes: paymentForm.notes.trim() || undefined,
        },
        token,
      );
      setPaymentModalOfficer(null);
      await fetchSummaryData();
      if (paymentHistoryOfficer?.id === officerId) {
        void fetchOfficerPayments(officerId);
      }
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : 'Could not record payment');
    } finally {
      setPaymentSubmitting(false);
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

  const officerOptions = useMemo(() => {
    return officers.map((o) => ({
      value: String(o.id),
      label: o.full_name,
    }));
  }, [officers]);

  const totals = summary?.totals;
  const pendingExpenses = expenses.filter((e) => e.status === 'submitted');
  const approvedExpenses = expenses.filter((e) => e.status === 'approved');
  const approvedCompanyTotal = useMemo(
    () => approvedExpenses.filter((e) => e.expense_type === 'company').reduce((sum, e) => sum + e.amount, 0),
    [approvedExpenses],
  );
  const approvedPersonalTotal = useMemo(
    () => approvedExpenses.filter((e) => e.expense_type === 'personal').reduce((sum, e) => sum + e.amount, 0),
    [approvedExpenses],
  );

  const filteredCalendarEvents = useMemo(() => {
    if (calendarOfficerFilter === 'all') return calendarEvents;
    return calendarEvents.filter((evt) => {
      if (evt.type === 'holiday') return true;
      if (evt.type === 'diary' && evt.raw && Array.isArray((evt.raw as any).officers)) {
        const matchingOfficer = (evt.raw as any).officers.find(
          (o: any) => o && String(o.id) === calendarOfficerFilter
        );
        if (matchingOfficer) return true;
      }
      if (evt.officerKey === `id:${calendarOfficerFilter}`) return true;
      if (evt.raw && String((evt.raw as any).officer_id) === calendarOfficerFilter) return true;
      return false;
    });
  }, [calendarEvents, calendarOfficerFilter]);

  const calendarEngineerLegend = useMemo(() => {
    const map = new Map<string, string>();
    for (const evt of calendarEvents) {
      if (evt.type === 'holiday' || !evt.officerKey || !evt.officerLabel) continue;
      if (!map.has(evt.officerKey)) map.set(evt.officerKey, evt.officerLabel);
    }
    return Array.from(map.entries())
      .map(([key, label]) => {
        const style = officerCalendarStyle(key, officerColorMap.get(key));
        return { key, label, borderColor: style.borderColor };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [calendarEvents, officerColorMap]);

  const pendingExpenseCount = summary?.totals?.pending_expenses_count ?? 0;

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
            className={`relative flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === 'summary' ? 'bg-[#14B8A6] text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Clock3 className="size-4" /> Work Summary
            {pendingExpenseCount > 0 && (
              <span
                className={`inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  activeTab === 'summary' ? 'bg-white text-rose-600' : 'bg-rose-600 text-white'
                }`}
              >
                {pendingExpenseCount}
              </span>
            )}
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
          {pendingExpenseCount > 0 && (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              <strong>{pendingExpenseCount} expense{pendingExpenseCount === 1 ? '' : 's'}</strong> waiting for your approval in this period.
            </div>
          )}
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

          <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
            <SummaryCard icon={<Clock3 className="size-5" />} label="Hours worked" value={formatHours(totals?.total_seconds ?? 0)} />
            <SummaryCard icon={<Route className="size-5" />} label="Travelling" value={formatHours(totals?.travelling_seconds ?? 0)} />
            <SummaryCard icon={<Gauge className="size-5" />} label="On site" value={formatHours(totals?.on_site_seconds ?? 0)} />
            <SummaryCard icon={<CalendarDays className="size-5" />} label="Days worked" value={`${totals?.days_worked ?? 0}`} />
            <SummaryCard icon={<ReceiptText className="size-5" />} label="Personal expenses (period)" value={formatMoney(totals?.expenses_total ?? 0)} sub={`${totals?.expenses_count ?? 0} approved`} />
            <SummaryCard icon={<ReceiptText className="size-5" />} label="Company expenses (period)" value={formatMoney(totals?.company_expenses_total ?? 0)} sub={`${totals?.company_expenses_count ?? 0} approved`} />
            <SummaryCard icon={<Wallet className="size-5" />} label="General overheads (period)" value={formatMoney(totals?.general_overhead_total ?? 0)} sub={`${totals?.general_overhead_count ?? 0} entries · insurance, rent, etc.`} />
            <SummaryCard icon={<Wallet className="size-5" />} label="Paid to officers" value={formatMoney(totals?.personal_paid_total ?? 0)} sub="All time" />
            <SummaryCard icon={<Wallet className="size-5" />} label="Outstanding to officers" value={formatMoney(totals?.personal_outstanding ?? 0)} sub="Approved personal minus paid" />
          </div>

          {/* Table: Officer hours */}
          <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-bold text-slate-900">Officer hours</h2>
              <p className="text-sm text-slate-500">Period totals for hours and expenses. Paid and outstanding are all-time personal expense balances.</p>
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
                    <th className="px-5 py-3">Personal</th>
                    <th className="px-5 py-3">Company</th>
                    <th className="px-5 py-3">Paid</th>
                    <th className="px-5 py-3">Outstanding</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingSummary ? (
                    <tr><td className="px-5 py-6 text-slate-500" colSpan={10}>Loading staff work…</td></tr>
                  ) : sortedOfficers.length === 0 ? (
                    <tr><td className="px-5 py-6 text-slate-500" colSpan={10}>No officers found.</td></tr>
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
                        <td className="px-5 py-4">
                          <span className="font-semibold text-slate-900">{formatMoney(o.company_expenses_total)}</span>
                          <span className="ml-2 text-xs text-slate-500">approved ({o.company_expenses_count})</span>
                        </td>
                        <td className="px-5 py-4 font-semibold text-emerald-700">{formatMoney(o.personal_paid_total)}</td>
                        <td className="px-5 py-4">
                          <span className={`font-semibold ${o.personal_outstanding > 0 ? 'text-rose-700' : 'text-slate-700'}`}>
                            {formatMoney(o.personal_outstanding)}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openPaymentModal(o)}
                              className="rounded-lg bg-[#14B8A6] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0d9488]"
                            >
                              Record payment
                            </button>
                            <button
                              type="button"
                              onClick={() => openPaymentHistory(o)}
                              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Payment history
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
                    <th className="px-5 py-3">Claimed by</th>
                    <th className="px-5 py-3">Job</th>
                    <th className="px-5 py-3">Expense</th>
                    <th className="px-5 py-3">Receipt</th>
                    <th className="px-5 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pendingExpenses.length === 0 ? (
                    <tr><td className="px-5 py-6 text-slate-500" colSpan={6}>No pending expenses for this period.</td></tr>
                  ) : (
                    pendingExpenses.map((e) => (
                      <tr key={e.id} className="hover:bg-slate-50">
                        <td className="px-5 py-4 text-slate-600">{e.expense_date}</td>
                        <td className="px-5 py-4 w-64 min-w-[200px]">
                          <SearchableSelect
                            options={officerOptions}
                            value={e.officer_id ? String(e.officer_id) : ''}
                            onChange={(val) => {
                              const nextId = val ? parseInt(val, 10) : null;
                              if (nextId !== e.officer_id) {
                                void updateExpenseOfficer(e.id, nextId);
                              }
                            }}
                            disabled={updatingExpenseId === e.id}
                            allowEmpty={true}
                            emptyButtonLabel={expenseClaimerLabel(e)}
                            emptyMenuLabel="No officer (unclaimed)"
                            buttonClassName={`flex w-full min-w-0 items-center justify-between gap-1.5 rounded border border-slate-200 bg-white px-2.5 py-1 text-left text-xs font-semibold text-slate-700 outline-none transition focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30 ${
                              updatingExpenseId === e.id ? 'opacity-50 cursor-not-allowed' : ''
                            }`}
                          />
                        </td>
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
                        <td className="px-5 py-4">
                          {e.proof_files?.length ? (
                            <button
                              type="button"
                              onClick={() => void openExpenseProof(e.proof_files![0]!.href)}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-[#0f766e] hover:bg-emerald-50"
                            >
                              <ImageIcon className="size-3.5" />
                              View receipt
                            </button>
                          ) : (
                            <span className="text-xs text-amber-700">No receipt</span>
                          )}
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
                    <th className="px-5 py-3">Claimed by</th>
                    <th className="px-5 py-3">Job</th>
                    <th className="px-5 py-3">Expense</th>
                    <th className="px-5 py-3">Receipt</th>
                    <th className="px-5 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {approvedExpenses.length === 0 ? (
                    <tr><td className="px-5 py-6 text-slate-500" colSpan={6}>No approved outstanding expenses for this period.</td></tr>
                  ) : (
                    approvedExpenses.map((e) => (
                      <tr key={e.id} className="hover:bg-slate-50">
                        <td className="px-5 py-4 text-slate-600">{e.expense_date}</td>
                        <td className="px-5 py-4 w-64 min-w-[200px]">
                          <SearchableSelect
                            options={officerOptions}
                            value={e.officer_id ? String(e.officer_id) : ''}
                            onChange={(val) => {
                              const nextId = val ? parseInt(val, 10) : null;
                              if (nextId !== e.officer_id) {
                                void updateExpenseOfficer(e.id, nextId);
                              }
                            }}
                            disabled={updatingExpenseId === e.id}
                            allowEmpty={true}
                            emptyButtonLabel={expenseClaimerLabel(e)}
                            emptyMenuLabel="No officer (unclaimed)"
                            buttonClassName={`flex w-full min-w-0 items-center justify-between gap-1.5 rounded border border-slate-200 bg-white px-2.5 py-1 text-left text-xs font-semibold text-slate-700 outline-none transition focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30 ${
                              updatingExpenseId === e.id ? 'opacity-50 cursor-not-allowed' : ''
                            }`}
                          />
                        </td>
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
                        <td className="px-5 py-4">
                          {e.proof_files?.length ? (
                            <button
                              type="button"
                              onClick={() => void openExpenseProof(e.proof_files![0]!.href)}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-[#0f766e] hover:bg-emerald-50"
                            >
                              <ImageIcon className="size-3.5" />
                              View receipt
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">No receipt</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right font-bold text-slate-900">{formatMoney(e.amount)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {approvedExpenses.length > 0 && (
                  <tfoot className="border-t border-slate-200 bg-slate-50 text-sm font-semibold text-slate-800">
                    <tr>
                      <td className="px-5 py-3" colSpan={5}>Period totals</td>
                      <td className="px-5 py-3 text-right">
                        <p>Personal: {formatMoney(approvedPersonalTotal)}</p>
                        <p className="text-slate-600">Company: {formatMoney(approvedCompanyTotal)}</p>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </section>

          {/* General company overheads (not job-linked) */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-bold text-slate-900">General company expenses</h2>
              <p className="text-sm text-slate-500">
                Overheads such as insurance, rent, and subscriptions — not tied to a job. These reduce net profit on the Invoices report.
              </p>
            </div>
            <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <form onSubmit={(e) => void saveOverheadExpense(e)} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
                <h3 className="text-sm font-bold text-slate-800">{editingOverheadId ? 'Edit expense' : 'Add expense'}</h3>
                <label className="block text-xs font-semibold text-slate-600">
                  Date
                  <input type="date" value={overheadForm.expense_date} onChange={(e) => setOverheadForm((f) => ({ ...f, expense_date: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" required />
                </label>
                <label className="block text-xs font-semibold text-slate-600">
                  Category
                  <input list="overhead-categories" value={overheadForm.category} onChange={(e) => setOverheadForm((f) => ({ ...f, category: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" required />
                  <datalist id="overhead-categories">
                    {GENERAL_OVERHEAD_CATEGORIES.map((c) => <option key={c} value={c} />)}
                  </datalist>
                </label>
                <label className="block text-xs font-semibold text-slate-600">
                  Description
                  <input type="text" value={overheadForm.description} onChange={(e) => setOverheadForm((f) => ({ ...f, description: e.target.value }))} placeholder="e.g. Annual public liability insurance" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                </label>
                <label className="block text-xs font-semibold text-slate-600">
                  Amount
                  <input type="text" inputMode="decimal" value={overheadForm.amount} onChange={(e) => setOverheadForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0.00" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" required />
                </label>
                {overheadError && <p className="text-sm font-medium text-rose-600">{overheadError}</p>}
                <div className="flex flex-wrap gap-2 pt-1">
                  <button type="submit" disabled={savingOverhead} className="rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0d9488] disabled:opacity-60">
                    {savingOverhead ? 'Saving…' : editingOverheadId ? 'Update expense' : 'Add expense'}
                  </button>
                  {editingOverheadId && (
                    <button type="button" onClick={resetOverheadForm} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white">
                      Cancel edit
                    </button>
                  )}
                </div>
              </form>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Description</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {overheadExpenses.length === 0 ? (
                      <tr><td colSpan={5} className="px-4 py-6 text-slate-500">No general expenses for this period yet.</td></tr>
                    ) : (
                      overheadExpenses.map((e) => (
                        <tr key={e.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 text-slate-600">{e.expense_date}</td>
                          <td className="px-4 py-3 font-medium text-slate-800">{e.category}</td>
                          <td className="px-4 py-3 text-slate-600">{e.description || '—'}</td>
                          <td className="px-4 py-3 text-right font-bold text-slate-900">{formatMoney(e.amount)}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex gap-1">
                              <button type="button" onClick={() => startEditOverhead(e)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="Edit"><Edit2 className="size-4" /></button>
                              <button type="button" onClick={() => void deleteOverheadExpense(e.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Delete"><Trash2 className="size-4" /></button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {overheadExpenses.length > 0 && (
                    <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-800">
                      <tr>
                        <td className="px-4 py-3" colSpan={3}>Period total</td>
                        <td className="px-4 py-3 text-right">{formatMoney(totals?.general_overhead_total ?? 0)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </section>

          {proofPreviewUrl && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={closeExpenseProof}>
              <div className="max-h-[90vh] max-w-4xl overflow-auto rounded-xl bg-white p-2" onClick={(e) => e.stopPropagation()}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={proofPreviewUrl} alt="Expense receipt" className="max-h-[80vh] w-full object-contain" />
              </div>
            </div>
          )}

          {paymentModalOfficer && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Record payment</h3>
                    <p className="text-sm text-slate-500">{paymentModalOfficer.full_name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Outstanding: {formatMoney(paymentModalOfficer.personal_outstanding)}
                    </p>
                  </div>
                  <button type="button" onClick={() => setPaymentModalOfficer(null)} className="rounded-lg p-1 hover:bg-slate-100">
                    <X className="size-5 text-slate-500" />
                  </button>
                </div>
                <form onSubmit={(e) => void submitOfficerPayment(e)} className="space-y-4">
                  <label className="block text-sm font-semibold text-slate-700">
                    Amount
                    <input
                      type="text"
                      inputMode="decimal"
                      value={paymentForm.amount}
                      onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      placeholder="0.00"
                      required
                    />
                  </label>
                  <label className="block text-sm font-semibold text-slate-700">
                    Payment date
                    <input
                      type="date"
                      value={paymentForm.payment_date}
                      onChange={(e) => setPaymentForm((f) => ({ ...f, payment_date: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      required
                    />
                  </label>
                  <label className="block text-sm font-semibold text-slate-700">
                    Method
                    <select
                      value={paymentForm.payment_method}
                      onChange={(e) => setPaymentForm((f) => ({ ...f, payment_method: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      <option value="bank_transfer">Bank transfer</option>
                      <option value="cash">Cash</option>
                      <option value="check">Cheque</option>
                      <option value="credit_card">Credit card</option>
                      <option value="digital_payment">Digital payment</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                  <label className="block text-sm font-semibold text-slate-700">
                    Reference
                    <input
                      type="text"
                      value={paymentForm.reference_number}
                      onChange={(e) => setPaymentForm((f) => ({ ...f, reference_number: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      placeholder="Optional"
                    />
                  </label>
                  <label className="block text-sm font-semibold text-slate-700">
                    Notes
                    <textarea
                      value={paymentForm.notes}
                      onChange={(e) => setPaymentForm((f) => ({ ...f, notes: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      rows={2}
                      placeholder="Optional"
                    />
                  </label>
                  {paymentError && <p className="text-sm font-medium text-rose-600">{paymentError}</p>}
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setPaymentModalOfficer(null)}
                      className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={paymentSubmitting}
                      className="rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0d9488] disabled:opacity-60"
                    >
                      {paymentSubmitting ? 'Saving…' : 'Save payment'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {paymentHistoryOfficer && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-xl">
                <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Payment history</h3>
                    <p className="text-sm text-slate-500">{paymentHistoryOfficer.full_name}</p>
                    {officerPaymentSummary && (
                      <p className="mt-1 text-xs text-slate-500">
                        Approved personal: {formatMoney(officerPaymentSummary.approved_total)} · Paid: {formatMoney(officerPaymentSummary.paid_total)} · Outstanding: {formatMoney(officerPaymentSummary.outstanding)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openPaymentModal(paymentHistoryOfficer)}
                      className="rounded-lg bg-[#14B8A6] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0d9488]"
                    >
                      Record payment
                    </button>
                    <button type="button" onClick={() => setPaymentHistoryOfficer(null)} className="rounded-lg p-1 hover:bg-slate-100">
                      <X className="size-5 text-slate-500" />
                    </button>
                  </div>
                </div>
                <div className="max-h-[60vh] overflow-y-auto">
                  {loadingOfficerPayments ? (
                    <p className="px-6 py-8 text-sm text-slate-500">Loading payments…</p>
                  ) : officerPayments.length === 0 ? (
                    <p className="px-6 py-8 text-sm text-slate-500">No payments recorded yet.</p>
                  ) : (
                    <table className="min-w-full divide-y divide-slate-100 text-sm">
                      <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-6 py-3">Date</th>
                          <th className="px-6 py-3">Method</th>
                          <th className="px-6 py-3">Reference</th>
                          <th className="px-6 py-3 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {officerPayments.map((p) => (
                          <tr key={p.id}>
                            <td className="px-6 py-4 text-slate-700">{p.payment_date}</td>
                            <td className="px-6 py-4 text-slate-700">{paymentMethodLabel(p.payment_method)}</td>
                            <td className="px-6 py-4 text-slate-600">
                              {p.reference_number || '—'}
                              {p.notes && <p className="text-xs text-slate-400">{p.notes}</p>}
                            </td>
                            <td className="px-6 py-4 text-right font-bold text-emerald-700">{formatMoney(p.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* --- TAB CONTENT: CALENDAR --- */}
      {activeTab === 'calendar' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Work Calendar</h2>
              <p className="text-sm text-slate-500">Overview of all scheduled diary jobs and company/staff holidays.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Filter:</span>
                <select
                  value={calendarOfficerFilter}
                  onChange={(e) => setCalendarOfficerFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/20"
                >
                  <option value="all">All Engineers</option>
                  {officers.map((o) => (
                    <option key={o.id} value={String(o.id)}>{o.full_name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3">
                <button
                  type="button"
                  onClick={handlePrev}
                  className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50 transition animate-press"
                >
                  <ChevronLeft className="size-4.5 text-slate-600" />
                </button>
                <span className="min-w-[160px] text-center text-sm font-bold text-slate-800">
                  {dateText}
                </span>
                <button
                  type="button"
                  onClick={handleNext}
                  className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50 transition animate-press"
                >
                  <ChevronRight className="size-4.5 text-slate-600" />
                </button>
              </div>
            </div>
          </div>

          <div style={{ height: 600 }} className="mt-4">
            <BigCalendar
              localizer={localizer}
              events={filteredCalendarEvents}
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
              eventPropGetter={(evt: CalendarEvent) => ({
                className: 'font-semibold text-xs px-2 py-0.5 rounded shadow-sm cursor-pointer hover:opacity-90 transition border-l-[3px]',
                style: {
                  backgroundColor: evt.backgroundColor,
                  borderLeftColor: evt.borderColor,
                  color: evt.textColor,
                },
              })}
            />
          </div>

          {calendarEngineerLegend.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Engineers (Click to filter)</span>
              {calendarEngineerLegend.map((item) => {
                const isIdKey = item.key.startsWith('id:');
                const officerId = isIdKey ? item.key.slice(3) : '';
                const isSelected = isIdKey ? calendarOfficerFilter === officerId : false;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      if (isIdKey) {
                        setCalendarOfficerFilter((cur) => (cur === officerId ? 'all' : officerId));
                      }
                    }}
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold shadow-sm ring-1 transition ${
                      isSelected
                        ? 'bg-[#14B8A6] text-white ring-[#14B8A6]'
                        : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <span
                      className={`size-2.5 rounded-full ${isSelected ? 'bg-white' : ''}`}
                      style={isSelected ? {} : { backgroundColor: item.borderColor }}
                    />
                    {item.label}
                  </button>
                );
              })}
              <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200">
                <span className="size-2.5 rounded-full bg-indigo-600" />
                Company holiday
              </span>
            </div>
          )}
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

function SummaryCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-[#14B8A6]/10 text-[#14B8A6]">{icon}</div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}
