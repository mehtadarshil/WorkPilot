'use client';

import { useState } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  onApply: (text: string, startRow: number, startColIndex: number) => void;
  columnLabels: { key: string; label: string }[];
};

export function PasteCircuitsModal({ open, onClose, onApply, columnLabels }: Props) {
  const [text, setText] = useState('');
  const [startRow, setStartRow] = useState(0);
  const [startColIndex, setStartColIndex] = useState(0);

  if (!open) return null;

  return (
    <>
      <button type="button" aria-label="Close" className="fixed inset-0 z-40 bg-slate-900/40" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-5 shadow-xl">
        <h3 className="text-lg font-bold text-slate-900">Paste from Excel</h3>
        <p className="mt-1 text-sm text-slate-600">
          Paste tab-separated or comma-separated values. Spare/Unknown rows only accept description changes.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">
            Start row (0-based)
            <input
              type="number"
              min={0}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={startRow}
              onChange={(e) => setStartRow(Math.max(0, parseInt(e.target.value, 10) || 0))}
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Start column
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={startColIndex}
              onChange={(e) => setStartColIndex(parseInt(e.target.value, 10) || 0)}
            >
              {columnLabels.map((col, index) => (
                <option key={col.key} value={index}>
                  {col.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="mt-3 block text-sm font-medium text-slate-700">
          Clipboard data
          <textarea
            className="mt-1 h-36 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste cells from Excel or Google Sheets…"
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold">
            Cancel
          </button>
          <button
            type="button"
            disabled={!text.trim()}
            onClick={() => {
              onApply(text, startRow, startColIndex);
              onClose();
              setText('');
            }}
            className="rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Paste into grid
          </button>
        </div>
      </div>
    </>
  );
}
