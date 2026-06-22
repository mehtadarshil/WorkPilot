import type { BoardRecord, CircuitRow } from './types';
import { emptyCircuit } from './documentDefaults';
import { applyCircuitCalculations } from './circuitCalculations';
import { applySpareOrUnknownCircuitDefaults } from './circuitGridUtils';
import type { CircuitQuickAddTemplate } from './circuitQuickAddTemplates';

export function buildCircuitFromQuickAddTemplate(
  template: CircuitQuickAddTemplate,
  board: BoardRecord,
  circuitNumber: string,
): CircuitRow {
  let circuit = emptyCircuit();
  circuit.circuitNumber = circuitNumber;
  circuit = { ...circuit, ...template.patch };

  if (template.spareOrUnknown) {
    circuit = applySpareOrUnknownCircuitDefaults(circuit);
  } else {
    circuit = applyCircuitCalculations(circuit, board, board.maxZsUse100Percent);
  }

  return circuit;
}
