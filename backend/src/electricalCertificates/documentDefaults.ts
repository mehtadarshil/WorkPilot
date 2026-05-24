import type {
  BoardRecord,
  CertificatePhoto,
  CircuitRow,
  DomesticFireAlarmCertificateData,
  DomesticFireAlarmDetector,
  ElectricalCertificateDocument,
  FireAlarmCertificateData,
  FireAlarmVariation,
  PatApplianceRow,
  PatCertificateData,
} from './types';

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
      status: 'pass',
    };
  });
  return applyPatTotals({
    registeredBusiness: { name: '', address: '', phone: '' },
    jobAddress: { customerName, address: '', landlordAgent: '' },
    certificateInfo: { date: today, number: '', totalTested: '', totalPassed: '', totalFailed: '' },
    appliances,
    testEquipment: { make: '', serialNo: '', notes: '' },
    engineer: {
      officerId: null,
      userId: null,
      name: '',
      notes: '',
      signatureDataUrl: '',
      signedAt: '',
      signedByUserId: null,
      signedByOfficerId: null,
    },
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
    return { id: newId('pat'), applianceId: n, brand: '', description: '', location: '', serialNo: '', retestPeriod: '12 Months', status: 'pass' };
  }
  const o = raw as Partial<PatApplianceRow>;
  const status = o.status === 'fail' ? 'fail' : 'pass';
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

export function createDefaultFireAlarmData(occupierName = ''): FireAlarmCertificateData {
  const today = new Date().toISOString().slice(0, 10);
  return {
    installation: {
      occupierName,
      detailsOfSystem: '',
      extentOfSystem: '',
      previousServiceDate: '',
      previousServiceUnknown: false,
    },
    limitations: {
      limitationsText: '',
      relatedDocuments: '',
      essentialReferenceDocs: '',
    },
    condition: {
      generalCondition: '',
      inspectionDate: today,
      outstandingDefectsReported: '',
      logBookUpdated: '',
      falseAlarmsCount: '',
      falseAlarmsNa: false,
      falseAlarmsLim: false,
      falseAlarmsEquates: '',
      falseAlarmsEquatesNa: false,
      falseAlarmsEquatesLim: false,
    },
    summary: {
      overallAssessment: '',
      nextInspectionDate: '',
      nextInspectionPreset: '',
    },
    declaration: {
      inspectedBy: '',
      inspectedPosition: '',
      inspectionDate: today,
      authorisedBy: '',
      authorisedPosition: '',
      authorisedDate: today,
    },
    variations: [],
    remedialActions: '',
    inspectionSchedule: {},
  };
}

function coerceFireAlarmVariation(raw: unknown): FireAlarmVariation {
  const base: FireAlarmVariation = {
    id: newId('fav'),
    details: '',
    code: '',
    location: '',
    photos: [],
  };
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Partial<FireAlarmVariation>;
  const code = o.code === 'c1' || o.code === 'c2' || o.code === 'fi' || o.code === 'c3' ? o.code : '';
  return {
    ...base,
    ...o,
    id: typeof o.id === 'string' && o.id ? o.id : base.id,
    code,
    photos: Array.isArray(o.photos)
      ? o.photos.map(coercePhoto).filter((p): p is CertificatePhoto => p != null)
      : [],
  };
}

export function coerceFireAlarmData(raw: unknown, occupierName = ''): FireAlarmCertificateData {
  const base = createDefaultFireAlarmData(occupierName);
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Partial<FireAlarmCertificateData>;
  const schedule =
    o.inspectionSchedule && typeof o.inspectionSchedule === 'object' ? o.inspectionSchedule : {};
  return {
    installation: { ...base.installation, ...(o.installation ?? {}) },
    limitations: { ...base.limitations, ...(o.limitations ?? {}) },
    condition: { ...base.condition, ...(o.condition ?? {}) },
    summary: { ...base.summary, ...(o.summary ?? {}) },
    declaration: { ...base.declaration, ...(o.declaration ?? {}) },
    variations: Array.isArray(o.variations) ? o.variations.map(coerceFireAlarmVariation) : [],
    remedialActions: typeof o.remedialActions === 'string' ? o.remedialActions : '',
    inspectionSchedule: schedule as FireAlarmCertificateData['inspectionSchedule'],
  };
}

export function createDefaultDomesticFireAlarmData(occupierName = ''): DomesticFireAlarmCertificateData {
  const today = new Date().toISOString().slice(0, 10);
  return {
    installation: {
      occupierName,
      systemGrade: '',
      systemCategory: '',
      extentOfSystem: '',
      limitations: '',
      generalCondition: '',
    },
    summary: {
      overallAssessment: '',
      nextInspectionDate: '',
      nextInspectionPreset: '',
    },
    declaration: {
      inspectedBy: '',
      inspectedPosition: '',
      inspectionDate: today,
      authorisedBy: '',
      authorisedPosition: '',
      authorisedDate: today,
    },
    variations: [],
    remedialActions: '',
    checklist: {},
    soundLevelInstrumentModel: '',
    soundLevelInstrumentSerial: '',
    detectors: [],
  };
}

export function emptyDomesticDetector(): DomesticFireAlarmDetector {
  return {
    id: newId('dfdet'),
    reference: '',
    location: '',
    make: '',
    model: '',
    detectorTypes: [],
    powerSource: '',
    interlink: '',
    expiryDate: '',
    fitForContinuedService: '',
    notes: '',
    photos: [],
  };
}

function coerceDomesticDetector(raw: unknown): DomesticFireAlarmDetector {
  const base = emptyDomesticDetector();
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Partial<DomesticFireAlarmDetector>;
  const fit =
    o.fitForContinuedService === 'yes' || o.fitForContinuedService === 'no' || o.fitForContinuedService === 'na'
      ? o.fitForContinuedService
      : '';
  return {
    ...base,
    ...o,
    id: typeof o.id === 'string' && o.id ? o.id : base.id,
    detectorTypes: Array.isArray(o.detectorTypes) ? o.detectorTypes.filter((v): v is string => typeof v === 'string') : [],
    fitForContinuedService: fit,
    photos: Array.isArray(o.photos)
      ? o.photos.map(coercePhoto).filter((p): p is CertificatePhoto => p != null)
      : [],
  };
}

export function coerceDomesticFireAlarmData(raw: unknown, occupierName = ''): DomesticFireAlarmCertificateData {
  const base = createDefaultDomesticFireAlarmData(occupierName);
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Partial<DomesticFireAlarmCertificateData>;
  const checklist = o.checklist && typeof o.checklist === 'object' ? o.checklist : {};
  return {
    installation: { ...base.installation, ...(o.installation ?? {}) },
    summary: { ...base.summary, ...(o.summary ?? {}) },
    declaration: { ...base.declaration, ...(o.declaration ?? {}) },
    variations: Array.isArray(o.variations) ? o.variations.map(coerceFireAlarmVariation) : [],
    remedialActions: typeof o.remedialActions === 'string' ? o.remedialActions : '',
    checklist: checklist as DomesticFireAlarmCertificateData['checklist'],
    soundLevelInstrumentModel:
      typeof o.soundLevelInstrumentModel === 'string' ? o.soundLevelInstrumentModel : '',
    soundLevelInstrumentSerial:
      typeof o.soundLevelInstrumentSerial === 'string' ? o.soundLevelInstrumentSerial : '',
    detectors: Array.isArray(o.detectors) ? o.detectors.map(coerceDomesticDetector) : [],
  };
}

function resolveDocumentTypeSlug(raw: unknown): ElectricalCertificateDocument['typeSlug'] {
  if (raw && typeof raw === 'object') {
    const s = (raw as Partial<ElectricalCertificateDocument>).typeSlug;
    if (s === 'portable_appliance_test' || s === 'fi_insp_2025' || s === 'dfi_insp_2019_a1') return s;
  }
  return 'eicr_18e_a3';
}

export function coercePatData(raw: unknown, customerName = ''): PatCertificateData {
  const base = createDefaultPatData(customerName);
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Partial<PatCertificateData>;
  const appliancesRaw = Array.isArray(o.appliances) ? o.appliances : [];
  const appliances = appliancesRaw.length > 0
    ? appliancesRaw.map((item, idx) => coercePatAppliance(item, idx))
    : base.appliances;
  const engineerRaw: Partial<PatCertificateData['engineer']> = o.engineer ?? {};
  const engineer = {
    ...base.engineer,
    ...engineerRaw,
    officerId: typeof engineerRaw.officerId === 'number' && Number.isFinite(engineerRaw.officerId) ? engineerRaw.officerId : null,
    userId: typeof engineerRaw.userId === 'number' && Number.isFinite(engineerRaw.userId) ? engineerRaw.userId : null,
    signedByUserId: typeof engineerRaw.signedByUserId === 'number' && Number.isFinite(engineerRaw.signedByUserId) ? engineerRaw.signedByUserId : null,
    signedByOfficerId: typeof engineerRaw.signedByOfficerId === 'number' && Number.isFinite(engineerRaw.signedByOfficerId) ? engineerRaw.signedByOfficerId : null,
  };
  return applyPatTotals({
    registeredBusiness: { ...base.registeredBusiness, ...(o.registeredBusiness ?? {}) },
    jobAddress: { ...base.jobAddress, ...(o.jobAddress ?? {}) },
    certificateInfo: { ...base.certificateInfo, ...(o.certificateInfo ?? {}) },
    appliances,
    testEquipment: { ...base.testEquipment, ...(o.testEquipment ?? {}) },
    engineer,
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
      inspectedPosition: '',
      inspectedDate: today,
      authorisedBy: '',
      authorisedPosition: '',
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
    boards: typeSlug === 'fi_insp_2025' || typeSlug === 'dfi_insp_2019_a1' ? [] : [emptyBoard()],
    appendix: { content: '', photos: [] },
    ...(typeSlug === 'portable_appliance_test' ? { pat: createDefaultPatData(customerName) } : {}),
    ...(typeSlug === 'fi_insp_2025' ? { fireAlarm: createDefaultFireAlarmData(customerName) } : {}),
    ...(typeSlug === 'dfi_insp_2019_a1'
      ? { domesticFireAlarm: createDefaultDomesticFireAlarmData(customerName) }
      : {}),
  };
}

export function coerceDocument(raw: unknown): ElectricalCertificateDocument {
  const rawType = resolveDocumentTypeSlug(raw);
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
      rawType === 'fi_insp_2025' || rawType === 'dfi_insp_2019_a1'
        ? []
        : Array.isArray(o.boards) && o.boards.length > 0
          ? o.boards.map(coerceBoard)
          : [emptyBoard()],
    appendix: {
      content: o.appendix?.content ?? base.appendix.content,
      photos: Array.isArray(o.appendix?.photos)
        ? o.appendix.photos.map(coercePhoto).filter((p): p is CertificatePhoto => p != null)
        : [],
    },
    ...(rawType === 'portable_appliance_test' ? { pat: coercePatData(o.pat) } : {}),
    ...(rawType === 'fi_insp_2025'
      ? { fireAlarm: coerceFireAlarmData(o.fireAlarm, base.installation.occupierName) }
      : {}),
    ...(rawType === 'dfi_insp_2019_a1'
      ? { domesticFireAlarm: coerceDomesticFireAlarmData(o.domesticFireAlarm, base.installation.occupierName) }
      : {}),
  };
}
