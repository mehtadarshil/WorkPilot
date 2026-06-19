import type { CertificatePdfInput } from './certificatePdfHtml';
import { INSPECTION_SCHEDULE_ITEMS, INSPECTION_SECTION_LABELS } from './inspectionScheduleItems';
import type { CircuitRow, InspectionOutcome } from './types';

type PdfHelpers = {
  esc: (value: string) => string;
  row: (label: string, value: string) => string;
  photosHtml: (photos: { caption: string; dataUrl: string }[], title: string) => string;
  certificatePdfStyles: (accent: string, accentEnd: string, fontSize?: string) => string;
  certificateHeaderHtml: (input: CertificatePdfInput, title: string, subtitle?: string) => string;
  certificateFooterHtml: (branding: CertificatePdfInput['branding'], certificateNumber: string) => string;
};

const OUTCOME_LABELS: Record<InspectionOutcome, string> = {
  '': '-',
  pass: 'OK',
  c1: 'C1',
  c2: 'C2',
  c3: 'C3',
  fi: 'FI',
  lim: 'LIM',
  nv: 'N/V',
  na: 'N/A',
  x: 'X',
};

const CIRCUIT_SCHEDULE_COLUMNS = [
  ['No', 'circuitNumber', '4.2mm'],
  ['Description', 'description', '24mm'],
  ['No. points', 'points', '6mm'],
  ['Wiring type', 'wiringType', '7mm'],
  ['Ref method', 'refMethod', '7mm'],
  ['Live mm²', 'liveMm2', '7mm'],
  ['CPC mm²', 'cpcMm2', '7mm'],
  ['Max disconnect secs', 'maxDisconnectTime', '8mm'],
  ['OCPD BS (EN)', 'ocpdBs', '11mm'],
  ['OCPD Type', 'ocpdType', '7mm'],
  ['OCPD A', 'ocpdRatingA', '7mm'],
  ['Breaking kA', 'ocpdBreakingKa', '8mm'],
  ['Max Zs Ω', 'maxZs', '8mm'],
  ['RCD BS (EN)', 'rcdBs', '10mm'],
  ['RCD Type', 'rcdType', '7mm'],
  ['IΔn mA', 'rcdRatingMa', '7mm'],
  ['RCD A', 'rcdRatingA', '7mm'],
  ['r1 Ω', 'ringR1', '7mm'],
  ['rn Ω', 'ringRn', '7mm'],
  ['r2 Ω', 'ringR2End', '7mm'],
  ['R1+R2 Ω', 'r1r2', '8mm'],
  ['R2 Ω', 'r2', '7mm'],
  ['IR V', 'insulationTestVoltage', '7mm'],
  ['IR L-L MΩ', 'insulationLL', '8mm'],
  ['IR L-E MΩ', 'insulationLE', '8mm'],
  ['Polarity', 'polarity', '9mm'],
  ['Measured Zs Ω', 'zs', '8mm'],
  ['RCD ms', 'rcdTripMs', '8mm'],
  ['AFDD', 'afdd', '7mm'],
  ['Remarks', 'remarks', '12mm'],
] as const;

type CircuitScheduleKey = (typeof CIRCUIT_SCHEDULE_COLUMNS)[number][1];

function circuitValue(circuit: CircuitRow, key: CircuitScheduleKey): string {
  if (key === 'insulationLE') return circuit.insulationLE || circuit.insulation || '';
  return circuit[key] ?? '';
}

export function buildEicrCertificatePdfHtml(input: CertificatePdfInput, h: PdfHelpers): string {
  const { document: doc, branding: b } = input;
  const inst = doc.installation;
  const sup = doc.supply;

  const clientLine = inst.hideClientOnReport
    ? 'Client withheld on report'
    : h.esc(input.customerName ?? '-');

  const inspectionRows = [...new Set(INSPECTION_SCHEDULE_ITEMS.map((item) => item.section))]
    .map((section) => {
      const rows = INSPECTION_SCHEDULE_ITEMS.filter((item) => item.section === section)
        .map((item) => {
          const outcome = doc.inspectionSchedule[item.id] ?? '';
          if (item.id === '5.12' || item.id === '5.17') {
            return `<tr class="sched-subheading"><td class="mono" style="font-weight:bold">${h.esc(item.id)}</td><td colspan="2" style="font-weight:bold">${h.esc(item.label)}</td></tr>`;
          }
          return `<tr><td class="mono">${h.esc(item.id)}</td><td>${h.esc(item.label)}</td><td class="outcome">${h.esc(OUTCOME_LABELS[outcome] ?? outcome)}</td></tr>`;
        })
        .join('');
      return `<section class="schedule-section"><h3>${h.esc(section)}. ${h.esc(INSPECTION_SECTION_LABELS[section] ?? section)}</h3><table class="sched"><thead><tr><th>Item no</th><th>Description</th><th>Outcome</th></tr></thead><tbody>${rows}</tbody></table></section>`;
    })
    .join('');

  const observationsHtml = doc.observations.items.length > 0
    ? `<ul>${doc.observations.items
        .map((item) => `<li><strong>${h.esc(item.code.toUpperCase())}</strong> ${h.esc(item.location)}: ${h.esc(item.details)}</li>`)
        .join('')}</ul>`
    : '<p class="muted">None recorded</p>';

  const boardsHtml = doc.boards
    .map((board) => {
      const circuits = board.circuits
        .map(
          (circuit) => `<tr>${CIRCUIT_SCHEDULE_COLUMNS.map(([, key]) => `<td>${h.esc(circuitValue(circuit, key))}</td>`).join('')}</tr>`,
        )
        .join('');
      const headers = CIRCUIT_SCHEDULE_COLUMNS.map(([label]) => `<th>${h.esc(label)}</th>`).join('');
      const colgroup = CIRCUIT_SCHEDULE_COLUMNS.map(([, , width]) => `<col style="width:${width}">`).join('');
      return `<section class="circuit-page">
        <h2>Distribution Board - ${h.esc(board.name)}</h2>
        <table class="board-details">
          <tbody>
            <tr>
              <td><strong>Location:</strong> ${h.esc(board.location)}</td>
              <td><strong>Manufacturer:</strong> ${h.esc(board.manufacturer)}</td>
              <td><strong>Supplied from:</strong> ${h.esc(board.suppliedFrom)}</td>
              <td><strong>Polarity confirmed:</strong> ${h.esc(board.polarityConfirmed)}</td>
              <td><strong>Phases:</strong> ${h.esc(board.phases)}</td>
              <td><strong>Phase seq:</strong> ${h.esc(board.phaseSequence)}</td>
            </tr>
            <tr>
              <td><strong>Zs at DB:</strong> ${h.esc(board.zsAtDb)} Ω</td>
              <td><strong>IPF at DB:</strong> ${h.esc(board.ipfAtDb)} kA</td>
              <td><strong>Main switch:</strong> ${h.esc([board.mainSwitchBs, board.mainSwitchVoltage, board.mainSwitchRating].filter(Boolean).join(' / '))}</td>
              <td><strong>RCD:</strong> ${h.esc([board.rcdRating, board.rcdTripTime].filter(Boolean).join(' / '))}</td>
              <td><strong>SPD:</strong> ${h.esc([board.spdType, board.spdStatus].filter(Boolean).join(' / '))}</td>
              <td><strong>OCPD:</strong> ${h.esc([board.ocpdBs, board.ocpdVoltage, board.ocpdRating].filter(Boolean).join(' / '))}</td>
            </tr>
            ${board.notes.trim() ? `<tr><td colspan="6"><strong>Notes:</strong> ${h.esc(board.notes)}</td></tr>` : ''}
          </tbody>
        </table>
        <table class="sched circuit-schedule">
          <colgroup>${colgroup}</colgroup>
          <thead><tr>${headers}</tr></thead>
          <tbody>${circuits || `<tr><td colspan="${CIRCUIT_SCHEDULE_COLUMNS.length}" class="muted">No circuits recorded</td></tr>`}</tbody>
        </table>
      </section>`;
    })
    .join('');

  const boardPhotos = doc.boards.flatMap((board) => board.photos ?? []);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${h.esc(input.certificateNumber)} - EICR</title>
<style>
${h.certificatePdfStyles(b.accent_color, b.accent_end_color, '8.4pt')}
  @page circuitSchedule { size: A4 landscape; margin: 6mm; }
  .inspection-schedule { page-break-before: page; break-before: page; page-break-inside: auto; }
  .schedule-section { page-break-inside: avoid; break-inside: avoid; margin-bottom: 7px; }
  .schedule-section h3 { margin-top: 0; }
  .schedule-section .sched { font-size: 6.8pt; }
  .schedule-section .sched th, .schedule-section .sched td { padding: 2.2px 3px; line-height: 1.15; }
  .schedule-section .mono { width: 38px; white-space: nowrap; }
  .circuit-page {
    page: circuitSchedule;
    break-before: page;
    break-after: page;
    page-break-inside: auto;
    margin: 0;
    padding: 0;
    border: 0;
    background: #fff;
  }
  .circuit-page h2 { margin: 0 0 3px; padding: 4px 6px; font-size: 9pt; background: #111; color: #fff; }
  .board-details { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 4px; font-size: 6.2pt; }
  .board-details td { border: 1px solid #b7b7b7; padding: 2px 3px; background: #f3f4f6; vertical-align: top; }
  .circuit-schedule { width: 100%; font-size: 5.7pt; table-layout: fixed; border: 1px solid #8b8b8b; }
  .circuit-schedule th, .circuit-schedule td {
    padding: 1.4px 1.8px;
    line-height: 1.08;
    word-break: break-word;
    overflow-wrap: anywhere;
    vertical-align: middle;
    text-align: center;
  }
  .circuit-schedule th { background: #d9d9d9; font-size: 5pt; font-weight: 800; }
  .circuit-schedule th:nth-child(2), .circuit-schedule td:nth-child(2), .circuit-schedule th:last-child, .circuit-schedule td:last-child { text-align: left; }
  .circuit-schedule thead { display: table-header-group; }
  .circuit-schedule tr { page-break-inside: avoid; }
</style>
</head>
<body>
  ${h.certificateHeaderHtml(input, 'Electrical Installation Condition Report', 'BS 7671 - 18th Edition Amd 3')}

  <section class="block">
    <h2>Certificate details</h2>
    <table class="kv">
      ${h.row('Client', clientLine)}
      ${h.row('Installation', input.installationLabel ?? '-')}
      ${h.row('Job number', input.jobNumber ?? '')}
      ${h.row('Reason for report', inst.reason)}
      ${h.row('Inspection date', inst.inspectionDate)}
      ${h.row('Premises type', inst.premisesType)}
      ${h.row('Overall assessment', inst.overallAssessment)}
      ${h.row('General condition', inst.generalCondition)}
      ${h.row('Extent covered', inst.extent)}
      ${h.row('Reinspection period', inst.reinspectionPeriod)}
    </table>
  </section>

  <section class="block"><h2>Observations and recommendations</h2>${observationsHtml}</section>

  <section class="block">
    <h2>Supply characteristics</h2>
    <table class="kv">
      ${h.row('Earthing arrangement', sup.earthing)}
      ${h.row('Ze (Ω)', sup.ze)}
      ${h.row('Prospective fault current', sup.ipf)}
      ${h.row('Nominal voltage U / Uo', `${sup.nominalU} / ${sup.nominalUo}`)}
      ${h.row('Number of phases', sup.phases)}
    </table>
  </section>

  <section class="block inspection-schedule"><h2>Inspection schedule</h2>${inspectionRows}</section>
  ${boardsHtml || '<section class="block"><h2>Distribution boards</h2><p class="muted">No boards</p></section>'}

  ${doc.appendix.content.trim() ? `<section class="block"><h2>Appendix notes</h2><p style="white-space:pre-wrap">${h.esc(doc.appendix.content)}</p></section>` : ''}
  ${boardPhotos.length ? h.photosHtml(boardPhotos, 'Board photographs') : ''}
  ${doc.appendix.photos.length ? h.photosHtml(doc.appendix.photos, 'Appendix photographs') : ''}

  <section class="block">
    <h2>Declaration</h2>
    <table class="kv">
      ${h.row('Inspected and tested by', inst.inspectedBy)}
      ${h.row('Inspector position', inst.inspectedPosition)}
      ${h.row('Inspected date', inst.inspectedDate)}
      ${h.row('Authorised for issue by', inst.authorisedBy)}
      ${h.row('Authorised position', inst.authorisedPosition)}
      ${h.row('Authorised date', inst.authorisedDate)}
    </table>
  </section>

  ${h.certificateFooterHtml(b, input.certificateNumber)}
</body>
</html>`;
}
