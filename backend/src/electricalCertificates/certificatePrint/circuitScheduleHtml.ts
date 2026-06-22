import type { BoardRecord, CircuitRow } from '../types';
import {
  PRINT_CIRCUIT_COLUMNS,
  circuitCellValue,
  printCircuitColumnGroups,
} from './circuitScheduleColumns';
import { printCheckmarkHtml } from './outcomes';

function circuitCellHtml(
  circuit: CircuitRow,
  col: (typeof PRINT_CIRCUIT_COLUMNS)[number],
  esc: (s: string) => string,
): string {
  const raw = circuitCellValue(circuit, col.key);
  if (col.checkmark) return printCheckmarkHtml(raw, esc);
  return esc(raw);
}

export function circuitScheduleTableHtml(circuits: CircuitRow[], esc: (s: string) => string): string {
  const groups = printCircuitColumnGroups();
  const colgroup = PRINT_CIRCUIT_COLUMNS.map((col) => `<col style="width:${col.widthMm}mm">`).join('');
  const groupRow = groups
    .map((g, i) => `<th colspan="${g.span}">${esc(g.label)}</th>`)
    .join('');
  const colRow = PRINT_CIRCUIT_COLUMNS.map((col) => {
    const cls = col.vertical && !col.description ? 'cp-th-v' : 'cp-th-h';
    const label = col.vertical && !col.description ? col.shortLabel : col.label;
    return `<th class="${cls}">${esc(label)}</th>`;
  }).join('');

  const body =
    circuits.length > 0
      ? circuits
          .map(
            (circuit) =>
              `<tr>${PRINT_CIRCUIT_COLUMNS.map((col) => {
                const cls = col.description ? ' class="cp-desc"' : '';
                return `<td${cls}>${circuitCellHtml(circuit, col, esc)}</td>`;
              }).join('')}</tr>`,
          )
          .join('')
      : `<tr><td colspan="${PRINT_CIRCUIT_COLUMNS.length}" class="cp-check-muted">No circuits recorded</td></tr>`;

  return `<table class="cp-circuit-table"><colgroup>${colgroup}</colgroup>
    <thead><tr class="cp-group-row">${groupRow}</tr><tr class="cp-col-row">${colRow}</tr></thead>
    <tbody>${body}</tbody></table>`;
}

export function boardDetailsGridHtml(board: BoardRecord, esc: (s: string) => string): string {
  const mainSwitch = [board.mainSwitchBs, board.mainSwitchVoltage, board.mainSwitchRating].filter(Boolean).join(' / ');
  const rcd = [board.rcdRating, board.rcdTripTime].filter(Boolean).join(' / ');
  const spd = [board.spdType, board.spdStatus].filter(Boolean).join(' / ');
  const ocpd = [board.ocpdBs, board.ocpdVoltage, board.ocpdRating].filter(Boolean).join(' / ');
  const notesRow = board.notes.trim()
    ? `<tr><td colspan="6"><strong>Notes:</strong> ${esc(board.notes)}</td></tr>`
    : '';

  return `<p class="cp-board-subtitle">${esc(board.name)} — Board details</p>
    <table class="cp-board-details"><tbody>
      <tr>
        <td><strong>Location:</strong> ${esc(board.location || '—')}</td>
        <td><strong>Manufacturer:</strong> ${esc(board.manufacturer || '—')}</td>
        <td><strong>Supplied from:</strong> ${esc(board.suppliedFrom || '—')}</td>
        <td><strong>Polarity confirmed:</strong> ${printCheckmarkHtml(board.polarityConfirmed, esc)}</td>
        <td><strong>Phases:</strong> ${esc(board.phases || '—')}</td>
        <td><strong>Phase seq:</strong> ${esc(board.phaseSequence || '—')}</td>
      </tr>
      <tr>
        <td><strong>Zs at DB:</strong> ${board.zsAtDb ? `${esc(board.zsAtDb)} Ω` : '—'}</td>
        <td><strong>IPF at DB:</strong> ${board.ipfAtDb ? `${esc(board.ipfAtDb)} kA` : '—'}</td>
        <td><strong>Main switch:</strong> ${esc(mainSwitch || '—')}</td>
        <td><strong>RCD:</strong> ${esc(rcd || '—')}</td>
        <td><strong>SPD:</strong> ${esc(spd || '—')}</td>
        <td><strong>OCPD:</strong> ${esc(ocpd || '—')}</td>
      </tr>
      ${notesRow}
    </tbody></table>`;
}

export function boardTestingFooterHtml(
  boardName: string,
  testedBy: string,
  position: string,
  testedDate: string,
  esc: (s: string) => string,
): string {
  if (!testedBy && !position && !testedDate) return '';
  const parts: string[] = [`<strong>${esc(boardName)} — Testing information</strong>`];
  if (testedBy) parts.push(`<strong>Tested by:</strong> ${esc(testedBy)}`);
  if (position) parts.push(`<strong>Position:</strong> ${esc(position)}`);
  if (testedDate) parts.push(`<strong>Date tested:</strong> ${esc(testedDate)}`);
  return `<div class="cp-board-testing">${parts.join(' · ')}</div>`;
}

export function boardCircuitPageHtml(
  board: BoardRecord,
  esc: (s: string) => string,
  testing?: { testedBy: string; position: string; testedDate: string },
): string {
  const testingHtml = testing
    ? boardTestingFooterHtml(board.name, testing.testedBy, testing.position, testing.testedDate, esc)
    : '';
  return `<section class="circuit-page">
    <h2 class="cp-board-title">Distribution Board — ${esc(board.name)}</h2>
    ${boardDetailsGridHtml(board, esc)}
    ${circuitScheduleTableHtml(board.circuits, esc)}
    ${testingHtml}
  </section>`;
}
