/** EICR electrical installation certificate document (Tradecert-aligned). */

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
  | 'em_pir_2025';

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

export type OutcomeButton = 'pass' | 'fail' | 'lim' | 'na' | 'yes' | 'no';

export interface ObservationItem {
  id: string;
  code: 'c1' | 'c2' | 'c3' | 'fi';
  details: string;
  location: string;
}

export interface CertificatePhoto {
  id: string;
  caption: string;
  dataUrl: string;
}

export type CircuitCalcOverrideKey =
  | 'maxDisconnectTime'
  | 'ocpdBreakingKa'
  | 'maxZs'
  | 'cpcMm2'
  | 'r1r2';

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
  polarity: string;
  zs: string;
  rcdTripMs: string;
  afdd: string;
  remarks: string;
  tested: boolean;
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
  appendix: {
    content: string;
    photos: CertificatePhoto[];
  };
  pat?: PatCertificateData;
  fireAlarm?: FireAlarmCertificateData;
  domesticFireAlarm?: DomesticFireAlarmCertificateData;
  domesticFireAlarmInst?: DomesticFireAlarmInstCertificateData;
  fireExtinguisher?: FireExtinguisherCertificateData;
  emergencyLighting?: EmergencyLightingCertificateData;
}

export interface ValidationIssue {
  id: string;
  section: string;
  label: string;
  field?: string;
  boardId?: string;
}
