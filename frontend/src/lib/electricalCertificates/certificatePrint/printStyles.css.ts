/** Shared print CSS for certificate PDFs and browser print — inject as global or <style>. */
export const CERTIFICATE_PRINT_CSS = `
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;

  .cp-outcome-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 16px;
    height: 16px;
    padding: 0 3px;
    border-radius: 999px;
    font-size: 6.5pt;
    font-weight: 800;
    line-height: 1;
    letter-spacing: -0.02em;
    vertical-align: middle;
  }
  .cp-outcome-empty { color: #9ca3af; font-weight: 400; }

  .cp-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 8px;
    margin: 0 0 6px;
    padding: 4px 6px;
    border: 1px solid #d1d5db;
    background: #f9fafb;
    font-size: 6pt;
  }
  .cp-legend-item { display: inline-flex; align-items: center; gap: 3px; white-space: nowrap; }

  .cp-assessment {
    display: inline-block;
    padding: 6px 14px;
    font-size: 11pt;
    font-weight: 900;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    border-radius: 2px;
  }
  .cp-assessment-neutral {
    display: inline-block;
    padding: 4px 8px;
    font-size: 9pt;
    font-weight: 700;
    border: 1px solid #d1d5db;
    background: #f3f4f6;
  }

  .cp-check {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 11px;
    height: 11px;
    border-radius: 999px;
    font-size: 7pt;
    font-weight: 900;
    line-height: 1;
  }
  .cp-check-pass { background: #059669; color: #fff; }
  .cp-check-fail { background: #dc2626; color: #fff; }
  .cp-check-muted { color: #6b7280; font-size: 6.5pt; font-weight: 600; }

  .cp-schedule-section-title {
    margin: 0 0 3px;
    padding: 3px 6px;
    background: #1e293b;
    color: #fff;
    font-size: 7pt;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .cp-board-title {
    margin: 0 0 3px;
    padding: 4px 6px;
    font-size: 9pt;
    font-weight: 800;
    background: #111;
    color: #fff;
    text-transform: uppercase;
  }
  .cp-board-subtitle {
    margin: 0 0 2px;
    font-size: 7pt;
    font-weight: 800;
    color: #111;
  }
  .cp-board-details {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    margin-bottom: 3px;
    font-size: 6pt;
  }
  .cp-board-details td {
    border: 1px solid #b7b7b7;
    padding: 2px 3px;
    background: #f3f4f6;
    vertical-align: top;
  }

  .cp-circuit-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    font-size: 5.6pt;
    border: 1px solid #8b8b8b;
  }
  .cp-circuit-table th,
  .cp-circuit-table td {
    border: 1px solid #b7b7b7;
    padding: 1px 1.5px;
    text-align: center;
    vertical-align: middle;
    line-height: 1.05;
  }
  .cp-circuit-table .cp-group-row th {
    background: #374151;
    color: #fff;
    font-size: 5pt;
    font-weight: 800;
    padding: 2px 2px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .cp-circuit-table .cp-col-row th {
    background: #d9d9d9;
    font-size: 5pt;
    font-weight: 800;
    height: 52px;
    padding: 1px;
  }
  .cp-circuit-table .cp-col-row th.cp-th-v {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    white-space: nowrap;
    height: 58px;
    max-width: 12px;
    overflow: hidden;
  }
  .cp-circuit-table .cp-col-row th.cp-th-h { height: auto; white-space: normal; }
  .cp-circuit-table td.cp-desc {
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 600;
  }
  .cp-circuit-table tbody tr:nth-child(even) td { background: #f9fafb; }
  .cp-circuit-table thead { display: table-header-group; }
  .cp-circuit-table tr { page-break-inside: avoid; }

  .cp-board-testing {
    margin-top: 4px;
    padding: 3px 6px;
    border: 1px solid #9ca3af;
    font-size: 6.5pt;
    background: #f9fafb;
  }
  .cp-board-testing strong { margin-right: 4px; }

  table.kv td.lbl, table.kv .lbl { width: 34%; background: #f3f4f6; color: #111; font-weight: 800; }
  table.kv.kv-grid { table-layout: fixed; width: 100%; border-collapse: collapse; }
  table.kv.kv-grid td { border: 1px solid #d1d5db; padding: 3px 5px; vertical-align: top; }
  table.kv.kv-grid tr.kv-pair td.lbl { width: 18%; background: #f3f4f6; font-weight: 800; }
  table.kv.kv-grid tr.kv-pair td:not(.lbl) { width: 32%; }
  table.kv.kv-grid tr.kv-full td.lbl { width: 22%; background: #f3f4f6; font-weight: 800; }
  table.kv.kv-grid tr { break-inside: avoid; page-break-inside: avoid; }

  .cert-print-page {
    padding-bottom: 4mm;
  }
  .cert-flow { /* natural pagination */ }

  .cp-print-footer-bar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 3mm 10mm;
    font-size: 6.5pt;
    color: #444;
    border-top: 1px solid #d1d5db;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #fff;
    z-index: 9999;
  }
  .cp-print-footer-bar .cp-page-number::after {
    content: 'Page ' counter(page) ' of ' counter(pages);
  }

  .cp-obs-summary-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    margin: 8px 0 10px;
  }
  .cp-obs-summary-box {
    border: 1px solid #d1d5db;
    padding: 5px 6px;
    background: #f9fafb;
    min-height: 52px;
  }
  .cp-obs-summary-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    border-radius: 3px;
    font-weight: 900;
    font-size: 8pt;
    margin-bottom: 3px;
  }
  .cp-obs-summary-count { margin: 0; font-size: 7pt; font-weight: 800; color: #111; }
  .cp-obs-summary-text { margin: 2px 0 0; font-size: 5.8pt; line-height: 1.2; color: #374151; }

  .cp-form-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    margin-top: 4px;
  }
  .cp-form-field {
    border: 1px solid #d1d5db;
    min-height: 26px;
    display: flex;
    flex-direction: column;
    background: #fff;
  }
  .cp-form-label {
    background: #f3f4f6;
    padding: 2px 4px;
    font-size: 5.8pt;
    font-weight: 800;
    color: #374151;
    border-bottom: 1px solid #e5e7eb;
  }
  .cp-form-value {
    padding: 3px 4px;
    font-size: 6.5pt;
    color: #111;
    min-height: 14px;
  }

  .cp-guidance {
    font-size: 7pt;
    line-height: 1.35;
    white-space: pre-wrap;
    color: #111;
  }
  .cp-guidance-block > h2 { break-after: avoid; page-break-after: avoid; }
  .cp-supply-sections { display: flex; flex-direction: column; gap: 4px; margin-top: 4px; }
  .cp-supply-subsection { break-inside: avoid; page-break-inside: avoid; }
  .cp-recommendations {
    margin-top: 8px;
    padding: 6px 8px;
    border: 1px solid #d1d5db;
    background: #f9fafb;
    font-size: 7pt;
    line-height: 1.35;
  }
  .cp-recommendations strong { display: block; margin-bottom: 4px; font-size: 7.5pt; text-transform: uppercase; }

  .cp-signatory-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 6px; }
  .cp-signatory-card { border: 1px solid #d1d5db; padding: 6px 8px; background: #fff; }
  .cp-signatory-title { margin: 0 0 4px; font-size: 7.5pt; font-weight: 800; text-transform: uppercase; color: #111; }
  .cp-signatory-meta { width: 100%; border-collapse: collapse; font-size: 6.8pt; margin-bottom: 4px; }
  .cp-signatory-meta td { padding: 1px 4px 1px 0; vertical-align: top; }
  .cp-signatory-meta td:first-child { width: 52px; font-weight: 700; color: #4b5563; }
  .cp-signature-block { margin-top: 2px; }
  .cp-signature-label { margin: 0 0 2px; font-size: 6pt; font-weight: 700; color: #6b7280; text-transform: uppercase; }
  .cp-signature-box {
    min-height: 42px; border: 1px solid #9ca3af; background: #fff;
    display: flex; align-items: center; justify-content: center; padding: 4px;
  }
  .cp-signature-img { max-width: 100%; max-height: 48px; object-fit: contain; display: block; }
  .cp-signature-typed { font-family: 'Segoe Script', 'Brush Script MT', cursive; font-size: 14pt; color: #111; }
  .cp-signature-empty { color: #9ca3af; font-size: 7pt; }

  .cp-supply-section-title {
    grid-column: 1 / -1; margin: 4px 0 0; padding: 2px 4px;
    background: #374151; color: #fff; font-size: 6.5pt; font-weight: 800; text-transform: uppercase;
    break-after: avoid; page-break-after: avoid;
  }
  .cp-form-field { break-inside: avoid; page-break-inside: avoid; }
`;
