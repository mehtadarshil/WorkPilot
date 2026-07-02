'use client';

import { useMemo, useState } from 'react';
import { Calculator, ClipboardPaste, Eraser, Grid3x3, Hash, Plus, Replace, Rows3, Wand2, X } from 'lucide-react';
import type { BoardRecord, CircuitRow } from '@/lib/electricalCertificates/types';
import {
  AUTOFILL_BLANK_VALUES,
  FILLABLE_CIRCUIT_COLUMNS,
  getColumnQuickOptions,
} from '@/lib/electricalCertificates/circuitGridUtils';
import { isCircuitTested } from './CircuitsGrid';

type Props = {
  board: BoardRecord;
  readOnly?: boolean;
  onFindReplace: () => void;
  onPaste: () => void;
  onOpenQuickAdd: () => void;
  onAdd: () => void;
  onRenumber: () => void;
  onToggle100MaxZs: () => void;
  onRecalculateAll: () => void;
  onFillColumn: (key: keyof CircuitRow, value: string) => void;
  onFillColumnBlanks: (key: keyof CircuitRow, value: string) => void;
  onClearColumn: (key: keyof CircuitRow) => void;
  onAutofillFromPrevious: () => void;
  onAutofillBlanks: () => void;
  selectedColumn?: keyof CircuitRow | null;
};

export function CircuitsToolbar({
  board,
  readOnly = false,
  onFindReplace,
  onPaste,
  onOpenQuickAdd,
  onAdd,
  onRenumber,
  onToggle100MaxZs,
  onRecalculateAll,
  onFillColumn,
  onFillColumnBlanks,
  onClearColumn,
  onAutofillFromPrevious,
  onAutofillBlanks,
  selectedColumn,
}: Props) {
  const [fillKey, setFillKey] = useState<keyof CircuitRow>('wiringType');
  const [fillValue, setFillValue] = useState('');
  const [fillModalOpen, setFillModalOpen] = useState(false);
  const tested = board.circuits.filter(isCircuitTested).length;
  const quickOptions = useMemo(() => getColumnQuickOptions(fillKey), [fillKey]);
  const fillLabel = FILLABLE_CIRCUIT_COLUMNS.find((c) => c.key === fillKey)?.label ?? '';
  const noCircuits = board.circuits.length === 0;
  const selectedFillable = selectedColumn
    ? FILLABLE_CIRCUIT_COLUMNS.find((c) => c.key === selectedColumn)
    : undefined;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={readOnly}
          onClick={onOpenQuickAdd}
          className="rounded-lg border border-[#14B8A6] bg-[#ecfdf9] px-3 py-1.5 text-xs font-semibold text-[#0f766e] hover:bg-[#d1faf4] disabled:opacity-40"
        >
          Quick add
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
          disabled={readOnly || board.circuits.length === 0}
          onClick={onAutofillBlanks}
          className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          title="Fill all empty cells with a value"
        >
          <Grid3x3 className="size-3.5" /> Fill blanks
        </button>
        <button
          type="button"
          disabled={readOnly || noCircuits}
          onClick={() => {
            if (selectedFillable) setFillKey(selectedFillable.key);
            setFillModalOpen(true);
          }}
          className={`flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${
            selectedFillable
              ? 'border-[#14B8A6] bg-[#ecfdf9] text-[#0f766e]'
              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          }`}
          title="Fill or clear a specific column"
        >
          <Rows3 className="size-3.5" />
          {selectedFillable ? `Fill: ${selectedFillable.label}` : 'Fill column'}
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

      {fillModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setFillModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-bold text-slate-900">Fill column</h3>
              <button
                type="button"
                onClick={() => setFillModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="size-5" />
              </button>
            </div>

            <label className="mt-3 block text-xs font-semibold text-slate-600">
              Column
              <select
                className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
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

            <p className="mt-4 text-sm font-medium text-slate-500">Set {fillLabel} to…</p>
            <input
              autoFocus
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              value={fillValue}
              onChange={(e) => setFillValue(e.target.value)}
              placeholder="Enter value to fill…"
            />

            <div className="mt-2 flex flex-wrap gap-1.5">
              {AUTOFILL_BLANK_VALUES.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFillValue(option)}
                  className="rounded-md border border-slate-800 bg-slate-800 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-700"
                >
                  {option}
                </button>
              ))}
            </div>

            {quickOptions.length > 0 && (
              <div className="mt-3 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-100">
                {quickOptions
                  .filter((o) => !AUTOFILL_BLANK_VALUES.includes(o as (typeof AUTOFILL_BLANK_VALUES)[number]))
                  .map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setFillValue(option)}
                      className={`block w-full px-3 py-2 text-left text-sm hover:bg-teal-50 ${
                        fillValue === option ? 'bg-teal-50 font-semibold text-teal-700' : 'text-slate-700'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                disabled={readOnly || noCircuits}
                onClick={() => {
                  onClearColumn(fillKey);
                  setFillModalOpen(false);
                }}
                className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                <Eraser className="size-3.5" /> Clear column
              </button>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setFillModalOpen(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={readOnly || !fillValue.trim() || noCircuits}
                  onClick={() => {
                    onFillColumnBlanks(fillKey, fillValue.trim());
                    setFillValue('');
                    setFillModalOpen(false);
                  }}
                  className="rounded-lg border border-[#14B8A6] bg-white px-4 py-2 text-sm font-semibold text-[#0f766e] hover:bg-[#ecfdf9] disabled:opacity-40"
                >
                  Fill blanks in column
                </button>
                <button
                  type="button"
                  disabled={readOnly || !fillValue.trim() || noCircuits}
                  onClick={() => {
                    onFillColumn(fillKey, fillValue.trim());
                    setFillValue('');
                    setFillModalOpen(false);
                  }}
                  className="rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0d9488] disabled:opacity-40"
                >
                  Fill all
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
