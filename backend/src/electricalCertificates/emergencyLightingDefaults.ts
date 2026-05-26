import type {
  CertificatePhoto,
  EmergencyLightingCertificateData,
  EmergencyLightingFaultRepair,
  EmergencyLightingModification,
  EmergencyLightingOutcome,
  EmergencyLightingTestItem,
} from './types';

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
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

function cleanOutcome(value: unknown): EmergencyLightingOutcome {
  return value === 'pass' || value === 'fail' || value === 'na' ? value : '';
}

export function emptyEmergencyLightingModification(): EmergencyLightingModification {
  return { id: newId('emmod'), location: '', details: '', date: '', notes: '', photos: [] };
}

export function emptyEmergencyLightingTestItem(index = 0): EmergencyLightingTestItem {
  return {
    id: newId('emtest'),
    reference: index > 0 ? `EL-${String(index).padStart(2, '0')}` : '',
    location: '',
    luminaireType: '',
    supplyMode: '',
    batteryType: '',
    lampType: '',
    durationMinutes: '',
    chargeIndicator: '',
    functionalTest: '',
    durationTest: '',
    result: 'pass',
    notes: '',
    photos: [],
  };
}

export function emptyEmergencyLightingFaultRepair(): EmergencyLightingFaultRepair {
  return {
    id: newId('emfault'),
    reference: '',
    location: '',
    fault: '',
    repair: '',
    repairedBy: '',
    repairedDate: '',
    result: '',
    notes: '',
    photos: [],
  };
}

export function createDefaultEmergencyLightingData(occupierName = ''): EmergencyLightingCertificateData {
  const today = todayIso();
  return {
    installation: {
      occupierName,
      premisesType: '',
      systemDescription: '',
      manufacturer: '',
      manufacturerPhone: '',
      installer: '',
      installerPhone: '',
      inspectionDate: today,
      nextInspectionDate: '',
      overallAssessment: '',
    },
    declaration: {
      inspectedBy: '',
      inspectedPosition: '',
      inspectedDate: today,
      authorisedBy: '',
      authorisedPosition: '',
      authorisedDate: today,
    },
    modifications: [],
    testSchedule: [],
    faultsAndRepairs: [],
  };
}

function coerceModification(raw: unknown): EmergencyLightingModification {
  const base = emptyEmergencyLightingModification();
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Partial<EmergencyLightingModification>;
  return {
    ...base,
    ...o,
    id: typeof o.id === 'string' && o.id ? o.id : base.id,
    photos: Array.isArray(o.photos) ? o.photos.map(coercePhoto).filter((p): p is CertificatePhoto => p != null) : [],
  };
}

function coerceTestItem(raw: unknown, index: number): EmergencyLightingTestItem {
  const base = emptyEmergencyLightingTestItem(index + 1);
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Partial<EmergencyLightingTestItem>;
  return {
    ...base,
    ...o,
    id: typeof o.id === 'string' && o.id ? o.id : base.id,
    chargeIndicator: cleanOutcome(o.chargeIndicator),
    functionalTest: cleanOutcome(o.functionalTest),
    durationTest: cleanOutcome(o.durationTest),
    result: cleanOutcome(o.result) || 'pass',
    photos: Array.isArray(o.photos) ? o.photos.map(coercePhoto).filter((p): p is CertificatePhoto => p != null) : [],
  };
}

function coerceFaultRepair(raw: unknown): EmergencyLightingFaultRepair {
  const base = emptyEmergencyLightingFaultRepair();
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Partial<EmergencyLightingFaultRepair>;
  return {
    ...base,
    ...o,
    id: typeof o.id === 'string' && o.id ? o.id : base.id,
    result: cleanOutcome(o.result),
    photos: Array.isArray(o.photos) ? o.photos.map(coercePhoto).filter((p): p is CertificatePhoto => p != null) : [],
  };
}

export function coerceEmergencyLightingData(raw: unknown, occupierName = ''): EmergencyLightingCertificateData {
  const base = createDefaultEmergencyLightingData(occupierName);
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Partial<EmergencyLightingCertificateData>;
  const assessment =
    o.installation?.overallAssessment === 'satisfactory' || o.installation?.overallAssessment === 'unsatisfactory'
      ? o.installation.overallAssessment
      : '';
  return {
    installation: { ...base.installation, ...(o.installation ?? {}), overallAssessment: assessment },
    declaration: { ...base.declaration, ...(o.declaration ?? {}) },
    modifications: Array.isArray(o.modifications) ? o.modifications.map(coerceModification) : [],
    testSchedule: Array.isArray(o.testSchedule) ? o.testSchedule.map(coerceTestItem) : [],
    faultsAndRepairs: Array.isArray(o.faultsAndRepairs) ? o.faultsAndRepairs.map(coerceFaultRepair) : [],
  };
}

