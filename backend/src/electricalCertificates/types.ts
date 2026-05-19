/** EICR electrical installation certificate document (Tradecert-aligned). */

export type CertificateStatus = 'in_progress' | 'completed' | 'archived';

export type BoardStatus = 'in_progress' | 'done';

export type InspectionOutcome = '' | 'pass' | 'c1' | 'c2' | 'c3' | 'fi' | 'lim' | 'nv' | 'na' | 'x';

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

export interface ElectricalCertificateDocument {
  version: 1;
  typeSlug: 'eicr_18e_a3';
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
    inspectedDate: string;
    authorisedBy: string;
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
}

export interface ValidationIssue {
  id: string;
  section: string;
  label: string;
  field?: string;
  boardId?: string;
}
