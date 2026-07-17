'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, ReceiptText } from 'lucide-react';
import { getJson } from '../../app/apiClient';

export type InvoiceExpenseLineDraft = {
  description: string;
  quantity: string;
  unit_price: string;
};

type JobExpense = {
  id: number;
  category: string;
  description: string | null;
  amount: number | string;
  expense_date: string;
  status: string;
};

const CATEGORY_SUGGESTIONS = [
  'Parking',
  'Fuel',
  'Travel',
  'Materials',
  'Tools hire',
  'Congestion charge',
  'Subsistence',
  'Other',
] as const;

type Props = {
  /** When set, approved job expenses can be pulled onto the invoice */
  jobId?: string | number | null;
  onAddExpenseLine: (draft: InvoiceExpenseLineDraft) => void;
};

function formatMoney(value: number | string): string {
  const n = typeof value === 'number' ? value : parseFloat(value);
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
}

function expenseToLine(category: string, amount: string, notes: string): InvoiceExpenseLineDraft {
  const cat = category.trim();
  const note = notes.trim();
  const description = note ? `Expense: ${cat} — ${note}` : `Expense: ${cat}`;
  return {
    description,
    quantity: '1',
    unit_price: amount.trim() || '0',
  };
}

/**
 * Quick-add billable expenses as invoice line items.
 * Works without a job; when a job is linked, also offers approved job expenses.
 */
export default function InvoiceExpensesSection({ jobId, onAddExpenseLine }: Props) {
  const [category, setCategory] = useState('Parking');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [jobExpenses, setJobExpenses] = useState<JobExpense[]>([]);
  const [loadingJobExpenses, setLoadingJobExpenses] = useState(false);
  const [addedJobExpenseIds, setAddedJobExpenseIds] = useState<number[]>([]);

  const loadJobExpenses = useCallback(async () => {
    const jid = jobId != null && String(jobId).trim() !== '' ? String(jobId) : '';
    if (!jid) {
      setJobExpenses([]);
      return;
    }
    const token = window.localStorage.getItem('wp_token');
    if (!token) return;
    setLoadingJobExpenses(true);
    try {
      const res = await getJson<{ expenses: JobExpense[] }>(`/jobs/${jid}/expenses`, token);
      setJobExpenses((res.expenses ?? []).filter((e) => e.status === 'approved'));
    } catch {
      setJobExpenses([]);
    } finally {
      setLoadingJobExpenses(false);
    }
  }, [jobId]);

  useEffect(() => {
    setAddedJobExpenseIds([]);
    void loadJobExpenses();
  }, [loadJobExpenses]);

  const canAdd = category.trim().length > 0 && (parseFloat(amount) || 0) > 0;

  const handleAdd = () => {
    if (!canAdd) {
      setError('Category and a positive amount are required');
      return;
    }
    setError(null);
    onAddExpenseLine(expenseToLine(category, amount, notes));
    setAmount('');
    setNotes('');
  };

  const handleAddJobExpense = (expense: JobExpense) => {
    const cat = expense.category?.trim() || 'Expense';
    const note = (expense.description ?? '').trim();
    const amt = formatMoney(expense.amount);
    onAddExpenseLine(expenseToLine(cat, amt, note));
    setAddedJobExpenseIds((prev) => (prev.includes(expense.id) ? prev : [...prev, expense.id]));
  };

  const hasJob = jobId != null && String(jobId).trim() !== '';

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-start gap-2 border-b border-slate-100 px-4 py-3">
        <div className="rounded-lg bg-[#14B8A6]/10 p-2 text-[#14B8A6]">
          <ReceiptText className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-800">Expenses</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {hasJob
              ? 'Add billable expenses as line items, or pull approved job expenses below.'
              : 'No job linked — add parking, travel, materials and other billable expenses here. They become invoice line items.'}
          </p>
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_120px_auto] sm:items-end">
          <label className="block text-xs">
            <span className="font-medium text-slate-600">Category</span>
            <input
              list="invoice-expense-categories"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/20"
              placeholder="e.g. Parking"
            />
            <datalist id="invoice-expense-categories">
              {CATEGORY_SUGGESTIONS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label className="block text-xs">
            <span className="font-medium text-slate-600">Amount (£)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/20"
              placeholder="0.00"
            />
          </label>
          <button
            type="button"
            disabled={!canAdd}
            onClick={handleAdd}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#14B8A6] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0d9488] disabled:opacity-40"
          >
            <Plus className="size-3.5" />
            Add expense
          </button>
        </div>
        <label className="block text-xs">
          <span className="font-medium text-slate-600">Notes (optional)</span>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-0.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/20"
            placeholder="Shown on the line item after the category"
          />
        </label>
        {error && <p className="text-xs text-rose-600">{error}</p>}

        {hasJob && (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/80 p-3">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Approved job expenses
            </p>
            {loadingJobExpenses ? (
              <p className="text-xs text-slate-500">Loading…</p>
            ) : jobExpenses.length === 0 ? (
              <p className="text-xs text-slate-500">No approved expenses on this job yet.</p>
            ) : (
              <ul className="space-y-2">
                {jobExpenses.map((expense) => {
                  const already = addedJobExpenseIds.includes(expense.id);
                  return (
                    <li
                      key={expense.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">{expense.category}</p>
                        <p className="truncate text-xs text-slate-500">
                          {expense.expense_date}
                          {expense.description?.trim() ? ` · ${expense.description.trim()}` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-sm font-semibold text-slate-800">£{formatMoney(expense.amount)}</span>
                        <button
                          type="button"
                          disabled={already}
                          onClick={() => handleAddJobExpense(expense)}
                          className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-[#14B8A6] hover:bg-[#14B8A6]/5 disabled:opacity-40"
                        >
                          {already ? 'Added' : 'Add'}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
