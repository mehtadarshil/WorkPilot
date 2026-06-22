'use client';

import type { ReactNode } from 'react';
import type { CompanyBranding } from '@/lib/electricalCertificates/companyBranding';
import { AssessmentBanner } from '@/lib/electricalCertificates/certificatePrint/AssessmentBanner';
import { PassFailOutcomeBadge } from '@/lib/electricalCertificates/certificatePrint/PassFailOutcomeBadge';
import { PrintPageFooter } from '@/lib/electricalCertificates/certificatePrint/PrintPageFooter';
import { CERTIFICATE_PRINT_CSS } from '@/lib/electricalCertificates/certificatePrint/printStyles.css';
import {
  DOMESTIC_FIRE_ALARM_CHECKLIST_ITEMS,
  DOMESTIC_FIRE_ALARM_CHECKLIST_SECTION_LABELS,
  DOMESTIC_FIRE_ALARM_REVISION,
  DOMESTIC_FIRE_ALARM_STANDARD,
} from '@/lib/electricalCertificates/domesticFireAlarmItems';
import type { ElectricalCertificate } from '@/lib/electricalCertificates/types';
import { CertificateBrandedHeader } from './CertificateBrandedHeader';

export function DomesticFireAlarmPrintTemplate({
  certificate,
  branding,
}: {
  certificate: ElectricalCertificate;
  branding: CompanyBranding;
}) {
  const domestic = certificate.document.domesticFireAlarm;
  if (!domestic) return null;
  const sections = [...new Set(DOMESTIC_FIRE_ALARM_CHECKLIST_ITEMS.map((i) => i.section))];

  return (
    <>
      <style jsx global>{CERTIFICATE_PRINT_CSS}</style>
      <div className="mx-auto max-w-[210mm] bg-white text-sm text-black">
        <div className="p-8 print:p-6">
          <CertificateBrandedHeader
            branding={branding}
            title="Domestic Fire Alarm Inspection and Servicing Report"
            subtitle={`Standard: ${DOMESTIC_FIRE_ALARM_STANDARD} · Revision: ${DOMESTIC_FIRE_ALARM_REVISION}`}
            certificateNumber={certificate.certificate_number}
          />
        </div>

        <section className="cert-print-page px-8 print:px-6">
          <SectionTitle>Installation details</SectionTitle>
          <KvTable>
            <PrintRow label="Client" value={certificate.customer_full_name ?? '—'} />
            <PrintRow label="Installation" value={certificate.installation_label ?? '—'} />
            <PrintRow label="Occupier" value={domestic.installation.occupierName} />
            <PrintRow label="System grade" value={domestic.installation.systemGrade} />
            <PrintRow label="System category" value={domestic.installation.systemCategory} />
            <PrintRow label="Extent covered" value={domestic.installation.extentOfSystem} />
            <PrintRow label="Limitations" value={domestic.installation.limitations} />
            <PrintRow label="General condition" value={domestic.installation.generalCondition} />
          </KvTable>
          <AssessmentBanner label="Overall assessment" value={domestic.summary.overallAssessment} />
          <KvTable>
            <PrintRow
              label="Next inspection"
              value={domestic.summary.nextInspectionDate || domestic.summary.nextInspectionPreset}
            />
          </KvTable>
        </section>

        <section className="cert-print-page px-8 print:px-6">
          <SectionTitle>Declaration</SectionTitle>
          <KvTable>
            <PrintRow label="Inspected by" value={domestic.declaration.inspectedBy} />
            <PrintRow label="Inspector position" value={domestic.declaration.inspectedPosition} />
            <PrintRow label="Inspection date" value={domestic.declaration.inspectionDate} />
            <PrintRow label="Authorised by" value={domestic.declaration.authorisedBy} />
            <PrintRow label="Authorised position" value={domestic.declaration.authorisedPosition} />
            <PrintRow label="Authorised date" value={domestic.declaration.authorisedDate} />
          </KvTable>

          {domestic.variations.length > 0 && (
            <>
              <SectionTitle>Variations</SectionTitle>
              <ul className="list-disc pl-5 text-sm">
                {domestic.variations.map((v) => (
                  <li key={v.id}>
                    <strong>{v.code || '—'}</strong> {v.location}: {v.details}
                  </li>
                ))}
              </ul>
            </>
          )}
          {domestic.remedialActions.trim() && (
            <>
              <SectionTitle>Remedial actions</SectionTitle>
              <p className="whitespace-pre-wrap text-sm">{domestic.remedialActions}</p>
            </>
          )}
        </section>

        <section className="cert-print-page px-8 print:px-6">
          <SectionTitle>Checklist</SectionTitle>
          {sections.map((sec) => {
            const items = DOMESTIC_FIRE_ALARM_CHECKLIST_ITEMS.filter((i) => i.section === sec);
            return (
              <div key={sec} className="mb-4 break-inside-avoid">
                <h3 className="cp-schedule-section-title">{DOMESTIC_FIRE_ALARM_CHECKLIST_SECTION_LABELS[sec]}</h3>
                <table className="w-full border-collapse text-[9px]">
                  <thead>
                    <tr className="bg-slate-800 text-white">
                      <th className="border border-slate-400 px-1 py-0.5 text-left">Item</th>
                      <th className="border border-slate-400 px-1 py-0.5">Outcome</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td className="border border-slate-200 px-1">{item.label}</td>
                        <td className="border border-slate-200 px-1 text-center">
                          <PassFailOutcomeBadge value={domestic.checklist[item.id] ?? ''} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </section>

        <section className="cert-print-page px-8 print:px-6">
          {domestic.detectors.length > 0 && (
            <>
              <SectionTitle>Detectors</SectionTitle>
              <table className="w-full border-collapse text-[9px]">
                <thead>
                  <tr className="bg-slate-800 text-white">
                    {['Ref', 'Location', 'Make', 'Model', 'Type', 'Power', 'Interlink', 'Fit'].map((h) => (
                      <th key={h} className="border border-slate-400 px-1 py-0.5 text-left">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {domestic.detectors.map((d) => (
                    <tr key={d.id}>
                      <td className="border border-slate-200 px-1">{d.reference}</td>
                      <td className="border border-slate-200 px-1">{d.location}</td>
                      <td className="border border-slate-200 px-1">{d.make}</td>
                      <td className="border border-slate-200 px-1">{d.model}</td>
                      <td className="border border-slate-200 px-1">{d.detectorTypes.join(', ')}</td>
                      <td className="border border-slate-200 px-1">{d.powerSource}</td>
                      <td className="border border-slate-200 px-1">{d.interlink}</td>
                      <td className="border border-slate-200 px-1">{d.fitForContinuedService.toUpperCase()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {certificate.document.appendix.content.trim() && (
            <>
              <SectionTitle>Appendix</SectionTitle>
              <p className="whitespace-pre-wrap text-sm">{certificate.document.appendix.content}</p>
            </>
          )}
          {certificate.document.appendix.photos.length > 0 && (
            <>
              <SectionTitle>Appendix photographs</SectionTitle>
              <div className="grid grid-cols-2 gap-3">
                {certificate.document.appendix.photos.map((p) => (
                  <figure key={p.id}>
                    <img src={p.dataUrl} alt={p.caption} className="max-h-48 w-full object-contain" />
                    {p.caption && <figcaption className="mt-1 text-xs text-slate-600">{p.caption}</figcaption>}
                  </figure>
                ))}
              </div>
            </>
          )}

          <CertificateFooter branding={branding} certificateNumber={certificate.certificate_number} />
        </section>
      </div>
      <PrintPageFooter certificateNumber={certificate.certificate_number} standard={`${DOMESTIC_FIRE_ALARM_STANDARD}`} />
    </>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 mt-4 border-b border-slate-300 font-bold first:mt-0">{children}</h2>;
}

function KvTable({ children }: { children: ReactNode }) {
  return <table className="mb-2 w-full text-sm"><tbody>{children}</tbody></table>;
}

function PrintRow({ label, value }: { label: string; value: string }) {
  if (!value?.trim()) return null;
  return (
    <tr>
      <td className="w-44 py-0.5 font-semibold text-slate-600">{label}</td>
      <td className="py-0.5">{value}</td>
    </tr>
  );
}

function CertificateFooter({ branding, certificateNumber }: { branding: CompanyBranding; certificateNumber: string }) {
  const primary = branding.footer_text?.trim()
    || [branding.company_name.trim(), certificateNumber].filter(Boolean).join(' · ')
    || certificateNumber;
  return (
    <footer className="mt-8 flex items-center justify-between gap-3 border-t border-slate-200 pt-3 text-xs text-slate-500">
      <span>{primary}</span>
      <span className="ml-auto whitespace-nowrap text-[10px] text-slate-400">Generated by WorkPilot</span>
    </footer>
  );
}
