import type {
  ElectricalInstallationCertificateData,
  ElectricalInstallationSignatory,
} from './types';

function defaultSignatory(date: string): ElectricalInstallationSignatory {
  return {
    name: '',
    signature: '',
    date,
    company: '',
    phone: '',
    address: '',
    postcode: '',
  };
}

function coerceSignatory(raw: unknown, date: string): ElectricalInstallationSignatory {
  const base = defaultSignatory(date);
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Partial<ElectricalInstallationSignatory>;
  return {
    ...base,
    name: typeof o.name === 'string' ? o.name : '',
    signature: typeof o.signature === 'string' ? o.signature : '',
    date: typeof o.date === 'string' ? o.date : base.date,
    company: typeof o.company === 'string' ? o.company : '',
    phone: typeof o.phone === 'string' ? o.phone : '',
    address: typeof o.address === 'string' ? o.address : '',
    postcode: typeof o.postcode === 'string' ? o.postcode : '',
  };
}

export function createDefaultElectricalInstallationData(customerName = ''): ElectricalInstallationCertificateData {
  void customerName;
  const today = new Date().toISOString().slice(0, 10);
  return {
    details: {
      workType: '',
      newInstallation: false,
      additionToExisting: false,
      alterationToExisting: false,
      replacementDistributionBoard: false,
      premisesType: '',
      description: '',
      extent: '',
      amendedTo: 'BS 7671:2018+A3:2024',
      commentsOnExistingInstallation: '',
      circuitDetailsSchedules: '1',
      testResultSchedules: '1',
    },
    design: {
      departures: 'None noted',
      permittedExceptions: 'None noted',
      riskAssessment: 'na',
      designer1: defaultSignatory(today),
      designer2: defaultSignatory(''),
      designer2NotApplicable: false,
    },
    construction: {
      departures: 'None noted',
      constructorSignatory: defaultSignatory(today),
    },
    inspection: {
      departures: 'None noted',
      inspector: defaultSignatory(today),
      nextInspectionInterval: '5 years',
    },
  };
}

export function coerceElectricalInstallationData(
  raw: unknown,
  customerName = '',
): ElectricalInstallationCertificateData {
  const base = createDefaultElectricalInstallationData(customerName);
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Partial<ElectricalInstallationCertificateData>;
  return {
    details: { ...base.details, ...(o.details ?? {}) },
    design: {
      ...base.design,
      ...(o.design ?? {}),
      designer1: coerceSignatory(o.design?.designer1, base.design.designer1.date),
      designer2: coerceSignatory(o.design?.designer2, ''),
      designer2NotApplicable:
        typeof o.design?.designer2NotApplicable === 'boolean' ? o.design.designer2NotApplicable : false,
    },
    construction: {
      ...base.construction,
      ...(o.construction ?? {}),
      constructorSignatory: coerceSignatory(
        o.construction?.constructorSignatory,
        base.construction.constructorSignatory.date,
      ),
    },
    inspection: {
      ...base.inspection,
      ...(o.inspection ?? {}),
      inspector: coerceSignatory(o.inspection?.inspector, base.inspection.inspector.date),
    },
  };
}
