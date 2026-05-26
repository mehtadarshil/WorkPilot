import type { BoardRecord, CircuitRow } from './types';

const UO = 230;
const CMIN = 0.95;

const MCB_MULTIPLIER: Record<string, number> = {
  B: 5,
  C: 10,
  D: 20,
};

const UNTESTED_ZS_VALUES = new Set(['', '-', '--', '---', 'lim', 'n/v', 'n/a', 'na', 'x']);

/** Live mm² → typical CPC mm² (Table 54.7 style defaults). */
const CPC_FROM_LIVE: Record<string, string> = {
  '1': '1',
  '1.0': '1',
  '1.5': '1',
  '2.5': '1.5',
  '4': '1.5',
  '6': '2.5',
  '10': '4',
  '16': '6',
  '25': '10',
  '35': '16',
};

function parseNum(v: string | undefined): number | null {
  if (v == null || String(v).trim() === '') return null;
  const n = parseFloat(String(v).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function formatOhms(n: number): string {
  if (n >= 10) return n.toFixed(2);
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(2);
}

function formatKa(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function inferMaxDisconnectTime(circuit: CircuitRow, ratingA: number | null): number {
  const explicit = parseNum(circuit.maxDisconnectTime);
  if (explicit != null && explicit > 0) return explicit;
  const rating = ratingA ?? parseNum(circuit.ocpdRatingA);
  if (rating != null && rating > 32) return 5;
  return 0.4;
}

export function calcMaxDisconnectTime(circuit: CircuitRow): string {
  const rating = parseNum(circuit.ocpdRatingA);
  return String(inferMaxDisconnectTime(circuit, rating));
}

export function calcBreakingCapacityKa(circuit: CircuitRow, board: BoardRecord): string {
  const ipf = parseNum(board.ipfAtDb);
  if (ipf == null || ipf <= 0) return '';
  const standard = [6, 10, 16, 25, 36, 50, 80, 100];
  const need = Math.ceil(ipf * 10) / 10;
  const pick = standard.find((k) => k >= need) ?? standard[standard.length - 1];
  return formatKa(pick);
}

export function calcMaxZs(
  circuit: CircuitRow,
  board: BoardRecord,
  use100Percent: boolean,
): string {
  const In = parseNum(circuit.ocpdRatingA);
  if (In == null || In <= 0) return '';

  const typeKey = (circuit.ocpdType || 'B').trim().toUpperCase().charAt(0);
  const n = MCB_MULTIPLIER[typeKey];
  if (!n) return '';

  const t = inferMaxDisconnectTime(circuit, In);
  let zs: number;
  if (t <= 0.5) {
    zs = (UO * CMIN) / (n * In);
  } else {
    zs = (UO * CMIN) / (1.44 * In);
  }
  if (!use100Percent) zs *= 0.8;
  return formatOhms(zs);
}

export function calcCpcFromLive(liveMm2: string): string {
  const key = liveMm2.trim();
  return CPC_FROM_LIVE[key] ?? '';
}

export function calcR1PlusR2(circuit: CircuitRow): string {
  const r1 = parseNum(circuit.ringR1);
  const r2 = parseNum(circuit.ringR2End);
  if (r1 == null || r2 == null) return '';
  return formatOhms((r1 + r2) / 4);
}

export function calcR1PlusR2FromZs(circuit: CircuitRow, board: BoardRecord): string {
  const zs = parseNum(circuit.zs);
  const zdb = parseNum(board.zsAtDb);
  if (zs == null || zdb == null) return '';
  const value = zs - zdb;
  return value >= 0 ? formatOhms(value) : '';
}

export function calcMeasuredZs(circuit: CircuitRow, board: BoardRecord): string {
  const zdb = parseNum(board.zsAtDb);
  if (zdb == null) return '';
  const r1r2 = parseNum(circuit.r1r2);
  const r2 = parseNum(circuit.r2);
  const loop = r1r2 ?? r2;
  if (loop == null) return '';
  return formatOhms(zdb + loop);
}

export type CalcFieldKey = 'maxDisconnectTime' | 'ocpdBreakingKa' | 'maxZs' | 'cpcMm2' | 'r1r2' | 'zs';

export function applyCircuitCalculations(
  circuit: CircuitRow,
  board: BoardRecord,
  use100Percent: boolean,
): CircuitRow {
  const overrides = circuit.calcOverrides ?? {};
  const next = { ...circuit };

  if (!overrides.maxDisconnectTime) {
    next.maxDisconnectTime = calcMaxDisconnectTime(circuit);
  }
  if (!overrides.ocpdBreakingKa) {
    next.ocpdBreakingKa = calcBreakingCapacityKa(circuit, board);
  }
  if (!overrides.maxZs) {
    next.maxZs = calcMaxZs({ ...next, maxDisconnectTime: next.maxDisconnectTime }, board, use100Percent);
  }
  if (!overrides.cpcMm2 && !next.cpcMm2.trim() && next.liveMm2.trim()) {
    next.cpcMm2 = calcCpcFromLive(next.liveMm2);
  }
  if (!overrides.r1r2) {
    const r = calcR1PlusR2(circuit) || calcR1PlusR2FromZs(circuit, board);
    if (r) next.r1r2 = r;
  }
  if (!overrides.zs) {
    const zs = calcMeasuredZs(next, board);
    if (zs) next.zs = zs;
  }
  next.tested = !UNTESTED_ZS_VALUES.has(next.zs.trim().toLowerCase());

  return next;
}

export function recalculateAllCircuits(
  circuits: CircuitRow[],
  board: BoardRecord,
  use100Percent: boolean,
  clearOverrides = false,
): CircuitRow[] {
  return circuits.map((c) => {
    const base = clearOverrides ? { ...c, calcOverrides: {} } : c;
    return applyCircuitCalculations(base, board, use100Percent);
  });
}
