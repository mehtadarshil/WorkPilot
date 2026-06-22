export function PrintPageFooter({
  certificateNumber,
  standard = 'BS 7671:2018+A3:2024',
}: {
  certificateNumber: string;
  standard?: string;
}) {
  return (
    <div className="cp-print-footer-bar" aria-hidden>
      <span>{certificateNumber}</span>
      <span className="cp-page-number" />
      <span>{standard}</span>
    </div>
  );
}

export function printPageFooterHtml(certificateNumber: string, esc: (s: string) => string): string {
  return `<div class="cp-print-footer-bar">
    <span>${esc(certificateNumber)}</span>
    <span class="cp-page-number"></span>
    <span>BS 7671:2018+A3:2024</span>
  </div>`;
}
