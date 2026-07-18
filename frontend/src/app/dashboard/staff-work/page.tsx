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
  X,
  ImageIcon,
  Wallet,
  Edit2,
} from 'lucide-react';
import { getBlob, getJson, postJson, patchJson, deleteRequest } from '../../apiClient';
import SearchableSelect from '../SearchableSelect';

// --- Type Definitions ---
type OfficerWorkRow = {
  id: number;
  full_name: string;
  role_position: string | null;
  department: string | null;
  state: string;
  bank_name?: string | null;
  sort_code?: string | null;
  account_number?: string | null;
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
  all_day?: boolean;
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


// --- Helpers ---
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

function formatHolidayRange(startDateStr: string, endDateStr: string, allDay = true): string {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '–';
  
  const startHasTime = !allDay;
  const endHasTime = !allDay;
  
  const startDateStrFormatted = start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const endDateStrFormatted = end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  
  const sameDay = start.getFullYear() === end.getFullYear() &&
                  start.getMonth() === end.getMonth() &&
                  start.getDate() === end.getDate();
                  
  if (sameDay) {
    if (startHasTime || endHasTime) {
      const startTimeStr = start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      const endTimeStr = end.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      return `${startDateStrFormatted}, ${startTimeStr} – ${endTimeStr}`;
    }
    return startDateStrFormatted;
  } else {
    let startFmt = startDateStrFormatted;
    let endFmt = endDateStrFormatted;
    if (startHasTime) {
      const startTimeStr = start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      startFmt = `${startDateStrFormatted} at ${startTimeStr}`;
    }
    if (endHasTime) {
      const endTimeStr = end.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      endFmt = `${endDateStrFormatted} at ${endTimeStr}`;
    }
    return `${startFmt} – ${endFmt}`;
  }
}

function formatHolidayDuration(startDateStr: string, endDateStr: string, backendDays: number | null, allDay = true): string {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return backendDays != null ? `${backendDays}d` : '–';
  }
  const diffMs = end.getTime() - start.getTime();
  // Timed (partial-day) leave always reports in hours.
  if (!allDay) {
    const hours = diffMs / (1000 * 60 * 60);
    if (hours <= 0) return '–';
    const hrs = Number.isInteger(hours) ? hours : parseFloat(hours.toFixed(1));
    return `${hrs}h`;
  }
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();

  if (diffMs <= 0 && sameDay) return '1d';

  const diffHours = diffMs / (1000 * 60 * 60);
  if (sameDay && diffHours < 24) {
    if (diffHours < 1) return '1d';
    const hrs = Number.isInteger(diffHours) ? diffHours : parseFloat(diffHours.toFixed(1));
    return `${hrs}h`;
  }

  if (diffHours < 24) {
    const hrs = Number.isInteger(diffHours) ? diffHours : parseFloat(diffHours.toFixed(1));
    return `${hrs}h`;
  }

  const startDay = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const endDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  const calendarDays = Math.round((endDay - startDay) / 86400000) + 1;
  if (calendarDays > 1 && diffMs >= (calendarDays - 1) * 86400000 * 0.9) {
    return `${calendarDays}d`;
  }

  const days = backendDays != null && backendDays > 0
    ? backendDays
    : (Number.isInteger(diffHours / 24) ? diffHours / 24 : parseFloat((diffHours / 24).toFixed(1)));
  return `${days}d`;
}

/** Prefer the explicit stored flag; fall back to inference for legacy rows. */
function resolveRequestAllDay(request: { all_day?: boolean; start_date: string; end_date: string }): boolean {
  if (typeof request.all_day === 'boolean') return request.all_day;
  return holidayRequestLooksAllDay(request.start_date, request.end_date);
}

function holidayRequestLooksAllDay(startDateStr: string, endDateStr: string): boolean {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return true;
  const diffMs = end.getTime() - start.getTime();
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  if (diffMs <= 0 && sameDay) return true;
  if (sameDay && diffMs >= 23 * 60 * 60 * 1000) return true;
  const startMidnight = start.getHours() === 0 && start.getMinutes() === 0;
  const endLate = end.getHours() === 23 && end.getMinutes() >= 59;
  if (!sameDay && startMidnight && endLate) return true;
  return false;
}

function toHolidayFormDateValue(iso: string, allDay: boolean): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  if (allDay) return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildHolidayTimestamps(startInput: string, endInput: string, allDay: boolean): { start: string; end: string } {
  if (allDay) {
    const onlyStart = startInput.split('T')[0];
    const onlyEnd = endInput.split('T')[0];
    return {
      start: `${onlyStart}T00:00:00`,
      end: `${onlyEnd}T23:59:59`,
    };
  }
  return {
    start: new Date(startInput).toISOString(),
    end: new Date(endInput).toISOString(),
  };
}


const inputClass = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30';
const selectClass = inputClass;

// --- Component ---
export default function StaffWorkPage() {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('wp_user');
      const user = raw ? (JSON.parse(raw) as { role?: string }) : null;
      setIsExpenseAdmin(user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN');
    } catch {
      setIsExpenseAdmin(false);
    }
  }, []);

  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<'summary' | 'holidays'>('summary');

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
  const [editingExpenseId, setEditingExpenseId] = useState<number | null>(null);
  const [expenseEditForm, setExpenseEditForm] = useState({
    category: '',
    description: '',
    amount: '',
    expense_date: '',
  });
  const [isExpenseAdmin, setIsExpenseAdmin] = useState(false);
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
  const [allDay, setAllDay] = useState(true);
  const handleAllDayChange = (checked: boolean) => {
    setAllDay(checked);
    if (!checked) {
      setReqForm((prev) => ({
        ...prev,
        start_date: prev.start_date && !prev.start_date.includes('T') ? prev.start_date + 'T09:00' : prev.start_date,
        end_date: prev.end_date && !prev.end_date.includes('T') ? prev.end_date + 'T17:00' : prev.end_date,
      }));
    }
  };
  const [editingRequest, setEditingRequest] = useState<HolidayRequest | null>(null);
  const [editForm, setEditForm] = useState({ start_date: '', end_date: '', leave_type: 'annual', reason: '' });
  const [editAllDay, setEditAllDay] = useState(true);
  const handleEditAllDayChange = (checked: boolean) => {
    setEditAllDay(checked);
    if (!checked) {
      setEditForm((prev) => ({
        ...prev,
        start_date: prev.start_date && !prev.start_date.includes('T') ? prev.start_date + 'T09:00' : prev.start_date,
        end_date: prev.end_date && !prev.end_date.includes('T') ? prev.end_date + 'T17:00' : prev.end_date,
      }));
    }
  };
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [holidayForm, setHolidayForm] = useState({ title: '', holiday_date: '', description: '', is_recurring: false });

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

  // Load summary totals for expense badges even when another tab is active.
  useEffect(() => {
    void fetchSummaryData();
  }, [fetchSummaryData]);

  // Load officers list on mount so it is populated for searchable selectors
  useEffect(() => {
    if (!token) return;
    getJson<{ officers: Officer[] }>('/officers/list', token)
      .then((res) => {
        setOfficers(res.officers ?? []);
      })
      .catch((err) => {
        console.error('Failed to load officers list on mount:', err);
      });
  }, [token]);

  useEffect(() => {
    if (activeTab === 'holidays') {
      void fetchHolidaysData();
    }
  }, [activeTab, fetchHolidaysData]);

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

  const startEditExpenseDetails = (expense: ExpenseRow) => {
    setEditingExpenseId(expense.id);
    setExpenseEditForm({
      category: expense.category || '',
      description: expense.description ?? '',
      amount: String(expense.amount ?? ''),
      expense_date: (expense.expense_date || '').slice(0, 10),
    });
    setSummaryError(null);
  };

  const cancelEditExpenseDetails = () => {
    setEditingExpenseId(null);
    setExpenseEditForm({ category: '', description: '', amount: '', expense_date: '' });
  };

  const saveExpenseDetails = async (expenseId: number) => {
    if (!token || !isExpenseAdmin) return;
    const amountNum = parseFloat(expenseEditForm.amount);
    if (!expenseEditForm.category.trim() || !Number.isFinite(amountNum) || amountNum <= 0) {
      setSummaryError('Category and a positive amount are required');
      return;
    }
    setUpdatingExpenseId(expenseId);
    setSummaryError(null);
    try {
      await patchJson(
        `/job-expenses/${expenseId}`,
        {
          category: expenseEditForm.category.trim(),
          description: expenseEditForm.description.trim() || null,
          amount: amountNum,
          expense_date: expenseEditForm.expense_date,
        },
        token,
      );
      cancelEditExpenseDetails();
      await fetchSummaryData();
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : 'Could not update expense');
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
      const { start: startDateStr, end: endDateStr } = buildHolidayTimestamps(
        reqForm.start_date,
        reqForm.end_date,
        allDay,
      );
      await postJson('/holiday-requests', {
        officer_id: reqForm.officer_id ? Number(reqForm.officer_id) : undefined,
        start_date: startDateStr,
        end_date: endDateStr,
        all_day: allDay,
        leave_type: reqForm.leave_type,
        reason: reqForm.reason || undefined,
      }, token);
      setShowRequestModal(false);
      setReqForm({ officer_id: '', start_date: '', end_date: '', leave_type: 'annual', reason: '' });
      setAllDay(true);
      void fetchHolidaysData();
    } catch (err) {
      setHolidayError(err instanceof Error ? err.message : 'Could not submit request');
    }
  };

  const openEditRequest = (request: HolidayRequest) => {
    const isAllDay = resolveRequestAllDay(request);
    setEditingRequest(request);
    setEditAllDay(isAllDay);
    setEditForm({
      start_date: toHolidayFormDateValue(request.start_date, isAllDay),
      end_date: toHolidayFormDateValue(request.end_date, isAllDay),
      leave_type: request.leave_type,
      reason: request.reason ?? '',
    });
  };

  const submitEditRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingRequest) return;
    setHolidayError(null);
    setEditSubmitting(true);
    try {
      const { start: startDateStr, end: endDateStr } = buildHolidayTimestamps(
        editForm.start_date,
        editForm.end_date,
        editAllDay,
      );
      await patchJson(`/holiday-requests/${editingRequest.id}`, {
        start_date: startDateStr,
        end_date: endDateStr,
        all_day: editAllDay,
        leave_type: editForm.leave_type,
        reason: editForm.reason || null,
      }, token);
      setEditingRequest(null);
      void fetchHolidaysData();
    } catch (err) {
      setHolidayError(err instanceof Error ? err.message : 'Could not update request');
    } finally {
      setEditSubmitting(false);
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

  const deleteHolidayRequest = async (id: number) => {
    if (!token || !confirm('Delete this leave request? You will be able to book this engineer on those dates again.')) return;
    setUpdatingHolidayId(id);
    setHolidayError(null);
    try {
      await deleteRequest(`/holiday-requests/${id}`, token);
      void fetchHolidaysData();
    } catch (err) {
      setHolidayError(err instanceof Error ? err.message : 'Could not delete leave request');
    } finally {
      setUpdatingHolidayId(null);
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


  const pendingExpenseCount = summary?.totals?.pending_expenses_count ?? 0;

  const pendingHolidays = requests.filter((r) => r.status === 'pending');
  const processedHolidays = requests.filter((r) => r.status !== 'pending');

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      {/* Title section */}
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#14B8A6]">Staff</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Staff Work</h1>
          <p className="mt-1 text-sm text-slate-600 font-medium">
            Manage officer working hours, expenses, and time-off requests. Visit scheduling lives under Calendar.
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
              <p className="text-sm text-slate-500">
                Officer-submitted parking, travel, and other job expenses. Approve to add them to outstanding pay and job costs.
                {isExpenseAdmin ? ' Admins can edit category, notes, date, and final amount before approving.' : ''}
              </p>
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
                    {isExpenseAdmin && <th className="px-5 py-3 text-right">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pendingExpenses.length === 0 ? (
                    <tr><td className="px-5 py-6 text-slate-500" colSpan={isExpenseAdmin ? 7 : 6}>No pending expenses for this period.</td></tr>
                  ) : (
                    pendingExpenses.map((e) => {
                      const isEditing = editingExpenseId === e.id;
                      return (
                      <tr key={e.id} className={`hover:bg-slate-50 ${isEditing ? 'bg-teal-50/50' : ''}`}>
                        <td className="px-5 py-4 text-slate-600">
                          {isEditing ? (
                            <input
                              type="date"
                              value={expenseEditForm.expense_date}
                              onChange={(evt) => setExpenseEditForm((f) => ({ ...f, expense_date: evt.target.value }))}
                              className="w-full min-w-[140px] rounded border border-slate-200 px-2 py-1 text-xs"
                            />
                          ) : (
                            e.expense_date
                          )}
                        </td>
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
                          {isEditing ? (
                            <div className="space-y-1.5 min-w-[180px]">
                              <input
                                value={expenseEditForm.category}
                                onChange={(evt) => setExpenseEditForm((f) => ({ ...f, category: evt.target.value }))}
                                className="w-full rounded border border-slate-200 px-2 py-1 text-xs font-medium"
                                placeholder="Category"
                              />
                              <input
                                value={expenseEditForm.description}
                                onChange={(evt) => setExpenseEditForm((f) => ({ ...f, description: evt.target.value }))}
                                className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                                placeholder="Notes (optional)"
                              />
                            </div>
                          ) : (
                            <>
                              <p className="font-medium text-slate-800">{e.category}</p>
                              {e.description && <p className="text-xs text-slate-500">{e.description}</p>}
                            </>
                          )}
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
                          {isEditing ? (
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={expenseEditForm.amount}
                              onChange={(evt) => setExpenseEditForm((f) => ({ ...f, amount: evt.target.value }))}
                              className="ml-auto w-28 rounded border border-slate-200 px-2 py-1 text-right text-xs font-bold"
                            />
                          ) : (
                            <p className="font-bold text-slate-900">{formatMoney(e.amount)}</p>
                          )}
                          <div className="mt-2 flex justify-end gap-2">
                            <button
                              type="button"
                              disabled={updatingExpenseId === e.id || isEditing}
                              onClick={() => void updateExpenseStatus(e.id, 'rejected')}
                              className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                            >
                              Reject
                            </button>
                            <button
                              type="button"
                              disabled={updatingExpenseId === e.id || isEditing}
                              onClick={() => void updateExpenseStatus(e.id, 'approved')}
                              className="rounded-md bg-[#14B8A6] px-2 py-1 text-xs font-semibold text-white hover:bg-[#0d9488] disabled:opacity-50"
                            >
                              Approve
                            </button>
                          </div>
                        </td>
                        {isExpenseAdmin && (
                          <td className="px-5 py-4 text-right">
                            {isEditing ? (
                              <div className="flex flex-col items-end gap-1">
                                <button
                                  type="button"
                                  disabled={updatingExpenseId === e.id}
                                  onClick={() => void saveExpenseDetails(e.id)}
                                  className="rounded-md bg-[#14B8A6] px-2 py-1 text-xs font-semibold text-white hover:bg-[#0d9488] disabled:opacity-50"
                                >
                                  {updatingExpenseId === e.id ? 'Saving…' : 'Save'}
                                </button>
                                <button
                                  type="button"
                                  disabled={updatingExpenseId === e.id}
                                  onClick={cancelEditExpenseDetails}
                                  className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled={updatingExpenseId === e.id || editingExpenseId != null}
                                onClick={() => startEditExpenseDetails(e)}
                                className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-[#0f766e] hover:bg-emerald-50 disabled:opacity-50"
                              >
                                <Edit2 className="size-3.5" />
                                Edit
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Table: Approved expenses */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-bold text-slate-900">Approved expenses outstanding</h2>
              <p className="text-sm text-slate-500">
                These are approved and included in officer outstanding balance and job Costs tab.
                {isExpenseAdmin ? ' Admins can edit the final figure when the exact amount was not known at claim time.' : ''}
              </p>
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
                    {isExpenseAdmin && <th className="px-5 py-3 text-right">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {approvedExpenses.length === 0 ? (
                    <tr><td className="px-5 py-6 text-slate-500" colSpan={isExpenseAdmin ? 7 : 6}>No approved outstanding expenses for this period.</td></tr>
                  ) : (
                    approvedExpenses.map((e) => {
                      const isEditing = editingExpenseId === e.id;
                      return (
                      <tr key={e.id} className={`hover:bg-slate-50 ${isEditing ? 'bg-teal-50/50' : ''}`}>
                        <td className="px-5 py-4 text-slate-600">
                          {isEditing ? (
                            <input
                              type="date"
                              value={expenseEditForm.expense_date}
                              onChange={(evt) => setExpenseEditForm((f) => ({ ...f, expense_date: evt.target.value }))}
                              className="w-full min-w-[140px] rounded border border-slate-200 px-2 py-1 text-xs"
                            />
                          ) : (
                            e.expense_date
                          )}
                        </td>
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
                          {isEditing ? (
                            <div className="space-y-1.5 min-w-[180px]">
                              <input
                                value={expenseEditForm.category}
                                onChange={(evt) => setExpenseEditForm((f) => ({ ...f, category: evt.target.value }))}
                                className="w-full rounded border border-slate-200 px-2 py-1 text-xs font-medium"
                                placeholder="Category"
                              />
                              <input
                                value={expenseEditForm.description}
                                onChange={(evt) => setExpenseEditForm((f) => ({ ...f, description: evt.target.value }))}
                                className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                                placeholder="Notes (optional)"
                              />
                            </div>
                          ) : (
                            <>
                              <p className="font-medium text-slate-800">{e.category}</p>
                              {e.description && <p className="text-xs text-slate-500">{e.description}</p>}
                            </>
                          )}
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
                        <td className="px-5 py-4 text-right font-bold text-slate-900">
                          {isEditing ? (
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={expenseEditForm.amount}
                              onChange={(evt) => setExpenseEditForm((f) => ({ ...f, amount: evt.target.value }))}
                              className="ml-auto w-28 rounded border border-slate-200 px-2 py-1 text-right text-xs font-bold"
                            />
                          ) : (
                            formatMoney(e.amount)
                          )}
                        </td>
                        {isExpenseAdmin && (
                          <td className="px-5 py-4 text-right">
                            {isEditing ? (
                              <div className="flex flex-col items-end gap-1">
                                <button
                                  type="button"
                                  disabled={updatingExpenseId === e.id}
                                  onClick={() => void saveExpenseDetails(e.id)}
                                  className="rounded-md bg-[#14B8A6] px-2 py-1 text-xs font-semibold text-white hover:bg-[#0d9488] disabled:opacity-50"
                                >
                                  {updatingExpenseId === e.id ? 'Saving…' : 'Save'}
                                </button>
                                <button
                                  type="button"
                                  disabled={updatingExpenseId === e.id}
                                  onClick={cancelEditExpenseDetails}
                                  className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled={updatingExpenseId === e.id || editingExpenseId != null}
                                onClick={() => startEditExpenseDetails(e)}
                                className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-[#0f766e] hover:bg-emerald-50 disabled:opacity-50"
                              >
                                <Edit2 className="size-3.5" />
                                Edit
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                      );
                    })
                  )}
                </tbody>
                {approvedExpenses.length > 0 && (
                  <tfoot className="border-t border-slate-200 bg-slate-50 text-sm font-semibold text-slate-800">
                    <tr>
                      <td className="px-5 py-3" colSpan={isExpenseAdmin ? 6 : 5}>Period totals</td>
                      <td className="px-5 py-3 text-right">
                        <p>Personal: {formatMoney(approvedPersonalTotal)}</p>
                        <p className="text-slate-600">Company: {formatMoney(approvedCompanyTotal)}</p>
                      </td>
                      {isExpenseAdmin && <td />}
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
                {(paymentModalOfficer.bank_name || paymentModalOfficer.sort_code || paymentModalOfficer.account_number) ? (
                  <div className="mb-4 rounded-lg border border-teal-200 bg-teal-50 p-3">
                    <p className="text-xs font-semibold uppercase text-teal-700 mb-2">Bank Details</p>
                    <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                      <div className="min-w-0">
                        <span className="text-xs text-teal-600">Bank</span>
                        <p className="font-medium text-teal-900 break-words">{paymentModalOfficer.bank_name || '—'}</p>
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs text-teal-600">Sort code</span>
                        <p className="font-medium text-teal-900 break-words">{paymentModalOfficer.sort_code || '—'}</p>
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs text-teal-600">Account</span>
                        <p className="font-medium text-teal-900 break-all">{paymentModalOfficer.account_number || '—'}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase text-slate-500 mb-1">Bank Details</p>
                    <p className="text-xs text-slate-500">
                      No bank details on file. Add them in Settings → Users by editing this team member.
                    </p>
                  </div>
                )}
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
                    {(paymentHistoryOfficer.bank_name || paymentHistoryOfficer.sort_code || paymentHistoryOfficer.account_number) ? (
                      <div className="mt-2 flex flex-wrap gap-3 text-xs">
                        {paymentHistoryOfficer.bank_name && (
                          <span className="rounded bg-slate-100 px-2 py-1 text-slate-700">
                            <span className="font-medium">Bank:</span> {paymentHistoryOfficer.bank_name}
                          </span>
                        )}
                        {paymentHistoryOfficer.sort_code && (
                          <span className="rounded bg-slate-100 px-2 py-1 text-slate-700">
                            <span className="font-medium">Sort:</span> {paymentHistoryOfficer.sort_code}
                          </span>
                        )}
                        {paymentHistoryOfficer.account_number && (
                          <span className="max-w-full break-all rounded bg-slate-100 px-2 py-1 text-slate-700">
                            <span className="font-medium">Acct:</span> {paymentHistoryOfficer.account_number}
                          </span>
                        )}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-slate-400">
                        No bank details on file · add them in Settings → Users
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
                        <th className="px-5 py-3">Duration</th>
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
                              {formatHolidayRange(r.start_date, r.end_date, resolveRequestAllDay(r))}
                            </td>
                            <td className="px-5 py-4 font-semibold text-slate-900">{formatHolidayDuration(r.start_date, r.end_date, r.days_count, resolveRequestAllDay(r))}</td>
                            <td className="px-5 py-4 capitalize text-slate-700">{r.leave_type}</td>
                            <td className="px-5 py-4 text-slate-600 max-w-[200px] truncate">{r.reason || '–'}</td>
                            <td className="px-5 py-4 text-right">
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => openEditRequest(r)}
                                  className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                >
                                  <Edit2 className="mr-1 inline size-3" /> Edit
                                </button>
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
                                <button
                                  type="button"
                                  disabled={updatingHolidayId === r.id}
                                  onClick={() => void deleteHolidayRequest(r.id)}
                                  className="rounded-md border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                                >
                                  <Trash2 className="mr-1 inline size-3" /> Delete
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
                        <th className="px-5 py-3">Duration</th>
                        <th className="px-5 py-3">Type</th>
                        <th className="px-5 py-3">Reason</th>
                        <th className="px-5 py-3">Status</th>
                        <th className="px-5 py-3">Reviewed By</th>
                        <th className="px-5 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {processedHolidays.length === 0 ? (
                        <tr><td className="px-5 py-6 text-slate-500" colSpan={8}>No processed requests yet.</td></tr>
                      ) : (
                        processedHolidays.map((r) => (
                          <tr key={r.id} className="hover:bg-slate-50">
                            <td className="px-5 py-4 font-semibold text-slate-900">{r.officer_name || 'Unknown'}</td>
                            <td className="px-5 py-4 text-slate-700">
                              {formatHolidayRange(r.start_date, r.end_date, resolveRequestAllDay(r))}
                            </td>
                            <td className="px-5 py-4 font-semibold text-slate-900">{formatHolidayDuration(r.start_date, r.end_date, r.days_count, resolveRequestAllDay(r))}</td>
                            <td className="px-5 py-4 capitalize text-slate-700">{r.leave_type}</td>
                            <td className="px-5 py-4 text-slate-600 max-w-[200px] truncate">{r.reason || '–'}</td>
                            <td className="px-5 py-4">
                              <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColor(r.status)}`}>
                                {r.status}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-slate-600">{r.approved_by_name || '–'}</td>
                            <td className="px-5 py-4 text-right">
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => openEditRequest(r)}
                                  className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                >
                                  <Edit2 className="mr-1 inline size-3" /> Edit
                                </button>
                                <button
                                  type="button"
                                  disabled={updatingHolidayId === r.id}
                                  onClick={() => void deleteHolidayRequest(r.id)}
                                  className="rounded-md border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                                >
                                  <Trash2 className="mr-1 inline size-3" /> Delete
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

      {/* --- MODAL: EDIT HOLIDAY REQUEST --- */}
      {editingRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEditingRequest(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900">Edit holiday request</h3>
            <p className="mt-1 text-sm text-slate-500">
              {editingRequest.officer_name || 'Staff member'} — adjust dates, times, or leave details before approval.
            </p>
            <form onSubmit={submitEditRequest} className="mt-4 space-y-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editAllDay}
                  onChange={(e) => handleEditAllDayChange(e.target.checked)}
                  className="size-4 rounded border-slate-200 text-[#14B8A6] focus:ring-[#14B8A6]"
                />
                <span className="text-sm font-semibold text-slate-700">All day</span>
                <span className="text-xs text-slate-400">— untick to set specific hours (e.g. 09:00–13:00)</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-bold uppercase text-slate-500">
                    {editAllDay ? 'Start date' : 'Start date & time'}
                  </span>
                  <input
                    type={editAllDay ? 'date' : 'datetime-local'}
                    value={editForm.start_date}
                    onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })}
                    required
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase text-slate-500">
                    {editAllDay ? 'End date' : 'End date & time'}
                  </span>
                  <input
                    type={editAllDay ? 'date' : 'datetime-local'}
                    value={editForm.end_date}
                    onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value })}
                    required
                    className={inputClass}
                  />
                </label>
              </div>
              <label className="block">
                <span className="text-xs font-bold uppercase text-slate-500">Leave type</span>
                <select
                  value={editForm.leave_type}
                  onChange={(e) => setEditForm({ ...editForm, leave_type: e.target.value })}
                  className={selectClass}
                >
                  <option value="annual">Annual Leave</option>
                  <option value="sick">Sick Leave</option>
                  <option value="unpaid">Unpaid Leave</option>
                  <option value="other">Other time off</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase text-slate-500">Reason / notes</span>
                <textarea
                  value={editForm.reason}
                  onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
                />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingRequest(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0d9488] disabled:opacity-50"
                >
                  {editSubmitting ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
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
              <label className="flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  checked={allDay}
                  onChange={(e) => handleAllDayChange(e.target.checked)}
                  className="size-4 rounded border-slate-200 text-[#14B8A6] focus:ring-[#14B8A6]"
                />
                <span className="text-sm font-semibold text-slate-700">All Day</span>
                <span className="text-xs text-slate-400">— untick to set specific hours (e.g. 09:00–13:00)</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-bold uppercase text-slate-500">
                    {allDay ? 'Start Date' : 'Start Date & Time'}
                  </span>
                  <input
                    type={allDay ? 'date' : 'datetime-local'}
                    value={reqForm.start_date}
                    onChange={(e) => setReqForm({ ...reqForm, start_date: e.target.value })}
                    required
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase text-slate-500">
                    {allDay ? 'End Date' : 'End Date & Time'}
                  </span>
                  <input
                    type={allDay ? 'date' : 'datetime-local'}
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
