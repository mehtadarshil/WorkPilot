import type { Pool } from 'pg';
import { renderHtmlReportToPdf } from '../jobClientReportPdf';
import { loadCompanyBranding } from './companyBranding';
import { puppeteerCertificateFooterTemplate } from './certificatePrint/pageFooter';
import { buildCertificatePdfHtml } from './certificatePdfHtml';
import { coerceDocument } from './documentDefaults';
import { resolveCertificateDocumentFileRefs } from './certificateFileStorage';

export async function generateElectricalCertificatePdfBuffer(
  pool: Pool,
  params: {
    certificateId: number;
    ownerUserId: number;
    certificateNumber: string;
    jobNumber: string | null;
    customerName: string | null;
    installationLabel: string | null;
    documentRaw: unknown;
  },
): Promise<{ pdf: Buffer; filenameBase: string }> {
  const document = coerceDocument(await resolveCertificateDocumentFileRefs(params.certificateId, params.documentRaw));
  const branding = await loadCompanyBranding(pool, params.ownerUserId);
  const html = buildCertificatePdfHtml({
    certificateNumber: params.certificateNumber,
    customerName: params.customerName,
    installationLabel: params.installationLabel,
    jobNumber: params.jobNumber,
    document,
    branding,
  });
  const pdf = await renderHtmlReportToPdf(html, {
    displayHeaderFooter: true,
    footerTemplate: puppeteerCertificateFooterTemplate(
      params.certificateNumber,
      document.typeSlug === 'fi_insp_2025'
        ? 'BS 5839-1:2025'
        : document.typeSlug === 'dfi_insp_2019_a1' || document.typeSlug === 'dfi_inst_2019_a1'
          ? 'BS 5839-6:2019+A1:2020'
          : 'BS 7671:2018+A3:2024',
    ),
    margin: { top: '10mm', right: '10mm', bottom: '14mm', left: '10mm' },
  });
  const fallbackPrefix =
    document.typeSlug === 'portable_appliance_test'
      ? 'PAT'
      : document.typeSlug === 'fi_insp_2025'
        ? 'FI-INSP'
        : document.typeSlug === 'dfi_insp_2019_a1'
          ? 'DFI-INSP'
          : document.typeSlug === 'dfi_inst_2019_a1'
            ? 'DFI-INST'
          : document.typeSlug === 'fi_extinsp_5306'
            ? 'FI-EXTINSP'
            : document.typeSlug === 'em_pir_2025'
              ? 'EM-PIR'
              : document.typeSlug === 'eic_18e_a3'
                ? 'EIC'
                : document.typeSlug === 'mwc_18e_a3'
                  ? 'MWC'
                  : 'EICR';
  const filenameBase = params.certificateNumber.replace(/[^\w.-]+/g, '_') || `${fallbackPrefix}-${params.certificateId}`;
  return { pdf, filenameBase };
}
