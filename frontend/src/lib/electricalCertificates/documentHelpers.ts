import { emptyBoard, newId } from './documentDefaults';
import type { BoardRecord, CertificatePhoto, CircuitRow, ElectricalCertificateDocument } from './types';

export function cloneCircuit(circuit: CircuitRow): CircuitRow {
  return {
    ...circuit,
    id: newId('c'),
    calcOverrides: circuit.calcOverrides ? { ...circuit.calcOverrides } : {},
  };
}

export function cloneBoard(board: BoardRecord, nameSuffix = ' copy'): BoardRecord {
  const base = emptyBoard();
  return {
    ...base,
    ...board,
    id: newId('db'),
    name: `${board.name.trim() || 'DB'}${nameSuffix}`.trim(),
    status: 'in_progress',
    circuits: board.circuits.map(cloneCircuit),
    photos: board.photos.map((p) => ({ ...p, id: newId('ph') })),
  };
}

export function clonePhoto(photo: CertificatePhoto): CertificatePhoto {
  return { ...photo, id: newId('ph') };
}

export function cloneDocument(doc: ElectricalCertificateDocument): ElectricalCertificateDocument {
  const base = {
    ...doc,
    boards: doc.boards.map((b) => cloneBoard(b, '')),
    observations: {
      ...doc.observations,
      items: doc.observations.items.map((o) => ({ ...o, id: newId('obs') })),
    },
    inspectionSchedule: { ...doc.inspectionSchedule },
    appendix: {
      ...doc.appendix,
      photos: doc.appendix.photos.map(clonePhoto),
    },
  };
  if (doc.fireAlarm) {
    base.fireAlarm = {
      ...doc.fireAlarm,
      variations: doc.fireAlarm.variations.map((v) => ({
        ...v,
        id: newId('fav'),
        photos: v.photos.map(clonePhoto),
      })),
      inspectionSchedule: { ...doc.fireAlarm.inspectionSchedule },
    };
  }
  if (doc.domesticFireAlarm) {
    base.domesticFireAlarm = {
      ...doc.domesticFireAlarm,
      variations: doc.domesticFireAlarm.variations.map((v) => ({
        ...v,
        id: newId('dfv'),
        photos: v.photos.map(clonePhoto),
      })),
      checklist: { ...doc.domesticFireAlarm.checklist },
      detectors: doc.domesticFireAlarm.detectors.map((d) => ({
        ...d,
        id: newId('dfdet'),
        photos: d.photos.map(clonePhoto),
      })),
    };
  }
  if (doc.domesticFireAlarmInst) {
    base.domesticFireAlarmInst = {
      ...doc.domesticFireAlarmInst,
      testSchedule: {
        ...doc.domesticFireAlarmInst.testSchedule,
        additionalTests: doc.domesticFireAlarmInst.testSchedule.additionalTests.map((t) => ({
          ...t,
          id: newId('dfitest'),
        })),
      },
    };
  }
  if (doc.fireExtinguisher) {
    base.fireExtinguisher = {
      ...doc.fireExtinguisher,
      checklist: { ...doc.fireExtinguisher.checklist },
      checklistNotes: { ...doc.fireExtinguisher.checklistNotes },
      extinguishers: doc.fireExtinguisher.extinguishers.map((item) => ({
        ...item,
        id: newId('fex'),
        photos: item.photos.map(clonePhoto),
      })),
      blankets: doc.fireExtinguisher.blankets.map((item) => ({
        ...item,
        id: newId('fbl'),
        photos: item.photos.map(clonePhoto),
      })),
    };
  }
  if (doc.emergencyLighting) {
    base.emergencyLighting = {
      ...doc.emergencyLighting,
      modifications: doc.emergencyLighting.modifications.map((item) => ({
        ...item,
        id: newId('emmod'),
        photos: item.photos.map(clonePhoto),
      })),
      testSchedule: doc.emergencyLighting.testSchedule.map((item) => ({
        ...item,
        id: newId('emtest'),
        photos: item.photos.map(clonePhoto),
      })),
      faultsAndRepairs: doc.emergencyLighting.faultsAndRepairs.map((item) => ({
        ...item,
        id: newId('emfault'),
        photos: item.photos.map(clonePhoto),
      })),
    };
  }
  if (doc.electricalInstallation) {
    base.electricalInstallation = {
      ...doc.electricalInstallation,
      design: {
        ...doc.electricalInstallation.design,
        designer1: { ...doc.electricalInstallation.design.designer1 },
        designer2: { ...doc.electricalInstallation.design.designer2 },
      },
      construction: {
        ...doc.electricalInstallation.construction,
        constructorSignatory: { ...doc.electricalInstallation.construction.constructorSignatory },
      },
      inspection: {
        ...doc.electricalInstallation.inspection,
        inspector: { ...doc.electricalInstallation.inspection.inspector },
      },
    };
  }
  return base;
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) {
    return items;
  }
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function replaceInCircuits(
  circuits: CircuitRow[],
  column: keyof CircuitRow,
  find: string,
  replace: string,
): CircuitRow[] {
  if (!find) return circuits;
  return circuits.map((c) => {
    const raw = c[column];
    if (typeof raw !== 'string') return c;
    if (!raw.includes(find)) return c;
    return { ...c, [column]: raw.split(find).join(replace) };
  });
}
