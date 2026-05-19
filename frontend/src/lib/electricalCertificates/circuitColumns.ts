import type { CircuitRow } from './types';

export type CircuitColumnDef = {
  key: keyof CircuitRow;
  label: string;
  shortLabel?: string;
  group?: string;
  width: string;
  calculated?: boolean;
  sticky?: boolean;
};

export const CIRCUIT_COLUMN_GROUPS = [
  { id: 'core', label: '' },
  { id: 'conductors', label: 'Conductors' },
  { id: 'ocpd', label: 'Overcurrent devices' },
  { id: 'rcd', label: 'RCD' },
  { id: 'ring', label: 'Ring final' },
  { id: 'tests', label: 'Test results' },
] as const;

export const CIRCUIT_COLUMNS: CircuitColumnDef[] = [
  { key: 'circuitNumber', label: '#', width: 'w-11', sticky: true },
  { key: 'description', label: 'Circuit description', width: 'min-w-[160px]', sticky: true },
  { key: 'points', label: 'No. points served', width: 'w-16' },
  { key: 'wiringType', label: 'Wiring type', width: 'w-20' },
  { key: 'refMethod', label: 'Ref method', width: 'w-16' },
  { key: 'liveMm2', label: 'Live mm²', group: 'conductors', width: 'w-14' },
  { key: 'cpcMm2', label: 'cpc mm²', group: 'conductors', width: 'w-14', calculated: true },
  {
    key: 'maxDisconnectTime',
    label: 'Max disconnect time secs',
    width: 'w-16',
    calculated: true,
  },
  { key: 'ocpdBs', label: 'BS (EN)', group: 'ocpd', width: 'w-20' },
  { key: 'ocpdType', label: 'Type', group: 'ocpd', width: 'w-12' },
  { key: 'ocpdRatingA', label: 'Rating A', group: 'ocpd', width: 'w-14' },
  { key: 'ocpdBreakingKa', label: 'Breaking capacity kA', group: 'ocpd', width: 'w-16', calculated: true },
  { key: 'maxZs', label: 'Max Zs Ω', width: 'w-14', calculated: true },
  { key: 'rcdBs', label: 'BS (EN)', group: 'rcd', width: 'w-18' },
  { key: 'rcdType', label: 'Type', group: 'rcd', width: 'w-12' },
  { key: 'rcdRatingMa', label: 'IΔn mA', group: 'rcd', width: 'w-12' },
  { key: 'rcdRatingA', label: 'Rating A', group: 'rcd', width: 'w-12' },
  { key: 'ringR1', label: 'r₁', group: 'ring', width: 'w-12' },
  { key: 'ringRn', label: 'rₙ', group: 'ring', width: 'w-12' },
  { key: 'ringR2End', label: 'r₂', group: 'ring', width: 'w-12' },
  { key: 'r1r2', label: '(R₁+R₂)', width: 'w-14', calculated: true },
  { key: 'r2', label: 'R₂', width: 'w-12' },
  { key: 'insulation', label: 'Insulation MΩ', width: 'w-16' },
  { key: 'polarity', label: 'Polarity', width: 'w-14' },
  { key: 'zs', label: 'Zs Ω', width: 'w-12' },
  { key: 'rcdTripMs', label: 'RCD ms', width: 'w-12' },
  { key: 'afdd', label: 'AFDD', width: 'w-12' },
  { key: 'remarks', label: 'Remarks', width: 'min-w-[120px]' },
];
