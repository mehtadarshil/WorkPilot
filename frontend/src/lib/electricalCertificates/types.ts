export type CertificateStatus = 'in_progress' | 'completed' | 'archived';

export type BoardStatus = 'in_progress' | 'done';

export type InspectionOutcome = '' | 'pass' | 'c1' | 'c2' | 'c3' | 'fi' | 'lim' | 'nv' | 'na' | 'x';
export type ElectricalCertificateTypeSlug =
  | 'eicr_18e_a3'
  | 'portable_appliance_test'
  | 'fi_insp_2025'
  | 'dfi_insp_2019_a1'
  | 'dfi_inst_2019_a1'
  | 'fi_extinsp_5306'
  | 'em_pir_2025'
  | 'eic_18e_a3'
  | 'mwc_18e_a3';

export type FireAlarmInspectionOutcome = '' | 'pass' | 'fail' | 'na' | 'lim';
export type FireAlarmYesNa = '' | 'yes' | 'na';
export type FireAlarmVariationCode = '' | 'c1' | 'c2' | 'fi' | 'c3';
export type FireAlarmOverallAssessment = '' | 'satisfactory' | 'unsatisfactory';
export type FireAlarmNextInspectionPreset = '' | '6months' | '1year' | '5years' | '10years' | 'other';

export interface FireAlarmVariation {
  id: string;
  details: string;
  code: FireAlarmVariationCode;
  location: string;
  photos: CertificatePhoto[];
}

export interface FireAlarmCertificateData {
  installation: {
    occupierName: string;
    detailsOfSystem: string;
    extentOfSystem: string;
    previousServiceDate: string;
    previousServiceUnknown: boolean;
  };
  limitations: {
    limitationsText: string;
    relatedDocuments: string;
    essentialReferenceDocs: string;
  };
  condition: {
    generalCondition: string;
    inspectionDate: string;
    outstandingDefectsReported: FireAlarmYesNa;
    logBookUpdated: FireAlarmYesNa;
    falseAlarmsCount: string;
    falseAlarmsNa: boolean;
    falseAlarmsLim: boolean;
    falseAlarmsEquates: string;
    falseAlarmsEquatesNa: boolean;
    falseAlarmsEquatesLim: boolean;
  };
  summary: {
    overallAssessment: FireAlarmOverallAssessment;
    nextInspectionDate: string;
    nextInspectionPreset: FireAlarmNextInspectionPreset;
  };
  declaration: {
    inspectedBy: string;
    inspectedPosition: string;
    inspectionDate: string;
    authorisedBy: string;
    authorisedPosition: string;
    authorisedDate: string;
  };
  variations: FireAlarmVariation[];
  remedialActions: string;
  inspectionSchedule: Record<string, FireAlarmInspectionOutcome>;
}

export type DomesticFireAlarmChecklistOutcome = '' | 'pass' | 'fail' | 'na';
export type DomesticFireAlarmGrade = '' | 'A' | 'B' | 'C' | 'D1' | 'D2' | 'E' | 'F1' | 'F2';
export type DomesticFireAlarmCategory = '' | 'LD1' | 'LD2' | 'LD3' | 'PD1' | 'PD2';
export type DomesticFireAlarmFitForService = '' | 'yes' | 'no' | 'na';

export interface DomesticFireAlarmDetector {
  id: string;
  reference: string;
  location: string;
  make: string;
  model: string;
  detectorTypes: string[];
  powerSource: string;
  interlink: string;
  expiryDate: string;
  fitForContinuedService: DomesticFireAlarmFitForService;
  notes: string;
  photos: CertificatePhoto[];
}

export type DomesticFireAlarmInstSystemIs = '' | 'new' | 'modification' | 'alteration';
export type DomesticFireAlarmInstPassNa = '' | 'pass' | 'na';
export type DomesticFireAlarmInstTestResultsRecorded = '' | 'supplied_to_commissioning' | 'supplied_by_others' | 'na';

export interface DomesticFireAlarmInstAdditionalTest {
  id: string;
  description: string;
  outcome: DomesticFireAlarmInstPassNa;
}

export interface DomesticFireAlarmInstCertificateData {
  installation: {
    occupierName: string;
    systemIs: DomesticFireAlarmInstSystemIs;
    systemGrade: DomesticFireAlarmGrade;
    systemCategory: DomesticFireAlarmCategory;
  };
  documentation: {
    relatedReferenceDocuments: string;
  };
  extent: {
    extentOfSystem: string;
  };
  specification: {
    specificationText: string;
  };
  variationsFromSpec: {
    variationsText: string;
  };
  declaration: {
    installedBy: string;
    installedPosition: string;
    installedDate: string;
    authorisedBy: string;
    authorisedPosition: string;
    authorisedDate: string;
  };
  testSchedule: {
    wiringTested: DomesticFireAlarmInstPassNa;
    testResultsRecorded: DomesticFireAlarmInstTestResultsRecorded;
    insulationBetweenConductors: DomesticFireAlarmInstPassNa;
    insulationConductorsEarth: DomesticFireAlarmInstPassNa;
    insulationConductorsScreen: DomesticFireAlarmInstPassNa;
    earthContinuity: DomesticFireAlarmInstPassNa;
    earthFaultLoopImpedance: DomesticFireAlarmInstPassNa;
    maxCircuitResistance: DomesticFireAlarmInstPassNa;
    manufacturerOtherTests: DomesticFireAlarmInstPassNa;
    additionalTests: DomesticFireAlarmInstAdditionalTest[];
  };
}

export interface DomesticFireAlarmCertificateData {
  installation: {
    occupierName: string;
    systemGrade: DomesticFireAlarmGrade;
    systemCategory: DomesticFireAlarmCategory;
    extentOfSystem: string;
    limitations: string;
    generalCondition: string;
  };
  summary: {
    overallAssessment: FireAlarmOverallAssessment;
    nextInspectionDate: string;
    nextInspectionPreset: FireAlarmNextInspectionPreset;
  };
  declaration: {
    inspectedBy: string;
    inspectedPosition: string;
    inspectionDate: string;
    authorisedBy: string;
    authorisedPosition: string;
    authorisedDate: string;
  };
  variations: FireAlarmVariation[];
  remedialActions: string;
  checklist: Record<string, DomesticFireAlarmChecklistOutcome>;
  soundLevelInstrumentModel: string;
  soundLevelInstrumentSerial: string;
  detectors: DomesticFireAlarmDetector[];
}

export interface CertificatePhoto {
  id: string;
  caption: string;
  /** JPEG/PNG data URL stored in certificate JSON. */
  dataUrl: string;
}

export interface ObservationItem {
  id: string;
  code: 'c1' | 'c2' | 'c3' | 'fi';
  details: string;
  location: string;
}

export type CircuitCalcOverrideKey =
  | 'maxDisconnectTime'
  | 'ocpdBreakingKa'
  | 'maxZs'
  | 'cpcMm2'
  | 'r1r2'
  | 'zs';

export interface CircuitRow {
  id: string;
  circuitNumber: string;
  description: string;
  points: string;
  wiringType: string;
  refMethod: string;
  liveMm2: string;
  cpcMm2: string;
  maxDisconnectTime: string;
  ocpdBs: string;
  ocpdType: string;
  ocpdRatingA: string;
  ocpdBreakingKa: string;
  maxZs: string;
  rcdBs: string;
  rcdType: string;
  rcdRatingMa: string;
  rcdRatingA: string;
  ringR1: string;
  ringRn: string;
  ringR2End: string;
  r1r2: string;
  r2: string;
  insulation: string;
  insulationTestVoltage: string;
  insulationLL: string;
  insulationLE: string;
  polarity: string;
  zs: string;
  rcdTripMs: string;
  afdd: string;
  remarks: string;
  tested: boolean;
  /** When true, user value is kept instead of auto-calc for that field. */
  calcOverrides?: Partial<Record<CircuitCalcOverrideKey, boolean>>;
}

export interface BoardRecord {
  id: string;
  name: string;
  status: BoardStatus;
  manufacturer: string;
  location: string;
  suppliedFrom: string;
  phases: string;
  zsAtDb: string;
  ipfAtDb: string;
  polarityConfirmed: string;
  phaseSequence: string;
  mainSwitchBs: string;
  mainSwitchVoltage: string;
  mainSwitchRating: string;
  mainSwitchIpf: string;
  rcdRating: string;
  rcdTripTime: string;
  spdType: string;
  spdStatus: string;
  ocpdBs: string;
  ocpdVoltage: string;
  ocpdRating: string;
  notes: string;
  /** When true, Max Zs uses 100% tabulated value; when false, 80% (test limit). */
  maxZsUse100Percent: boolean;
  circuits: CircuitRow[];
  photos: CertificatePhoto[];
}

export interface PatApplianceRow {
  id: string;
  applianceId: string;
  brand: string;
  description: string;
  location: string;
  serialNo: string;
  retestPeriod: string;
  status: '' | 'pass' | 'fail';
}

export interface PatCertificateData {
  registeredBusiness: {
    name: string;
    address: string;
    phone: string;
  };
  jobAddress: {
    customerName: string;
    address: string;
    landlordAgent: string;
  };
  certificateInfo: {
    date: string;
    number: string;
    totalTested: string;
    totalPassed: string;
    totalFailed: string;
  };
  appliances: PatApplianceRow[];
  testEquipment: {
    make: string;
    serialNo: string;
    notes: string;
  };
  engineer: {
    officerId: number | null;
    userId: number | null;
    name: string;
    notes: string;
    signatureDataUrl: string;
    signedAt: string;
    signedByUserId: number | null;
    signedByOfficerId: number | null;
  };
}

export type FireExtinguisherChecklistOutcome = '' | 'yes' | 'no' | 'na';
export type FireExtinguisherBlanketOutcome = '' | 'pass' | 'fail';
export type FireExtinguisherNextInspectionPreset = '' | '6months' | '1year' | '3years' | '5years' | 'other';

export interface FireExtinguisherRecord {
  id: string;
  location: string;
  reference: string;
  serviceCode: string;
  make: string;
  extinguisherType: string;
  capacity: string;
  capacityUnit: string;
  measuredWeight: string;
  nextDischargeDate: string;
  endOfLifeDate: string;
  notes: string;
  photos: CertificatePhoto[];
}

export interface FireBlanketRecord {
  id: string;
  location: string;
  reference: string;
  make: string;
  installationDate: string;
  installationDateUnknown: boolean;
  expiryDate: string;
  outcome: FireExtinguisherBlanketOutcome;
  notes: string;
  photos: CertificatePhoto[];
}

export interface FireExtinguisherCertificateData {
  installation: {
    occupierName: string;
    occupierType: string;
    premisesType: string;
    nextInspectionDate: string;
    nextInspectionPreset: FireExtinguisherNextInspectionPreset;
  };
  declaration: {
    inspectedBy: string;
    inspectedPosition: string;
    inspectedDate: string;
    authorisedBy: string;
    authorisedPosition: string;
    authorisedDate: string;
  };
  extinguishers: FireExtinguisherRecord[];
  blankets: FireBlanketRecord[];
  checklist: Record<string, FireExtinguisherChecklistOutcome>;
  checklistNotes: Record<string, string>;
  hideChecklistFromReport: boolean;
  remedialActions: string;
}

export type EmergencyLightingOutcome = '' | 'pass' | 'fail' | 'na';

export interface EmergencyLightingModification {
  id: string;
  location: string;
  details: string;
  date: string;
  notes: string;
  photos: CertificatePhoto[];
}

export interface EmergencyLightingTestItem {
  id: string;
  reference: string;
  location: string;
  luminaireType: string;
  supplyMode: string;
  batteryType: string;
  lampType: string;
  durationMinutes: string;
  chargeIndicator: EmergencyLightingOutcome;
  functionalTest: EmergencyLightingOutcome;
  durationTest: EmergencyLightingOutcome;
  result: EmergencyLightingOutcome;
  notes: string;
  photos: CertificatePhoto[];
}

export interface EmergencyLightingFaultRepair {
  id: string;
  reference: string;
  location: string;
  fault: string;
  repair: string;
  repairedBy: string;
  repairedDate: string;
  result: EmergencyLightingOutcome;
  notes: string;
  photos: CertificatePhoto[];
}

export interface EmergencyLightingCertificateData {
  installation: {
    occupierName: string;
    premisesType: string;
    systemDescription: string;
    manufacturer: string;
    manufacturerPhone: string;
    installer: string;
    installerPhone: string;
    inspectionDate: string;
    nextInspectionDate: string;
    overallAssessment: '' | 'satisfactory' | 'unsatisfactory';
  };
  declaration: {
    inspectedBy: string;
    inspectedPosition: string;
    inspectedDate: string;
    authorisedBy: string;
    authorisedPosition: string;
    authorisedDate: string;
  };
  modifications: EmergencyLightingModification[];
  testSchedule: EmergencyLightingTestItem[];
  faultsAndRepairs: EmergencyLightingFaultRepair[];
}

export type ElectricalInstallationWorkType = '' | 'new' | 'addition' | 'alteration';
export type ElectricalInstallationRiskAssessment = '' | 'yes' | 'no' | 'na';

export interface ElectricalInstallationSignatory {
  name: string;
  signature: string;
  date: string;
  company: string;
  phone: string;
  address: string;
  postcode: string;
}

export interface ElectricalInstallationCertificateData {
  details: {
    workType: ElectricalInstallationWorkType;
    newInstallation: boolean;
    additionToExisting: boolean;
    alterationToExisting: boolean;
    replacementDistributionBoard: boolean;
    premisesType: string;
    description: string;
    extent: string;
    amendedTo: string;
    commentsOnExistingInstallation: string;
    circuitDetailsSchedules: string;
    testResultSchedules: string;
  };
  design: {
    departures: string;
    permittedExceptions: string;
    riskAssessment: ElectricalInstallationRiskAssessment;
    designer1: ElectricalInstallationSignatory;
    designer2: ElectricalInstallationSignatory;
    designer2NotApplicable: boolean;
  };
  construction: {
    departures: string;
    constructorSignatory: ElectricalInstallationSignatory;
  };
  inspection: {
    departures: string;
    inspector: ElectricalInstallationSignatory;
    nextInspectionInterval: string;
  };
}

export type MwcBondingOutcome = '' | 'pass' | 'fail' | 'lim' | 'na';
export type MwcRiskAssessment = '' | 'yes' | 'na';

export interface MinorWorksCertificateData {
  description: string;
  dateCompleted: string;
  earthingArrangement: string;
  methodOfProtection: string;
  departuresAndExceptions: string;
  riskAssessmentAttached: MwcRiskAssessment;
  commentsOnExistingInstallation: string;
  earthingDetails: {
    earthingConductor: MwcBondingOutcome;
    water: MwcBondingOutcome;
    gas: MwcBondingOutcome;
    oil: MwcBondingOutcome;
    structuralSteel: MwcBondingOutcome;
    other: string;
  };
  declaration: {
    inspectedBy: string;
    inspectedPosition: string;
    inspectedDate: string;
    authorisedBy: string;
    authorisedPosition: string;
    authorisedDate: string;
  };
}

export interface ElectricalCertificateDocument {
  version: 1;
  typeSlug: ElectricalCertificateTypeSlug;
  installation: {
    hideClientOnReport: boolean;
    reason: string;
    inspectionDate: string;
    occupierName: string;
    occupierType: string;
    premisesType: string;
    recordsAvailable: string;
    previousInspectionDate: string;
    previousCertNumber: string;
    estimatedAge: string;
    alterationsEvidence: string;
    extent: string;
    operationalLimitations: string;
    agreedLimitations: string;
    agreedWith: string;
    generalCondition: string;
    overallAssessment: string;
    inspectedBy: string;
    inspectedPosition: string;
    inspectedDate: string;
    authorisedBy: string;
    authorisedPosition: string;
    authorisedDate: string;
    reinspectionPeriod: string;
  };
  observations: {
    noRemedialRequired: boolean;
    items: ObservationItem[];
  };
  supply: {
    earthing: string;
    ze: string;
    ipf: string;
    acDc: string;
    phases: string;
    numSupplies: string;
    nominalU: string;
    nominalUo: string;
    frequency: string;
    polarityConfirmed: string;
    supplyDeviceBs: string;
    supplyDeviceType: string;
    supplyDeviceKa: string;
    supplyDeviceA: string;
    mainSwitchBs: string;
    mainSwitchPoles: string;
    mainSwitchV: string;
    mainSwitchIn: string;
    fuseSetting: string;
    mainSwitchLocation: string;
    conductorMaterial: string;
    conductorCsa: string;
    rcdIdn: string;
    rcdDelay: string;
    rcdTime: string;
    earthMaterial: string;
    earthCsa: string;
    earthContinuity: string;
    bondMaterial: string;
    bondCsa: string;
    bondContinuity: string;
    bondWater: string;
    bondGas: string;
    bondOil: string;
    bondSteel: string;
    bondLightning: string;
  };
  inspectionSchedule: Record<string, InspectionOutcome>;
  boards: BoardRecord[];
  appendix: { content: string; photos: CertificatePhoto[] };
  pat?: PatCertificateData;
  fireAlarm?: FireAlarmCertificateData;
  domesticFireAlarm?: DomesticFireAlarmCertificateData;
  domesticFireAlarmInst?: DomesticFireAlarmInstCertificateData;
  fireExtinguisher?: FireExtinguisherCertificateData;
  emergencyLighting?: EmergencyLightingCertificateData;
  electricalInstallation?: ElectricalInstallationCertificateData;
  minorWorks?: MinorWorksCertificateData;
}

export interface ValidationIssue {
  id: string;
  section: string;
  label: string;
  field?: string;
  boardId?: string;
  circuitId?: string;
}

export interface ElectricalCertificateListSummary {
  board_count: number;
  circuit_count: number;
  observation_count: number;
  overall_assessment: string | null;
}

export interface ElectricalCertificate {
  id: number;
  certificate_number: string;
  job_number: string | null;
  type_slug: string;
  status: CertificateStatus;
  customer_id: number;
  work_address_id: number | null;
  job_id: number | null;
  document: ElectricalCertificateDocument;
  customer_full_name: string | null;
  installation_label: string | null;
  created_at: string;
  updated_at: string;
  renewal_reminder_enabled: boolean;
  renewal_anchor_date: string | null;
  renewal_interval_years: number;
  renewal_early_days: number;
  renewal_job_id: number | null;
  list_summary?: ElectricalCertificateListSummary;
}

export const CERTIFICATE_TYPE_CATALOG = [
  {
    slug: 'eic_18e_a3',
    title: 'Electrical Installation Certificate',
    subtitle: 'BS 7671 — 18th Edition Amendment 3',
    shortLabel: 'EIC',
    standard: 'BS 7671',
    revision: '18th Edition Amendment 3',
  },
  {
    slug: 'eicr_18e_a3',
    title: 'Electrical Installation Condition Report',
    subtitle: 'BS 7671 — 18th Edition Amendment 3',
    shortLabel: 'EICR',
    standard: 'BS 7671',
    revision: '18th Edition Amendment 3',
  },
  {
    slug: 'portable_appliance_test',
    title: 'Portable Appliance Test Certificate',
    subtitle: 'PAT certificate with appliance Pass/Fail results',
    shortLabel: 'PAT',
    standard: 'IET Code of Practice',
    revision: '',
  },
  {
    slug: 'fi_insp_2025',
    title: 'Fire Alarm Inspection and Servicing Report',
    subtitle: 'BS 5839-1:2025',
    shortLabel: 'FI-INSP',
    standard: 'BS 5839-1',
    revision: '2025',
  },
  {
    slug: 'dfi_insp_2019_a1',
    title: 'Domestic Fire Alarm Inspection and Servicing Report',
    subtitle: 'Standard: BS 5839-6 | Revision: 2019:A1',
    shortLabel: 'DFI-INSP',
    standard: 'BS 5839-6',
    revision: '2019:A1',
  },
  {
    slug: 'dfi_inst_2019_a1',
    title: 'Domestic Fire Alarm Installation Certificate',
    subtitle: 'Standard: BS 5839-6 | Revision: 2019:A1',
    shortLabel: 'DFI-INST',
    standard: 'BS 5839-6',
    revision: '2019:A1',
  },
  {
    slug: 'fi_extinsp_5306',
    title: 'Fire Extinguisher Inspection Certificate',
    subtitle: 'Standard: BS 5306 | Revision: Parts 3, 8, 9',
    shortLabel: 'FI-EXTINSP',
    standard: 'BS 5306',
    revision: 'Parts 3, 8, 9',
  },
  {
    slug: 'em_pir_2025',
    title: 'Emergency Lighting - Periodic Inspection Report',
    subtitle: 'Standard: BS 5266-1:2025 | BS EN 50172 / BS 5266-8',
    shortLabel: 'EM-PIR',
    standard: 'BS 5266-1',
    revision: '2025',
  },
  {
    slug: 'mwc_18e_a3',
    title: 'Minor Works Certificate',
    subtitle: 'BS 7671 — 18th Edition Amendment 3',
    shortLabel: 'MWC',
    standard: 'BS 7671',
    revision: '18th Edition Amendment 3',
  },
] as const;

export const ELECTRICAL_INSTALLATION_EDITOR_SECTIONS = [
  { key: 'installation-details', label: 'Installation details' },
  { key: 'design', label: 'Design' },
  { key: 'construction', label: 'Construction' },
  { key: 'inspection-testing', label: 'Inspection & testing' },
  { key: 'signatories', label: 'Signatories' },
  { key: 'supply-characteristics', label: 'Supply' },
  { key: 'inspection-schedule', label: 'Inspection schedule' },
  { key: 'boards', label: 'Boards & circuits' },
  { key: 'appendix', label: 'Appendix' },
] as const;

export type ElectricalInstallationEditorSectionKey = (typeof ELECTRICAL_INSTALLATION_EDITOR_SECTIONS)[number]['key'];

export const EMERGENCY_LIGHTING_EDITOR_SECTIONS = [
  { key: 'installation-details', label: 'Installation details' },
  { key: 'modifications', label: 'Modifications' },
  { key: 'test-schedule', label: 'Test schedule' },
  { key: 'faults-repairs', label: 'Faults and repairs' },
  { key: 'appendix', label: 'Appendix' },
] as const;

export type EmergencyLightingEditorSectionKey = (typeof EMERGENCY_LIGHTING_EDITOR_SECTIONS)[number]['key'];

export const FIRE_EXTINGUISHER_EDITOR_SECTIONS = [
  { key: 'installation-details', label: 'Installation details' },
  { key: 'observations', label: 'Observations' },
  { key: 'fire-extinguishers', label: 'Fire extinguishers' },
  { key: 'fire-blankets', label: 'Fire blankets' },
  { key: 'checklist', label: 'Checklist' },
  { key: 'appendix', label: 'Appendix' },
] as const;

export type FireExtinguisherEditorSectionKey = (typeof FIRE_EXTINGUISHER_EDITOR_SECTIONS)[number]['key'];

export const DOMESTIC_FIRE_ALARM_INST_EDITOR_SECTIONS = [
  { key: 'installation-details', label: 'Installation details' },
  { key: 'test-schedule', label: 'Test schedule' },
  { key: 'appendix', label: 'Appendix' },
] as const;

export type DomesticFireAlarmInstEditorSectionKey = (typeof DOMESTIC_FIRE_ALARM_INST_EDITOR_SECTIONS)[number]['key'];

export const FIRE_ALARM_EDITOR_SECTIONS = [
  { key: 'installation-details', label: 'Installation details' },
  { key: 'variations', label: 'Variations' },
  { key: 'inspection-schedule', label: 'Inspection schedule' },
  { key: 'appendix', label: 'Appendix' },
] as const;

export type FireAlarmEditorSectionKey = (typeof FIRE_ALARM_EDITOR_SECTIONS)[number]['key'];

export const DOMESTIC_FIRE_ALARM_EDITOR_SECTIONS = [
  { key: 'installation-details', label: 'Installation details' },
  { key: 'variations', label: 'Variations' },
  { key: 'checklist', label: 'Checklist' },
  { key: 'detectors', label: 'Detectors' },
  { key: 'appendix', label: 'Appendix' },
] as const;

export type DomesticFireAlarmEditorSectionKey = (typeof DOMESTIC_FIRE_ALARM_EDITOR_SECTIONS)[number]['key'];

export const MWC_EDITOR_SECTIONS = [
  { key: 'installation-details', label: 'Installation details' },
  { key: 'circuits', label: 'Circuits' },
  { key: 'declaration', label: 'Declaration' },
  { key: 'appendix', label: 'Appendix' },
] as const;

export type MwcEditorSectionKey = (typeof MWC_EDITOR_SECTIONS)[number]['key'];

export const EDITOR_SECTIONS = [
  { key: 'installation-details', label: 'Installation details', icon: 'building' },
  { key: 'observations', label: 'Observations', icon: 'eye' },
  { key: 'supply-characteristics', label: 'Supply characteristics', icon: 'zap' },
  { key: 'inspection-schedule', label: 'Inspection schedule', icon: 'clipboard' },
  { key: 'boards', label: 'Boards & circuits', icon: 'grid' },
  { key: 'appendix', label: 'Appendix', icon: 'file' },
] as const;

export type EditorSectionKey = (typeof EDITOR_SECTIONS)[number]['key'];
