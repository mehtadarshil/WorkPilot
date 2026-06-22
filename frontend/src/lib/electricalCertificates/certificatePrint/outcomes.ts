import type { InspectionOutcome } from '../types';
import { PRINT_OUTCOME_STYLES } from './tokens';

export const INSPECTION_LEGEND_ITEMS: { outcome: InspectionOutcome; text: string }[] = [
  { outcome: 'pass', text: 'Acceptable condition' },
  { outcome: 'c1', text: 'Unacceptable condition' },
  { outcome: 'c2', text: 'Unacceptable condition' },
  { outcome: 'c3', text: 'Improvement recommended' },
  { outcome: 'fi', text: 'Further investigation' },
  { outcome: 'nv', text: 'Not verified' },
  { outcome: 'lim', text: 'Limitation' },
  { outcome: 'na', text: 'Not applicable' },
];

export function inspectionOutcomeStyle(outcome: InspectionOutcome | string) {
  if (!outcome) return null;
  return PRINT_OUTCOME_STYLES[outcome as keyof typeof PRINT_OUTCOME_STYLES] ?? null;
}

export function isPassLikeValue(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === 'pass' || v === 'yes' || v === 'y' || v === '✓' || v === 'ok' || v === 'satisfactory';
}

export function normalizeAssessment(value: string): 'satisfactory' | 'unsatisfactory' | null {
  const v = value.trim().toLowerCase();
  if (v === 'satisfactory' || v === 'pass') return 'satisfactory';
  if (v === 'unsatisfactory' || v === 'fail' || v === 'failed') return 'unsatisfactory';
  return null;
}
