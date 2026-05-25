export const DOMESTIC_FIRE_ALARM_STANDARD = 'BS 5839-6';
export const DOMESTIC_FIRE_ALARM_REVISION = '2019:A1';

export const DOMESTIC_FIRE_ALARM_INST_FIXED_TESTS = [
  { id: 'insulationBetweenConductors', label: 'Between conductors' },
  { id: 'insulationConductorsEarth', label: 'Between conductors and earth' },
  { id: 'insulationConductorsScreen', label: 'Between conductors and screen (if any)' },
  { id: 'earthContinuity', label: 'Earth continuity' },
  { id: 'earthFaultLoopImpedance', label: 'Earth fault loop impedance' },
  { id: 'maxCircuitResistance', label: 'Maximum circuit resistance' },
  { id: 'manufacturerOtherTests', label: 'Other tests' },
] as const;

export const DOMESTIC_FIRE_ALARM_INST_PASS_NA_LABELS: Record<string, string> = {
  '': '—',
  pass: 'PASS',
  na: 'N/A',
};

export const DOMESTIC_FIRE_ALARM_INST_TEST_RESULTS_LABELS: Record<string, string> = {
  '': '—',
  supplied_to_commissioning: 'Supplied to commissioning person',
  supplied_by_others: 'Supplied by others',
  na: 'N/A',
};

export const DOMESTIC_FIRE_ALARM_SYSTEM_IS_LABELS: Record<string, string> = {
  '': '—',
  new: 'New',
  modification: 'Modification',
  alteration: 'Alteration',
};
