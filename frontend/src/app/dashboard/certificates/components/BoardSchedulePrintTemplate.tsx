'use client';

import { CircuitScheduleTable } from '@/lib/electricalCertificates/certificatePrint/CircuitScheduleTable';
import { CERTIFICATE_PRINT_CSS } from '@/lib/electricalCertificates/certificatePrint/printStyles.css';
import type { BoardRecord, ElectricalCertificate } from '@/lib/electricalCertificates/types';
import type { CompanyBranding } from '@/lib/electricalCertificates/companyBranding';
import { CertificateBrandedHeader } from './CertificateBrandedHeader';

export function BoardSchedulePrintTemplate({
  certificate,
  board,
  branding,
}: {
  certificate: ElectricalCertificate;
  board: BoardRecord;
  branding: CompanyBranding;
}) {
  return (
    <>
      <style jsx global>{CERTIFICATE_PRINT_CSS}</style>
      <div className="mx-auto max-w-[297mm] bg-white p-8 text-sm text-black print:p-6">
        <CertificateBrandedHeader
          branding={branding}
          title={`Circuit schedule — ${board.name}`}
          subtitle={certificate.certificate_number}
          certificateNumber={undefined}
        />
        <p className="mb-2 text-slate-600">
          {certificate.customer_full_name}
          {certificate.installation_label ? ` · ${certificate.installation_label}` : ''}
          {certificate.job_number ? ` · Job ${certificate.job_number}` : ''}
        </p>
        <p className="mb-4 text-slate-600">
          {[board.manufacturer, board.location, board.zsAtDb ? `Zdb ${board.zsAtDb} Ω` : '']
            .filter(Boolean)
            .join(' · ')}
        </p>

        {board.photos.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {board.photos.map((p) => (
              <figure key={p.id} className="w-36">
                <img src={p.dataUrl} alt="" className="h-28 w-full border object-cover" />
                {p.caption && <figcaption className="text-[9px] text-slate-500">{p.caption}</figcaption>}
              </figure>
            ))}
          </div>
        )}

        <CircuitScheduleTable circuits={board.circuits} />

        <footer className="mt-6 border-t border-slate-200 pt-2 text-center text-xs text-slate-500">
          {branding.footer_text || branding.company_name}
        </footer>
      </div>
    </>
  );
}
