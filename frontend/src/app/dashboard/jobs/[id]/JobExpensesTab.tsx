'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Camera, ImageIcon, Pencil, Plus, ReceiptText, X } from 'lucide-react';
import { getBlob, getJson, patchJson, postJson } from '../../../apiClient';

type ProofFile = {
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
  expense_date: string;
  category: string;
  description: string | null;
  amount: number;
  status: string;
  expense_type: string;
  proof_files?: ProofFile[];
};

type OfficerOption = { id: number; full_name: string };

type Props = {
  jobId: string;
  token: string | null;
};

function money(v: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(v);
}

async function fileToPayload(file: File) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return {
    filename: file.name || 'receipt.jpg',
    content_type: file.type || 'image/jpeg',
    content_base64: window.btoa(binary),
  };
}

export default function JobExpensesTab({ jobId, token }: Props) {
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [officers, setOfficers] = useState<OfficerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [category, setCategory] = useState('Parking');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expenseType, setExpenseType] = useState<'personal' | 'company'>('personal');
  const [officerId, setOfficerId] = useState<number | ''>('');
  const [proofFiles, setProofFiles] = useState<File[]>([]);
  const [existingProofs, setExistingProofs] = useState<ProofFile[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [expRes, offRes] = await Promise.all([
        getJson<{ expenses: ExpenseRow[] }>(`/jobs/${jobId}/expenses`, token),
        getJson<{ officers: OfficerOption[] }>('/officers/list', token).catch(() => ({ officers: [] })),
      ]);
      setExpenses(expRes.expenses ?? []);
      setOfficers(offRes.officers ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load expenses');
    } finally {
      setLoading(false);
    }
  }, [jobId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('wp_user');
      const user = raw ? (JSON.parse(raw) as { role?: string }) : null;
      setIsAdmin(user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN');
    } catch {
      setIsAdmin(false);
    }
  }, []);

  const pending = useMemo(() => expenses.filter((e) => e.status === 'submitted'), [expenses]);
  const approved = useMemo(() => expenses.filter((e) => e.status === 'approved'), [expenses]);

  const canSave =
    category.trim().length > 0 && Number(amount) > 0 && expenseDate.trim().length > 0 && !saving;

  const resetForm = () => {
    setEditingId(null);
    setCategory('Parking');
    setAmount('');
    setDescription('');
    setExpenseDate(new Date().toISOString().slice(0, 10));
    setExpenseType('personal');
    setOfficerId('');
    setProofFiles([]);
    setExistingProofs([]);
  };

  const startEdit = (row: ExpenseRow) => {
    if (!isAdmin) return;
    setEditingId(row.id);
    setCategory(row.category || 'Parking');
    setAmount(String(row.amount ?? ''));
    setDescription(row.description ?? '');
    setExpenseDate((row.expense_date || '').slice(0, 10) || new Date().toISOString().slice(0, 10));
    setExpenseType(row.expense_type === 'company' ? 'company' : 'personal');
    setOfficerId(row.officer_id ?? '');
    setProofFiles([]);
    setExistingProofs(row.proof_files ?? []);
    setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submit = async () => {
    if (!token || !canSave) return;
    setSaving(true);
    setError(null);
    try {
      const encoded = await Promise.all(proofFiles.map(fileToPayload));
      const payload = {
        category: category.trim(),
        amount: Number(amount),
        description: description.trim() || null,
        expense_date: expenseDate,
        expense_type: expenseType,
        officer_id: officerId === '' ? null : officerId,
        ...(encoded.length > 0 ? { proof_files: encoded } : {}),
      };

      if (editingId != null) {
        if (!isAdmin) {
          setError('Only admins can edit expense amount and details');
          return;
        }
        await patchJson(`/job-expenses/${editingId}`, payload, token);
      } else {
        await postJson(`/jobs/${jobId}/expenses`, payload, token);
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save expense');
    } finally {
      setSaving(false);
    }
  };

  const openProof = async (href: string) => {
    if (!token) return;
    try {
      const blob = await getBlob(href, token);
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open receipt');
    }
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Loading expenses…</p>;
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ReceiptText className="size-5 text-[#14B8A6]" />
            <h3 className="text-lg font-bold text-slate-900">
              {editingId != null ? 'Edit job expense' : 'Add job expense'}
            </h3>
          </div>
          {editingId != null && (
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <X className="size-3.5" />
              Cancel edit
            </button>
          )}
        </div>
        <p className="mb-4 text-sm text-slate-500">
          {editingId != null
            ? 'Update the expense details below. New receipts are added alongside any existing ones.'
            : 'Add forgotten expenses on completed jobs. Claims stay pending until approved in Staff Work.'}
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-slate-700">Category</span>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-slate-700">Amount (£)</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              type="number"
              min="0"
              step="0.01"
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-slate-700">Expense date</span>
            <input
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              type="date"
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-slate-700">Claimed by (engineer)</span>
            <select
              value={officerId}
              onChange={(e) => setOfficerId(e.target.value ? Number(e.target.value) : '')}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            >
              <option value="">Unassigned / office entry</option>
              {officers.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.full_name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-slate-700">Type</span>
            <select
              value={expenseType}
              onChange={(e) => setExpenseType(e.target.value as 'personal' | 'company')}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            >
              <option value="personal">Personal</option>
              <option value="company">Company</option>
            </select>
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="mb-1 block font-semibold text-slate-700">Notes</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </label>
          <div className="md:col-span-2">
            <span className="mb-1 block text-sm font-semibold text-slate-700">
              Receipt photo {editingId != null ? '(optional — adds to existing)' : '(optional for office)'}
            </span>
            {existingProofs.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {existingProofs.map((p) => (
                  <button
                    key={p.href}
                    type="button"
                    onClick={() => void openProof(p.href)}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-[#0f766e] hover:bg-emerald-50"
                  >
                    <ImageIcon className="size-3.5" />
                    {p.original_filename || 'View receipt'}
                  </button>
                ))}
              </div>
            )}
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              <Camera className="size-4" />
              {editingId != null ? 'Attach another receipt' : 'Attach receipt'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length) setProofFiles(files);
                }}
              />
            </label>
            {proofFiles.length > 0 && (
              <p className="mt-2 text-xs text-slate-500">{proofFiles.map((f) => f.name).join(', ')}</p>
            )}
          </div>
        </div>
        <button
          type="button"
          disabled={!canSave}
          onClick={() => void submit()}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-bold text-white hover:bg-[#0d9488] disabled:opacity-50"
        >
          {editingId != null ? <Pencil className="size-4" /> : <Plus className="size-4" />}
          {saving ? 'Saving…' : editingId != null ? 'Save changes' : 'Add expense'}
        </button>
      </section>

      <ExpenseTable
        title="Pending approval"
        empty="No pending expenses for this job."
        rows={pending}
        editingId={editingId}
        canEdit={isAdmin}
        onEdit={startEdit}
        onOpenProof={(href) => void openProof(href)}
      />
      <ExpenseTable
        title="Approved"
        empty="No approved expenses yet."
        rows={approved}
        editingId={editingId}
        canEdit={isAdmin}
        onEdit={startEdit}
        onOpenProof={(href) => void openProof(href)}
      />

      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={closePreview}>
          <div className="max-h-[90vh] max-w-4xl overflow-auto rounded-xl bg-white p-2" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Expense receipt" className="max-h-[80vh] w-full object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}

function ExpenseTable({
  title,
  empty,
  rows,
  editingId,
  canEdit,
  onEdit,
  onOpenProof,
}: {
  title: string;
  empty: string;
  rows: ExpenseRow[];
  editingId: number | null;
  canEdit: boolean;
  onEdit: (row: ExpenseRow) => void;
  onOpenProof: (href: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <h3 className="text-lg font-bold text-slate-900">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3">Date</th>
              <th className="px-5 py-3">Claimed by</th>
              <th className="px-5 py-3">Expense</th>
              <th className="px-5 py-3">Receipt</th>
              <th className="px-5 py-3 text-right">Amount</th>
              {canEdit && <th className="px-5 py-3 text-right">Action</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 6 : 5} className="px-5 py-6 text-slate-500">
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((e) => (
                <tr key={e.id} className={`hover:bg-slate-50 ${editingId === e.id ? 'bg-teal-50/60' : ''}`}>
                  <td className="px-5 py-4 text-slate-600">{e.expense_date}</td>
                  <td className="px-5 py-4 font-semibold text-slate-900">
                    {e.claimed_by_name || e.officer_name || 'Unknown'}
                  </td>
                  <td className="px-5 py-4">
                    <p className="font-medium text-slate-800">{e.category}</p>
                    {e.description && <p className="text-xs text-slate-500">{e.description}</p>}
                    <p className="mt-1 text-xs capitalize text-slate-500">{e.expense_type}</p>
                  </td>
                  <td className="px-5 py-4">
                    {e.proof_files?.length ? (
                      <div className="flex flex-wrap gap-2">
                        {e.proof_files.map((p) => (
                          <button
                            key={p.href}
                            type="button"
                            onClick={() => onOpenProof(p.href)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-[#0f766e] hover:bg-emerald-50"
                          >
                            <ImageIcon className="size-3.5" />
                            View
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">No receipt</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right font-bold text-slate-900">{money(e.amount)}</td>
                  {canEdit && (
                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => onEdit(e)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-[#0f766e] hover:bg-emerald-50"
                      >
                        <Pencil className="size-3.5" />
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
