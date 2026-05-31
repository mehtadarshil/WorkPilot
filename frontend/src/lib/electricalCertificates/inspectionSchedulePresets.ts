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
        '2.0': 'na',
        '6.1': 'na',
        '6.2': 'na',
        '6.3': 'na',
        '6.4': 'na',
        '6.5': 'na',
        '6.6': 'na',
        '6.7': 'na',
        '6.8': 'na',
        '7.02': 'na',
        '7.03': 'na',
        '7.04': 'na',
        '7.05': 'na',
        '7.06': 'na',
        '7.08': 'na',
        '7.09': 'na',
        '7.10': 'na',
        '7.11': 'na',
        '7.12': 'na',
        '7.14': 'na',
        '7.15': 'na',
        '7.17': 'na',
        '7.21': 'na',
        '7.22': 'na',
        '7.29': 'na',
        '7.30': 'na',
        '7.40': 'na',
        '7.53': 'na',
      }),
  },
  {
    id: 'commercial_satisfactory',
    label: 'Commercial — satisfactory',
    description: 'Commercial installation: all pass except microgen if not present',
    apply: () =>
      merge(allItems('pass'), {
        '2.0': 'na',
      }),
  },
  {
    id: 'landlord_satisfactory',
    label: 'Landlord report — satisfactory',
    description: 'Typical landlord EICR: satisfactory with LIM on concealed/not verified items',
    apply: () =>
      merge(allItems('pass'), {
        '2.0': 'na',
        '5.10': 'lim',
        '5.11': 'lim',
        '5.12.3': 'lim',
        '5.17': 'lim',
        '5.17.1': 'lim',
        '5.17.2': 'lim',
        '5.17.3': 'lim',
        '5.17.4': 'lim',
        '6.1': 'na',
        '6.2': 'na',
        '6.3': 'na',
        '6.4': 'na',
        '6.5': 'na',
        '6.6': 'na',
        '6.7': 'na',
        '6.8': 'na',
        '7.02': 'na',
        '7.03': 'na',
        '7.04': 'na',
        '7.05': 'na',
        '7.06': 'na',
        '7.08': 'na',
        '7.09': 'na',
        '7.10': 'na',
        '7.11': 'na',
        '7.12': 'na',
        '7.14': 'na',
        '7.15': 'na',
        '7.17': 'na',
        '7.21': 'na',
        '7.22': 'na',
        '7.29': 'na',
        '7.30': 'na',
        '7.40': 'na',
        '7.53': 'na',
      }),
  },
  {
    id: 'limited_access',
    label: 'Limited access / LIM',
    description: 'Items not inspected marked LIM; others pass where seen',
    apply: () =>
      merge(allItems('lim'), {
        '1.1': 'pass',
        '1.2': 'pass',
        '1.3': 'pass',
        '3.1': 'pass',
        '4.1': 'pass',
        '5.1': 'pass',
      }),
  },
];
