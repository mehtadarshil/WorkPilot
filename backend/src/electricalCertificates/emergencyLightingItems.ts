export const EMERGENCY_LIGHTING_STANDARD_LABEL =
  'For systems designed to BS 5266-1:2025 and BS EN 50172 / BS 5266-8';

export const EMERGENCY_LIGHTING_OUTCOME_LABELS: Record<string, string> = {
  '': '-',
  pass: 'Pass',
  fail: 'Fail',
  na: 'N/A',
};

export const EMERGENCY_LIGHTING_LUMINAIRE_TYPE_LABELS: Record<string, string> = {
  maintained: 'Maintained',
  non_maintained: 'Non-maintained',
  combined: 'Combined',
  exit_sign: 'Exit sign',
  twin_spot: 'Twin spot',
  other: 'Other',
};

export const EMERGENCY_LIGHTING_SUPPLY_MODE_LABELS: Record<string, string> = {
  central_battery: 'Central battery',
  self_contained: 'Self-contained',
  generator: 'Generator backed',
  other: 'Other',
};

