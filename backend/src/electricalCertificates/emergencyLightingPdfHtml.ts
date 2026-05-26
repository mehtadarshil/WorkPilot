import {
  EMERGENCY_LIGHTING_LUMINAIRE_TYPE_LABELS,
  EMERGENCY_LIGHTING_OUTCOME_LABELS,
  EMERGENCY_LIGHTING_STANDARD_LABEL,
  EMERGENCY_LIGHTING_SUPPLY_MODE_LABELS,
} from './emergencyLightingItems';
import type { CertificatePdfInput } from './certificatePdfHtml';

type PdfHelpers = {
  esc: (value: string) => string;
  row: (label: string, value: string) => string;
  photosHtml: (photos: { caption: string; dataUrl: string }[], title: string) => string;
  certificatePdfStyles: (accent: string, accentEnd: string, fontSize?: string) => string;
  certificateHeaderHtml: (input: CertificatePdfInput, title: string, subtitle?: string) => string;
  certificateFooterHtml: (branding: CertificatePdfInput['branding'], certificateNumber: string) => string;
};

export function buildEmergencyLightingCertificatePdfHtml(input: CertificatePdfInput, h: PdfHelpers): string {
  const { document: doc, branding: b } = input;
  const em = doc.emergencyLighting;
  if (!em) throw new Error('EMERGENCY_LIGHTING_DOCUMENT_MISSING');
  const outcome = (value: string) => EMERGENCY_LIGHTING_OUTCOME_LABELS[value] ?? '-';

  const modifications = em.modifications
    .map(
      (item) =>
        `<tr><td>${h.esc(item.location)}</td><td>${h.esc(item.date)}</td><td>${h.esc(item.details)}</td><td>${h.esc(item.notes)}</td></tr>`,
    )
    .join('');

  const testRows = em.testSchedule
    .map(
      (item) =>
        `<tr><td>${h.esc(item.reference)}</td><td>${h.esc(item.location)}</td><td>${h.esc(EMERGENCY_LIGHTING_LUMINAIRE_TYPE_LABELS[item.luminaireType] ?? item.luminaireType)}</td><td>${h.esc(EMERGENCY_LIGHTING_SUPPLY_MODE_LABELS[item.supplyMode] ?? item.supplyMode)}</td><td>${h.esc(item.durationMinutes)}</td><td class="outcome">${h.esc(outcome(item.chargeIndicator))}</td><td class="outcome">${h.esc(outcome(item.functionalTest))}</td><td class="outcome">${h.esc(outcome(item.durationTest))}</td><td class="outcome">${h.esc(outcome(item.result))}</td><td>${h.esc(item.notes)}</td></tr>`,
    )
    .join('');

  const faultRows = em.faultsAndRepairs
    .map(
      (item) =>
        `<tr><td>${h.esc(item.reference)}</td><td>${h.esc(item.location)}</td><td>${h.esc(item.fault)}</td><td>${h.esc(item.repair)}</td><td>${h.esc(item.repairedBy)}</td><td>${h.esc(item.repairedDate)}</td><td class="outcome">${h.esc(outcome(item.result))}</td></tr>`,
    )
    .join('');

  const itemPhotos = [
    ...em.modifications.flatMap((item) => item.photos),
    ...em.testSchedule.flatMap((item) => item.photos),
    ...em.faultsAndRepairs.flatMap((item) => item.photos),
  ];

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${h.esc(input.certificateNumber)} - Emergency Lighting PIR</title>
<style>${h.certificatePdfStyles(b.accent_color, b.accent_end_color, '8.3pt')}</style>
</head>
<body>
  ${h.certificateHeaderHtml(input, 'Emergency Lighting - Periodic Inspection Report', EMERGENCY_LIGHTING_STANDARD_LABEL)}

  <section class="block">
    <h2>Details of the installation</h2>
    <table class="kv">
      ${h.row('Occupier', em.installation.occupierName)}
      ${h.row('Description of premises', em.installation.premisesType)}
      ${h.row('System description', em.installation.systemDescription)}
      ${h.row('Inspection date', em.installation.inspectionDate)}
      ${h.row('Next inspection', em.installation.nextInspectionDate)}
      ${h.row('Overall assessment', em.installation.overallAssessment)}
    </table>
  </section>

  <section class="block">
    <h2>Emergency lighting system details</h2>
    <table class="kv">
      ${h.row('Manufacturer', em.installation.manufacturer)}
      ${h.row('Manufacturer phone', em.installation.manufacturerPhone)}
      ${h.row('Installer', em.installation.installer)}
      ${h.row('Installer phone', em.installation.installerPhone)}
    </table>
  </section>

  <section class="block">
    <h2>Declaration</h2>
    <table class="kv">
      ${h.row('Inspected by', em.declaration.inspectedBy)}
      ${h.row('Inspector position', em.declaration.inspectedPosition)}
      ${h.row('Inspected date', em.declaration.inspectedDate)}
      ${h.row('Authorised by', em.declaration.authorisedBy)}
      ${h.row('Authorised position', em.declaration.authorisedPosition)}
      ${h.row('Authorised date', em.declaration.authorisedDate)}
    </table>
  </section>

  ${modifications ? `<section class="block"><h2>Modifications</h2><table class="sched"><thead><tr><th>Location</th><th>Date</th><th>Details</th><th>Notes</th></tr></thead><tbody>${modifications}</tbody></table></section>` : ''}
  ${testRows ? `<section class="block"><h2>Test schedule</h2><table class="sched"><thead><tr><th>Ref</th><th>Location</th><th>Type</th><th>Supply</th><th>Duration</th><th>Charge</th><th>Function</th><th>Duration</th><th>Result</th><th>Notes</th></tr></thead><tbody>${testRows}</tbody></table></section>` : ''}
  ${faultRows ? `<section class="block"><h2>Faults and repairs</h2><table class="sched"><thead><tr><th>Ref</th><th>Location</th><th>Fault</th><th>Repair</th><th>Repaired by</th><th>Date</th><th>Result</th></tr></thead><tbody>${faultRows}</tbody></table></section>` : ''}
  ${doc.appendix.content.trim() ? `<section class="block"><h2>Appendix</h2><p style="white-space:pre-wrap">${h.esc(doc.appendix.content)}</p></section>` : ''}
  ${itemPhotos.length ? h.photosHtml(itemPhotos, 'Certificate photographs') : ''}
  ${doc.appendix.photos.length ? h.photosHtml(doc.appendix.photos, 'Appendix photographs') : ''}
  ${h.certificateFooterHtml(b, input.certificateNumber)}
</body>
</html>`;
}

