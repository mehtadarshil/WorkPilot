class CertificateScheduleItem {
  const CertificateScheduleItem({
    required this.id,
    required this.section,
    required this.label,
    this.group,
  });

  final String id;
  final String section;
  final String label;
  final String? group;
}

const inspectionSectionLabels = {
  '1': 'External intake equipment',
  '2': 'Other sources',
  '3': 'Earthing / bonding arrangements',
  '4': 'Consumer units / distribution boards',
  '5': 'Final circuits',
  '6': 'Bath or shower locations',
  '7': 'Other Part 7 installations',
};

const inspectionScheduleItems = [
  CertificateScheduleItem(id: '1.1', section: '1', label: 'Intake equipment'),
  CertificateScheduleItem(
    id: '1.1.1',
    section: '1',
    label: 'Duty holder notified',
  ),
  CertificateScheduleItem(id: '1.2', section: '1', label: 'Consumer isolator'),
  CertificateScheduleItem(id: '1.3', section: '1', label: 'Meter tails'),
  CertificateScheduleItem(
    id: '2.0',
    section: '2',
    label: 'Other source arrangements',
  ),
  CertificateScheduleItem(
    id: '3.1',
    section: '3',
    label: 'Distributor earthing',
  ),
  CertificateScheduleItem(
    id: '3.2',
    section: '3',
    label: 'Earth electrode connection',
  ),
  CertificateScheduleItem(
    id: '3.3',
    section: '3',
    label: 'Earthing/bonding labels',
  ),
  CertificateScheduleItem(
    id: '3.4',
    section: '3',
    label: 'Earthing conductor size',
  ),
  CertificateScheduleItem(
    id: '3.5',
    section: '3',
    label: 'Earthing conductor at MET',
  ),
  CertificateScheduleItem(
    id: '3.6',
    section: '3',
    label: 'Main bonding conductor size',
  ),
  CertificateScheduleItem(
    id: '3.7',
    section: '3',
    label: 'Main bonding connections',
  ),
  CertificateScheduleItem(
    id: '3.8',
    section: '3',
    label: 'Other bonding connections',
  ),
  CertificateScheduleItem(
    id: '4.1',
    section: '4',
    label: 'Working space/accessibility',
  ),
  CertificateScheduleItem(id: '4.2', section: '4', label: 'Security of fixing'),
  CertificateScheduleItem(
    id: '4.3',
    section: '4',
    label: 'Enclosure IP condition',
  ),
  CertificateScheduleItem(
    id: '4.4',
    section: '4',
    label: 'Enclosure fire rating',
  ),
  CertificateScheduleItem(id: '4.5', section: '4', label: 'Enclosure damage'),
  CertificateScheduleItem(id: '4.6', section: '4', label: 'Main linked switch'),
  CertificateScheduleItem(
    id: '4.7',
    section: '4',
    label: 'Main switch operation',
  ),
  CertificateScheduleItem(
    id: '4.8',
    section: '4',
    label: 'CB/RCD manual operation',
  ),
  CertificateScheduleItem(
    id: '4.9',
    section: '4',
    label: 'Circuit identification',
  ),
  CertificateScheduleItem(id: '4.10', section: '4', label: 'RCD test notice'),
  CertificateScheduleItem(
    id: '4.11',
    section: '4',
    label: 'Alternative supply warning',
  ),
  CertificateScheduleItem(
    id: '4.12',
    section: '4',
    label: 'Other required labelling',
  ),
  CertificateScheduleItem(
    id: '4.13',
    section: '4',
    label: 'Protective device compatibility',
  ),
  CertificateScheduleItem(
    id: '4.14',
    section: '4',
    label: 'Single-pole switching',
  ),
  CertificateScheduleItem(
    id: '4.15',
    section: '4',
    label: 'Mechanical protection at entries',
  ),
  CertificateScheduleItem(
    id: '4.16',
    section: '4',
    label: 'EM effects at entries',
  ),
  CertificateScheduleItem(
    id: '4.17',
    section: '4',
    label: 'RCD fault protection',
  ),
  CertificateScheduleItem(
    id: '4.18',
    section: '4',
    label: 'RCD additional protection',
  ),
  CertificateScheduleItem(id: '4.19', section: '4', label: 'SPD indication'),
  CertificateScheduleItem(
    id: '4.20',
    section: '4',
    label: 'Connections tight and secure',
  ),
  CertificateScheduleItem(
    id: '4.21',
    section: '4',
    label: 'Generator switched alternative',
  ),
  CertificateScheduleItem(
    id: '4.22',
    section: '4',
    label: 'Generator parallel arrangements',
  ),
  CertificateScheduleItem(
    id: '5.1',
    section: '5',
    label: 'Conductors identified',
  ),
  CertificateScheduleItem(id: '5.2', section: '5', label: 'Cables supported'),
  CertificateScheduleItem(
    id: '5.3',
    section: '5',
    label: 'Live part insulation',
  ),
  CertificateScheduleItem(
    id: '5.4',
    section: '5',
    label: 'Non-sheathed cable protection',
  ),
  CertificateScheduleItem(
    id: '5.4.1',
    section: '5',
    label: 'Conduit/trunking integrity',
  ),
  CertificateScheduleItem(
    id: '5.5',
    section: '5',
    label: 'Cable current capacity',
  ),
  CertificateScheduleItem(
    id: '5.6',
    section: '5',
    label: 'Overload coordination',
  ),
  CertificateScheduleItem(
    id: '5.7',
    section: '5',
    label: 'Protective device adequacy',
  ),
  CertificateScheduleItem(
    id: '5.8',
    section: '5',
    label: 'Circuit protective conductors',
  ),
  CertificateScheduleItem(
    id: '5.9',
    section: '5',
    label: 'Wiring system suitability',
  ),
  CertificateScheduleItem(
    id: '5.10',
    section: '5',
    label: 'Concealed cable zones',
  ),
  CertificateScheduleItem(
    id: '5.11',
    section: '5',
    label: 'Concealed cable damage protection',
  ),
  CertificateScheduleItem(
    id: '5.12',
    section: '5',
    label: 'Additional RCD requirements',
  ),
  CertificateScheduleItem(
    id: '5.12.1',
    section: '5',
    label: 'Socket outlet RCD protection',
  ),
  CertificateScheduleItem(
    id: '5.12.2',
    section: '5',
    label: 'Outdoor mobile equipment',
  ),
  CertificateScheduleItem(
    id: '5.12.3',
    section: '5',
    label: 'Wall cable RCD protection',
  ),
  CertificateScheduleItem(
    id: '5.12.4',
    section: '5',
    label: 'Domestic luminaires',
  ),
  CertificateScheduleItem(
    id: '5.13',
    section: '5',
    label: 'Fire barriers and sealing',
  ),
  CertificateScheduleItem(
    id: '5.14',
    section: '5',
    label: 'Band II segregation',
  ),
  CertificateScheduleItem(
    id: '5.15',
    section: '5',
    label: 'Communications segregation',
  ),
  CertificateScheduleItem(
    id: '5.16',
    section: '5',
    label: 'Services segregation',
  ),
  CertificateScheduleItem(id: '5.17', section: '5', label: 'Cable termination'),
  CertificateScheduleItem(
    id: '5.17.1',
    section: '5',
    label: 'Connections sound',
  ),
  CertificateScheduleItem(
    id: '5.17.2',
    section: '5',
    label: 'No exposed basic insulation',
  ),
  CertificateScheduleItem(
    id: '5.17.3',
    section: '5',
    label: 'Live conductors enclosed',
  ),
  CertificateScheduleItem(
    id: '5.17.4',
    section: '5',
    label: 'Cable entry connected',
  ),
  CertificateScheduleItem(
    id: '5.18',
    section: '5',
    label: 'Accessories condition',
  ),
  CertificateScheduleItem(
    id: '5.19',
    section: '5',
    label: 'Accessory suitability',
  ),
  CertificateScheduleItem(
    id: '5.20',
    section: '5',
    label: 'Equipment accessibility',
  ),
  CertificateScheduleItem(
    id: '5.21',
    section: '5',
    label: 'Single-pole line switching',
  ),
  CertificateScheduleItem(
    id: '6.1',
    section: '6',
    label: 'Bathroom RCD protection',
  ),
  CertificateScheduleItem(
    id: '6.2',
    section: '6',
    label: 'SELV/PELV requirements',
  ),
  CertificateScheduleItem(id: '6.3', section: '6', label: 'Shaver sockets'),
  CertificateScheduleItem(
    id: '6.4',
    section: '6',
    label: 'Supplementary bonding',
  ),
  CertificateScheduleItem(
    id: '6.5',
    section: '6',
    label: 'Socket zone distance',
  ),
  CertificateScheduleItem(
    id: '6.6',
    section: '6',
    label: 'IP rating suitability',
  ),
  CertificateScheduleItem(
    id: '6.7',
    section: '6',
    label: 'Zone accessory suitability',
  ),
  CertificateScheduleItem(
    id: '6.8',
    section: '6',
    label: 'Equipment position suitability',
  ),
  CertificateScheduleItem(id: '7.02', section: '7', label: 'Swimming pools'),
  CertificateScheduleItem(
    id: '7.03',
    section: '7',
    label: 'Sauna heater rooms',
  ),
  CertificateScheduleItem(
    id: '7.04',
    section: '7',
    label: 'Construction sites',
  ),
  CertificateScheduleItem(
    id: '7.05',
    section: '7',
    label: 'Agricultural/horticultural',
  ),
  CertificateScheduleItem(
    id: '7.06',
    section: '7',
    label: 'Restricted conductive locations',
  ),
  CertificateScheduleItem(
    id: '7.08',
    section: '7',
    label: 'Caravan/camping parks',
  ),
  CertificateScheduleItem(id: '7.09', section: '7', label: 'Marinas'),
  CertificateScheduleItem(id: '7.10', section: '7', label: 'Medical locations'),
  CertificateScheduleItem(
    id: '7.11',
    section: '7',
    label: 'Exhibitions and stands',
  ),
  CertificateScheduleItem(id: '7.12', section: '7', label: 'Solar PV systems'),
  CertificateScheduleItem(id: '7.14', section: '7', label: 'Outdoor lighting'),
  CertificateScheduleItem(
    id: '7.15',
    section: '7',
    label: 'Extra-low voltage lighting',
  ),
  CertificateScheduleItem(id: '7.17', section: '7', label: 'Mobile units'),
  CertificateScheduleItem(
    id: '7.21',
    section: '7',
    label: 'Caravans and motor caravans',
  ),
  CertificateScheduleItem(id: '7.22', section: '7', label: 'EV charging'),
  CertificateScheduleItem(
    id: '7.29',
    section: '7',
    label: 'Maintenance gangways',
  ),
  CertificateScheduleItem(
    id: '7.30',
    section: '7',
    label: 'Inland navigation vessels',
  ),
  CertificateScheduleItem(
    id: '7.40',
    section: '7',
    label: 'Temporary fairground installations',
  ),
  CertificateScheduleItem(id: '7.53', section: '7', label: 'Heating cables'),
];

const domesticFireAlarmItems = [
  CertificateScheduleItem(
    id: 'testing.test_buttons',
    section: 'testing',
    label: 'Test buttons checked',
  ),
  CertificateScheduleItem(
    id: 'testing.simulated_smoke',
    section: 'testing',
    label: 'Simulated smoke/aerosol test',
  ),
  CertificateScheduleItem(
    id: 'testing.dedicated_circuits',
    section: 'testing',
    label: 'Dedicated circuits provided',
  ),
  CertificateScheduleItem(
    id: 'testing.warning_devices',
    section: 'testing',
    label: 'Warning devices operate',
  ),
  CertificateScheduleItem(
    id: 'testing.heat_test',
    section: 'testing',
    label: 'Heat test',
  ),
  CertificateScheduleItem(
    id: 'testing.protective_device_labelled',
    section: 'testing',
    label: 'Protective device labelled',
  ),
  CertificateScheduleItem(
    id: 'testing.bedroom_sound_level',
    section: 'testing',
    label: 'Bedroom sound level',
  ),
  CertificateScheduleItem(
    id: 'testing.mains_failure_indicators',
    section: 'testing',
    label: 'Mains failure indications',
  ),
  CertificateScheduleItem(
    id: 'testing.silencing_system',
    section: 'testing',
    label: 'Silencing system checked',
  ),
  CertificateScheduleItem(
    id: 'instructions.operation',
    section: 'userInstructions',
    label: 'Operation instructions',
  ),
  CertificateScheduleItem(
    id: 'instructions.routine_testing',
    section: 'userInstructions',
    label: 'Routine testing instructions',
  ),
  CertificateScheduleItem(
    id: 'instructions.reoccupation',
    section: 'userInstructions',
    label: 'Re-occupation checks',
  ),
  CertificateScheduleItem(
    id: 'instructions.alarm_action',
    section: 'userInstructions',
    label: 'Alarm action',
  ),
  CertificateScheduleItem(
    id: 'instructions.servicing',
    section: 'userInstructions',
    label: 'Servicing and maintenance',
  ),
  CertificateScheduleItem(
    id: 'instructions.detector_contamination',
    section: 'userInstructions',
    label: 'Detector contamination',
  ),
  CertificateScheduleItem(
    id: 'instructions.false_alarms',
    section: 'userInstructions',
    label: 'False alarm avoidance',
  ),
  CertificateScheduleItem(
    id: 'instructions.clear_spaces',
    section: 'userInstructions',
    label: 'Clear spaces',
  ),
  CertificateScheduleItem(
    id: 'instructions.as_fitted_drawings',
    section: 'userInstructions',
    label: 'As-fitted drawings',
  ),
  CertificateScheduleItem(
    id: 'instructions.co_warning',
    section: 'userInstructions',
    label: 'CO false alarm warning',
  ),
  CertificateScheduleItem(
    id: 'instructions.lithium_batteries',
    section: 'userInstructions',
    label: 'Lithium battery precautions',
  ),
];

const domesticFireAlarmInstItems = [
  CertificateScheduleItem(
    id: 'insulationBetweenConductors',
    section: 'testSchedule',
    label: 'Between conductors',
  ),
  CertificateScheduleItem(
    id: 'insulationConductorsEarth',
    section: 'testSchedule',
    label: 'Between conductors and earth',
  ),
  CertificateScheduleItem(
    id: 'insulationConductorsScreen',
    section: 'testSchedule',
    label: 'Between conductors and screen',
  ),
  CertificateScheduleItem(
    id: 'earthContinuity',
    section: 'testSchedule',
    label: 'Earth continuity',
  ),
  CertificateScheduleItem(
    id: 'earthFaultLoopImpedance',
    section: 'testSchedule',
    label: 'Earth fault loop impedance',
  ),
  CertificateScheduleItem(
    id: 'maxCircuitResistance',
    section: 'testSchedule',
    label: 'Maximum circuit resistance',
  ),
  CertificateScheduleItem(
    id: 'manufacturerOtherTests',
    section: 'testSchedule',
    label: 'Other manufacturer tests',
  ),
];

const fireExtinguisherItems = [
  CertificateScheduleItem(
    id: 'serviced_bs5306',
    section: 'checklist',
    label: 'Serviced to BS 5306',
  ),
  CertificateScheduleItem(
    id: 'condemned_removed',
    section: 'checklist',
    label: 'Condemned extinguishers removed',
  ),
  CertificateScheduleItem(
    id: 'waste_transfer_docs',
    section: 'checklist',
    label: 'Waste transfer documents',
  ),
  CertificateScheduleItem(
    id: 'appropriate_quantity_type',
    section: 'checklist',
    label: 'Appropriate quantity and type',
  ),
  CertificateScheduleItem(
    id: 'identification_signage',
    section: 'checklist',
    label: 'Identification signage',
  ),
  CertificateScheduleItem(
    id: 'exit_routes_marked',
    section: 'checklist',
    label: 'Exit routes marked',
  ),
  CertificateScheduleItem(
    id: 'blankets_serviced',
    section: 'checklist',
    label: 'Fire blankets serviced',
  ),
  CertificateScheduleItem(
    id: 'maintenance_records',
    section: 'checklist',
    label: 'Maintenance records available',
  ),
];

const emergencyLightingItems = [
  CertificateScheduleItem(
    id: 'chargeIndicator',
    section: 'testSchedule',
    label: 'Charge indicator',
  ),
  CertificateScheduleItem(
    id: 'functionalTest',
    section: 'testSchedule',
    label: 'Functional test',
  ),
  CertificateScheduleItem(
    id: 'durationTest',
    section: 'testSchedule',
    label: 'Duration test',
  ),
  CertificateScheduleItem(
    id: 'result',
    section: 'testSchedule',
    label: 'Overall result',
  ),
];
