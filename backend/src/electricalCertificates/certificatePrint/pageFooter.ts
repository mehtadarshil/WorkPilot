export function printPageFooterHtml(certificateNumber: string, esc: (s: string) => string, standard = 'BS 7671:2018+A3:2024'): string {
  return `<div class="cp-print-footer-bar cp-print-footer-screen" aria-hidden="true">
    <span>${esc(certificateNumber)}</span>
    <span class="cp-page-number"></span>
    <span>${esc(standard)}</span>
  </div>`;
}

/** Puppeteer footer template — CSS page counters do not work reliably in fixed footers. */
export function puppeteerCertificateFooterTemplate(certificateNumber: string, standard = 'BS 7671:2018+A3:2024'): string {
  const left = certificateNumber.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const right = standard.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<div style="width:100%;font-size:7px;color:#444;padding:0 10mm 2mm;display:flex;justify-content:space-between;align-items:center;border-top:1px solid #d1d5db;font-family:Arial,Helvetica,sans-serif;">
    <span>${left}</span>
    <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
    <span>${right}</span>
  </div>`;
}
