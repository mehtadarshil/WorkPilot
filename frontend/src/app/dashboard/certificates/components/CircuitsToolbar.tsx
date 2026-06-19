'use client';

import { useMemo, useState } from 'react';
import { Calculator, ClipboardPaste, Eraser, Hash, Plus, Replace, Rows3, Wand2 } from 'lucide-react';
import type { BoardRecord, CircuitRow } from '@/lib/electricalCertificates/types';
import {
  FILLABLE_CIRCUIT_COLUMNS,
  getColumnQuickOptions,
} from '@/lib/electricalCertificates/circuitGridUtils';
import { isCircuitTested } from './CircuitsGrid';

type Props = {
  board: BoardRecord;
  readOnly?: boolean;
  onFindReplace: () => void;
  onPaste: () => void;
  onQuickAdd: (n: number) => void;
  onAdd: () => void;
  onRenumber: () => void;
  onToggle100MaxZs: () => void;
  onRecalculateAll: () => void;
  onFillColumn: (key: keyof CircuitRow, value: string) => void;
  onClearColumn: (key: keyof CircuitRow) => void;
  onAutofillFromPrevious: () => void;
};

export function CircuitsToolbar({
  board,
  readOnly = false,
  onFindReplace,
  onPaste,
  onQuickAdd,
  onAdd,
  onRenumber,
  onToggle100MaxZs,
  onRecalculateAll,
  onFillColumn,
  onClearColumn,
  onAutofillFromPrevious,
}: Props) {
  const [fillKey, setFillKey] = useState<keyof CircuitRow>('wiringType');
  const [fillValue, setFillValue] = useState('');
  const tested = board.circuits.filter(isCircuitTested).length;
  const quickOptions = useMemo(() => getColumnQuickOptions(fillKey), [fillKey]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={readOnly}
          onClick={() => onQuickAdd(6)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          Quick add 6
        </button>
        <button
          type="button"
          disabled={readOnly}
          onClick={onAdd}
          className="flex items-center gap-1 rounded-lg bg-[#14B8A6] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0d9488] disabled:opacity-40"
        >
          <Plus className="size-3.5" /> Add
        </button>
        <button
          type="button"
          disabled={readOnly}
          onClick={onFindReplace}
          className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          <Replace className="size-3.5" /> Find &amp; replace
        </button>
        <button
          type="button"
          disabled={readOnly}
          onClick={onPaste}
          className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          <ClipboardPaste className="size-3.5" /> Paste
        </button>
        <button
          type="button"
          disabled={readOnly}
          onClick={onAutofillFromPrevious}
          className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          <Wand2 className="size-3.5" /> Autofill
        </button>
        <button
          type="button"
          disabled={readOnly}
          onClick={onRenumber}
          className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          <Hash className="size-3.5" /> Renumber
        </button>
        <button
          type="button"
          disabled={readOnly}
          onClick={onRecalculateAll}
          className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          title="Recalculate all calculator fields"
        >
          <Calculator className="size-3.5" /> Recalculate
        </button>
        <button
          type="button"
          disabled={readOnly}
          onClick={onToggle100MaxZs}
          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${
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
            {FILLABLE_CIRCUIT_COLUMNS.map((c) => (
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
          disabled={readOnly || !fillValue.trim() || board.circuits.length === 0}
          onClick={() => {
            onFillColumn(fillKey, fillValue.trim());
            setFillValue('');
          }}
          className="mb-0.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
        >
          Apply (skip spares)
        </button>
        <button
          type="button"
          disabled={readOnly || board.circuits.length === 0}
          onClick={() => onClearColumn(fillKey)}
          className="mb-0.5 flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
        >
          <Eraser className="size-3" /> Clear column
        </button>
        {quickOptions.length > 0 && (
          <div className="mb-0.5 flex flex-wrap items-center gap-1">
            {quickOptions.slice(0, 8).map((option) => (
              <button
                key={option}
                type="button"
                disabled={readOnly}
                onClick={() => onFillColumn(fillKey, option)}
                className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-teal-50 disabled:opacity-40"
              >
                {option}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
