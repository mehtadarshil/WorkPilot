import type { BoardRecord, CircuitRow, ElectricalCertificateDocument } from './types';

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyCircuit(): CircuitRow {
  return {
    id: newId('c'),
    circuitNumber: '',
    description: '',
    points: '',
    wiringType: '',
    refMethod: '',
    liveMm2: '',
    cpcMm2: '',
    maxDisconnectTime: '',
    ocpdBs: '',
    ocpdType: '',
    ocpdRatingA: '',
    ocpdBreakingKa: '',
    maxZs: '',
    rcdBs: '',
    rcdType: '',
    rcdRatingMa: '',
    rcdRatingA: '',
    ringR1: '',
    ringRn: '',
    ringR2End: '',
    r1r2: '',
    r2: '',
    insulation: '',
    polarity: '',
    zs: '',
    rcdTripMs: '',
    afdd: '',
    remarks: '',
    tested: false,
    calcOverrides: {},
  };
}

function coerceCircuit(raw: unknown): CircuitRow {
  const base = emptyCircuit();
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Record<string, unknown>;
  const legacyRcd = typeof o.rcd === 'string' ? o.rcd : '';
  return {
    ...base,
    ...(o as Partial<CircuitRow>),
    rcdTripMs: (o.rcdTripMs as string) ?? legacyRcd ?? '',
    calcOverrides: (o.calcOverrides as CircuitRow['calcOverrides']) ?? {},
  };
}

function coerceBoard(raw: unknown): BoardRecord {
  const base = emptyBoard();
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Partial<BoardRecord> & { circuits?: unknown[] };
  return {
    ...base,
    ...o,
    maxZsUse100Percent: o.maxZsUse100Percent ?? false,
    circuits: Array.isArray(o.circuits) ? o.circuits.map(coerceCircuit) : [],
  };
}

export function emptyBoard(name = 'DB-1'): BoardRecord {
  return {
    id: newId('db'),
    name,
    status: 'in_progress',
    manufacturer: '',
    location: '',
    suppliedFrom: '',
    phases: '',
    zsAtDb: '',
    ipfAtDb: '',
    polarityConfirmed: '',
    phaseSequence: '',
    mainSwitchBs: '',
    mainSwitchVoltage: '',
    mainSwitchRating: '',
    mainSwitchIpf: '',
    rcdRating: '',
    rcdTripTime: '',
    spdType: '',
    spdStatus: '',
    ocpdBs: '',
    ocpdVoltage: '',
    ocpdRating: '',
    notes: '',
    maxZsUse100Percent: false,
    circuits: [],
  };
}

export function createDefaultDocument(): ElectricalCertificateDocument {
  const today = new Date().toISOString().slice(0, 10);
  return {
    version: 1,
    typeSlug: 'eicr_18e_a3',
    installation: {
      hideClientOnReport: false,
      reason: '',
      inspectionDate: today,
      occupierName: '',
      occupierType: '',
      premisesType: '',
      recordsAvailable: '',
      previousInspectionDate: '',
      previousCertNumber: '',
      estimatedAge: '',
      alterationsEvidence: '',
      extent: '',
      operationalLimitations: '',
      agreedLimitations: '',
      agreedWith: '',
      generalCondition: '',
      overallAssessment: '',
      inspectedBy: '',
      inspectedDate: today,
      authorisedBy: '',
      authorisedDate: today,
      reinspectionPeriod: '5 years',
    },
    observations: {
      noRemedialRequired: false,
      items: [],
    },
    supply: {
      earthing: '',
      ze: '',
      ipf: '',
      acDc: 'ac',
      phases: '',
      numSupplies: '1',
      nominalU: '',
      nominalUo: '230',
      frequency: '50',
      polarityConfirmed: '',
      supplyDeviceBs: '',
      supplyDeviceType: '',
      supplyDeviceKa: '',
      supplyDeviceA: '',
      mainSwitchBs: '',
      mainSwitchPoles: '',
      mainSwitchV: '',
      mainSwitchIn: '',
      fuseSetting: '',
      mainSwitchLocation: '',
      conductorMaterial: '',
      conductorCsa: '',
      rcdIdn: '',
      rcdDelay: '',
      rcdTime: '',
      earthMaterial: '',
      earthCsa: '',
      earthContinuity: '',
      bondMaterial: '',
      bondCsa: '',
      bondContinuity: '',
      bondWater: '',
      bondGas: '',
      bondOil: '',
      bondSteel: '',
      bondLightning: '',
    },
    inspectionSchedule: {},
    boards: [emptyBoard()],
    appendix: { content: '' },
  };
}

export function coerceDocument(raw: unknown): ElectricalCertificateDocument {
  const base = createDefaultDocument();
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Partial<ElectricalCertificateDocument>;
  return {
    ...base,
    ...o,
    version: 1,
    typeSlug: 'eicr_18e_a3',
    installation: { ...base.installation, ...(o.installation ?? {}) },
    observations: {
      noRemedialRequired: o.observations?.noRemedialRequired ?? base.observations.noRemedialRequired,
      items: Array.isArray(o.observations?.items) ? o.observations.items : [],
    },
    supply: { ...base.supply, ...(o.supply ?? {}) },
    inspectionSchedule:
      o.inspectionSchedule && typeof o.inspectionSchedule === 'object' ? o.inspectionSchedule : {},
    boards:
      Array.isArray(o.boards) && o.boards.length > 0 ? o.boards.map(coerceBoard) : [emptyBoard()],
    appendix: { ...base.appendix, ...(o.appendix ?? {}) },
  };
}
