export const FIRE_EXTINGUISHER_STANDARD_LABEL = 'Standard: BS 5306 | Revision: Parts 3, 8, 9';

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

export const FIRE_EXTINGUISHER_SERVICE_CODE_LABELS: Record<string, string> = {
  inspected: 'Inspected',
  basic_service: 'Basic Service',
  basic_service_advice: 'Basic Service and Advice',
  commissioning: 'Commissioning Service',
  '5_year': '5 Year Service',
  '10_year': '10 Year Service',
};

export const FIRE_EXTINGUISHER_PREMISES_LABELS: Record<string, string> = {
  residential: 'Residential',
  commercial: 'Commercial',
  industrial: 'Industrial',
  na: 'N/A',
  other: 'Other',
};

export const FIRE_EXTINGUISHER_TYPE_LABELS: Record<string, string> = {
  co2: 'CO2',
  powder: 'Powder',
  foam: 'Foam',
  water: 'Water',
  water_mist: 'Water mist',
  wet_chemical: 'Wet chemical',
  na: 'N/A',
  other: 'Other',
};
