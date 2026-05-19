import type { CompanyBranding } from './companyBranding';
import { INSPECTION_SCHEDULE_ITEMS, INSPECTION_SECTION_LABELS } from './inspectionScheduleItems';
import type { ElectricalCertificateDocument, InspectionOutcome } from './types';

export type CertificatePdfInput = {
  certificateNumber: string;
  customerName: string | null;
  installationLabel: string | null;
  jobNumber: string | null;
  document: ElectricalCertificateDocument;
  branding: CompanyBranding;
};

const OUTCOME_LABELS: Record<InspectionOutcome, string> = {
  '': '—',
  pass: '✓',
  c1: 'C1',
  c2: 'C2',
  c3: 'C3',
  fi: 'FI',
  lim: 'LIM',
  nv: 'N/V',
  na: 'N/A',
  x: 'X',
};

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function row(label: string, value: string): string {
  if (!value.trim()) return '';
  return `<tr><td class="lbl">${esc(label)}</td><td>${esc(value)}</td></tr>`;
}

function photosHtml(photos: { caption: string; dataUrl: string }[], title: string): string {
  if (!photos.length) return '';
  const items = photos
    .map(
      (p) =>
        `<figure class="photo"><img src="${p.dataUrl}" alt="${esc(p.caption || 'Photo')}"/><figcaption>${esc(p.caption || '')}</figcaption></figure>`,
    )
    .join('');
  return `<section class="block"><h2>${esc(title)}</h2><div class="photos">${items}</div></section>`;
}

export function buildCertificatePdfHtml(input: CertificatePdfInput): string {
  const { document: doc, branding: b } = input;
  const inst = doc.installation;
  const sup = doc.supply;
  const accent = b.accent_color;
  const accentEnd = b.accent_end_color;

  const clientLine = inst.hideClientOnReport
    ? 'Client withheld on report'
    : esc(input.customerName ?? '—');

  const inspectionRows = [...new Set(INSPECTION_SCHEDULE_ITEMS.map((i) => i.section))]
    .map((sec) => {
      const items = INSPECTION_SCHEDULE_ITEMS.filter((i) => i.section === sec);
      const rows = items
        .map((item) => {
          const outcome = doc.inspectionSchedule[item.id] ?? '';
          return `<tr><td class="mono">${esc(item.id)}</td><td>${esc(item.label)}</td><td class="outcome">${esc(OUTCOME_LABELS[outcome] ?? outcome)}</td></tr>`;
        })
        .join('');
      return `<h3>${esc(sec)}. ${esc(INSPECTION_SECTION_LABELS[sec] ?? sec)}</h3><table class="sched"><thead><tr><th>Ref</th><th>Item</th><th>Outcome</th></tr></thead><tbody>${rows}</tbody></table>`;
    })
    .join('');

  const obsHtml =
    doc.observations.items.length > 0
      ? `<ul>${doc.observations.items
          .map(
            (o) =>
              `<li><strong>${esc(o.code.toUpperCase())}</strong> ${esc(o.location)}: ${esc(o.details)}</li>`,
          )
          .join('')}</ul>`
      : '<p class="muted">None recorded</p>';

  const boardsHtml = doc.boards
    .map((board) => {
      const boardPhotos =
        board.photos?.length > 0
          ? `<div class="photos">${board.photos
              .map(
                (p) =>
                  `<figure class="photo"><img src="${p.dataUrl}" alt=""/><figcaption>${esc(p.caption)}</figcaption></figure>`,
              )
              .join('')}</div>`
          : '';
      return `<div class="board"><h3>${esc(board.name)}</h3>
        <p class="muted">${board.circuits.length} circuits · ${board.status === 'done' ? 'Complete' : 'In progress'}${board.zsAtDb ? ` · Zdb ${esc(board.zsAtDb)} Ω` : ''}</p>
        ${boardPhotos}
      </div>`;
    })
    .join('');

  const appendixPhotos = doc.appendix.photos ?? [];

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${esc(input.certificateNumber)} — EICR</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, Segoe UI, sans-serif; font-size: 10pt; color: #0f172a; margin: 0; }
  .header { display: flex; gap: 16px; border-bottom: 3px solid ${accent}; padding-bottom: 12px; margin-bottom: 16px; }
  .logo { width: 72px; height: 72px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
  .logo img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .company h1 { margin: 0; font-size: 14pt; background: linear-gradient(90deg, ${accent}, ${accentEnd}); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .company p { margin: 2px 0 0; font-size: 9pt; color: #475569; }
  .cert-meta { margin-left: auto; text-align: right; font-size: 9pt; }
  .cert-meta strong { display: block; font-size: 12pt; color: #0f172a; }
  h2 { font-size: 11pt; margin: 16px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; }
  h3 { font-size: 10pt; margin: 12px 0 6px; color: #334155; }
  table.kv { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  table.kv td { padding: 3px 6px; vertical-align: top; border-bottom: 1px solid #f1f5f9; }
  table.kv td.lbl { width: 38%; color: #64748b; font-weight: 600; }
  table.sched { width: 100%; border-collapse: collapse; font-size: 8pt; margin-bottom: 12px; }
  table.sched th, table.sched td { border: 1px solid #cbd5e1; padding: 3px 5px; text-align: left; }
  table.sched th { background: #f8fafc; }
  table.sched td.mono { width: 36px; font-family: monospace; color: #64748b; }
  table.sched td.outcome { width: 48px; text-align: center; font-weight: 700; }
  .muted { color: #64748b; font-size: 9pt; }
  .board { margin-bottom: 12px; padding: 8px; border: 1px solid #e2e8f0; border-radius: 6px; }
  .photos { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  .photo { margin: 0; width: 140px; }
  .photo img { width: 100%; height: auto; border: 1px solid #e2e8f0; border-radius: 4px; }
  .photo figcaption { font-size: 7pt; color: #64748b; margin-top: 2px; }
  .footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid #e2e8f0; font-size: 8pt; color: #64748b; text-align: center; }
  .block { page-break-inside: avoid; }
</style>
</head>
<body>
  <header class="header">
    ${b.company_logo ? `<div class="logo"><img src="${b.company_logo}" alt="Logo"/></div>` : ''}
    <div class="company">
      <h1>${esc(b.company_name)}</h1>
      ${b.company_address ? `<p>${esc(b.company_address).replace(/\n/g, '<br/>')}</p>` : ''}
      <p>${[b.company_phone, b.company_email, b.company_website]
        .filter((s): s is string => Boolean(s))
        .map(esc)
        .join(' · ')}</p>
    </div>
    <div class="cert-meta">
      <strong>Electrical Installation Condition Report</strong>
      <span>BS 7671 — 18th Edition Amd 3</span><br/>
      <span>${esc(input.certificateNumber)}</span>
    </div>
  </header>

  <section class="block">
    <h2>Certificate details</h2>
    <table class="kv">
      ${row('Client', clientLine)}
      ${row('Installation', input.installationLabel ?? '—')}
      ${row('Job number', input.jobNumber ?? '')}
      ${row('Reason for report', inst.reason)}
      ${row('Inspection date', inst.inspectionDate)}
      ${row('Premises type', inst.premisesType)}
      ${row('Overall assessment', inst.overallAssessment)}
      ${row('General condition', inst.generalCondition)}
      ${row('Extent covered', inst.extent)}
      ${row('Reinspection period', inst.reinspectionPeriod)}
    </table>
  </section>

  <section class="block">
    <h2>Observations</h2>
    ${obsHtml}
  </section>

  <section class="block">
    <h2>Supply characteristics</h2>
    <table class="kv">
      ${row('Earthing arrangement', sup.earthing)}
      ${row('Ze (Ω)', sup.ze)}
      ${row('Prospective fault current', sup.ipf)}
      ${row('Nominal voltage U / Uo', `${sup.nominalU} / ${sup.nominalUo}`)}
      ${row('Number of phases', sup.phases)}
    </table>
  </section>

  <section class="block">
    <h2>Inspection schedule</h2>
    ${inspectionRows}
  </section>

  <section class="block">
    <h2>Distribution boards</h2>
    ${boardsHtml || '<p class="muted">No boards</p>'}
  </section>

  ${
    doc.appendix.content.trim()
      ? `<section class="block"><h2>Appendix notes</h2><p style="white-space:pre-wrap">${esc(doc.appendix.content)}</p></section>`
      : ''
  }
  ${appendixPhotos.length ? photosHtml(appendixPhotos, 'Appendix photographs') : ''}

  <div class="footer">
    ${b.footer_text ? esc(b.footer_text) : `${esc(b.company_name)} · ${esc(input.certificateNumber)}`}
  </div>
</body>
</html>`;
}
