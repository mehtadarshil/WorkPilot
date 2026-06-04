import type { Pool } from 'pg';
import { renderHtmlReportToPdf } from '../jobClientReportPdf';
import { loadCompanyBranding } from './companyBranding';
import { buildCertificatePdfHtml } from './certificatePdfHtml';
import { coerceDocument } from './documentDefaults';

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
  const document = coerceDocument(params.documentRaw);
  const branding = await loadCompanyBranding(pool, params.ownerUserId);
  const html = buildCertificatePdfHtml({
    certificateNumber: params.certificateNumber,
    customerName: params.customerName,
    installationLabel: params.installationLabel,
    jobNumber: params.jobNumber,
    document,
    branding,
  });
  const pdf = await renderHtmlReportToPdf(html);
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
