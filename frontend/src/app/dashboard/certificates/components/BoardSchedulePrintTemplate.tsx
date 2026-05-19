'use client';

import { CIRCUIT_COLUMNS } from '@/lib/electricalCertificates/circuitColumns';
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

      <table className="w-full border-collapse text-[8px]">
        <thead>
          <tr>
            {CIRCUIT_COLUMNS.map((col) => (
              <th key={col.key} className="border border-slate-400 bg-slate-100 px-1 py-0.5 text-left">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {board.circuits.length === 0 ? (
            <tr>
              <td colSpan={CIRCUIT_COLUMNS.length} className="border px-2 py-4 text-center text-slate-500">
                No circuits
              </td>
            </tr>
          ) : (
            board.circuits.map((c) => (
              <tr key={c.id}>
                {CIRCUIT_COLUMNS.map((col) => (
                  <td key={col.key} className="border border-slate-300 px-1 py-0.5">
                    {col.key === 'tested' ? (c.tested ? 'Yes' : '') : String(c[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>

      <footer className="mt-6 border-t border-slate-200 pt-2 text-center text-xs text-slate-500">
        {branding.footer_text || branding.company_name}
      </footer>
    </div>
  );
}
