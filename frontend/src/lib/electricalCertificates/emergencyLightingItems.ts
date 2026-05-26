export const EMERGENCY_LIGHTING_STANDARD_LABEL =
  'For systems designed to BS 5266-1:2025 and BS EN 50172 / BS 5266-8';

export const EMERGENCY_LIGHTING_PREMISES_OPTIONS = [
  { value: 'residential', label: 'Residential' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'mixed_use', label: 'Mixed use' },
  { value: 'other', label: 'Other' },
];

export const EMERGENCY_LIGHTING_LUMINAIRE_TYPE_OPTIONS = [
  { value: 'maintained', label: 'Maintained' },
  { value: 'non_maintained', label: 'Non-maintained' },
  { value: 'combined', label: 'Combined' },
  { value: 'exit_sign', label: 'Exit sign' },
  { value: 'twin_spot', label: 'Twin spot' },
  { value: 'other', label: 'Other' },
];

export const EMERGENCY_LIGHTING_SUPPLY_MODE_OPTIONS = [
  { value: 'central_battery', label: 'Central battery' },
  { value: 'self_contained', label: 'Self-contained' },
  { value: 'generator', label: 'Generator backed' },
  { value: 'other', label: 'Other' },
];

export const EMERGENCY_LIGHTING_OUTCOME_LABELS: Record<string, string> = {
  '': '-',
  pass: 'Pass',
  fail: 'Fail',
  na: 'N/A',
};

