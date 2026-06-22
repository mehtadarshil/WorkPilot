import type { CertificatePdfInput } from './certificatePdfHtml';
import { passFailOutcomeBadgeHtml } from './certificatePrint/passFailOutcomes';
import { CERTIFICATE_PRINT_CSS } from './certificatePrint/printStyles';

type PdfHelpers = {
  esc: (value: string) => string;
  row: (label: string, value: string) => string;
  photosHtml: (photos: { caption: string; dataUrl: string }[], title: string) => string;
  certificatePdfStyles: (accent: string, accentEnd: string, fontSize?: string) => string;
  certificateHeaderHtml: (input: CertificatePdfInput, title: string, subtitle?: string) => string;
  certificateFooterHtml: (branding: CertificatePdfInput['branding'], certificateNumber: string) => string;
};

function bondingBadge(value: string, esc: (s: string) => string): string {
  return passFailOutcomeBadgeHtml(value, esc);
}

export function buildMinorWorksCertificatePdfHtml(input: CertificatePdfInput, h: PdfHelpers): string {
  const { document: doc, branding: b } = input;
  const mwc = doc.minorWorks;
  if (!mwc) throw new Error('MINOR_WORKS_DOCUMENT_MISSING');

  const clientLine = doc.installation.hideClientOnReport
    ? 'Client withheld on certificate'
    : h.esc(input.customerName ?? '—');

  const boardsHtml = doc.boards
    .map((board) => {
      const circuits = board.circuits
        .map(
          (c) => `<tr><td>${h.esc(c.circuitNumber)}</td><td>${h.esc(c.description)}</td><td>${h.esc(c.points)}</td><td>${h.esc(c.wiringType)}</td><td>${h.esc(c.liveMm2)}</td><td>${h.esc(c.cpcMm2)}</td><td>${h.esc(c.maxDisconnectTime)}</td><td>${h.esc(c.ocpdBs)}</td><td>${h.esc(c.ocpdType)}</td><td>${h.esc(c.ocpdRatingA)}</td><td>${h.esc(c.maxZs)}</td><td>${h.esc(c.polarity)}</td><td>${h.esc(c.zs)}</td><td>${h.esc(c.remarks)}</td></tr>`,
        )
        .join('');
      return `<section class="block">
        <h2>Distribution Board – ${h.esc(board.name)}</h2>
        <table class="kv">
          <tr>
            <td class="lbl">Location</td><td>${h.esc(board.location)}</td>
            <td class="lbl">Manufacturer</td><td>${h.esc(board.manufacturer)}</td>
            <td class="lbl">Supplied from</td><td>${h.esc(board.suppliedFrom)}</td>
          </tr>
          <tr>
            <td class="lbl">Zs at DB</td><td>${h.esc(board.zsAtDb)} Ω</td>
            <td class="lbl">IPF at DB</td><td>${h.esc(board.ipfAtDb)} kA</td>
            <td class="lbl">Phases</td><td>${h.esc(board.phases)}</td>
          </tr>
          ${board.notes.trim() ? `<tr><td class="lbl">Notes</td><td colspan="5">${h.esc(board.notes)}</td></tr>` : ''}
        </table>
        <table class="sched">
          <thead><tr><th>No</th><th>Description</th><th>Points</th><th>Wiring</th><th>Live</th><th>CPC</th><th>Max disc</th><th>OCPD BS</th><th>Type</th><th>A</th><th>Max Zs</th><th>Polarity</th><th>Zs</th><th>Remarks</th></tr></thead>
          <tbody>${circuits || '<tr><td colspan="14" class="muted">No circuits recorded</td></tr>'}</tbody>
        </table>
      </section>`;
    })
    .join('');

  const boardPhotos = doc.boards.flatMap((board) => board.photos ?? []);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${h.esc(input.certificateNumber)} – Minor Works Certificate</title>
<style>
${h.certificatePdfStyles(b.accent_color, b.accent_end_color, '8.4pt')}
${CERTIFICATE_PRINT_CSS}
</style>
</head>
<body>
  ${h.certificateHeaderHtml(input, 'Minor Works Certificate', 'BS 7671 — 18th Edition Amendment 3')}

  <section class="block">
    <h2>Certificate details</h2>
    <table class="kv">
      ${h.row('Client', clientLine)}
      ${h.row('Installation', input.installationLabel ?? '—')}
      ${h.row('Job number', input.jobNumber ?? '')}
    </table>
  </section>

  <section class="block">
    <h2>Description of the minor works</h2>
    <table class="kv">
      ${h.row('Description', mwc.description)}
      ${h.row('Date completed', mwc.dateCompleted)}
      ${h.row('Earthing arrangement', mwc.earthingArrangement)}
      ${h.row('Method of protection', mwc.methodOfProtection)}
    </table>
  </section>

  <section class="block">
    <h2>Comments, departures and permitted exceptions</h2>
    <table class="kv">
      ${h.row('Departures & exceptions', mwc.departuresAndExceptions)}
      ${h.row('Risk assessment attached', mwc.riskAssessmentAttached === 'yes' ? 'YES' : mwc.riskAssessmentAttached === 'na' ? 'N/A' : '')}
      ${h.row('Comments on existing installation', mwc.commentsOnExistingInstallation)}
    </table>
  </section>

  <section class="block">
    <h2>Earthing details</h2>
    <table class="kv">
      <tr><td class="lbl">Earthing conductor</td><td>${bondingBadge(mwc.earthingDetails.earthingConductor, h.esc)}</td></tr>
      <tr><td class="lbl">Water</td><td>${bondingBadge(mwc.earthingDetails.water, h.esc)}</td></tr>
      <tr><td class="lbl">Gas</td><td>${bondingBadge(mwc.earthingDetails.gas, h.esc)}</td></tr>
      <tr><td class="lbl">Oil</td><td>${bondingBadge(mwc.earthingDetails.oil, h.esc)}</td></tr>
      <tr><td class="lbl">Structural steel</td><td>${bondingBadge(mwc.earthingDetails.structuralSteel, h.esc)}</td></tr>
      ${h.row('Other', mwc.earthingDetails.other)}
    </table>
  </section>

  ${boardsHtml || '<section class="block"><h2>Distribution boards</h2><p class="muted">No boards recorded</p></section>'}

  <section class="block">
    <h2>Declaration</h2>
    <table class="kv">
      ${h.row('Inspected and tested by', mwc.declaration.inspectedBy)}
      ${h.row('Inspector position', mwc.declaration.inspectedPosition)}
      ${h.row('Inspected date', mwc.declaration.inspectedDate)}
      ${h.row('Authorised for issue by', mwc.declaration.authorisedBy)}
      ${h.row('Authorised position', mwc.declaration.authorisedPosition)}
      ${h.row('Authorised date', mwc.declaration.authorisedDate)}
    </table>
  </section>

  ${doc.appendix.content.trim() ? `<section class="block"><h2>Appendix notes</h2><p style="white-space:pre-wrap">${h.esc(doc.appendix.content)}</p></section>` : ''}
  ${boardPhotos.length ? h.photosHtml(boardPhotos, 'Board photographs') : ''}
  ${doc.appendix.photos.length ? h.photosHtml(doc.appendix.photos, 'Appendix photographs') : ''}

  ${h.certificateFooterHtml(b, input.certificateNumber)}
</body>
</html>`;
}
