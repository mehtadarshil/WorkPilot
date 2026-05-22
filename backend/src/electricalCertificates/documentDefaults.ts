import type { BoardRecord, CertificatePhoto, CircuitRow, ElectricalCertificateDocument, PatApplianceRow, PatCertificateData } from './types';

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

function coercePhoto(raw: unknown): CertificatePhoto | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Partial<CertificatePhoto>;
  if (typeof o.dataUrl !== 'string' || !o.dataUrl.startsWith('data:image/')) return null;
  return {
    id: typeof o.id === 'string' ? o.id : newId('ph'),
    caption: typeof o.caption === 'string' ? o.caption : '',
    dataUrl: o.dataUrl,
  };
}

function coerceBoard(raw: unknown): BoardRecord {
  const base = emptyBoard();
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Partial<BoardRecord> & { circuits?: unknown[]; photos?: unknown[] };
  return {
    ...base,
    ...o,
    maxZsUse100Percent: o.maxZsUse100Percent ?? false,
    circuits: Array.isArray(o.circuits) ? o.circuits.map(coerceCircuit) : [],
    photos: Array.isArray(o.photos)
      ? o.photos.map(coercePhoto).filter((p): p is CertificatePhoto => p != null)
      : [],
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
    photos: [],
  };
}

export function createDefaultPatData(customerName = ''): PatCertificateData {
  const today = new Date().toISOString().slice(0, 10);
  const appliances: PatApplianceRow[] = Array.from({ length: 1 }, (_, idx) => {
    const n = String(idx + 1).padStart(3, '0');
    return {
      id: newId('pat'),
      applianceId: n,
      brand: '',
      description: '',
      location: '',
      serialNo: '',
      retestPeriod: '12 Months',
      status: '',
    };
  });
  return applyPatTotals({
    registeredBusiness: { name: '', address: '', phone: '' },
    jobAddress: { customerName, address: '', landlordAgent: '' },
    certificateInfo: { date: today, number: '', totalTested: '', totalPassed: '', totalFailed: '' },
    appliances,
    testEquipment: { make: '', serialNo: '', notes: '' },
    engineer: { name: '', notes: '' },
  });
}

export function applyPatTotals(pat: PatCertificateData): PatCertificateData {
  const totalTested = pat.appliances.filter((row) => row.status === 'pass' || row.status === 'fail').length;
  const totalPassed = pat.appliances.filter((row) => row.status === 'pass').length;
  const totalFailed = pat.appliances.filter((row) => row.status === 'fail').length;
  return {
    ...pat,
    certificateInfo: {
      ...pat.certificateInfo,
      totalTested: String(totalTested),
      totalPassed: String(totalPassed),
      totalFailed: String(totalFailed),
    },
  };
}

function coercePatAppliance(raw: unknown, index: number): PatApplianceRow {
  const n = String(index + 1).padStart(3, '0');
  if (!raw || typeof raw !== 'object') {
    return { id: newId('pat'), applianceId: n, brand: '', description: '', location: '', serialNo: '', retestPeriod: '12 Months', status: '' };
  }
  const o = raw as Partial<PatApplianceRow>;
  const status = o.status === 'pass' || o.status === 'fail' ? o.status : '';
  return {
    id: typeof o.id === 'string' && o.id ? o.id : newId('pat'),
    applianceId: typeof o.applianceId === 'string' ? o.applianceId : n,
    brand: typeof o.brand === 'string' ? o.brand : '',
    description: typeof o.description === 'string' ? o.description : '',
    location: typeof o.location === 'string' ? o.location : '',
    serialNo: typeof o.serialNo === 'string' ? o.serialNo : '',
    retestPeriod: typeof o.retestPeriod === 'string' ? o.retestPeriod : '12 Months',
    status,
  };
}

export function coercePatData(raw: unknown, customerName = ''): PatCertificateData {
  const base = createDefaultPatData(customerName);
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Partial<PatCertificateData>;
  const appliancesRaw = Array.isArray(o.appliances) ? o.appliances : [];
  const appliances = appliancesRaw.length > 0
    ? appliancesRaw.map((item, idx) => coercePatAppliance(item, idx))
    : base.appliances;
  return applyPatTotals({
    registeredBusiness: { ...base.registeredBusiness, ...(o.registeredBusiness ?? {}) },
    jobAddress: { ...base.jobAddress, ...(o.jobAddress ?? {}) },
    certificateInfo: { ...base.certificateInfo, ...(o.certificateInfo ?? {}) },
    appliances,
    testEquipment: { ...base.testEquipment, ...(o.testEquipment ?? {}) },
    engineer: { ...base.engineer, ...(o.engineer ?? {}) },
  });
}

export function createDefaultDocument(typeSlug: ElectricalCertificateDocument['typeSlug'] = 'eicr_18e_a3', customerName = ''): ElectricalCertificateDocument {
  const today = new Date().toISOString().slice(0, 10);
  return {
    version: 1,
    typeSlug,
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
    appendix: { content: '', photos: [] },
    ...(typeSlug === 'portable_appliance_test' ? { pat: createDefaultPatData(customerName) } : {}),
  };
}

export function coerceDocument(raw: unknown): ElectricalCertificateDocument {
  const rawType =
    raw && typeof raw === 'object' && (raw as Partial<ElectricalCertificateDocument>).typeSlug === 'portable_appliance_test'
      ? 'portable_appliance_test'
      : 'eicr_18e_a3';
  const base = createDefaultDocument(rawType);
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Partial<ElectricalCertificateDocument>;
  return {
    ...base,
    ...o,
    version: 1,
    typeSlug: rawType,
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
    appendix: {
      content: o.appendix?.content ?? base.appendix.content,
      photos: Array.isArray(o.appendix?.photos)
        ? o.appendix.photos.map(coercePhoto).filter((p): p is CertificatePhoto => p != null)
        : [],
    },
    ...(rawType === 'portable_appliance_test' ? { pat: coercePatData(o.pat) } : {}),
  };
}
