'use client';

import { useState } from 'react';
import { Calculator, Hash, Plus, Rows3, Wand2 } from 'lucide-react';
import type { BoardRecord, CircuitRow } from '@/lib/electricalCertificates/types';
import { CIRCUIT_COLUMNS } from '@/lib/electricalCertificates/circuitColumns';

type Props = {
  board: BoardRecord;
  onQuickAdd: (n: number) => void;
  onAdd: () => void;
  onRenumber: () => void;
  onToggle100MaxZs: () => void;
  onRecalculateAll: () => void;
  onFillColumn: (key: keyof CircuitRow, value: string) => void;
  onAutofillFromPrevious: () => void;
};

export function CircuitsToolbar({
  board,
  onQuickAdd,
  onAdd,
  onRenumber,
  onToggle100MaxZs,
  onRecalculateAll,
  onFillColumn,
  onAutofillFromPrevious,
}: Props) {
  const [fillKey, setFillKey] = useState<keyof CircuitRow>('wiringType');
  const [fillValue, setFillValue] = useState('');
  const tested = board.circuits.filter((c) => c.tested).length;

  const fillableCols = CIRCUIT_COLUMNS.filter(
    (c) => !c.calculated && c.key !== 'circuitNumber' && c.key !== 'id',
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onQuickAdd(6)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Quick add 6
        </button>
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1 rounded-lg bg-[#14B8A6] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0d9488]"
        >
          <Plus className="size-3.5" /> Add
        </button>
        <button
          type="button"
          onClick={onAutofillFromPrevious}
          className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Wand2 className="size-3.5" /> Autofill
        </button>
        <button
          type="button"
          onClick={onRenumber}
          className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Hash className="size-3.5" /> Renumber
        </button>
        <button
          type="button"
          onClick={onRecalculateAll}
          className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          title="Recalculate all calculator fields"
        >
          <Calculator className="size-3.5" /> Recalculate
        </button>
        <button
          type="button"
          onClick={onToggle100MaxZs}
          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
            board.maxZsUse100Percent
              ? 'border-amber-400 bg-amber-50 text-amber-900'
              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          100% Max Zs
        </button>
        <span className="ml-auto text-xs text-slate-500">
          {board.circuits.length} circuit{board.circuits.length === 1 ? '' : 's'} · {tested} tested
        </span>
        {board.zsAtDb.trim() && (
          <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-white">
            Zdb: {board.zsAtDb} Ω
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-100 bg-slate-50/80 p-2">
        <Rows3 className="mb-2 size-4 text-slate-400" />
        <label className="text-xs font-medium text-slate-600">
          Fill column
          <select
            className="mt-0.5 block rounded border border-slate-200 bg-white px-2 py-1 text-xs"
            value={fillKey}
            onChange={(e) => setFillKey(e.target.value as keyof CircuitRow)}
          >
            {fillableCols.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          Value
          <input
            className="mt-0.5 block w-28 rounded border border-slate-200 bg-white px-2 py-1 text-xs"
            value={fillValue}
            onChange={(e) => setFillValue(e.target.value)}
            placeholder="Value…"
          />
        </label>
        <button
          type="button"
          disabled={!fillValue.trim() || board.circuits.length === 0}
          onClick={() => {
            onFillColumn(fillKey, fillValue.trim());
            setFillValue('');
          }}
          className="mb-0.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
        >
          Apply to all rows
        </button>
      </div>
    </div>
  );
}
