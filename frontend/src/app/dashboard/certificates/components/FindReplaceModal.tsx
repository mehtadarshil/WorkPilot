'use client';

import { useState } from 'react';
import type { CircuitRow } from '@/lib/electricalCertificates/types';
import { CIRCUIT_COLUMNS } from '@/lib/electricalCertificates/circuitColumns';

export function FindReplaceModal({
  open,
  onClose,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  onApply: (column: keyof CircuitRow, find: string, replace: string) => void;
}) {
  const [column, setColumn] = useState<keyof CircuitRow>('description');
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');

  if (!open) return null;

  const textCols = CIRCUIT_COLUMNS.filter(
    (c) => c.key !== 'tested' && c.key !== 'circuitNumber',
  );

  return (
    <>
      <button type="button" aria-label="Close" className="fixed inset-0 z-40 bg-slate-900/40" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-5 shadow-xl">
        <h3 className="text-lg font-bold text-slate-900">Find &amp; replace</h3>
        <p className="mt-1 text-sm text-slate-600">Replace text in all circuits on this board.</p>
        <div className="mt-4 space-y-3">
          <label className="block text-sm font-medium text-slate-700">
            Column
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={column}
              onChange={(e) => setColumn(e.target.value as keyof CircuitRow)}
            >
              {textCols.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Find
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={find}
              onChange={(e) => setFind(e.target.value)}
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Replace with
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={replace}
              onChange={(e) => setReplace(e.target.value)}
            />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold">
            Cancel
          </button>
          <button
            type="button"
            disabled={!find}
            onClick={() => {
              onApply(column, find, replace);
              onClose();
              setFind('');
              setReplace('');
            }}
            className="rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Replace all
          </button>
        </div>
      </div>
    </>
  );
}
