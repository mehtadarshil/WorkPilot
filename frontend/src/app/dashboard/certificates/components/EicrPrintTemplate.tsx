'use client';

import type { CompanyBranding } from '@/lib/electricalCertificates/companyBranding';
import { AssessmentBanner } from '@/lib/electricalCertificates/certificatePrint/AssessmentBanner';
import {
  BoardDetailsGrid,
  BoardTestingFooter,
  CircuitScheduleTable,
} from '@/lib/electricalCertificates/certificatePrint/CircuitScheduleTable';
import { EICR_RECIPIENT_GUIDANCE, EICR_RECOMMENDATIONS_INTRO } from '@/lib/electricalCertificates/certificatePrint/eicrGuidance';
import { InspectionOutcomeBadge } from '@/lib/electricalCertificates/certificatePrint/InspectionOutcomeBadge';
import { InspectionScheduleLegend } from '@/lib/electricalCertificates/certificatePrint/InspectionScheduleLegend';
import { ObservationSummaryGrid } from '@/lib/electricalCertificates/certificatePrint/ObservationSummaryGrid';
import { PrintPageFooter } from '@/lib/electricalCertificates/certificatePrint/PrintPageFooter';
import { DeclarationSignatoryRow } from '@/lib/electricalCertificates/certificatePrint/DeclarationSignatory';
import { CERTIFICATE_PRINT_CSS } from '@/lib/electricalCertificates/certificatePrint/printStyles.css';
import { SupplyParticularsGrid } from '@/lib/electricalCertificates/certificatePrint/SupplyParticularsGrid';
import {
  INSPECTION_SCHEDULE_ITEMS,
  INSPECTION_SECTION_LABELS,
} from '@/lib/electricalCertificates/inspectionScheduleItems';
import type { ElectricalCertificate } from '@/lib/electricalCertificates/types';
import type { KvEntry } from '@/lib/electricalCertificates/certificatePrint/kvTable';
import { buildKvTableRows } from '@/lib/electricalCertificates/certificatePrint/kvTable';
import { CertificateBrandedHeader } from './CertificateBrandedHeader';

export function EicrPrintTemplate({
  certificate,
  branding,
}: {
  certificate: ElectricalCertificate;
  branding: CompanyBranding;
}) {
  const doc = certificate.document;
  const inst = doc.installation;
  const sup = doc.supply;
  const sections = [...new Set(INSPECTION_SCHEDULE_ITEMS.map((item) => item.section))];
  const clientLabel = inst.hideClientOnReport ? 'Withheld' : (certificate.customer_full_name ?? '—');

  return (
    <>
      <style jsx global>{`
        ${CERTIFICATE_PRINT_CSS}
        @page eicrCircuitSchedule {
          size: A4 landscape;
          margin: 6mm;
        }
        @page {
          margin: 10mm 10mm 16mm 10mm;
        }
        .eicr-circuit-page {
          page: eicrCircuitSchedule;
          break-before: page;
        }
        .eicr-inspection-schedule th {
          background: #111;
          color: #fff;
        }
      `}</style>

      <div className="mx-auto max-w-[210mm] bg-white text-sm text-black print:p-0">
        <div className="p-8 print:p-6">
          <CertificateBrandedHeader branding={branding} certificateNumber={certificate.certificate_number} />
        </div>

        <section className="cert-flow px-8 print:px-6">
          <SectionTitle>Details of client or person ordering report</SectionTitle>
          <CompactKvTable
            entries={[
              { label: 'Client', value: clientLabel },
              { label: 'Installation', value: certificate.installation_label ?? '—' },
              { label: 'Job', value: certificate.job_number ?? '' },
            ]}
          />

          <SectionTitle>Reason for producing this report</SectionTitle>
          <CompactKvTable
            entries={[
              { label: 'Reason', value: inst.reason },
              { label: 'Date inspection carried out', value: inst.inspectionDate },
            ]}
          />

          <SectionTitle>Details of the installation</SectionTitle>
          <CompactKvTable
            entries={[
              { label: 'Occupier name', value: inst.occupierName },
              { label: 'Description of premises', value: inst.premisesType },
              { label: 'Installation records available', value: inst.recordsAvailable },
              { label: 'Date of previous inspection', value: inst.previousInspectionDate },
              { label: 'Previous certificate number', value: inst.previousCertNumber },
              { label: 'Evidence of additions/alterations', value: inst.alterationsEvidence },
              { label: 'Estimated age of installation', value: inst.estimatedAge },
            ]}
          />

          <SectionTitle>Extent and limitations of inspection and testing</SectionTitle>
          <CompactKvTable
            entries={[
              { label: 'Extent covered', value: inst.extent },
              { label: 'Agreed limitations', value: inst.agreedLimitations },
              { label: 'Agreed with', value: inst.agreedWith },
              { label: 'Operational limitations', value: inst.operationalLimitations },
            ]}
          />

          <SectionTitle>Summary of the condition of the installation</SectionTitle>
          <AssessmentBanner
            label="Overall assessment of the installation in terms of its suitability for continued use"
            value={inst.overallAssessment}
          />
          <div className="cp-recommendations">
            <strong>Recommendations</strong>
            <p className="mt-1">{EICR_RECOMMENDATIONS_INTRO}</p>
            {inst.reinspectionPeriod.trim() && (
              <p className="mt-2">
                <strong>Recommended re-inspection:</strong> {inst.reinspectionPeriod}
              </p>
            )}
          </div>

          <SectionTitle>Observations and recommendations</SectionTitle>
          <p className="mb-2 text-xs text-slate-600">
            One of the following codes has been allocated to each observation to indicate the degree of urgency for remedial action.
          </p>
          <ObservationSummaryGrid items={doc.observations.items} />
          {doc.observations.items.length > 0 ? (
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-800 text-white">
                  <th className="border border-slate-400 px-2 py-1">No.</th>
                  <th className="border border-slate-400 px-2 py-1 text-left">Observation</th>
                  <th className="border border-slate-400 px-2 py-1">Code</th>
                </tr>
              </thead>
              <tbody>
                {doc.observations.items.map((observation, i) => (
                  <tr key={observation.id}>
                    <td className="border border-slate-200 px-2 py-1 text-center">{i + 1}</td>
                    <td className="border border-slate-200 px-2 py-1">
                      {observation.location}: {observation.details}
                    </td>
                    <td className="border border-slate-200 px-2 py-1 text-center">
                      <InspectionOutcomeBadge outcome={observation.code} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-slate-600">No remedial action is required</p>
          )}

          <AssessmentBanner label="General condition of the installation" value={inst.generalCondition} />
          <SectionTitle>Declaration</SectionTitle>
          <div className="cp-signatory-grid">
            <DeclarationSignatoryRow
              title="Inspected and tested by"
              name={inst.inspectedBy}
              position={inst.inspectedPosition}
              date={inst.inspectedDate}
              signatureDataUrl={inst.inspectedBySignatureDataUrl ?? ''}
            />
            <DeclarationSignatoryRow
              title="Report authorised by"
              name={inst.authorisedBy}
              position={inst.authorisedPosition}
              date={inst.authorisedDate}
              signatureDataUrl={inst.authorisedBySignatureDataUrl ?? ''}
            />
          </div>
          <div className="cp-supply-block break-inside-auto">
            <SectionTitle className="cp-supply-section-heading">Supply characteristics and earthing arrangements</SectionTitle>
            <SupplyParticularsGrid supply={sup} />
          </div>
        </section>

        {/* Inspection schedule */}
        <section className="px-8 print:px-6">
          <SectionTitle>Inspection schedule</SectionTitle>
          <InspectionScheduleLegend />
          {sections.map((section) => {
            const items = INSPECTION_SCHEDULE_ITEMS.filter((item) => item.section === section);
            return (
              <div key={section} className="mb-4 break-inside-avoid">
                <h3 className="cp-schedule-section-title">
                  {section}. {INSPECTION_SECTION_LABELS[section]}
                </h3>
                <table className="eicr-inspection-schedule mt-1 w-full border-collapse text-[8px]">
                  <thead>
                    <tr>
                      <th className="w-10 border border-slate-300 px-1 py-0.5">Item no</th>
                      <th className="border border-slate-300 px-1 py-0.5 text-left">Description</th>
                      <th className="w-12 border border-slate-300 px-1 py-0.5">Outcome</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td className="border border-slate-200 px-1 font-mono text-slate-500">{item.id}</td>
                        <td className="border border-slate-200 px-1">{item.label}</td>
                        <td className="border border-slate-200 px-1 text-center">
                          <InspectionOutcomeBadge outcome={doc.inspectionSchedule[item.id] ?? ''} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </section>

        {doc.appendix.content.trim() && (
          <section className="px-8 print:px-6">
            <SectionTitle>Appendix</SectionTitle>
            <p className="whitespace-pre-wrap">{doc.appendix.content}</p>
          </section>
        )}

        <section className="cp-guidance-block px-8 print:px-6">
          <SectionTitle>Guidance for recipients</SectionTitle>
          <div className="cp-guidance">{EICR_RECIPIENT_GUIDANCE}</div>
          <CertificateFooter branding={branding} certificateNumber={certificate.certificate_number} />
        </section>
      </div>

      {doc.boards.map((board) => (
        <section key={board.id} className="eicr-circuit-page mx-auto w-[297mm] bg-white p-4 text-black print:p-3">
          <h2 className="cp-board-title">Distribution Board — {board.name}</h2>
          <BoardDetailsGrid board={board} />
          <CircuitScheduleTable circuits={board.circuits} />
          <BoardTestingFooter
            boardName={board.name}
            testedBy={inst.inspectedBy}
            position={inst.inspectedPosition}
            testedDate={inst.inspectedDate}
          />
        </section>
      ))}

      <PrintPageFooter certificateNumber={certificate.certificate_number} />
    </>
  );
}

function SectionTitle({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <h2 className={`mb-2 mt-4 border-b border-slate-300 font-bold first:mt-0 break-after-avoid ${className}`}>{children}</h2>;
}

function CompactKvTable({ entries, pairCompact = true }: { entries: KvEntry[]; pairCompact?: boolean }) {
  const rows = buildKvTableRows(entries, pairCompact);
  if (!rows.length) return null;
  return (
    <table className="kv kv-grid mb-2 w-full text-sm">
      <tbody>
        {rows.map((row, i) =>
          row.length === 2 ? (
            <tr key={i} className="kv-pair">
              <td className="lbl py-0.5 font-semibold text-slate-600">{row[0]!.label}</td>
              <td className="py-0.5">{row[0]!.value}</td>
              <td className="lbl py-0.5 font-semibold text-slate-600">{row[1]!.label}</td>
              <td className="py-0.5">{row[1]!.value}</td>
            </tr>
          ) : (
            <tr key={i} className="kv-full">
              <td className="lbl py-0.5 font-semibold text-slate-600">{row[0]!.label}</td>
              <td colSpan={3} className="py-0.5">{row[0]!.value}</td>
            </tr>
          ),
        )}
      </tbody>
    </table>
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
