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
  const filenameBase = params.certificateNumber.replace(/[^\w.-]+/g, '_') || `EICR-${params.certificateId}`;
  return { pdf, filenameBase };
}
