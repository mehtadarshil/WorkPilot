import {
  DOMESTIC_FIRE_ALARM_CATEGORIES,
  DOMESTIC_FIRE_ALARM_GRADES,
  DOMESTIC_FIRE_ALARM_REVISION,
  DOMESTIC_FIRE_ALARM_STANDARD,
} from './domesticFireAlarmItems';

export {
  DOMESTIC_FIRE_ALARM_STANDARD,
  DOMESTIC_FIRE_ALARM_REVISION,
  DOMESTIC_FIRE_ALARM_GRADES,
  DOMESTIC_FIRE_ALARM_CATEGORIES,
};

export const DOMESTIC_FIRE_ALARM_INST_STANDARD_LABEL = `Standard: ${DOMESTIC_FIRE_ALARM_STANDARD} | Revision: ${DOMESTIC_FIRE_ALARM_REVISION}`;

export const DOMESTIC_FIRE_ALARM_SYSTEM_IS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'modification', label: 'Modification' },
  { value: 'alteration', label: 'Alteration' },
] as const;

export const DOMESTIC_FIRE_ALARM_INST_PASS_NA_LABELS = {
  '': '—',
  pass: 'PASS',
  na: 'N/A',
} as const;

export const DOMESTIC_FIRE_ALARM_INST_TEST_RESULTS_RECORDED = [
  { value: 'supplied_to_commissioning', label: 'Supplied to the person responsible for commissioning the system' },
  { value: 'supplied_by_others', label: 'Supplied by others' },
  { value: 'na', label: 'N/A' },
] as const;

export const DOMESTIC_FIRE_ALARM_INST_TEXT_PRESETS = {
  relatedReferenceDocuments: [
    'Design certificate and specification provided.',
    'Commissioning certificate to follow.',
    'As per design specification and manufacturer instructions.',
  ],
  extentOfSystem: [
    'All fire detection and alarm equipment installed at the premises.',
    'Ground floor and first floor only.',
    'Whole dwelling including loft conversion.',
  ],
  specificationText: [
    'BS 5839-6:2019+A1 and manufacturer instructions.',
    'Design specification provided with this installation.',
  ],
  variationsText: [
    'No variations from the specification.',
    'Variations as noted on accompanying design documentation.',
  ],
} as const;

export const DOMESTIC_FIRE_ALARM_INST_FIXED_TESTS = [
  { id: 'insulationBetweenConductors', label: 'Between conductors' },
  { id: 'insulationConductorsEarth', label: 'Between conductors and earth' },
  { id: 'insulationConductorsScreen', label: 'Between conductors and screen (if any)' },
  { id: 'earthContinuity', label: 'Earth continuity' },
  { id: 'earthFaultLoopImpedance', label: 'Earth fault loop impedance' },
  { id: 'maxCircuitResistance', label: 'Maximum circuit resistance' },
  { id: 'manufacturerOtherTests', label: 'Other tests' },
] as const;
