import type { BoardRecord, CircuitRow } from './types';
import { CIRCUIT_COLUMNS } from './circuitColumns';
import { applyCircuitCalculations } from './circuitCalculations';

export const CIRCUIT_OPTION_VALUES: Partial<Record<keyof CircuitRow, string[]>> = {
  description: ['Spare', 'Unknown'],
  points: ['1', '2', '3', '4', '5', '6', '8', '10', '12', 'N/A', 'LIM'],
  wiringType: ['A', 'B', 'C', 'D', 'SWA', 'MICC', 'FP200', 'Twin & earth', 'Singles', 'N/A', 'LIM', 'Other'],
  refMethod: ['A1', 'A2', 'B1', 'B2', 'C', 'D', 'E', 'F', 'G', '100', '101', '102', '103', 'N/A', 'LIM'],
  liveMm2: ['1', '1.5', '2.5', '4', '6', '10', '16', '25', '35', '50', '70', 'N/A', 'LIM'],
  cpcMm2: ['1', '1.5', '2.5', '4', '6', '10', '16', '25', '35', 'N/A', 'LIM'],
  maxDisconnectTime: ['0.2', '0.4', '1', '5', 'N/A', 'LIM'],
  ocpdBs: ['60898', '61009', '88-2', '88-3', '3036', '3871', '1361', '60947-2', '60269', 'N/A', 'LIM', 'UNKNOWN'],
  ocpdType: ['B', 'C', 'D', '1', '2', '3', 'gG', 'gL', 'aM', 'N/A', 'LIM'],
  ocpdRatingA: ['5', '6', '10', '15', '16', '20', '25', '32', '40', '45', '50', '63', '80', '100', 'N/A', 'LIM'],
  ocpdBreakingKa: ['1', '3', '6', '10', '16', '25', '33', '50', 'N/A', 'LIM', 'UNKNOWN'],
  maxZs: ['N/A', 'LIM', 'N/V', '---'],
  rcdBs: ['61008', '61009', '62423', 'N/A', 'LIM', 'UNKNOWN'],
  rcdType: ['AC', 'A', 'F', 'B', 'S', 'N/A', 'LIM'],
  rcdRatingMa: ['10', '30', '100', '300', '500', '1000', 'N/A', 'N/V', 'LIM'],
  rcdRatingA: ['16', '20', '25', '32', '40', '63', '80', '100', 'N/A', 'LIM'],
  ringR1: ['N/A', 'LIM', 'N/V', '---'],
  ringRn: ['N/A', 'LIM', 'N/V', '---'],
  ringR2End: ['N/A', 'LIM', 'N/V', '---'],
  r1r2: ['N/A', 'LIM', 'N/V', '---'],
  r2: ['N/A', 'LIM', 'N/V', '---'],
  insulationTestVoltage: ['250', '500', '1000', 'N/A', 'LIM'],
  insulationLL: ['>999', '>500', '>200', '>100', 'N/A', 'LIM', 'N/V', '---'],
  insulationLE: ['>999', '>500', '>200', '>100', 'N/A', 'LIM', 'N/V', '---'],
  polarity: ['PASS', 'FAIL', 'LIM', 'N/A'],
  zs: ['N/A', 'LIM', 'N/V', '---'],
  rcdTripMs: ['N/A', 'LIM', 'N/V', '---'],
  afdd: ['PASS', 'FAIL', 'LIM', 'N/A'],
  remarks: ['N/A', 'LIM', 'N/V', '---'],
};

export const CIRCUIT_FIELD_MAX_LENGTHS: Partial<Record<keyof CircuitRow, number>> = {
  description: 80,
  points: 8,
  wiringType: 24,
  refMethod: 8,
  liveMm2: 8,
  cpcMm2: 8,
  maxDisconnectTime: 8,
  ocpdBs: 16,
  ocpdType: 8,
  ocpdRatingA: 8,
  ocpdBreakingKa: 8,
  maxZs: 12,
  rcdBs: 16,
  rcdType: 8,
  rcdRatingMa: 8,
  rcdRatingA: 8,
  ringR1: 12,
  ringRn: 12,
  ringR2End: 12,
  r1r2: 12,
  r2: 12,
  insulationTestVoltage: 8,
  insulationLL: 12,
  insulationLE: 12,
  polarity: 8,
  zs: 12,
  rcdTripMs: 12,
  afdd: 8,
  remarks: 200,
  circuitNumber: 6,
};

export const FILLABLE_CIRCUIT_COLUMNS = CIRCUIT_COLUMNS.filter(
  (c) => !c.calculated && c.key !== 'circuitNumber' && c.key !== 'id',
);

const CIRCUIT_NA_FIELDS: (keyof CircuitRow)[] = [
  'points',
  'wiringType',
  'refMethod',
  'liveMm2',
  'cpcMm2',
  'maxDisconnectTime',
  'ocpdBs',
  'ocpdType',
  'ocpdRatingA',
  'ocpdBreakingKa',
  'maxZs',
  'rcdBs',
  'rcdType',
  'rcdRatingMa',
  'rcdRatingA',
  'ringR1',
  'ringRn',
  'ringR2End',
  'r1r2',
  'r2',
  'insulation',
  'insulationTestVoltage',
  'insulationLL',
  'insulationLE',
  'polarity',
  'zs',
  'rcdTripMs',
  'afdd',
  'remarks',
];

export function isNaDescription(value: string) {
  const text = value.trim().toLowerCase();
  return text === 'spare' || text === 'unknown';
}

export function isSpareOrUnknownCircuit(circuit: CircuitRow) {
  return isNaDescription(String(circuit.description ?? ''));
}

export function applySpareOrUnknownCircuitDefaults(circuit: CircuitRow): CircuitRow {
  const next = { ...circuit, tested: false, calcOverrides: { ...(circuit.calcOverrides ?? {}) } };
  for (const key of CIRCUIT_NA_FIELDS) {
    next[key] = 'N/A' as never;
  }
  return next;
}

export function clampCircuitField(key: keyof CircuitRow, value: string) {
  const max = CIRCUIT_FIELD_MAX_LENGTHS[key];
  if (!max || value.length <= max) return value;
  return value.slice(0, max);
}

export function getColumnQuickOptions(key: keyof CircuitRow) {
  return CIRCUIT_OPTION_VALUES[key] ?? [];
}

export function renumberCircuitsSmart(circuits: CircuitRow[]) {
  return circuits.map((circuit, index) => ({
    ...circuit,
    circuitNumber: String(index + 1),
  }));
}

export function fillColumnIntelligent(
  circuits: CircuitRow[],
  column: keyof CircuitRow,
  value: string,
  board: BoardRecord,
  use100Percent: boolean,
) {
  const trimmed = clampCircuitField(column, value.trim());
  return circuits.map((circuit) => {
    if (isSpareOrUnknownCircuit(circuit)) return circuit;
    const next = { ...circuit, [column]: trimmed } as CircuitRow;
    return applyCircuitCalculations(next, board, use100Percent);
  });
}

export function clearColumnIntelligent(
  circuits: CircuitRow[],
  column: keyof CircuitRow,
  board: BoardRecord,
  use100Percent: boolean,
) {
  return circuits.map((circuit) => {
    if (isSpareOrUnknownCircuit(circuit)) return circuit;
    const next = { ...circuit, [column]: '' } as CircuitRow;
    return applyCircuitCalculations(next, board, use100Percent);
  });
}

export function parsePastedGrid(text: string): string[][] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) return [];
  const rows = normalized.split('\n').map((line) => line.split('\t'));
  if (rows.length === 1 && rows[0].length === 1 && rows[0][0].includes(',')) {
    return normalized.split('\n').map((line) => line.split(',').map((c) => c.trim()));
  }
  return rows;
}

const PASTEABLE_KEYS = FILLABLE_CIRCUIT_COLUMNS.map((c) => c.key);

export function pasteIntoCircuits(
  circuits: CircuitRow[],
  startRow: number,
  startColIndex: number,
  grid: string[][],
  board: BoardRecord,
  use100Percent: boolean,
) {
  const next = circuits.map((c) => ({ ...c }));
  for (let r = 0; r < grid.length; r++) {
    const rowIndex = startRow + r;
    if (rowIndex < 0 || rowIndex >= next.length) break;
    const row = grid[r];
    for (let c = 0; c < row.length; c++) {
      const colIndex = startColIndex + c;
      if (colIndex < 0 || colIndex >= PASTEABLE_KEYS.length) break;
      const key = PASTEABLE_KEYS[colIndex];
      const cell = clampCircuitField(key, row[c]?.trim() ?? '');
      if (isSpareOrUnknownCircuit(next[rowIndex]) && key !== 'description') continue;
      next[rowIndex] = { ...next[rowIndex], [key]: cell };
    }
    next[rowIndex] = applyCircuitCalculations(next[rowIndex], board, use100Percent);
  }
  return next;
}
