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

const WORK_TYPE_LABELS: Record<string, string> = {
  new: 'New installation',
  addition: 'Addition to existing installation',
  alteration: 'Alteration to existing installation',
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

function circuitValue(c: CircuitRow, key: CircuitScheduleKey): string {
  if (key === 'insulationLE') return c.insulationLE || c.insulation || '';
  return c[key] ?? '';
}

function signatoryRows(
  h: PdfHelpers,
  title: string,
  s: { name: string; signature: string; date: string; company: string; phone: string; address: string; postcode: string },
): string {
  return `<h3>${h.esc(title)}</h3><table class="kv">
    ${h.row('Name', s.name)}
    ${h.row('Signature', s.signature)}
    ${h.row('Date', s.date)}
    ${h.row('Company', s.company)}
    ${h.row('Phone', s.phone)}
    ${h.row('Address', s.address)}
    ${h.row('Postcode', s.postcode)}
  </table>`;
}

export function buildElectricalInstallationCertificatePdfHtml(input: CertificatePdfInput, h: PdfHelpers): string {
  const { document: doc, branding: b } = input;
  const eic = doc.electricalInstallation;
  if (!eic) throw new Error('ELECTRICAL_INSTALLATION_DOCUMENT_MISSING');
  const inst = doc.installation;
  const sup = doc.supply;
  const workTypes = [
    eic.details.newInstallation ? 'New installation' : '',
    eic.details.additionToExisting ? 'Addition to existing installation' : '',
    eic.details.alterationToExisting ? 'Alteration to existing installation' : '',
    eic.details.replacementDistributionBoard ? 'Replacement of a distribution board' : '',
  ].filter(Boolean).join(', ');

  const inspectionRows = [...new Set(INSPECTION_SCHEDULE_ITEMS.map((item) => item.section))]
    .map((section) => {
      const rows = INSPECTION_SCHEDULE_ITEMS.filter((item) => item.section === section)
        .map((item) => {
          const outcome = doc.inspectionSchedule[item.id] ?? '';
          return `<tr><td class="mono">${h.esc(item.id)}</td><td>${h.esc(item.label)}</td><td class="outcome">${h.esc(OUTCOME_LABELS[outcome] ?? outcome)}</td></tr>`;
        })
        .join('');
      return `<h3>${h.esc(section)}. ${h.esc(INSPECTION_SECTION_LABELS[section] ?? section)}</h3><table class="sched"><thead><tr><th>Ref</th><th>Description</th><th>Outcome</th></tr></thead><tbody>${rows}</tbody></table>`;
    })
    .join('');

  const boardsHtml = doc.boards
    .map((board) => {
      const circuits = board.circuits
        .map(
          (c) => `<tr>${CIRCUIT_SCHEDULE_COLUMNS.map(([, key]) => `<td>${h.esc(circuitValue(c, key))}</td>`).join('')}</tr>`,
        )
        .join('');
      const headers = CIRCUIT_SCHEDULE_COLUMNS.map(([label]) => `<th>${h.esc(label)}</th>`).join('');
      const colgroup = CIRCUIT_SCHEDULE_COLUMNS.map(([, , width]) => `<col style="width:${width}">`).join('');
      return `<section class="circuit-page">
        <h2>Schedule of circuit details and test results - ${h.esc(board.name)}</h2>
        <table class="board-details">
          <tbody>
            <tr>
              <td><strong>Location:</strong> ${h.esc(board.location)}</td>
              <td><strong>Manufacturer:</strong> ${h.esc(board.manufacturer)}</td>
              <td><strong>Supplied from:</strong> ${h.esc(board.suppliedFrom)}</td>
              <td><strong>Polarity:</strong> ${h.esc(board.polarityConfirmed)}</td>
              <td><strong>Phases:</strong> ${h.esc(board.phases)}</td>
              <td><strong>Phase seq:</strong> ${h.esc(board.phaseSequence)}</td>
            </tr>
            <tr>
              <td><strong>Zs at DB:</strong> ${h.esc(board.zsAtDb)} Ω</td>
              <td><strong>Ipf at DB:</strong> ${h.esc(board.ipfAtDb)} kA</td>
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
<title>${h.esc(input.certificateNumber)} - Electrical Installation Certificate</title>
<style>${h.certificatePdfStyles(b.accent_color, b.accent_end_color, '8.2pt')}
  @page circuitSchedule { size: A4 landscape; margin: 6mm; }
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
  ${h.certificateHeaderHtml(input, 'Electrical Installation Certificate', eic.details.amendedTo || 'BS 7671')}

  <section class="block">
    <h2>Details of client and installation</h2>
    <table class="kv">
      ${h.row('Client', inst.hideClientOnReport ? 'Client withheld on certificate' : input.customerName ?? '-')}
      ${h.row('Installation address', input.installationLabel ?? '-')}
      ${h.row('Occupier', inst.occupierName)}
      ${h.row('Description of premises', eic.details.premisesType)}
      ${h.row('Work type', workTypes || WORK_TYPE_LABELS[eic.details.workType] || eic.details.workType)}
      ${h.row('Description of installation', eic.details.description)}
      ${h.row('Extent covered by this certificate', eic.details.extent || inst.extent)}
      ${h.row('Schedules of circuit details attached', eic.details.circuitDetailsSchedules)}
      ${h.row('Schedules of test results attached', eic.details.testResultSchedules)}
    </table>
  </section>

  <section class="block">
    <h2>For design</h2>
    <table class="kv">
      ${h.row('Departures from BS 7671', eic.design.departures)}
      ${h.row('Permitted exceptions', eic.design.permittedExceptions)}
      ${h.row('Risk assessment attached', eic.design.riskAssessment)}
    </table>
  </section>

  <section class="block">
    <h2>For construction</h2>
    <table class="kv">${h.row('Departures from BS 7671', eic.construction.departures)}</table>
  </section>

  <section class="block">
    <h2>For inspection and testing</h2>
    <table class="kv">
      ${h.row('Departures from BS 7671', eic.inspection.departures)}
      ${h.row('Next inspection interval', eic.inspection.nextInspectionInterval)}
      ${h.row('Comments on existing installation', eic.details.commentsOnExistingInstallation)}
    </table>
  </section>

  <section class="block">
    <h2>Supply characteristics and particulars of installation</h2>
    <table class="kv">
      ${h.row('Earthing arrangement', sup.earthing)}
      ${h.row('Live conductors', sup.phases)}
      ${h.row('Nominal voltage U / Uo', [sup.nominalU, sup.nominalUo].filter(Boolean).join(' / '))}
      ${h.row('Nominal frequency', sup.frequency)}
      ${h.row('Ipf', sup.ipf)}
      ${h.row('Ze', sup.ze)}
      ${h.row('Supply protective device', [sup.supplyDeviceBs, sup.supplyDeviceType, sup.supplyDeviceA].filter(Boolean).join(' '))}
      ${h.row('Main switch location', sup.mainSwitchLocation)}
      ${h.row('Main switch', [sup.mainSwitchBs, sup.mainSwitchPoles, sup.mainSwitchIn].filter(Boolean).join(' '))}
      ${h.row('Earthing conductor', [sup.earthMaterial, sup.earthCsa].filter(Boolean).join(' '))}
      ${h.row('Main bonding conductor', [sup.bondMaterial, sup.bondCsa].filter(Boolean).join(' '))}
    </table>
  </section>

  <section class="block"><h2>Schedule of inspections</h2>${inspectionRows}</section>
  ${boardsHtml}

  <section class="block">
    <h2>Particulars of signatories</h2>
    ${signatoryRows(h, 'Designer No. 1', eic.design.designer1)}
    ${
      eic.design.designer2NotApplicable
        ? '<h3>Designer No. 2</h3><table class="kv"><tr><td class="lbl">Status</td><td>N/A</td></tr></table>'
        : eic.design.designer2.name.trim()
          ? signatoryRows(h, 'Designer No. 2', eic.design.designer2)
          : ''
    }
    ${signatoryRows(h, 'Constructor', eic.construction.constructorSignatory)}
    ${signatoryRows(h, 'Inspector', eic.inspection.inspector)}
  </section>

  ${doc.appendix.content.trim() ? `<section class="block"><h2>Appendix</h2><p style="white-space:pre-wrap">${h.esc(doc.appendix.content)}</p></section>` : ''}
  ${boardPhotos.length ? h.photosHtml(boardPhotos, 'Board photographs') : ''}
  ${doc.appendix.photos.length ? h.photosHtml(doc.appendix.photos, 'Appendix photographs') : ''}
  ${h.certificateFooterHtml(b, input.certificateNumber)}
</body>
</html>`;
}
