'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Calculator, Plus, Trash2, Save } from 'lucide-react';
import { getJson, putJson } from '../../apiClient';

export type InternalCostSection = 'material' | 'labour';

export type InternalCostRow = {
  key: string;
  section: InternalCostSection;
  item: string;
  supplier: string;
  supplier_link: string;
  unit_cost: string;
  quantity: string;
};

export type InternalCostItem = {
  id: number;
  section: InternalCostSection;
  item: string;
  supplier: string;
  supplier_link: string;
  unit_cost: number;
  quantity: number;
  total: number;
  sort_order: number;
};

type InternalCostsPayload = {
  items: InternalCostItem[];
  materials_subtotal: number;
  labour_subtotal: number;
  combined_total: number;
};

const DEFAULT_ROW_COUNT = 10;

let rowKeyCounter = 0;
function nextRowKey(): string {
  rowKeyCounter += 1;
  return `cost-row-${rowKeyCounter}`;
}

function emptyRow(section: InternalCostSection): InternalCostRow {
  return {
    key: nextRowKey(),
    section,
    item: '',
    supplier: '',
    supplier_link: '',
    unit_cost: '',
    quantity: '',
  };
}

function createDefaultRows(section: InternalCostSection, count = DEFAULT_ROW_COUNT): InternalCostRow[] {
  return Array.from({ length: count }, () => emptyRow(section));
}

function parseNumber(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function rowTotal(row: InternalCostRow): number {
  return Math.round(parseNumber(row.unit_cost) * parseNumber(row.quantity) * 100) / 100;
}

function rowHasContent(row: InternalCostRow): boolean {
  return (
    row.item.trim().length > 0 ||
    row.supplier.trim().length > 0 ||
    row.supplier_link.trim().length > 0 ||
    parseNumber(row.unit_cost) > 0 ||
    parseNumber(row.quantity) > 0
  );
}

function itemsToRows(items: InternalCostItem[], section: InternalCostSection): InternalCostRow[] {
  const sectionItems = items
    .filter((i) => i.section === section)
    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  const rows: InternalCostRow[] = sectionItems.map((item) => ({
    key: nextRowKey(),
    section,
    item: item.item,
    supplier: item.supplier,
    supplier_link: item.supplier_link,
    unit_cost: item.unit_cost ? String(item.unit_cost) : '',
    quantity: item.quantity ? String(item.quantity) : '',
  }));
  while (rows.length < DEFAULT_ROW_COUNT) {
    rows.push(emptyRow(section));
  }
  return rows;
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount);
}

type CostTableProps = {
  title: string;
  rows: InternalCostRow[];
  currency: string;
  onChange: (rows: InternalCostRow[]) => void;
};

function CostTable({ title, rows, currency, onChange }: CostTableProps) {
  const subtotal = useMemo(() => rows.reduce((sum, row) => sum + rowTotal(row), 0), [rows]);

  const updateRow = (index: number, patch: Partial<InternalCostRow>) => {
    const next = rows.map((row, i) => (i === index ? { ...row, ...patch } : row));
    onChange(next);
  };

  const addRow = () => {
    const section = rows[0]?.section ?? 'material';
    onChange([...rows, emptyRow(section)]);
  };

  const removeRow = (index: number) => {
    if (rows.length <= 1) return;
    onChange(rows.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-slate-800">{title}</h4>
        <span className="text-xs font-semibold text-slate-500">
          Subtotal: <span className="text-slate-900">{formatCurrency(subtotal, currency)}</span>
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-[560px] text-left text-xs">
          <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-2">Item</th>
              <th className="px-2 py-2">Supplier</th>
              <th className="px-2 py-2">Link</th>
              <th className="w-20 px-2 py-2">Unit cost</th>
              <th className="w-16 px-2 py-2">Qty</th>
              <th className="w-20 px-2 py-2">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, index) => (
              <tr key={row.key} className="align-top">
                <td className="px-1 py-1">
                  <div className="flex min-w-[9rem] items-center gap-1">
                    <input
                      type="text"
                      value={row.item}
                      onChange={(e) => updateRow(index, { item: e.target.value })}
                      placeholder="Item"
                      className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs text-slate-900 focus:border-[#14B8A6] focus:outline-none focus:ring-1 focus:ring-[#14B8A6]"
                    />
                    <button
                      type="button"
                      onClick={() => removeRow(index)}
                      disabled={rows.length <= 1}
                      className="shrink-0 rounded border border-rose-100 bg-rose-50 p-1.5 text-rose-600 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label="Delete row"
                      title="Delete row"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </td>
                <td className="px-1 py-1">
                  <input
                    type="text"
                    value={row.supplier}
                    onChange={(e) => updateRow(index, { supplier: e.target.value })}
                    placeholder="Supplier"
                    className="w-full min-w-[6rem] rounded border border-slate-200 px-2 py-1.5 text-xs text-slate-900 focus:border-[#14B8A6] focus:outline-none focus:ring-1 focus:ring-[#14B8A6]"
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    type="url"
                    value={row.supplier_link}
                    onChange={(e) => updateRow(index, { supplier_link: e.target.value })}
                    placeholder="https://"
                    className="w-full min-w-[6rem] rounded border border-slate-200 px-2 py-1.5 text-xs text-slate-900 focus:border-[#14B8A6] focus:outline-none focus:ring-1 focus:ring-[#14B8A6]"
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={row.unit_cost}
                    onChange={(e) => updateRow(index, { unit_cost: e.target.value })}
                    placeholder="0.00"
                    className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs text-slate-900 focus:border-[#14B8A6] focus:outline-none focus:ring-1 focus:ring-[#14B8A6]"
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={row.quantity}
                    onChange={(e) => updateRow(index, { quantity: e.target.value })}
                    placeholder="0"
                    className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs text-slate-900 focus:border-[#14B8A6] focus:outline-none focus:ring-1 focus:ring-[#14B8A6]"
                  />
                </td>
                <td className="px-2 py-2 text-xs font-semibold text-slate-700 whitespace-nowrap">
                  {formatCurrency(rowTotal(row), currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={addRow}
        className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-[#14B8A6] hover:text-[#14B8A6]"
      >
        <Plus className="size-3.5" />
        Add row
      </button>
    </div>
  );
}

type QuotationInternalCostingCardProps = {
  quotationId: string;
  authToken: string;
  currency: string;
};

export default function QuotationInternalCostingCard({
  quotationId,
  authToken,
  currency,
}: QuotationInternalCostingCardProps) {
  const [materialRows, setMaterialRows] = useState<InternalCostRow[]>(() => createDefaultRows('material'));
  const [labourRows, setLabourRows] = useState<InternalCostRow[]>(() => createDefaultRows('labour'));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const hasChanges = useRef(false);

  const handleMaterialRowsChange = (next: InternalCostRow[]) => {
    hasChanges.current = true;
    setMaterialRows(next);
  };

  const handleLabourRowsChange = (next: InternalCostRow[]) => {
    hasChanges.current = true;
    setLabourRows(next);
  };

  const loadCosts = useCallback(async () => {
    if (!authToken || !quotationId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getJson<InternalCostsPayload>(`/quotations/${quotationId}/internal-costs`, authToken);
      hasChanges.current = false;
      setMaterialRows(itemsToRows(data.items, 'material'));
      setLabourRows(itemsToRows(data.items, 'labour'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load internal costing');
    } finally {
      setLoading(false);
    }
  }, [authToken, quotationId]);

  useEffect(() => {
    loadCosts();
  }, [loadCosts]);

  const materialsSubtotal = useMemo(
    () => materialRows.reduce((sum, row) => sum + rowTotal(row), 0),
    [materialRows],
  );
  const labourSubtotal = useMemo(
    () => labourRows.reduce((sum, row) => sum + rowTotal(row), 0),
    [labourRows],
  );
  const combinedTotal = materialsSubtotal + labourSubtotal;

  const handleSave = async () => {
    if (!authToken) return;
    hasChanges.current = false;
    setSaving(true);
    setError(null);
    try {
      const payloadRows = [...materialRows, ...labourRows]
        .filter(rowHasContent)
        .map((row, index) => ({
          section: row.section,
          item: row.item.trim(),
          supplier: row.supplier.trim(),
          supplier_link: row.supplier_link.trim(),
          unit_cost: parseNumber(row.unit_cost),
          quantity: parseNumber(row.quantity),
          sort_order: index,
        }));
      const data = await putJson<InternalCostsPayload, { items: typeof payloadRows }>(
        `/quotations/${quotationId}/internal-costs`,
        { items: payloadRows },
        authToken,
      );
      setMaterialRows(itemsToRows(data.items, 'material'));
      setLabourRows(itemsToRows(data.items, 'labour'));
      setSavedAt(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save internal costing');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!hasChanges.current || loading) return;

    const handler = setTimeout(() => {
      void handleSave();
    }, 1500);

    return () => {
      clearTimeout(handler);
    };
  }, [materialRows, labourRows, loading, authToken]);

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <Calculator className="size-5 text-amber-600" />
            Internal Costing
          </h3>
          <p className="mt-1 text-xs text-amber-800/80">
            Office use only — not shown on customer quotation, print, or PDF.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || loading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#14B8A6] px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#0d9488] disabled:opacity-50"
        >
          <Save className="size-3.5" />
          {saving ? 'Saving…' : 'Save costing'}
        </button>
      </div>

      {error ? <p className="mb-3 text-xs font-medium text-rose-600">{error}</p> : null}
      {savedAt && !error ? (
        <p className="mb-3 text-xs font-medium text-emerald-700">Saved at {savedAt}</p>
      ) : null}

      {loading ? (
        <div className="py-8 text-center text-sm text-slate-500">Loading costing worksheet…</div>
      ) : (
        <div className="space-y-6">
          <CostTable title="Materials" rows={materialRows} currency={currency} onChange={handleMaterialRowsChange} />
          <CostTable title="Labour" rows={labourRows} currency={currency} onChange={handleLabourRowsChange} />

          <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
            <div className="flex justify-between py-1">
              <span className="text-slate-500">Materials subtotal</span>
              <span className="font-semibold text-slate-900">{formatCurrency(materialsSubtotal, currency)}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-500">Labour subtotal</span>
              <span className="font-semibold text-slate-900">{formatCurrency(labourSubtotal, currency)}</span>
            </div>
            <div className="mt-2 flex justify-between border-t border-slate-100 pt-2">
              <span className="font-bold text-slate-900">Combined internal cost</span>
              <span className="text-base font-black text-amber-700">{formatCurrency(combinedTotal, currency)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
