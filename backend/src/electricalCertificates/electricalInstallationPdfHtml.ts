import type { CertificatePdfInput } from './certificatePdfHtml';
import { boardCircuitPageHtml } from './certificatePrint/circuitScheduleHtml';
import { CERTIFICATE_PRINT_CSS } from './certificatePrint/printStyles';
import {
  inspectionOutcomeBadgeHtml,
  inspectionScheduleLegendHtml,
} from './certificatePrint/outcomes';
import { signatureBlockHtml } from './certificatePrint/signatureHtml';
import { INSPECTION_SCHEDULE_ITEMS, INSPECTION_SECTION_LABELS } from './inspectionScheduleItems';

type PdfHelpers = {
  esc: (value: string) => string;
  row: (label: string, value: string) => string;
  photosHtml: (photos: { caption: string; dataUrl: string }[], title: string) => string;
  certificatePdfStyles: (accent: string, accentEnd: string, fontSize?: string) => string;
  certificateHeaderHtml: (input: CertificatePdfInput, title: string, subtitle?: string) => string;
  certificateFooterHtml: (branding: CertificatePdfInput['branding'], certificateNumber: string) => string;
};

const WORK_TYPE_LABELS: Record<string, string> = {
  new: 'New installation',
  addition: 'Addition to existing installation',
  alteration: 'Alteration to existing installation',
};

function signatoryRows(
  h: PdfHelpers,
  title: string,
  s: { name: string; signature: string; date: string; company: string; phone: string; address: string; postcode: string },
): string {
  return `<h3>${h.esc(title)}</h3><table class="kv">
    ${h.row('Name', s.name)}
    <tr><td class="lbl">Signature</td><td>${signatureBlockHtml(s.signature, h.esc, s.signature, '')}</td></tr>
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
          if (item.id === '5.12' || item.id === '5.17') {
            return `<tr class="sched-subheading"><td class="mono" style="font-weight:bold">${h.esc(item.id)}</td><td colspan="2" style="font-weight:bold">${h.esc(item.label)}</td></tr>`;
          }
          return `<tr><td class="mono">${h.esc(item.id)}</td><td>${h.esc(item.label)}</td><td class="outcome">${inspectionOutcomeBadgeHtml(outcome, h.esc)}</td></tr>`;
        })
        .join('');
      return `<section class="schedule-section"><h3 class="cp-schedule-section-title">${h.esc(section)}. ${h.esc(INSPECTION_SECTION_LABELS[section] ?? section)}</h3><table class="sched"><thead><tr><th>Ref</th><th>Description</th><th>Outcome</th></tr></thead><tbody>${rows}</tbody></table></section>`;
    })
    .join('');

  const boardsHtml = doc.boards
    .map((board) =>
      boardCircuitPageHtml(board, h.esc, {
        testedBy: eic.inspection.inspector.name,
        position: '',
        testedDate: eic.inspection.inspector.date,
      }),
    )
    .join('');

  const boardPhotos = doc.boards.flatMap((board) => board.photos ?? []);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${h.esc(input.certificateNumber)} - Electrical Installation Certificate</title>
<style>${h.certificatePdfStyles(b.accent_color, b.accent_end_color, '8.2pt')}
${CERTIFICATE_PRINT_CSS}
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

  <section class="block"><h2>Schedule of inspections</h2>${inspectionScheduleLegendHtml(h.esc)}${inspectionRows}</section>
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
