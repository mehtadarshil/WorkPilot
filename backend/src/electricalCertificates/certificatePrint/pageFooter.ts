export function printPageFooterHtml(certificateNumber: string, esc: (s: string) => string, standard = 'BS 7671:2018+A3:2024'): string {
  return `<div class="cp-print-footer-bar">
    <span>${esc(certificateNumber)}</span>
    <span class="cp-page-number"></span>
    <span>${esc(standard)}</span>
  </div>`;
}
