export const FIRE_EXTINGUISHER_STANDARD_LABEL = 'Standard: BS 5306 | Revision: Parts 3, 8, 9';

export const FIRE_EXTINGUISHER_PREMISES_OPTIONS = [
  { value: 'residential', label: 'Residential' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'na', label: 'N/A' },
  { value: 'other', label: 'Other' },
];

export const FIRE_EXTINGUISHER_NEXT_INSPECTION_PRESETS = [
  { value: '6months', label: '6 months' },
  { value: '1year', label: '1 year' },
  { value: '3years', label: '3 years' },
  { value: '5years', label: '5 years' },
  { value: 'other', label: 'Other' },
] as const;

export const FIRE_EXTINGUISHER_SERVICE_CODE_OPTIONS = [
  { value: 'inspected', label: 'Inspected' },
  { value: 'basic_service', label: 'Basic Service' },
  { value: 'basic_service_advice', label: 'Basic Service and Advice' },
  { value: 'commissioning', label: 'Commissioning Service' },
  { value: '5_year', label: '5 Year Service' },
  { value: '10_year', label: '10 Year Service' },
];

export const FIRE_EXTINGUISHER_MAKE_OPTIONS = [
  'Agrippa (Geo Fire)',
  'Angus Fire',
  'Apollo',
  'Blazex',
  'Britannia',
  'Ceasefire',
  'Chubb',
  'Commando',
  'Commander',
  'Contempo',
  'Firechief',
  'Firexo',
  'Flamefighter',
  'Kidde',
  'Minimax',
  'Safelincs',
  'Sentry',
  'Strike First',
  'Thomas Glover',
  'Other',
].map((label) => ({ value: label, label }));

export const FIRE_EXTINGUISHER_TYPE_OPTIONS = [
  { value: 'co2', label: 'CO2' },
  { value: 'powder', label: 'Powder' },
  { value: 'foam', label: 'Foam' },
  { value: 'water', label: 'Water' },
  { value: 'water_mist', label: 'Water mist' },
  { value: 'wet_chemical', label: 'Wet chemical' },
  { value: 'na', label: 'N/A' },
  { value: 'other', label: 'Other' },
];

export const FIRE_EXTINGUISHER_CAPACITY_UNIT_OPTIONS = [
  { value: 'kg', label: 'kg' },
  { value: 'litre', label: 'litre' },
  { value: 'other', label: 'Other' },
];

export const FIRE_EXTINGUISHER_CHECKLIST_OUTCOME_LABELS: Record<string, string> = {
  '': '—',
  yes: 'Yes',
  no: 'No',
  na: 'N/A',
};

export const FIRE_EXTINGUISHER_BLANKET_OUTCOME_LABELS: Record<string, string> = {
  '': '—',
  pass: 'Pass',
  fail: 'Fail',
};

export const FIRE_EXTINGUISHER_CHECKLIST_ITEMS = [
  {
    id: 'serviced_bs5306',
    label:
      'Have all located fire extinguishers been properly serviced according to BS 5306-3 and maintained in operational condition?',
  },
  {
    id: 'condemned_removed',
    label: 'Have all condemned extinguishers been removed from the premises?',
  },
  {
    id: 'waste_transfer_docs',
    label:
      'Has appropriate waste transfer documentation been completed for any extinguishers that required removal?',
  },
  {
    id: 'appropriate_quantity_type',
    label: 'Do all relevant areas have the appropriate quantity and type of fire extinguishers installed?',
  },
  {
    id: 'identification_signage',
    label: 'Do all fire extinguishers display the proper identification and instructional signage?',
  },
  {
    id: 'exit_routes_marked',
    label: 'Are all emergency exit routes clearly marked with appropriate directional signage?',
  },
  {
    id: 'blankets_serviced',
    label: 'Have all located fire blankets been inspected and maintained in operational condition?',
  },
  {
    id: 'maintenance_records',
    label: 'Are maintenance and inspection records available and up to date for the premises?',
  },
];

export const FIRE_EXTINGUISHER_SERVICE_CODE_LABELS = Object.fromEntries(
  FIRE_EXTINGUISHER_SERVICE_CODE_OPTIONS.map((o) => [o.value, o.label]),
);

export const FIRE_EXTINGUISHER_PREMISES_LABELS = Object.fromEntries(
  FIRE_EXTINGUISHER_PREMISES_OPTIONS.map((o) => [o.value, o.label]),
);
