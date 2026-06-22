'use client';

import type { ReactNode } from 'react';
import type { CompanyBranding } from '@/lib/electricalCertificates/companyBranding';
import { AssessmentBanner } from '@/lib/electricalCertificates/certificatePrint/AssessmentBanner';
import { PassFailOutcomeBadge } from '@/lib/electricalCertificates/certificatePrint/PassFailOutcomeBadge';
import { PrintPageFooter } from '@/lib/electricalCertificates/certificatePrint/PrintPageFooter';
import { CERTIFICATE_PRINT_CSS } from '@/lib/electricalCertificates/certificatePrint/printStyles.css';
import {
  FIRE_ALARM_INSPECTION_SCHEDULE_ITEMS,
  FIRE_ALARM_SECTION_LABELS,
} from '@/lib/electricalCertificates/fireAlarmInspectionScheduleItems';
import type { ElectricalCertificate } from '@/lib/electricalCertificates/types';
import { CertificateBrandedHeader } from './CertificateBrandedHeader';

export function FireAlarmPrintTemplate({
  certificate,
  branding,
}: {
  certificate: ElectricalCertificate;
  branding: CompanyBranding;
}) {
  const fa = certificate.document.fireAlarm;
  if (!fa) return null;
  const sections = [...new Set(FIRE_ALARM_INSPECTION_SCHEDULE_ITEMS.map((i) => i.section))];

  return (
    <>
      <style jsx global>{CERTIFICATE_PRINT_CSS}</style>
      <div className="mx-auto max-w-[210mm] bg-white text-sm text-black">
        <div className="p-8 print:p-6">
          <CertificateBrandedHeader
            branding={branding}
            title="Fire Alarm Inspection & Servicing Report"
            subtitle="BS 5839-1:2025"
            certificateNumber={certificate.certificate_number}
          />
        </div>

        <section className="cert-print-page px-8 print:px-6">
          <SectionTitle>Client &amp; installation</SectionTitle>
          <KvTable>
            <PrintRow label="Client" value={certificate.customer_full_name ?? '—'} />
            <PrintRow label="Installation" value={certificate.installation_label ?? '—'} />
            <PrintRow label="Occupier" value={fa.installation.occupierName} />
            <PrintRow label="Details of system" value={fa.installation.detailsOfSystem} />
            <PrintRow label="Extent" value={fa.installation.extentOfSystem} />
            <PrintRow
              label="Previous service"
              value={fa.installation.previousServiceUnknown ? 'Unknown' : fa.installation.previousServiceDate}
            />
          </KvTable>

          <SectionTitle>Limitations &amp; documentation</SectionTitle>
          <KvTable>
            <PrintRow label="Limitations" value={fa.limitations.limitationsText} />
            <PrintRow label="Related documents" value={fa.limitations.relatedDocuments} />
            <PrintRow label="Essential references" value={fa.limitations.essentialReferenceDocs} />
          </KvTable>

          <SectionTitle>Condition &amp; summary</SectionTitle>
          <KvTable>
            <PrintRow label="General condition" value={fa.condition.generalCondition} />
            <PrintRow label="Inspection date" value={fa.condition.inspectionDate} />
            <PrintRow label="Outstanding defects reported" value={fa.condition.outstandingDefectsReported} />
            <PrintRow label="Log book updated" value={fa.condition.logBookUpdated} />
            <PrintRow
              label="False alarms (12 months)"
              value={fa.condition.falseAlarmsNa ? 'N/A' : fa.condition.falseAlarmsCount}
            />
            <PrintRow
              label="False alarms rate"
              value={fa.condition.falseAlarmsEquatesNa ? 'N/A' : fa.condition.falseAlarmsEquates}
            />
          </KvTable>
          <AssessmentBanner label="Overall assessment" value={fa.summary.overallAssessment} />
          <KvTable>
            <PrintRow label="Next inspection" value={fa.summary.nextInspectionDate || fa.summary.nextInspectionPreset} />
          </KvTable>
        </section>

        <section className="cert-print-page px-8 print:px-6">
          <SectionTitle>Declaration</SectionTitle>
          <KvTable>
            <PrintRow label="Inspected by" value={fa.declaration.inspectedBy} />
            <PrintRow label="Inspector position" value={fa.declaration.inspectedPosition} />
            <PrintRow label="Inspection date" value={fa.declaration.inspectionDate} />
            <PrintRow label="Authorised by" value={fa.declaration.authorisedBy} />
            <PrintRow label="Authorised position" value={fa.declaration.authorisedPosition} />
            <PrintRow label="Authorised date" value={fa.declaration.authorisedDate} />
          </KvTable>

          {fa.variations.length > 0 && (
            <>
              <SectionTitle>Variations</SectionTitle>
              <ul className="list-disc pl-5 text-sm">
                {fa.variations.map((v) => (
                  <li key={v.id}>
                    <strong>{v.code || '—'}</strong> {v.location}: {v.details}
                  </li>
                ))}
              </ul>
            </>
          )}
          {fa.remedialActions.trim() && (
            <>
              <SectionTitle>Remedial actions</SectionTitle>
              <p className="whitespace-pre-wrap text-sm">{fa.remedialActions}</p>
            </>
          )}
        </section>

        <section className="cert-print-page px-8 print:px-6">
          <SectionTitle>Inspection schedule</SectionTitle>
          {sections.map((sec) => {
            const items = FIRE_ALARM_INSPECTION_SCHEDULE_ITEMS.filter((i) => i.section === sec);
            return (
              <div key={sec} className="mb-4 break-inside-avoid">
                <h3 className="cp-schedule-section-title">
                  {sec}. {FIRE_ALARM_SECTION_LABELS[sec]}
                </h3>
                <table className="w-full border-collapse text-[9px]">
                  <thead>
                    <tr className="bg-slate-800 text-white">
                      <th className="border border-slate-400 px-1 py-0.5">Ref</th>
                      <th className="border border-slate-400 px-1 py-0.5 text-left">Item</th>
                      <th className="border border-slate-400 px-1 py-0.5">Outcome</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td className="border border-slate-200 px-1 font-mono">{item.id}</td>
                        <td className="border border-slate-200 px-1">{item.label}</td>
                        <td className="border border-slate-200 px-1 text-center">
                          <PassFailOutcomeBadge value={fa.inspectionSchedule[item.id] ?? ''} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </section>

        {certificate.document.appendix.content.trim() && (
          <section className="px-8 print:px-6">
            <SectionTitle>Appendix</SectionTitle>
            <p className="whitespace-pre-wrap text-sm">{certificate.document.appendix.content}</p>
          </section>
        )}

        <div className="px-8 pb-8 print:px-6">
          <CertificateFooter branding={branding} certificateNumber={certificate.certificate_number} />
        </div>
      </div>
      <PrintPageFooter certificateNumber={certificate.certificate_number} standard="BS 5839-1:2025" />
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
