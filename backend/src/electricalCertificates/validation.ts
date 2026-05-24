import { INSPECTION_SCHEDULE_ITEMS, INSPECTION_SECTION_LABELS } from './inspectionScheduleItems';
import type { ElectricalCertificateDocument, ValidationIssue } from './types';

function isEmpty(v: string | undefined | null): boolean {
  return v == null || String(v).trim() === '';
}

function req(section: string, label: string, field?: string, boardId?: string): ValidationIssue {
  return { id: `${section}:${label}`, section, label: `${label}: Is empty`, field, boardId };
}

export function validateElectricalCertificate(doc: ElectricalCertificateDocument): ValidationIssue[] {
  if (doc.typeSlug === 'portable_appliance_test' || doc.typeSlug === 'fi_insp_2025') {
    return [];
  }
  const issues: ValidationIssue[] = [];
  const inst = doc.installation;

  if (isEmpty(inst.premisesType)) issues.push(req('installation', 'Description of premises', 'premisesType'));
  if (isEmpty(inst.previousInspectionDate)) issues.push(req('installation', 'Date of previous inspection', 'previousInspectionDate'));
  if (isEmpty(inst.previousCertNumber)) issues.push(req('installation', 'Previous certificate number', 'previousCertNumber'));
  if (isEmpty(inst.estimatedAge)) issues.push(req('installation', 'Estimated age of installation', 'estimatedAge'));
  if (isEmpty(inst.alterationsEvidence)) issues.push(req('installation', 'Evidence of additions or alterations', 'alterationsEvidence'));
  if (isEmpty(inst.operationalLimitations)) issues.push(req('installation', 'Operational limitations', 'operationalLimitations'));
  if (isEmpty(inst.agreedLimitations)) issues.push(req('installation', 'Agreed limitations', 'agreedLimitations'));
  if (isEmpty(inst.agreedWith)) issues.push(req('installation', 'Agreed with', 'agreedWith'));
  if (isEmpty(inst.generalCondition)) issues.push(req('installation', 'General condition of the installation', 'generalCondition'));
  if (isEmpty(inst.inspectedBy)) issues.push(req('installation', 'Inspected and tested by', 'inspectedBy'));
  if (isEmpty(inst.authorisedBy)) issues.push(req('installation', 'Authorised for issue by', 'authorisedBy'));
  if (isEmpty(inst.authorisedDate)) issues.push(req('installation', 'Authorised for issue date', 'authorisedDate'));
  if (isEmpty(inst.reinspectionPeriod)) issues.push(req('installation', 'Recommended re-inspection date', 'reinspectionPeriod'));

  const sup = doc.supply;
  if (isEmpty(sup.phases)) issues.push(req('supply', 'Number and type of live conductors', 'phases'));
  if (isEmpty(sup.nominalU)) issues.push(req('supply', 'Nominal voltage (U)', 'nominalU'));
  if (isEmpty(sup.polarityConfirmed)) issues.push(req('supply', 'Supply polarity confirmed', 'polarityConfirmed'));
  if (isEmpty(sup.supplyDeviceBs)) issues.push(req('supply', 'Supply protective device BS(EN)', 'supplyDeviceBs'));
  if (isEmpty(sup.supplyDeviceType)) issues.push(req('supply', 'Supply protective device type', 'supplyDeviceType'));
  if (isEmpty(sup.supplyDeviceKa)) issues.push(req('supply', 'Supply protective device short circuit capacity', 'supplyDeviceKa'));
  if (isEmpty(sup.supplyDeviceA)) issues.push(req('supply', 'Supply protective device rated current', 'supplyDeviceA'));
  if (isEmpty(sup.mainSwitchBs)) issues.push(req('supply', 'Main switch type BS(EN)', 'mainSwitchBs'));
  if (isEmpty(sup.mainSwitchPoles)) issues.push(req('supply', 'Main switch number of poles', 'mainSwitchPoles'));
  if (isEmpty(sup.mainSwitchV)) issues.push(req('supply', 'Main switch voltage rating', 'mainSwitchV'));
  if (isEmpty(sup.mainSwitchIn)) issues.push(req('supply', 'Main switch rated current', 'mainSwitchIn'));
  if (isEmpty(sup.fuseSetting)) issues.push(req('supply', 'Fuse device setting', 'fuseSetting'));
  if (isEmpty(sup.mainSwitchLocation)) issues.push(req('supply', 'Location of main switch', 'mainSwitchLocation'));
  if (isEmpty(sup.conductorMaterial)) issues.push(req('supply', 'Main switch conductor material', 'conductorMaterial'));
  if (isEmpty(sup.conductorCsa)) issues.push(req('supply', 'Main switch conductor CSA', 'conductorCsa'));
  if (isEmpty(sup.rcdIdn)) issues.push(req('supply', 'RCD operating current IΔn', 'rcdIdn'));
  if (isEmpty(sup.rcdDelay)) issues.push(req('supply', 'RCD time delay', 'rcdDelay'));
  if (isEmpty(sup.rcdTime)) issues.push(req('supply', 'RCD operating time IΔn', 'rcdTime'));
  if (isEmpty(sup.earthMaterial)) issues.push(req('supply', 'Earthing conductor material', 'earthMaterial'));
  if (isEmpty(sup.earthCsa)) issues.push(req('supply', 'Earthing conductor CSA', 'earthCsa'));
  if (isEmpty(sup.earthContinuity)) issues.push(req('supply', 'Earthing conductor continuity check', 'earthContinuity'));
  if (isEmpty(sup.bondMaterial)) issues.push(req('supply', 'Main bonding conductor material', 'bondMaterial'));
  if (isEmpty(sup.bondCsa)) issues.push(req('supply', 'Main bonding conductor CSA', 'bondCsa'));
  if (isEmpty(sup.bondContinuity)) issues.push(req('supply', 'Main bonding conductor continuity check', 'bondContinuity'));
  if (isEmpty(sup.bondWater)) issues.push(req('supply', 'Bonding — Water', 'bondWater'));
  if (isEmpty(sup.bondGas)) issues.push(req('supply', 'Bonding — Gas', 'bondGas'));
  if (isEmpty(sup.bondOil)) issues.push(req('supply', 'Bonding — Oil', 'bondOil'));
  if (isEmpty(sup.bondSteel)) issues.push(req('supply', 'Bonding — Structural Steel', 'bondSteel'));
  if (isEmpty(sup.bondLightning)) issues.push(req('supply', 'Bonding — Lightning', 'bondLightning'));

  const sectionIncomplete: Record<string, number> = {};
  for (const item of INSPECTION_SCHEDULE_ITEMS) {
    const outcome = doc.inspectionSchedule[item.id];
    if (!outcome) {
      sectionIncomplete[item.section] = (sectionIncomplete[item.section] ?? 0) + 1;
    }
  }
  for (const [sec, count] of Object.entries(sectionIncomplete)) {
    if (count > 0) {
      const title = INSPECTION_SECTION_LABELS[sec] ?? `Section ${sec}`;
      issues.push({
        id: `inspection:section:${sec}`,
        section: 'inspection',
        label: `Section ${sec}: ${title}: ${count} item${count === 1 ? '' : 's'} incomplete`,
        field: `section_${sec}`,
      });
    }
  }

  for (const board of doc.boards) {
    const bid = board.id;
    if (isEmpty(board.phases)) issues.push(req('boards', 'Number of Phases', 'phases', bid));
    if (isEmpty(board.polarityConfirmed)) issues.push(req('boards', 'Supply Polarity Confirmed', 'polarityConfirmed', bid));
    if (isEmpty(board.phaseSequence)) issues.push(req('boards', 'Phase Sequence Confirmed', 'phaseSequence', bid));
    if (isEmpty(board.ipfAtDb)) issues.push(req('boards', 'Prospective Fault Current (Ipf at DB)', 'ipfAtDb', bid));
    if (isEmpty(board.mainSwitchBs)) issues.push(req('boards', 'Main Switch - BS (EN)', 'mainSwitchBs', bid));
    if (isEmpty(board.mainSwitchRating)) issues.push(req('boards', 'Main Switch - Rated Current', 'mainSwitchRating', bid));
    if (isEmpty(board.mainSwitchIpf)) issues.push(req('boards', 'Main Switch - IPF Rating', 'mainSwitchIpf', bid));
    if (isEmpty(board.rcdRating)) issues.push(req('boards', 'Main Switch - RCD Rating', 'rcdRating', bid));
    if (isEmpty(board.rcdTripTime)) issues.push(req('boards', 'Main Switch - RCD Trip Time', 'rcdTripTime', bid));
    if (isEmpty(board.spdType)) issues.push(req('boards', 'SPD - Type', 'spdType', bid));
    if (isEmpty(board.spdStatus)) issues.push(req('boards', 'SPD - Operation Status Confirmed', 'spdStatus', bid));
    if (isEmpty(board.ocpdBs)) issues.push(req('boards', 'Overcurrent Device - BS (EN)', 'ocpdBs', bid));
    if (isEmpty(board.ocpdVoltage)) issues.push(req('boards', 'Overcurrent Device - Voltage Rating', 'ocpdVoltage', bid));
    if (isEmpty(board.ocpdRating)) issues.push(req('boards', 'Overcurrent Device - Rated Current', 'ocpdRating', bid));

    let incompleteCircuitFields = 0;
    for (const c of board.circuits) {
      if (isEmpty(c.description)) incompleteCircuitFields++;
      if (isEmpty(c.ocpdBs)) incompleteCircuitFields++;
      if (isEmpty(c.ocpdRatingA)) incompleteCircuitFields++;
      if (isEmpty(c.zs)) incompleteCircuitFields++;
    }
    if (board.circuits.length === 0) incompleteCircuitFields += 6;
    if (incompleteCircuitFields > 0) {
      issues.push({
        id: `boards:${bid}:circuits`,
        section: 'boards',
        label: `Circuits: ${incompleteCircuitFields} fields incomplete`,
        boardId: bid,
      });
    }
  }

  return issues;
}
