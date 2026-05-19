import type { InspectionOutcome } from './types';
import { INSPECTION_SCHEDULE_ITEMS } from './inspectionScheduleItems';

export interface InspectionSchedulePreset {
  id: string;
  label: string;
  description: string;
  apply: () => Record<string, InspectionOutcome>;
}

function allItems(outcome: InspectionOutcome): Record<string, InspectionOutcome> {
  const next: Record<string, InspectionOutcome> = {};
  for (const item of INSPECTION_SCHEDULE_ITEMS) {
    next[item.id] = outcome;
  }
  return next;
}

function merge(
  base: Record<string, InspectionOutcome>,
  overrides: Record<string, InspectionOutcome>,
): Record<string, InspectionOutcome> {
  return { ...base, ...overrides };
}

/** BS 7671 EICR style presets — quick-fill common inspection patterns. */
export const INSPECTION_SCHEDULE_PRESETS: InspectionSchedulePreset[] = [
  {
    id: 'clear',
    label: 'Clear all',
    description: 'Remove every outcome (blank schedule)',
    apply: () => ({}),
  },
  {
    id: 'all_pass',
    label: 'All satisfactory (✓)',
    description: 'Set every item to PASS / satisfactory',
    apply: () => allItems('pass'),
  },
  {
    id: 'all_na',
    label: 'All not applicable',
    description: 'Set every item to N/A',
    apply: () => allItems('na'),
  },
  {
    id: 'domestic_satisfactory',
    label: 'Domestic — satisfactory',
    description: 'Typical domestic EICR: intake & earthing pass; special locations N/A',
    apply: () =>
      merge(allItems('pass'), {
        '2.1': 'na',
        '6.1': 'na',
        '6.2': 'na',
        '6.3': 'na',
        '7.1': 'na',
      }),
  },
  {
    id: 'commercial_satisfactory',
    label: 'Commercial — satisfactory',
    description: 'Commercial installation: all pass except microgen if not present',
    apply: () =>
      merge(allItems('pass'), {
        '2.1': 'na',
      }),
  },
  {
    id: 'limited_access',
    label: 'Limited access / LIM',
    description: 'Items not inspected marked LIM; others pass where seen',
    apply: () =>
      merge(allItems('lim'), {
        '1.1': 'pass',
        '1.3': 'pass',
        '1.4': 'pass',
        '3.1': 'pass',
        '4.1': 'pass',
        '5.1': 'pass',
      }),
  },
];
