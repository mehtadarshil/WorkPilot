import type { CircuitRow } from '../types';

export type PrintCircuitColumn = {
  key: keyof CircuitRow;
  label: string;
  shortLabel: string;
  group: string;
  widthMm: number;
  vertical?: boolean;
  checkmark?: boolean;
  description?: boolean;
};

export const PRINT_CIRCUIT_COLUMNS: PrintCircuitColumn[] = [
  { key: 'description', label: 'Circuit designation', shortLabel: 'Circuit designation', group: '', widthMm: 26, description: true },
  { key: 'circuitNumber', label: 'Circuit no', shortLabel: 'No', group: '', widthMm: 5 },
  { key: 'points', label: 'Number of points served', shortLabel: 'Points', group: '', widthMm: 5.5, vertical: true },
  { key: 'wiringType', label: 'Type of wiring', shortLabel: 'Wiring', group: '', widthMm: 5.5, vertical: true },
  { key: 'refMethod', label: 'Reference method', shortLabel: 'Ref', group: '', widthMm: 5, vertical: true },
  { key: 'liveMm2', label: 'Live CSA (mm²)', shortLabel: 'Live', group: 'Conductors', widthMm: 5, vertical: true },
  { key: 'cpcMm2', label: 'cpc CSA (mm²)', shortLabel: 'cpc', group: 'Conductors', widthMm: 5, vertical: true },
  { key: 'maxDisconnectTime', label: 'Max disconnect time (s)', shortLabel: 't (s)', group: 'Conductors', widthMm: 5.5, vertical: true },
  { key: 'ocpdBs', label: 'BS (EN)', shortLabel: 'BS', group: 'Overcurrent devices', widthMm: 7, vertical: true },
  { key: 'ocpdType', label: 'Type', shortLabel: 'Type', group: 'Overcurrent devices', widthMm: 4.5, vertical: true },
  { key: 'ocpdRatingA', label: 'Rating (A)', shortLabel: 'A', group: 'Overcurrent devices', widthMm: 4.5, vertical: true },
  { key: 'ocpdBreakingKa', label: 'Breaking capacity (kA)', shortLabel: 'kA', group: 'Overcurrent devices', widthMm: 5, vertical: true },
  { key: 'maxZs', label: 'Maximum Zs (Ω)', shortLabel: 'Max Zs', group: 'Overcurrent devices', widthMm: 5.5, vertical: true },
  { key: 'rcdBs', label: 'BS (EN)', shortLabel: 'BS', group: 'RCD', widthMm: 7, vertical: true },
  { key: 'rcdType', label: 'Type', shortLabel: 'Type', group: 'RCD', widthMm: 4.5, vertical: true },
  { key: 'rcdRatingMa', label: 'IΔn (mA)', shortLabel: 'IΔn', group: 'RCD', widthMm: 5, vertical: true },
  { key: 'rcdRatingA', label: 'Rating (A)', shortLabel: 'A', group: 'RCD', widthMm: 4.5, vertical: true },
  { key: 'ringR1', label: 'r₁ (Ω)', shortLabel: 'r₁', group: 'Ring final circuits', widthMm: 5, vertical: true },
  { key: 'ringRn', label: 'rₙ (Ω)', shortLabel: 'rₙ', group: 'Ring final circuits', widthMm: 5, vertical: true },
  { key: 'ringR2End', label: 'r₂ (Ω)', shortLabel: 'r₂', group: 'Ring final circuits', widthMm: 5, vertical: true },
  { key: 'r1r2', label: 'R₁+R₂ (Ω)', shortLabel: 'R₁+R₂', group: 'R1+R2 or R2', widthMm: 5.5, vertical: true },
  { key: 'r2', label: 'R₂ (Ω)', shortLabel: 'R₂', group: 'R1+R2 or R2', widthMm: 5, vertical: true },
  { key: 'insulationTestVoltage', label: 'Test voltage (V)', shortLabel: 'V', group: 'Insulation resistance', widthMm: 5, vertical: true },
  { key: 'insulationLL', label: 'Live–Live (MΩ)', shortLabel: 'L-L', group: 'Insulation resistance', widthMm: 5.5, vertical: true },
  { key: 'insulationLE', label: 'Live–Earth (MΩ)', shortLabel: 'L-E', group: 'Insulation resistance', widthMm: 5.5, vertical: true },
  { key: 'polarity', label: 'Polarity confirmed', shortLabel: 'Polarity', group: 'Test results', widthMm: 5.5, vertical: true, checkmark: true },
  { key: 'zs', label: 'Measured Zs (Ω)', shortLabel: 'Zs', group: 'Test results', widthMm: 5.5, vertical: true },
  { key: 'rcdTripMs', label: 'RCD time (ms)', shortLabel: 'RCD ms', group: 'Test results', widthMm: 5.5, vertical: true },
  { key: 'afdd', label: 'AFDD test', shortLabel: 'AFDD', group: 'Test results', widthMm: 5, vertical: true, checkmark: true },
  { key: 'remarks', label: 'Remarks', shortLabel: 'Remarks', group: 'Test results', widthMm: 8 },
];

export function circuitCellValue(circuit: CircuitRow, key: keyof CircuitRow): string {
  if (key === 'insulationLE') return circuit.insulationLE || circuit.insulation || '';
  const v = circuit[key];
  if (typeof v === 'boolean') return v ? 'Yes' : '';
  return String(v ?? '');
}

export function printCircuitColumnGroups(): { label: string; span: number }[] {
  const groups: { label: string; span: number }[] = [];
  let current = '';
  for (const col of PRINT_CIRCUIT_COLUMNS) {
    const g = col.group || '';
    if (g === current && groups.length > 0) {
      groups[groups.length - 1].span += 1;
    } else {
      groups.push({ label: g, span: 1 });
      current = g;
    }
  }
  return groups;
}
