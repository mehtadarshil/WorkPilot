import type { CertificatePdfInput } from './certificatePdfHtml';
import { pdfBlock } from './certificatePdfHtml';
import { boardCircuitPageHtml } from './certificatePrint/circuitScheduleHtml';
import { EICR_RECIPIENT_GUIDANCE, EICR_RECOMMENDATIONS_INTRO } from './certificatePrint/eicrGuidance';
import { kvTableHtml } from './certificatePrint/kvTableHtml';
import { observationSummaryGridHtml } from './certificatePrint/observationSummary';
import {
  assessmentBannerHtml,
  inspectionOutcomeBadgeHtml,
  inspectionScheduleLegendHtml,
} from './certificatePrint/outcomes';
import { declarationSignatoryHtml } from './certificatePrint/signatureHtml';
import { printPageFooterHtml } from './certificatePrint/pageFooter';
import { CERTIFICATE_PRINT_CSS } from './certificatePrint/printStyles';
import { supplyParticularsHtml } from './certificatePrint/supplyParticularsHtml';
import { INSPECTION_SCHEDULE_ITEMS, INSPECTION_SECTION_LABELS } from './inspectionScheduleItems';

type PdfHelpers = {
  esc: (value: string) => string;
  row: (label: string, value: string) => string;
  photosHtml: (photos: { caption: string; dataUrl: string }[], title: string) => string;
  certificatePdfStyles: (accent: string, accentEnd: string, fontSize?: string) => string;
  certificateHeaderHtml: (input: CertificatePdfInput, title: string, subtitle?: string) => string;
  certificateFooterHtml: (branding: CertificatePdfInput['branding'], certificateNumber: string) => string;
};

export function buildEicrCertificatePdfHtml(input: CertificatePdfInput, h: PdfHelpers): string {
  const { document: doc, branding: b } = input;
  const inst = doc.installation;
  const sup = doc.supply;

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
      return `<section class="schedule-section">
        <h3 class="cp-schedule-section-title">${h.esc(section)}. ${h.esc(INSPECTION_SECTION_LABELS[section] ?? section)}</h3>
        <table class="sched inspection-schedule-table"><thead><tr><th>Item no</th><th>Description</th><th>Outcome</th></tr></thead><tbody>${rows}</tbody></table>
      </section>`;
    })
    .join('');

  const observationsTable = doc.observations.items.length > 0
    ? `<table class="sched"><thead><tr><th>No.</th><th>Observation</th><th>Code</th></tr></thead><tbody>${doc.observations.items
        .map(
          (item, i) =>
            `<tr><td>${i + 1}</td><td>${h.esc(item.location)}: ${h.esc(item.details)}</td><td class="outcome">${inspectionOutcomeBadgeHtml(item.code, h.esc)}</td></tr>`,
        )
        .join('')}</tbody></table>`
    : '<p class="muted">No remedial action is required</p>';

  const boardsHtml = doc.boards
    .map((board) =>
      boardCircuitPageHtml(board, h.esc, {
        testedBy: inst.inspectedBy,
        position: inst.inspectedPosition,
        testedDate: inst.inspectedDate,
      }),
    )
    .join('');

  const boardPhotos = doc.boards.flatMap((board) => board.photos ?? []);
  const overallBanner = assessmentBannerHtml(
    inst.overallAssessment,
    h.esc,
    'Overall assessment of the installation in terms of its suitability for continued use',
  );
  const conditionBanner = assessmentBannerHtml(inst.generalCondition, h.esc, 'General condition of the installation');
  const clientValue = inst.hideClientOnReport ? 'Client withheld on report' : (input.customerName ?? '-');
  const footerBar = printPageFooterHtml(input.certificateNumber, h.esc);
  const observationsCompact = doc.observations.items.length === 0;

  const mainFlow = `<div class="cert-flow">
    ${pdfBlock(
      'Details of client or person ordering report',
      kvTableHtml(
        [
          { label: 'Client', value: clientValue },
          { label: 'Installation', value: input.installationLabel ?? '-' },
          { label: 'Job number', value: input.jobNumber ?? '' },
        ],
        h.esc,
        true,
      ),
      h.esc,
      true,
    )}
    ${pdfBlock(
      'Reason for producing this report',
      kvTableHtml(
        [
          { label: 'Reason', value: inst.reason },
          { label: 'Date inspection carried out', value: inst.inspectionDate },
        ],
        h.esc,
        true,
      ),
      h.esc,
      true,
    )}
    ${pdfBlock(
      'Details of the installation',
      kvTableHtml(
        [
          { label: 'Occupier name', value: inst.occupierName },
          { label: 'Description of premises', value: inst.premisesType },
          { label: 'Installation records available', value: inst.recordsAvailable },
          { label: 'Date of previous inspection', value: inst.previousInspectionDate },
          { label: 'Previous certificate number', value: inst.previousCertNumber },
          { label: 'Evidence of additions/alterations', value: inst.alterationsEvidence },
          { label: 'Estimated age of installation', value: inst.estimatedAge },
        ],
        h.esc,
        true,
      ),
      h.esc,
      false,
    )}
    ${pdfBlock(
      'Extent and limitations of inspection and testing',
      kvTableHtml(
        [
          { label: 'Extent covered', value: inst.extent },
          { label: 'Agreed limitations', value: inst.agreedLimitations },
          { label: 'Agreed with', value: inst.agreedWith },
          { label: 'Operational limitations', value: inst.operationalLimitations },
        ],
        h.esc,
        true,
      ),
      h.esc,
      false,
    )}
    ${pdfBlock(
      'Summary of the condition of the installation',
      `${overallBanner}
    <div class="cp-recommendations">
      <strong>Recommendations</strong>
      ${h.esc(EICR_RECOMMENDATIONS_INTRO)}
      ${inst.reinspectionPeriod.trim() ? `<p style="margin:6px 0 0"><strong>Recommended re-inspection:</strong> ${h.esc(inst.reinspectionPeriod)}</p>` : ''}
    </div>`,
      h.esc,
      true,
    )}
    ${pdfBlock(
      'Observations and recommendations',
      `<p class="muted" style="font-size:7pt;margin-bottom:6px">One of the following codes has been allocated to each observation to indicate the degree of urgency for remedial action.</p>
    ${observationSummaryGridHtml(doc.observations.items, h.esc)}
    ${observationsTable}`,
      h.esc,
      observationsCompact,
    )}
    ${conditionBanner ? `<div class="cp-keep-together" style="margin-bottom:8px">${conditionBanner}</div>` : ''}
    ${pdfBlock(
      'Declaration',
      `<div class="cp-signatory-grid">
      ${declarationSignatoryHtml('Inspected and tested by', inst.inspectedBy, inst.inspectedPosition, inst.inspectedDate, inst.inspectedBySignatureDataUrl ?? '', h.esc)}
      ${declarationSignatoryHtml('Report authorised by', inst.authorisedBy, inst.authorisedPosition, inst.authorisedDate, inst.authorisedBySignatureDataUrl ?? '', h.esc)}
    </div>`,
      h.esc,
      true,
    )}
    ${pdfBlock('Supply characteristics and earthing arrangements', supplyParticularsHtml(sup, h.esc), h.esc, false, 'cp-supply-block')}
  </div>`;

  const pageInspection = `<section class="inspection-schedule">
    ${pdfBlock('Inspection schedule', `${inspectionScheduleLegendHtml(h.esc)}
    ${inspectionRows}`, h.esc)}
  </section>`;

  const pageGuidance = `${pdfBlock('Guidance for recipients', `<div class="cp-guidance">${h.esc(EICR_RECIPIENT_GUIDANCE)}</div>`, h.esc, false, 'cp-guidance-block')}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${h.esc(input.certificateNumber)} - EICR</title>
<style>
${h.certificatePdfStyles(b.accent_color, b.accent_end_color, '8.4pt')}
${CERTIFICATE_PRINT_CSS}
  @page { margin: 10mm 10mm 16mm 10mm; }
  @page circuitSchedule { size: A4 landscape; margin: 6mm 6mm 12mm 6mm; }
  body { padding-bottom: 2mm; }
  .inspection-schedule { page-break-inside: auto; break-inside: auto; }
  .schedule-section { page-break-inside: avoid; break-inside: avoid; margin-bottom: 7px; }
  .schedule-section .sched { font-size: 6.8pt; }
  .schedule-section .sched th, .schedule-section .sched td { padding: 2.2px 3px; line-height: 1.15; }
  .schedule-section .mono { width: 38px; white-space: nowrap; }
  .inspection-schedule-table th { background: #111; color: #fff; }
  .circuit-page {
    page: circuitSchedule;
    break-before: page;
    page-break-inside: auto;
    margin: 0; padding: 0; border: 0; background: #fff;
  }
</style>
</head>
<body>
  ${h.certificateHeaderHtml(input, 'Electrical Installation Condition Report', 'BS 7671:2018+A3:2024 (18th Edition)')}
  ${mainFlow}
  ${pageInspection}
  ${pageGuidance}
  ${boardsHtml || '<section class="block"><h2>Distribution boards</h2><p class="muted">No boards</p></section>'}
  ${doc.appendix.content.trim() ? `<section class="block"><h2>Appendix notes</h2><p style="white-space:pre-wrap">${h.esc(doc.appendix.content)}</p></section>` : ''}
  ${boardPhotos.length ? h.photosHtml(boardPhotos, 'Board photographs') : ''}
  ${doc.appendix.photos.length ? h.photosHtml(doc.appendix.photos, 'Appendix photographs') : ''}
  ${footerBar}
</body>
</html>`;
}
