'use client';

import { useCallback, type KeyboardEvent } from 'react';
import { Calculator, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { useCertificateEditor } from '../CertificateEditorContext';
import type { BoardRecord, CircuitRow, CircuitCalcOverrideKey } from '@/lib/electricalCertificates/types';
import { CIRCUIT_COLUMNS } from '@/lib/electricalCertificates/circuitColumns';
import {
  applyCircuitCalculations,
  type CalcFieldKey,
} from '@/lib/electricalCertificates/circuitCalculations';
import {
  CIRCUIT_OPTION_VALUES,
  clampCircuitField,
  isNaDescription,
  applySpareOrUnknownCircuitDefaults,
} from '@/lib/electricalCertificates/circuitGridUtils';
import { CircuitCellInput } from './CircuitCellInput';

const CALC_KEY_MAP: Partial<Record<keyof CircuitRow, CalcFieldKey>> = {
  maxDisconnectTime: 'maxDisconnectTime',
  ocpdBreakingKa: 'ocpdBreakingKa',
  maxZs: 'maxZs',
  cpcMm2: 'cpcMm2',
  r1r2: 'r1r2',
  zs: 'zs',
};

const UNTESTED_ZS_VALUES = new Set(['', '-', '--', '---', 'lim', 'n/v', 'n/a', 'na', 'x']);

export function isCircuitTested(circuit: CircuitRow) {
  return !UNTESTED_ZS_VALUES.has(circuit.zs.trim().toLowerCase());
}

type Props = {
  boardId: string;
  board: BoardRecord;
  circuits: CircuitRow[];
  readOnly?: boolean;
  onMoveCircuit?: (circuitId: string, direction: -1 | 1) => void;
};

export function CircuitsGrid({ boardId, board, circuits, readOnly = false, onMoveCircuit }: Props) {
  const { setDocument } = useCertificateEditor();

  const focusCircuitCell = (grid: HTMLElement, rowIndex: number, colIndex: number) => {
    const row = Math.max(0, Math.min(rowIndex, circuits.length - 1));
    const col = Math.max(0, Math.min(colIndex, CIRCUIT_COLUMNS.length - 1));
    const next = grid.querySelector<HTMLInputElement>(
      `input[data-circuit-row="${row}"][data-circuit-col="${col}"]`,
    );
    if (!next) return;
    next.focus();
    next.select();
    next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  const handleCellKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    colIndex: number,
  ) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
    const grid = event.currentTarget.closest<HTMLElement>('[data-circuit-grid]');
    if (!grid) return;

    if (event.key === 'Enter') {
      event.preventDefault();
      const nextCol = event.shiftKey ? colIndex - 1 : colIndex + 1;
      if (nextCol >= CIRCUIT_COLUMNS.length) {
        focusCircuitCell(grid, rowIndex + 1, 0);
      } else if (nextCol < 0) {
        focusCircuitCell(grid, rowIndex - 1, CIRCUIT_COLUMNS.length - 1);
      } else {
        focusCircuitCell(grid, rowIndex, nextCol);
      }
      return;
    }

    const moves: Partial<Record<string, [number, number]>> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    focusCircuitCell(grid, rowIndex + move[0], colIndex + move[1]);
  };

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
    const nextValue = typeof value === 'string' ? clampCircuitField(key, value) : value;
    updateBoardCircuits((list) =>
      list.map((c) => {
        if (c.id !== circuitId) return c;
        const calcKey = CALC_KEY_MAP[key];
        const overrides = { ...(c.calcOverrides ?? {}) };
        if (calcKey && typeof nextValue === 'string') {
          overrides[calcKey as CircuitCalcOverrideKey] = true;
        }
        let updated = { ...c, [key]: nextValue, calcOverrides: overrides } as CircuitRow;
        if (key === 'description' && typeof nextValue === 'string' && isNaDescription(nextValue)) {
          updated = applySpareOrUnknownCircuitDefaults(updated);
        }
        if (key === 'zs' && typeof nextValue === 'string') {
          updated.tested = !UNTESTED_ZS_VALUES.has(nextValue.trim().toLowerCase());
        }
        const triggersCalc =
          key === 'ocpdType' ||
          key === 'ocpdRatingA' ||
          key === 'liveMm2' ||
          key === 'ringR1' ||
          key === 'ringRn' ||
          key === 'ringR2End' ||
          key === 'r1r2' ||
          key === 'r2' ||
          key === 'zs' ||
          key === 'maxDisconnectTime';
        if (triggersCalc && typeof value === 'string') {
          const calculated = applyCircuitCalculations(updated, board, board.maxZsUse100Percent);
          return { ...calculated, tested: isCircuitTested(calculated) };
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
    insulation: 'Insulation resistance',
  };

  return (
    <div data-circuit-grid className="relative w-full overflow-x-auto overflow-y-visible rounded-none border-0 bg-white">
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
          {circuits.map((c, rowIndex) => (
            <tr key={c.id} className="border-b border-slate-50 hover:bg-[#14B8A6]/5">
              {CIRCUIT_COLUMNS.map((col, colIndex) => {
                const isCalc = col.calculated;
                const calcField = CALC_KEY_MAP[col.key];
                const overridden = calcField && c.calcOverrides?.[calcField];
                const cellValue = String(c[col.key] ?? '');
                const options = CIRCUIT_OPTION_VALUES[col.key];

                return (
                  <td
                    key={col.key}
                    className={`p-0 ${col.width} ${
                      col.sticky ? 'sticky left-0 z-[5] bg-white' : ''
                    } ${col.key === 'description' ? 'sticky left-11 z-[5] bg-white' : ''}`}
                  >
                    <div className="relative flex items-center">
                      <CircuitCellInput
                        value={cellValue}
                        options={options}
                        disabled={readOnly}
                        rowIndex={rowIndex}
                        colIndex={colIndex}
                        title={isCalc ? 'Auto-calculated — edit to override' : undefined}
                        className={`w-full border-0 px-1.5 py-1.5 outline-none focus:bg-white focus:ring-1 focus:ring-[#14B8A6] disabled:cursor-not-allowed disabled:opacity-60 ${
                          options?.length ? 'pr-5' : ''
                        } ${
                          isCalc ? 'bg-teal-50/50 text-teal-900' : 'bg-transparent text-slate-900'
                        } ${overridden ? 'ring-1 ring-amber-200' : ''}`}
                        onChange={(next) => updateCircuit(c.id, col.key, next)}
                        onKeyDown={(e) => handleCellKeyDown(e, rowIndex, colIndex)}
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
