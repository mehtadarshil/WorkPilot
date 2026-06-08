'use client';

import { useCallback, useEffect, useState } from 'react';
import { getJson, postJson, patchJson, deleteRequest } from '../../../apiClient';
import { format } from 'date-fns';
import {
  ClipboardList,
  Plus,
  Trash2,
  Pencil,
  X,
  Save,
  Calendar,
  User,
  PoundSterling,
  Package,
  Hash,
  AlignLeft,
} from 'lucide-react';

interface ReportItem {
  id: number;
  report_id: number;
  item_name: string;
  description: string | null;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  sort_order: number;
}

interface JobReport {
  id: number;
  job_id: number;
  title: string;
  notes: string | null;
  report_date: string;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  items: ReportItem[];
}

interface Props {
  jobId: string;
  token: string;
}

function formatCurrency(n: number): string {
  return `£${Number(n).toFixed(2)}`;
}

function computeTotal(items: { quantity: number; unit_cost: number }[]): number {
  return items.reduce((sum, it) => sum + (it.quantity * it.unit_cost), 0);
}

export default function JobDynamicReportsTab({ jobId, token }: Props) {
  const [reports, setReports] = useState<JobReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingReport, setEditingReport] = useState<JobReport | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [formTitle, setFormTitle] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formDate, setFormDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [formItems, setFormItems] = useState<Omit<ReportItem, 'id' | 'report_id'>[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getJson<{ reports: JobReport[] }>(`/jobs/${jobId}/reports`, token);
      setReports(res.reports || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, [jobId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setFormTitle('');
    setFormNotes('');
    setFormDate(format(new Date(), 'yyyy-MM-dd'));
    setFormItems([]);
    setEditingReport(null);
  };

  const openCreate = () => {
    resetForm();
    setModalOpen(true);
  };

  const openEdit = (report: JobReport) => {
    setEditingReport(report);
    setFormTitle(report.title);
    setFormNotes(report.notes || '');
    setFormDate(report.report_date);
    setFormItems(
      report.items.map((it) => ({
        item_name: it.item_name,
        description: it.description,
        quantity: it.quantity,
        unit_cost: it.unit_cost,
        total_cost: it.total_cost,
        sort_order: it.sort_order,
      })),
    );
    setModalOpen(true);
  };

  const addItem = () => {
    setFormItems((prev) => [
      ...prev,
      { item_name: '', description: '', quantity: 1, unit_cost: 0, total_cost: 0, sort_order: prev.length },
    ]);
  };

  const updateItem = (index: number, patch: Partial<typeof formItems[0]>) => {
    setFormItems((prev) => {
      const next = [...prev];
      const row = { ...next[index], ...patch };
      row.total_cost = row.quantity * row.unit_cost;
      next[index] = row;
      return next;
    });
  };

  const removeItem = (index: number) => {
    setFormItems((prev) => prev.filter((_, i) => i !== index).map((it, i) => ({ ...it, sort_order: i })));
  };

  const handleSave = async () => {
    if (!token) return;
    const title = formTitle.trim();
    if (!title) {
      setError('Title is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let reportId: number;
      if (editingReport) {
        await patchJson(`/jobs/${jobId}/reports/${editingReport.id}`, {
          title,
          notes: formNotes.trim() || null,
          report_date: formDate,
        }, token);
        reportId = editingReport.id;
        // Delete existing items and recreate
        for (const it of editingReport.items) {
          await deleteRequest(`/jobs/${jobId}/reports/${reportId}/items/${it.id}`, token);
        }
      } else {
        const res = await postJson<{ report: JobReport }>(`/jobs/${jobId}/reports`, {
          title,
          notes: formNotes.trim() || null,
          report_date: formDate,
        }, token);
        reportId = res.report.id;
      }

      // Create new items
      for (const it of formItems) {
        if (!it.item_name.trim()) continue;
        await postJson(`/jobs/${jobId}/reports/${reportId}/items`, {
          item_name: it.item_name.trim(),
          description: it.description?.trim() || null,
          quantity: it.quantity,
          unit_cost: it.unit_cost,
          sort_order: it.sort_order,
        }, token);
      }

      setModalOpen(false);
      resetForm();
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (report: JobReport) => {
    if (!token) return;
    if (!window.confirm(`Delete report "${report.title}"? This cannot be undone.`)) return;
    setDeletingId(report.id);
    try {
      await deleteRequest(`/jobs/${jobId}/reports/${report.id}`, token);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-slate-500 text-sm font-medium">Loading job reports…</div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardList className="size-5 text-[#14B8A6]" />
          <h2 className="text-lg font-bold text-slate-900">Job Reports</h2>
          <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
            {reports.length}
          </span>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-bold text-white shadow hover:bg-[#119f8e]"
        >
          <Plus className="size-4" /> Add report
        </button>
      </div>

      {error && !modalOpen && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      )}

      {reports.length === 0 ? (
        <div className="p-12 flex flex-col items-center justify-center text-center bg-white rounded-xl border border-slate-200">
          <div className="bg-slate-50 p-6 rounded-full border border-slate-100 mb-4 ring-8 ring-slate-50/50">
            <ClipboardList className="size-10 text-slate-300 stroke-[1.5]" />
          </div>
          <p className="text-[15px] font-black text-slate-400 italic tracking-tight uppercase">
            No job reports yet
          </p>
          <p className="text-sm text-slate-400 mt-2 max-w-md">
            Add reports to track materials, tools, costs, or any notes about this job.
          </p>
          <button
            onClick={openCreate}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            <Plus className="size-4" /> Create first report
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => {
            const total = computeTotal(report.items);
            return (
              <div
                key={report.id}
                className="bg-white rounded-xl border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden"
              >
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <h3 className="text-sm font-bold text-slate-800">{report.title}</h3>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Calendar className="size-3.5" />
                      {format(new Date(report.report_date), 'dd MMM yyyy')}
                    </div>
                    {report.created_by_name && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <User className="size-3.5" />
                        {report.created_by_name}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEdit(report)}
                      className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-[#14B8A6]"
                      title="Edit"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(report)}
                      disabled={deletingId === report.id}
                      className="p-1.5 rounded-md text-slate-500 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                      title="Delete"
                    >
                      {deletingId === report.id ? (
                        <span className="size-4 block animate-spin rounded-full border-2 border-slate-300 border-t-rose-600" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Notes */}
                {report.notes && (
                  <div className="px-6 py-3 border-b border-slate-100">
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{report.notes}</p>
                  </div>
                )}

                {/* Items table */}
                {report.items.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[13px]">
                      <thead className="bg-[#FBFCFD] border-b border-slate-100 uppercase text-[11px] font-black text-slate-500">
                        <tr>
                          <th className="px-6 py-3">Item</th>
                          <th className="px-6 py-3">Description</th>
                          <th className="px-6 py-3 text-right">Qty</th>
                          <th className="px-6 py-3 text-right">Unit cost</th>
                          <th className="px-6 py-3 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {report.items.map((it) => (
                          <tr key={it.id} className="hover:bg-slate-50/30">
                            <td className="px-6 py-3 font-semibold text-slate-700">{it.item_name}</td>
                            <td className="px-6 py-3 text-slate-600">{it.description || '—'}</td>
                            <td className="px-6 py-3 text-right font-medium text-slate-600">{it.quantity}</td>
                            <td className="px-6 py-3 text-right font-medium text-slate-600">{formatCurrency(it.unit_cost)}</td>
                            <td className="px-6 py-3 text-right font-bold text-slate-800">{formatCurrency(it.total_cost)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Footer total */}
                {total > 0 && (
                  <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/30 flex justify-end">
                    <div className="text-right">
                      <span className="text-[11px] font-black uppercase text-slate-500 tracking-wide">Report total</span>
                      <div className="text-lg font-black text-slate-800">{formatCurrency(total)}</div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-800">
                {editingReport ? 'Edit Report' : 'New Job Report'}
              </h3>
              <button
                onClick={() => { setModalOpen(false); resetForm(); }}
                className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {error && modalOpen && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                    Report title
                  </label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="e.g. Materials for Phase 1"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                    Date
                  </label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                  Notes
                </label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Any additional notes about this report..."
                  rows={3}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/20 resize-none"
                />
              </div>

              {/* Line items */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                    Line items
                  </label>
                  <span className="text-sm font-bold text-slate-800">
                    Total: {formatCurrency(computeTotal(formItems))}
                  </span>
                </div>

                {formItems.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
                    <p className="text-sm text-slate-400">No items yet. Add line items to track materials, tools, or costs.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {formItems.map((it, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start rounded-lg border border-slate-200 bg-white p-3"
                      >
                        <div className="sm:col-span-4">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Item name</label>
                          <input
                            type="text"
                            value={it.item_name}
                            onChange={(e) => updateItem(idx, { item_name: e.target.value })}
                            placeholder="e.g. Cable 2.5mm"
                            className="mt-1 w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-[#14B8A6]"
                          />
                        </div>
                        <div className="sm:col-span-3">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Description</label>
                          <input
                            type="text"
                            value={it.description || ''}
                            onChange={(e) => updateItem(idx, { description: e.target.value })}
                            placeholder="Optional"
                            className="mt-1 w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-[#14B8A6]"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Qty</label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={it.quantity}
                            onChange={(e) => updateItem(idx, { quantity: parseFloat(e.target.value) || 0 })}
                            className="mt-1 w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-[#14B8A6]"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Unit cost</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={it.unit_cost}
                            onChange={(e) => updateItem(idx, { unit_cost: parseFloat(e.target.value) || 0 })}
                            className="mt-1 w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-[#14B8A6]"
                          />
                        </div>
                        <div className="sm:col-span-1 flex flex-col items-end justify-end h-full pt-5">
                          <button
                            onClick={() => removeItem(idx)}
                            className="p-1.5 rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                            title="Remove item"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={addItem}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  <Plus className="size-3.5" /> Add line item
                </button>
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200">
              <button
                onClick={() => { setModalOpen(false); resetForm(); }}
                className="px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-50 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleSave()}
                disabled={saving || !formTitle.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-[#14B8A6] px-5 py-2 text-sm font-bold text-white shadow hover:bg-[#119f8e] disabled:opacity-50"
              >
                {saving ? (
                  <span className="size-4 block animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  <Save className="size-4" />
                )}
                {saving ? 'Saving…' : 'Save report'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
