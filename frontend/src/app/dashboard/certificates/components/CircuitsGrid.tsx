'use client';

import { useCallback } from 'react';
import { Calculator, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { useCertificateEditor } from '../CertificateEditorContext';
import type { BoardRecord, CircuitRow, CircuitCalcOverrideKey } from '@/lib/electricalCertificates/types';
import { CIRCUIT_COLUMNS } from '@/lib/electricalCertificates/circuitColumns';
import {
  applyCircuitCalculations,
  type CalcFieldKey,
} from '@/lib/electricalCertificates/circuitCalculations';

const CALC_KEY_MAP: Partial<Record<keyof CircuitRow, CalcFieldKey>> = {
  maxDisconnectTime: 'maxDisconnectTime',
  ocpdBreakingKa: 'ocpdBreakingKa',
  maxZs: 'maxZs',
  cpcMm2: 'cpcMm2',
  r1r2: 'r1r2',
};

type Props = {
  boardId: string;
  board: BoardRecord;
  circuits: CircuitRow[];
  readOnly?: boolean;
  onMoveCircuit?: (circuitId: string, direction: -1 | 1) => void;
};

export function CircuitsGrid({ boardId, board, circuits, readOnly = false, onMoveCircuit }: Props) {
  const { setDocument } = useCertificateEditor();

  const updateBoardCircuits = useCallback(
    (updater: (circuits: CircuitRow[]) => CircuitRow[]) => {
      setDocument((d) => ({
        ...d,
        boards: d.boards.map((b) =>
          b.id !== boardId ? b : { ...b, circuits: updater(b.circuits) },
        ),
      }));
    },
    [boardId, setDocument],
  );

  const updateCircuit = (circuitId: string, key: keyof CircuitRow, value: string | boolean) => {
    updateBoardCircuits((list) =>
      list.map((c) => {
        if (c.id !== circuitId) return c;
        const calcKey = CALC_KEY_MAP[key];
        const overrides = { ...(c.calcOverrides ?? {}) };
        if (calcKey && typeof value === 'string') {
          overrides[calcKey as CircuitCalcOverrideKey] = true;
        }
        const updated = { ...c, [key]: value, calcOverrides: overrides } as CircuitRow;
        const triggersCalc =
          key === 'ocpdType' ||
          key === 'ocpdRatingA' ||
          key === 'liveMm2' ||
          key === 'ringR1' ||
          key === 'ringR2End' ||
          key === 'maxDisconnectTime';
        if (triggersCalc && typeof value === 'string') {
          return applyCircuitCalculations(updated, board, board.maxZsUse100Percent);
        }
        return updated;
      }),
    );
  };

  const removeCircuit = (circuitId: string) => {
    updateBoardCircuits((list) => list.filter((c) => c.id !== circuitId));
  };

  const clearCalcOverride = (circuitId: string, field: CalcFieldKey) => {
    updateBoardCircuits((list) =>
      list.map((c) => {
        if (c.id !== circuitId) return c;
        const overrides = { ...(c.calcOverrides ?? {}) };
        delete overrides[field];
        const next = applyCircuitCalculations(
          { ...c, calcOverrides: overrides },
          board,
          board.maxZsUse100Percent,
        );
        return next;
      }),
    );
  };

  if (circuits.length === 0) {
    return <p className="text-sm text-slate-500">No circuits yet. Use Quick add or Add.</p>;
  }

  const groupSpans: { label: string; span: number }[] = [];
  let currentGroup = '';
  let span = 0;
  for (const col of CIRCUIT_COLUMNS) {
    const g = col.group ?? '';
    if (g !== currentGroup) {
      if (span > 0) groupSpans.push({ label: currentGroup, span });
      currentGroup = g;
      span = 0;
    }
    span++;
  }
  if (span > 0) groupSpans.push({ label: currentGroup, span });

  const groupLabels: Record<string, string> = {
    conductors: 'Conductors',
    ocpd: 'Overcurrent devices',
    rcd: 'RCD',
    ring: 'Ring final',
  };

  return (
    <div className="relative overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-inner">
      <table className="min-w-[2400px] border-collapse text-xs">
        <thead className="sticky top-0 z-10 bg-slate-50">
          <tr className="border-b border-slate-200">
            {groupSpans.map((g, i) =>
              g.label ? (
                <th
                  key={`g-${i}`}
                  colSpan={g.span}
                  className="border-b border-slate-200 bg-slate-100/90 px-1 py-1 text-center text-[10px] font-bold uppercase tracking-wide text-slate-500"
                >
                  {groupLabels[g.label] ?? g.label}
                </th>
              ) : (
                <th key={`g-${i}`} colSpan={g.span} className="border-b border-slate-200 bg-slate-50" />
              ),
            )}
            <th className="w-16 bg-slate-50" rowSpan={2} />
          </tr>
          <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            {CIRCUIT_COLUMNS.map((col) => (
              <th
                key={col.key}
                className={`border-r border-slate-100 px-1 py-1.5 text-left ${col.width} ${
                  col.sticky ? 'sticky left-0 z-20 bg-slate-50 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]' : ''
                } ${col.key === 'description' ? 'sticky left-11 z-20 bg-slate-50' : ''}`}
              >
                <span className="flex items-center gap-0.5">
                  {col.label}
                  {col.calculated && (
                    <Calculator className="size-3 shrink-0 text-[#14B8A6]" aria-label="Auto-calculated" />
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {circuits.map((c) => (
            <tr key={c.id} className="border-b border-slate-50 hover:bg-[#14B8A6]/5">
              {CIRCUIT_COLUMNS.map((col) => {
                const isCalc = col.calculated;
                const calcField = CALC_KEY_MAP[col.key];
                const overridden = calcField && c.calcOverrides?.[calcField];
                const cellValue = String(c[col.key] ?? '');

                return (
                  <td
                    key={col.key}
                    className={`p-0 ${col.width} ${
                      col.sticky ? 'sticky left-0 z-[5] bg-white' : ''
                    } ${col.key === 'description' ? 'sticky left-11 z-[5] bg-white' : ''}`}
                  >
                    <div className="relative flex items-center">
                      <input
                        disabled={readOnly}
                        className={`w-full border-0 px-1.5 py-1.5 outline-none focus:bg-white focus:ring-1 focus:ring-[#14B8A6] disabled:cursor-not-allowed disabled:opacity-60 ${
                          isCalc ? 'bg-teal-50/50 text-teal-900' : 'bg-transparent'
                        } ${overridden ? 'ring-1 ring-amber-200' : ''}`}
                        value={cellValue}
                        onChange={(e) => updateCircuit(c.id, col.key, e.target.value)}
                        title={isCalc ? 'Auto-calculated — edit to override' : undefined}
                      />
                      {isCalc && calcField && overridden && (
                        <button
                          type="button"
                          title="Reset to calculated value"
                          onClick={() => clearCalcOverride(c.id, calcField)}
                          className="absolute right-0.5 rounded p-0.5 text-[#14B8A6] hover:bg-teal-100"
                        >
                          <Calculator className="size-3" />
                        </button>
                      )}
                    </div>
                  </td>
                );
              })}
              <td className="p-0.5">
                <div className="flex items-center justify-center gap-0.5">
                  {onMoveCircuit && !readOnly && (
                    <>
                      <button
                        type="button"
                        title="Move up"
                        disabled={circuits.findIndex((x) => x.id === c.id) === 0}
                        onClick={() => onMoveCircuit(c.id, -1)}
                        className="rounded p-0.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                      >
                        <ChevronUp className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Move down"
                        disabled={circuits.findIndex((x) => x.id === c.id) === circuits.length - 1}
                        onClick={() => onMoveCircuit(c.id, 1)}
                        className="rounded p-0.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                      >
                        <ChevronDown className="size-3.5" />
                      </button>
                    </>
                  )}
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => removeCircuit(c.id)}
                      className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
