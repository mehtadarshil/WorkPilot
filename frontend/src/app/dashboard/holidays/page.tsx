'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, CheckCircle, Clock, Plus, Trash2, XCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { getJson, postJson, patchJson, deleteRequest } from '../../apiClient';

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

type Tab = 'requests' | 'holidays';

const inputClass = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30';
const selectClass = inputClass;

function statusColor(status: string) {
  if (status === 'approved') return 'bg-emerald-100 text-emerald-800';
  if (status === 'rejected') return 'bg-rose-100 text-rose-800';
  return 'bg-amber-100 text-amber-800';
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function HolidaysPage() {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;
  const [tab, setTab] = useState<Tab>('requests');
  const [requests, setRequests] = useState<HolidayRequest[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const [reqForm, setReqForm] = useState({ officer_id: '', start_date: '', end_date: '', leave_type: 'annual', reason: '' });
  const [holidayForm, setHolidayForm] = useState({ title: '', holiday_date: '', description: '', is_recurring: false });

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
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
      setError(err instanceof Error ? err.message : 'Could not load holidays');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const submitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError(null);
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
      void fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit request');
    }
  };

  const submitHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError(null);
    try {
      await postJson('/holidays', {
        title: holidayForm.title,
        holiday_date: holidayForm.holiday_date,
        description: holidayForm.description || undefined,
        is_recurring: holidayForm.is_recurring,
      }, token);
      setShowHolidayModal(false);
      setHolidayForm({ title: '', holiday_date: '', description: '', is_recurring: false });
      void fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add holiday');
    }
  };

  const updateRequestStatus = async (id: number, status: 'approved' | 'rejected') => {
    if (!token) return;
    setUpdatingId(id);
    setError(null);
    try {
      await patchJson(`/holiday-requests/${id}`, { status }, token);
      void fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update request');
    } finally {
      setUpdatingId(null);
    }
  };

  const deleteHoliday = async (id: number) => {
    if (!token || !confirm('Delete this holiday?')) return;
    try {
      await deleteRequest(`/holidays/${id}`, token);
      void fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete holiday');
    }
  };

  const pending = requests.filter((r) => r.status === 'pending');
  const processed = requests.filter((r) => r.status !== 'pending');

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#14B8A6]">Holidays</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Holiday Management</h1>
          <p className="mt-1 text-sm text-slate-600">Request time off and manage company holidays.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowRequestModal(true)}
            className="flex items-center gap-2 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0d9488]"
          >
            <Plus className="size-4" /> Request Holiday
          </button>
          <button
            type="button"
            onClick={() => setShowHolidayModal(true)}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Plus className="size-4" /> Add Company Holiday
          </button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-xl border border-slate-200 bg-white p-1 w-fit">
        {(['requests', 'holidays'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              tab === t ? 'bg-[#14B8A6] text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {t === 'requests' ? `Requests${pending.length > 0 ? ` (${pending.length})` : ''}` : `Company Holidays`}
          </button>
        ))}
      </div>

      {/* Requests Tab */}
      {tab === 'requests' && (
        <>
          <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
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
                  {loading ? (
                    <tr><td className="px-5 py-6 text-slate-500" colSpan={6}>Loading…</td></tr>
                  ) : pending.length === 0 ? (
                    <tr><td className="px-5 py-6 text-slate-500" colSpan={6}>No pending requests.</td></tr>
                  ) : (
                    pending.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="px-5 py-4 font-semibold text-slate-900">{r.officer_name || 'Unknown'}</td>
                        <td className="px-5 py-4 text-slate-700">
                          {formatDate(r.start_date)}{r.start_date !== r.end_date && <> – {formatDate(r.end_date)}</>}
                        </td>
                        <td className="px-5 py-4 font-semibold text-slate-900">{r.days_count ?? '–'}</td>
                        <td className="px-5 py-4 capitalize text-slate-700">{r.leave_type}</td>
                        <td className="px-5 py-4 text-slate-600 max-w-[200px] truncate">{r.reason || '–'}</td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              disabled={updatingId === r.id}
                              onClick={() => void updateRequestStatus(r.id, 'rejected')}
                              className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                            >
                              <XCircle className="mr-1 inline size-3" /> Reject
                            </button>
                            <button
                              type="button"
                              disabled={updatingId === r.id}
                              onClick={() => void updateRequestStatus(r.id, 'approved')}
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
                  {processed.length === 0 ? (
                    <tr><td className="px-5 py-6 text-slate-500" colSpan={6}>No processed requests yet.</td></tr>
                  ) : (
                    processed.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="px-5 py-4 font-semibold text-slate-900">{r.officer_name || 'Unknown'}</td>
                        <td className="px-5 py-4 text-slate-700">
                          {formatDate(r.start_date)}{r.start_date !== r.end_date && <> – {formatDate(r.end_date)}</>}
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
        </>
      )}

      {/* Company Holidays Tab */}
      {tab === 'holidays' && (
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
                {loading ? (
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
                          <Trash2 className="inline size-3" />
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

      {/* Request Holiday Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setShowRequestModal(false)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-slate-900">Request Holiday</h2>
            <p className="mb-4 mt-1 text-sm text-slate-500">Submit a new holiday request for approval.</p>
            <form onSubmit={(e) => void submitRequest(e)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Staff Member</label>
                <select value={reqForm.officer_id} onChange={(e) => setReqForm({ ...reqForm, officer_id: e.target.value })} className={selectClass}>
                  <option value="">Myself</option>
                  {officers.map((o) => (
                    <option key={o.id} value={o.id}>{o.full_name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Start Date *</label>
                  <input type="date" required value={reqForm.start_date} onChange={(e) => setReqForm({ ...reqForm, start_date: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">End Date *</label>
                  <input type="date" required value={reqForm.end_date} onChange={(e) => setReqForm({ ...reqForm, end_date: e.target.value })} className={inputClass} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Leave Type</label>
                <select value={reqForm.leave_type} onChange={(e) => setReqForm({ ...reqForm, leave_type: e.target.value })} className={selectClass}>
                  <option value="annual">Annual Leave</option>
                  <option value="sick">Sick Leave</option>
                  <option value="personal">Personal Leave</option>
                  <option value="unpaid">Unpaid Leave</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Reason</label>
                <textarea value={reqForm.reason} onChange={(e) => setReqForm({ ...reqForm, reason: e.target.value })} rows={3} className={inputClass} placeholder="Optional reason for leave…" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowRequestModal(false)} className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="submit" className="flex-1 rounded-lg bg-[#14B8A6] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#0d9488]">Submit Request</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Add Company Holiday Modal */}
      {showHolidayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setShowHolidayModal(false)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-slate-900">Add Company Holiday</h2>
            <p className="mb-4 mt-1 text-sm text-slate-500">Add a bank holiday or company-wide day off.</p>
            <form onSubmit={(e) => void submitHoliday(e)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Title *</label>
                <input type="text" required value={holidayForm.title} onChange={(e) => setHolidayForm({ ...holidayForm, title: e.target.value })} className={inputClass} placeholder="e.g. Christmas Day" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Date *</label>
                <input type="date" required value={holidayForm.holiday_date} onChange={(e) => setHolidayForm({ ...holidayForm, holiday_date: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Description</label>
                <textarea value={holidayForm.description} onChange={(e) => setHolidayForm({ ...holidayForm, description: e.target.value })} rows={2} className={inputClass} placeholder="Optional description…" />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_recurring"
                  checked={holidayForm.is_recurring}
                  onChange={(e) => setHolidayForm({ ...holidayForm, is_recurring: e.target.checked })}
                  className="size-4 rounded border-slate-300 text-[#14B8A6] focus:ring-[#14B8A6]"
                />
                <label htmlFor="is_recurring" className="text-sm font-medium text-slate-700">Recurring annually</label>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowHolidayModal(false)} className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="submit" className="flex-1 rounded-lg bg-[#14B8A6] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#0d9488]">Add Holiday</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </main>
  );
}
