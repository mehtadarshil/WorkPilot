import type { DomesticFireAlarmChecklistOutcome } from './types';

export const DOMESTIC_FIRE_ALARM_STANDARD = 'BS 5839-6';
export const DOMESTIC_FIRE_ALARM_REVISION = '2019:A1';
export const DOMESTIC_FIRE_ALARM_STANDARD_LABEL = `Standard: ${DOMESTIC_FIRE_ALARM_STANDARD} | Revision: ${DOMESTIC_FIRE_ALARM_REVISION}`;

export const DOMESTIC_FIRE_ALARM_GRADES = ['A', 'B', 'C', 'D1', 'D2', 'E', 'F1', 'F2'] as const;
export const DOMESTIC_FIRE_ALARM_CATEGORIES = ['LD1', 'LD2', 'LD3', 'PD1', 'PD2'] as const;
export const DOMESTIC_FIRE_ALARM_NEXT_INSPECTION_PRESETS = [
  { value: '6months', label: '6 months' },
  { value: '1year', label: '1 year' },
  { value: '5years', label: '5 years' },
  { value: '10years', label: '10 years' },
  { value: 'other', label: 'Other' },
] as const;

export const DOMESTIC_FIRE_ALARM_DETECTOR_MAKES = [
  'ABB Emergi-Lite',
  'ADT',
  'Advanced',
  'Advanced Electronics',
  'Aegis',
  'Aico',
  'Alert Pro',
  'Apollo',
  'C-Tec',
  'Chubb',
  'Eaton',
  'EMS',
  'FireAngel',
  'FireHawk',
  'Gent',
  'Hochiki',
  'Honeywell',
  'Kidde',
  'NEST',
  'Notifier',
  'System Sensor',
  'Yale',
  'N/A',
  'Other',
] as const;

export const DOMESTIC_FIRE_ALARM_POWER_SOURCES = [
  'Mains',
  'Mains with battery',
  'Mains with capacitor',
  'Battery',
  'N/A',
  'Other',
] as const;

export const DOMESTIC_FIRE_ALARM_INTERLINK_TYPES = ['Wired', 'Radio', 'None', 'N/A', 'Other'] as const;
export const DOMESTIC_FIRE_ALARM_DETECTOR_TYPES = ['Ionisation', 'Optical', 'Heat', 'CO', 'Smoke', 'Other'] as const;

export const DOMESTIC_FIRE_ALARM_CHECKLIST_OUTCOME_LABELS: Record<DomesticFireAlarmChecklistOutcome, string> = {
  '': '-',
  pass: 'PASS',
  fail: 'FAIL',
  na: 'N/A',
};

export type DomesticFireAlarmChecklistItem = {
  id: string;
  section: 'testing' | 'userInstructions';
  label: string;
};

export const DOMESTIC_FIRE_ALARM_CHECKLIST_SECTION_LABELS: Record<
  DomesticFireAlarmChecklistItem['section'],
  string
> = {
  testing: 'Testing',
  userInstructions: 'User instructions',
};

export const DOMESTIC_FIRE_ALARM_CHECKLIST_ITEMS: DomesticFireAlarmChecklistItem[] = [
  { id: 'testing.test_buttons', section: 'testing', label: 'Test buttons checked' },
  { id: 'testing.simulated_smoke', section: 'testing', label: 'Simulated smoke or aerosol test' },
  { id: 'testing.dedicated_circuits', section: 'testing', label: 'Dedicated circuit(s) provided' },
  { id: 'testing.warning_devices', section: 'testing', label: 'All alarm warning devices operate' },
  { id: 'testing.heat_test', section: 'testing', label: 'Heat test' },
  { id: 'testing.protective_device_labelled', section: 'testing', label: 'Protective device labelled' },
  { id: 'testing.bedroom_sound_level', section: 'testing', label: 'Bedroom sound level (Clause 13.2)' },
  { id: 'testing.mains_failure_indicators', section: 'testing', label: 'Audible and visual indications of mains failure' },
  { id: 'testing.silencing_system', section: 'testing', label: 'Silencing system checked' },
  { id: 'instructions.operation', section: 'userInstructions', label: 'Operation of the system' },
  { id: 'instructions.routine_testing', section: 'userInstructions', label: 'Routine testing of the system' },
  {
    id: 'instructions.reoccupation',
    section: 'userInstructions',
    label: 'Checking the system on re-occupation after a vacation etc',
  },
  { id: 'instructions.alarm_action', section: 'userInstructions', label: 'Action to be taken in the event of an alarm signal' },
  {
    id: 'instructions.servicing',
    section: 'userInstructions',
    label: 'Servicing and maintenance of the system, including battery replacement intervals',
  },
  { id: 'instructions.detector_contamination', section: 'userInstructions', label: 'The need to avoid contamination of detectors by paint' },
  { id: 'instructions.false_alarms', section: 'userInstructions', label: 'Avoidance of false alarms and action in the event of a false alarm' },
  {
    id: 'instructions.clear_spaces',
    section: 'userInstructions',
    label: 'The need to keep clear spaces around all detectors and manual call points',
  },
  { id: 'instructions.as_fitted_drawings', section: 'userInstructions', label: 'As fitted drawings' },
  {
    id: 'instructions.co_warning',
    section: 'userInstructions',
    label: 'Warning that apparent false alarm from carbon monoxide may not be false alarm',
  },
  {
    id: 'instructions.lithium_batteries',
    section: 'userInstructions',
    label: 'Special precautions relevant to any lithium batteries used in the system',
  },
];
