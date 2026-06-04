import type { MinorWorksCertificateData, MwcBondingOutcome, MwcRiskAssessment } from './types';

export function createDefaultMinorWorksData(): MinorWorksCertificateData {
  const today = new Date().toISOString().slice(0, 10);
  return {
    description: '',
    dateCompleted: today,
    earthingArrangement: '',
    methodOfProtection: '',
    departuresAndExceptions: '',
    riskAssessmentAttached: '',
    commentsOnExistingInstallation: '',
    earthingDetails: {
      earthingConductor: '',
      water: '',
      gas: '',
      oil: '',
      structuralSteel: '',
      other: '',
    },
    declaration: {
      inspectedBy: '',
      inspectedPosition: '',
      inspectedDate: today,
      authorisedBy: '',
      authorisedPosition: '',
      authorisedDate: today,
    },
  };
}

function cleanBondingOutcome(value: unknown): MwcBondingOutcome {
  return value === 'pass' || value === 'fail' || value === 'lim' || value === 'na' ? value : '';
}

function cleanRiskAssessment(value: unknown): MwcRiskAssessment {
  return value === 'yes' || value === 'na' ? value : '';
}

export function coerceMinorWorksData(raw: unknown): MinorWorksCertificateData {
  const base = createDefaultMinorWorksData();
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Partial<MinorWorksCertificateData> & { earthingDetails?: Partial<MinorWorksCertificateData['earthingDetails']> };
  const earthingRaw = (o.earthingDetails ?? {}) as Partial<MinorWorksCertificateData['earthingDetails']>;
  return {
    description: typeof o.description === 'string' ? o.description : '',
    dateCompleted: typeof o.dateCompleted === 'string' ? o.dateCompleted : base.dateCompleted,
    earthingArrangement: typeof o.earthingArrangement === 'string' ? o.earthingArrangement : '',
    methodOfProtection: typeof o.methodOfProtection === 'string' ? o.methodOfProtection : '',
    departuresAndExceptions: typeof o.departuresAndExceptions === 'string' ? o.departuresAndExceptions : '',
    riskAssessmentAttached: cleanRiskAssessment(o.riskAssessmentAttached),
    commentsOnExistingInstallation: typeof o.commentsOnExistingInstallation === 'string' ? o.commentsOnExistingInstallation : '',
    earthingDetails: {
      earthingConductor: cleanBondingOutcome(earthingRaw.earthingConductor),
      water: cleanBondingOutcome(earthingRaw.water),
      gas: cleanBondingOutcome(earthingRaw.gas),
      oil: cleanBondingOutcome(earthingRaw.oil),
      structuralSteel: cleanBondingOutcome(earthingRaw.structuralSteel),
      other: typeof earthingRaw.other === 'string' ? earthingRaw.other : '',
    },
    declaration: {
      inspectedBy: typeof o.declaration?.inspectedBy === 'string' ? o.declaration.inspectedBy : '',
      inspectedPosition: typeof o.declaration?.inspectedPosition === 'string' ? o.declaration.inspectedPosition : '',
      inspectedDate: typeof o.declaration?.inspectedDate === 'string' ? o.declaration.inspectedDate : base.declaration.inspectedDate,
      authorisedBy: typeof o.declaration?.authorisedBy === 'string' ? o.declaration.authorisedBy : '',
      authorisedPosition: typeof o.declaration?.authorisedPosition === 'string' ? o.declaration.authorisedPosition : '',
      authorisedDate: typeof o.declaration?.authorisedDate === 'string' ? o.declaration.authorisedDate : base.declaration.authorisedDate,
    },
  };
}
