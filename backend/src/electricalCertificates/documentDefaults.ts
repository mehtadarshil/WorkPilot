import type {
  BoardRecord,
  CertificatePhoto,
  CircuitRow,
  DomesticFireAlarmCertificateData,
  DomesticFireAlarmInstCertificateData,
  DomesticFireAlarmInstAdditionalTest,
  DomesticFireAlarmInstPassNa,
  DomesticFireAlarmDetector,
  ElectricalCertificateDocument,
  FireBlanketRecord,
  FireAlarmCertificateData,
  FireExtinguisherCertificateData,
  FireExtinguisherBlanketOutcome,
  FireExtinguisherChecklistOutcome,
  FireExtinguisherNextInspectionPreset,
  FireExtinguisherRecord,
  FireAlarmVariation,
  PatApplianceRow,
  PatCertificateData,
} from './types';
import {
  coerceEmergencyLightingData,
  createDefaultEmergencyLightingData,
} from './emergencyLightingDefaults';
import {
  coerceElectricalInstallationData,
  createDefaultElectricalInstallationData,
} from './electricalInstallationDefaults';

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
    insulationTestVoltage: '',
    insulationLL: '',
    insulationLE: '',
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
    insulationTestVoltage: (o.insulationTestVoltage as string) ?? '',
    insulationLL: (o.insulationLL as string) ?? '',
    insulationLE: (o.insulationLE as string) ?? ((o.insulation as string) ?? ''),
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

export function emptyFireExtinguisher(index = 0): FireExtinguisherRecord {
  return {
    id: newId('fex'),
    location: '',
    reference: index > 0 ? `FE-${String(index).padStart(2, '0')}` : '',
    serviceCode: 'inspected',
    make: '',
    extinguisherType: '',
    capacity: '',
    capacityUnit: 'kg',
    measuredWeight: '',
    nextDischargeDate: '',
    endOfLifeDate: '',
    notes: '',
    photos: [],
  };
}

export function emptyFireBlanket(index = 0): FireBlanketRecord {
  return {
    id: newId('fbl'),
    location: '',
    reference: index > 0 ? `FB-${String(index).padStart(2, '0')}` : '',
    make: '',
    installationDate: '',
    installationDateUnknown: false,
    expiryDate: '',
    outcome: '',
    notes: '',
    photos: [],
  };
}

export function createDefaultFireExtinguisherData(occupierName = ''): FireExtinguisherCertificateData {
  const today = new Date().toISOString().slice(0, 10);
  return {
    installation: {
      occupierName,
      occupierType: '',
      premisesType: '',
      nextInspectionDate: '',
      nextInspectionPreset: '',
    },
    declaration: {
      inspectedBy: '',
      inspectedPosition: '',
      inspectedDate: today,
      authorisedBy: '',
      authorisedPosition: '',
      authorisedDate: today,
    },
    extinguishers: [],
    blankets: [],
    checklist: {},
    checklistNotes: {},
    hideChecklistFromReport: false,
    remedialActions: '',
  };
}

function cleanChecklistOutcome(value: unknown): FireExtinguisherChecklistOutcome {
  if (value === 'yes' || value === 'no' || value === 'na') return value;
  if (value === 'pass') return 'yes';
  if (value === 'fail') return 'no';
  return '';
}

function cleanBlanketOutcome(value: unknown): FireExtinguisherBlanketOutcome {
  return value === 'pass' || value === 'fail' ? value : '';
}

function cleanNextInspectionPreset(value: unknown): FireExtinguisherNextInspectionPreset {
  return value === '6months' || value === '1year' || value === '3years' || value === '5years' || value === 'other'
    ? value
    : '';
}

function coerceFireExtinguisher(raw: unknown, index: number): FireExtinguisherRecord {
  const base = emptyFireExtinguisher(index + 1);
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Partial<FireExtinguisherRecord> & {
    size?: string;
    manufacturer?: string;
    nextServiceDate?: string;
    manufactureDate?: string;
  };
  const capacity = typeof o.capacity === 'string' ? o.capacity : typeof o.size === 'string' ? o.size : '';
  const make = typeof o.make === 'string' ? o.make : typeof o.manufacturer === 'string' ? o.manufacturer : '';
  return {
    ...base,
    ...o,
    id: typeof o.id === 'string' && o.id ? o.id : base.id,
    location: typeof o.location === 'string' ? o.location : '',
    reference: typeof o.reference === 'string' ? o.reference : base.reference,
    serviceCode: typeof o.serviceCode === 'string' ? o.serviceCode : base.serviceCode,
    make,
    extinguisherType: typeof o.extinguisherType === 'string' ? o.extinguisherType : '',
    capacity,
    capacityUnit: o.capacityUnit === 'litre' || o.capacityUnit === 'other' ? o.capacityUnit : o.capacityUnit === 'kg' ? 'kg' : base.capacityUnit,
    measuredWeight: typeof o.measuredWeight === 'string' ? o.measuredWeight : '',
    nextDischargeDate:
      typeof o.nextDischargeDate === 'string'
        ? o.nextDischargeDate
        : typeof o.nextServiceDate === 'string'
          ? o.nextServiceDate
          : '',
    endOfLifeDate:
      typeof o.endOfLifeDate === 'string'
        ? o.endOfLifeDate
        : typeof o.manufactureDate === 'string'
          ? o.manufactureDate
          : '',
    notes: typeof o.notes === 'string' ? o.notes : '',
    photos: Array.isArray(o.photos)
      ? o.photos.map(coercePhoto).filter((p): p is CertificatePhoto => p != null)
      : [],
  };
}

function coerceFireBlanket(raw: unknown, index: number): FireBlanketRecord {
  const base = emptyFireBlanket(index + 1);
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Partial<FireBlanketRecord> & { manufacturer?: string };
  const make = typeof o.make === 'string' ? o.make : typeof o.manufacturer === 'string' ? o.manufacturer : '';
  return {
    ...base,
    ...o,
    id: typeof o.id === 'string' && o.id ? o.id : base.id,
    location: typeof o.location === 'string' ? o.location : '',
    reference: typeof o.reference === 'string' ? o.reference : base.reference,
    make,
    installationDate: typeof o.installationDate === 'string' ? o.installationDate : '',
    installationDateUnknown: Boolean(o.installationDateUnknown),
    expiryDate: typeof o.expiryDate === 'string' ? o.expiryDate : '',
    outcome: cleanBlanketOutcome(o.outcome),
    notes: typeof o.notes === 'string' ? o.notes : '',
    photos: Array.isArray(o.photos)
      ? o.photos.map(coercePhoto).filter((p): p is CertificatePhoto => p != null)
      : [],
  };
}

export function coerceFireExtinguisherData(raw: unknown, occupierName = ''): FireExtinguisherCertificateData {
  const base = createDefaultFireExtinguisherData(occupierName);
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Partial<FireExtinguisherCertificateData> & {
    installation?: Partial<FireExtinguisherCertificateData['installation']> & {
      premisesDescription?: string;
      nextServiceDate?: string;
    };
  };
  const installationRaw: Partial<FireExtinguisherCertificateData['installation']> & {
    premisesDescription?: string;
    nextServiceDate?: string;
  } = o.installation ?? {};
  const premisesType =
    typeof installationRaw.premisesType === 'string'
      ? installationRaw.premisesType
      : typeof installationRaw.premisesDescription === 'string'
        ? installationRaw.premisesDescription
        : '';
  const checklistRaw = o.checklist && typeof o.checklist === 'object' ? o.checklist : {};
  const checklistNotesRaw = o.checklistNotes && typeof o.checklistNotes === 'object' ? o.checklistNotes : {};
  const checklist: FireExtinguisherCertificateData['checklist'] = {};
  const checklistNotes: FireExtinguisherCertificateData['checklistNotes'] = {};
  for (const [key, value] of Object.entries(checklistRaw)) {
    checklist[key] = cleanChecklistOutcome(value);
  }
  for (const [key, value] of Object.entries(checklistNotesRaw)) {
    if (typeof value === 'string') checklistNotes[key] = value;
  }
  return {
    installation: {
      ...base.installation,
      ...installationRaw,
      occupierName: typeof installationRaw.occupierName === 'string' ? installationRaw.occupierName : occupierName,
      premisesType,
      nextInspectionDate:
        typeof installationRaw.nextInspectionDate === 'string'
          ? installationRaw.nextInspectionDate
          : typeof installationRaw.nextServiceDate === 'string'
            ? installationRaw.nextServiceDate
            : '',
      nextInspectionPreset: cleanNextInspectionPreset(installationRaw.nextInspectionPreset),
    },
    declaration: { ...base.declaration, ...(o.declaration ?? {}) },
    extinguishers: Array.isArray(o.extinguishers) ? o.extinguishers.map(coerceFireExtinguisher) : [],
    blankets: Array.isArray(o.blankets) ? o.blankets.map(coerceFireBlanket) : [],
    checklist,
    checklistNotes,
    hideChecklistFromReport: Boolean(o.hideChecklistFromReport),
    remedialActions: typeof o.remedialActions === 'string' ? o.remedialActions : '',
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

export function createDefaultDomesticFireAlarmInstData(occupierName = ''): DomesticFireAlarmInstCertificateData {
  const today = new Date().toISOString().slice(0, 10);
  return {
    installation: {
      occupierName,
      systemIs: 'new',
      systemGrade: '',
      systemCategory: '',
    },
    documentation: { relatedReferenceDocuments: '' },
    extent: { extentOfSystem: '' },
    specification: { specificationText: '' },
    variationsFromSpec: { variationsText: '' },
    declaration: {
      installedBy: '',
      installedPosition: '',
      installedDate: today,
      authorisedBy: '',
      authorisedPosition: '',
      authorisedDate: today,
    },
    testSchedule: {
      wiringTested: '',
      testResultsRecorded: '',
      insulationBetweenConductors: '',
      insulationConductorsEarth: '',
      insulationConductorsScreen: '',
      earthContinuity: '',
      earthFaultLoopImpedance: '',
      maxCircuitResistance: '',
      manufacturerOtherTests: '',
      additionalTests: [],
    },
  };
}

function coerceDomesticFireAlarmInstAdditionalTest(raw: unknown): DomesticFireAlarmInstAdditionalTest {
  const base: DomesticFireAlarmInstAdditionalTest = { id: newId('dfitest'), description: '', outcome: '' };
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Partial<DomesticFireAlarmInstAdditionalTest>;
  const outcome = o.outcome === 'pass' || o.outcome === 'na' ? o.outcome : '';
  return {
    ...base,
    ...o,
    id: typeof o.id === 'string' && o.id ? o.id : base.id,
    outcome,
  };
}

export function coerceDomesticFireAlarmInstData(raw: unknown, occupierName = ''): DomesticFireAlarmInstCertificateData {
  const base = createDefaultDomesticFireAlarmInstData(occupierName);
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Partial<DomesticFireAlarmInstCertificateData>;
  const systemIs =
    o.installation?.systemIs === 'new' ||
    o.installation?.systemIs === 'modification' ||
    o.installation?.systemIs === 'alteration'
      ? o.installation.systemIs
      : base.installation.systemIs;
  const testRaw: Partial<DomesticFireAlarmInstCertificateData['testSchedule']> = o.testSchedule ?? {};
  const passNa = (v: unknown): DomesticFireAlarmInstPassNa => (v === 'pass' || v === 'na' ? v : '');
  const recorded =
    testRaw.testResultsRecorded === 'supplied_to_commissioning' ||
    testRaw.testResultsRecorded === 'supplied_by_others' ||
    testRaw.testResultsRecorded === 'na'
      ? testRaw.testResultsRecorded
      : '';
  return {
    installation: { ...base.installation, ...(o.installation ?? {}), systemIs },
    documentation: { ...base.documentation, ...(o.documentation ?? {}) },
    extent: { ...base.extent, ...(o.extent ?? {}) },
    specification: { ...base.specification, ...(o.specification ?? {}) },
    variationsFromSpec: { ...base.variationsFromSpec, ...(o.variationsFromSpec ?? {}) },
    declaration: { ...base.declaration, ...(o.declaration ?? {}) },
    testSchedule: {
      wiringTested: passNa(testRaw.wiringTested),
      testResultsRecorded: recorded,
      insulationBetweenConductors: passNa(testRaw.insulationBetweenConductors),
      insulationConductorsEarth: passNa(testRaw.insulationConductorsEarth),
      insulationConductorsScreen: passNa(testRaw.insulationConductorsScreen),
      earthContinuity: passNa(testRaw.earthContinuity),
      earthFaultLoopImpedance: passNa(testRaw.earthFaultLoopImpedance),
      maxCircuitResistance: passNa(testRaw.maxCircuitResistance),
      manufacturerOtherTests: passNa(testRaw.manufacturerOtherTests),
      additionalTests: Array.isArray(testRaw.additionalTests)
        ? testRaw.additionalTests.map(coerceDomesticFireAlarmInstAdditionalTest)
        : [],
    },
  };
}

function resolveDocumentTypeSlug(raw: unknown): ElectricalCertificateDocument['typeSlug'] {
  if (raw && typeof raw === 'object') {
    const s = (raw as Partial<ElectricalCertificateDocument>).typeSlug;
    if (
      s === 'portable_appliance_test' ||
      s === 'fi_insp_2025' ||
      s === 'dfi_insp_2019_a1' ||
      s === 'dfi_inst_2019_a1' ||
      s === 'fi_extinsp_5306' ||
      s === 'em_pir_2025' ||
      s === 'eic_18e_a3'
    ) {
      return s;
    }
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
    boards:
      typeSlug === 'fi_insp_2025' ||
      typeSlug === 'dfi_insp_2019_a1' ||
      typeSlug === 'dfi_inst_2019_a1' ||
      typeSlug === 'fi_extinsp_5306' ||
      typeSlug === 'em_pir_2025'
        ? []
        : [emptyBoard()],
    appendix: { content: '', photos: [] },
    ...(typeSlug === 'portable_appliance_test' ? { pat: createDefaultPatData(customerName) } : {}),
    ...(typeSlug === 'fi_insp_2025' ? { fireAlarm: createDefaultFireAlarmData(customerName) } : {}),
    ...(typeSlug === 'dfi_insp_2019_a1'
      ? { domesticFireAlarm: createDefaultDomesticFireAlarmData(customerName) }
      : {}),
    ...(typeSlug === 'dfi_inst_2019_a1'
      ? { domesticFireAlarmInst: createDefaultDomesticFireAlarmInstData(customerName) }
      : {}),
    ...(typeSlug === 'fi_extinsp_5306'
      ? { fireExtinguisher: createDefaultFireExtinguisherData(customerName) }
      : {}),
    ...(typeSlug === 'em_pir_2025'
      ? { emergencyLighting: createDefaultEmergencyLightingData(customerName) }
      : {}),
    ...(typeSlug === 'eic_18e_a3'
      ? { electricalInstallation: createDefaultElectricalInstallationData(customerName) }
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
      rawType === 'fi_insp_2025' ||
      rawType === 'dfi_insp_2019_a1' ||
      rawType === 'dfi_inst_2019_a1' ||
      rawType === 'fi_extinsp_5306' ||
      rawType === 'em_pir_2025'
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
    ...(rawType === 'dfi_inst_2019_a1'
      ? {
          domesticFireAlarmInst: coerceDomesticFireAlarmInstData(
            o.domesticFireAlarmInst,
            base.installation.occupierName,
          ),
        }
      : {}),
    ...(rawType === 'fi_extinsp_5306'
      ? {
          fireExtinguisher: coerceFireExtinguisherData(
            o.fireExtinguisher,
            base.installation.occupierName,
          ),
        }
      : {}),
    ...(rawType === 'em_pir_2025'
      ? {
          emergencyLighting: coerceEmergencyLightingData(
            o.emergencyLighting,
            base.installation.occupierName,
          ),
        }
      : {}),
    ...(rawType === 'eic_18e_a3'
      ? {
          electricalInstallation: coerceElectricalInstallationData(
            o.electricalInstallation,
            base.installation.occupierName,
          ),
        }
      : {}),
  };
}
