'use client';

import type { CompanyBranding } from '@/lib/electricalCertificates/companyBranding';
import {
  INSPECTION_SCHEDULE_ITEMS,
  INSPECTION_SECTION_LABELS,
} from '@/lib/electricalCertificates/inspectionScheduleItems';
import type { CircuitRow, ElectricalCertificate, InspectionOutcome } from '@/lib/electricalCertificates/types';
import { CertificateBrandedHeader } from './CertificateBrandedHeader';

const OUTCOME_LABELS: Record<InspectionOutcome, string> = {
  '': '—',
  pass: '✓',
  c1: 'C1',
  c2: 'C2',
  c3: 'C3',
  fi: 'FI',
  lim: 'LIM',
  nv: 'N/V',
  na: 'N/A',
  x: 'X',
};

const CIRCUIT_SCHEDULE_COLUMNS = [
  ['No', 'circuitNumber'],
  ['Description', 'description'],
  ['No. points', 'points'],
  ['Wiring type', 'wiringType'],
  ['Ref method', 'refMethod'],
  ['Live mm²', 'liveMm2'],
  ['CPC mm²', 'cpcMm2'],
  ['Max disconnect secs', 'maxDisconnectTime'],
  ['OCPD BS (EN)', 'ocpdBs'],
  ['OCPD Type', 'ocpdType'],
  ['OCPD A', 'ocpdRatingA'],
  ['Breaking kA', 'ocpdBreakingKa'],
  ['Max Zs Ω', 'maxZs'],
  ['RCD BS (EN)', 'rcdBs'],
  ['RCD Type', 'rcdType'],
  ['IΔn mA', 'rcdRatingMa'],
  ['RCD A', 'rcdRatingA'],
  ['r1 Ω', 'ringR1'],
  ['rn Ω', 'ringRn'],
  ['r2 Ω', 'ringR2End'],
  ['R1+R2 Ω', 'r1r2'],
  ['R2 Ω', 'r2'],
  ['IR V', 'insulationTestVoltage'],
  ['IR L-L MΩ', 'insulationLL'],
  ['IR L-E MΩ', 'insulationLE'],
  ['Polarity', 'polarity'],
  ['Measured Zs Ω', 'zs'],
  ['RCD ms', 'rcdTripMs'],
  ['AFDD', 'afdd'],
  ['Remarks', 'remarks'],
] as const;

type CircuitScheduleKey = (typeof CIRCUIT_SCHEDULE_COLUMNS)[number][1];

function circuitValue(circuit: CircuitRow, key: CircuitScheduleKey): string {
  if (key === 'insulationLE') return circuit.insulationLE || circuit.insulation || '';
  return circuit[key] ?? '';
}

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

  return (
    <>
      <style jsx global>{`
        @page eicrCircuitSchedule {
          size: A4 landscape;
          margin: 6mm;
        }
        .eicr-circuit-page {
          page: eicrCircuitSchedule;
          break-before: page;
          break-after: page;
        }
      `}</style>
      <div className="mx-auto max-w-[210mm] bg-white p-8 text-sm text-black print:p-6">
        <CertificateBrandedHeader branding={branding} certificateNumber={certificate.certificate_number} />

        <section className="mb-6">
          <h2 className="mb-2 border-b border-slate-300 font-bold">Certificate details</h2>
          <table className="w-full text-sm">
            <tbody>
              <PrintRow label="Client" value={inst.hideClientOnReport ? 'Withheld' : (certificate.customer_full_name ?? '—')} />
              <PrintRow label="Installation" value={certificate.installation_label ?? '—'} />
              {certificate.job_number && <PrintRow label="Job" value={certificate.job_number} />}
              <PrintRow label="Reason" value={inst.reason} />
              <PrintRow label="Inspection date" value={inst.inspectionDate} />
              <PrintRow label="Premises" value={inst.premisesType} />
              <PrintRow label="Overall assessment" value={inst.overallAssessment} />
              <PrintRow label="General condition" value={inst.generalCondition} />
              <PrintRow label="Extent" value={inst.extent} />
              <PrintRow label="Reinspection" value={inst.reinspectionPeriod} />
            </tbody>
          </table>
        </section>

        {doc.observations.items.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-2 border-b border-slate-300 font-bold">Observations</h2>
            <ul className="list-disc pl-5">
              {doc.observations.items.map((observation) => (
                <li key={observation.id}>
                  <strong>{observation.code.toUpperCase()}</strong> {observation.location}: {observation.details}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mb-6">
          <h2 className="mb-2 border-b border-slate-300 font-bold">Supply characteristics</h2>
          <table className="w-full text-sm">
            <tbody>
              <PrintRow label="Earthing" value={sup.earthing} />
              <PrintRow label="Ze (Ω)" value={sup.ze} />
              <PrintRow label="Ipf" value={sup.ipf} />
              <PrintRow label="Phases" value={sup.phases} />
              <PrintRow label="U / Uo" value={`${sup.nominalU} / ${sup.nominalUo}`} />
            </tbody>
          </table>
        </section>

        <section className="mb-6 break-before-page">
          <h2 className="mb-2 border-b border-slate-300 font-bold">Inspection schedule</h2>
          {sections.map((section) => {
            const items = INSPECTION_SCHEDULE_ITEMS.filter((item) => item.section === section);
            return (
              <div key={section} className="mb-4 break-inside-avoid">
                <h3 className="text-xs font-bold text-slate-700">
                  {section}. {INSPECTION_SECTION_LABELS[section]}
                </h3>
                <table className="mt-1 w-full border-collapse text-[8px]">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="w-10 border border-slate-300 px-1 py-0.5">Item no</th>
                      <th className="border border-slate-300 px-1 py-0.5 text-left">Description</th>
                      <th className="w-10 border border-slate-300 px-1 py-0.5">Outcome</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td className="border border-slate-200 px-1 font-mono text-slate-500">{item.id}</td>
                        <td className="border border-slate-200 px-1">{item.label}</td>
                        <td className="border border-slate-200 px-1 text-center font-bold">
                          {OUTCOME_LABELS[doc.inspectionSchedule[item.id] ?? '']}
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
          <section className="mb-6">
            <h2 className="mb-2 border-b border-slate-300 font-bold">Appendix</h2>
            <p className="whitespace-pre-wrap">{doc.appendix.content}</p>
          </section>
        )}

        <section className="mb-6">
          <h2 className="mb-2 border-b border-slate-300 font-bold">Declaration</h2>
          <table className="w-full text-sm">
            <tbody>
              <PrintRow label="Inspected and tested by" value={inst.inspectedBy} />
              <PrintRow label="Inspector position" value={inst.inspectedPosition} />
              <PrintRow label="Inspected date" value={inst.inspectedDate} />
              <PrintRow label="Authorised for issue by" value={inst.authorisedBy} />
              <PrintRow label="Authorised position" value={inst.authorisedPosition} />
              <PrintRow label="Authorised date" value={inst.authorisedDate} />
            </tbody>
          </table>
        </section>

        <CertificateFooter branding={branding} certificateNumber={certificate.certificate_number} />
      </div>

      {doc.boards.map((board) => (
        <section key={board.id} className="eicr-circuit-page mx-auto w-[297mm] bg-white p-4 text-[7px] text-black print:p-0">
          <h2 className="mb-1 bg-black px-2 py-1 text-[9px] font-bold uppercase text-white">
            Distribution Board - {board.name}
          </h2>
          <table className="mb-1 w-full table-fixed border-collapse text-[6px]">
            <tbody>
              <tr>
                <BoardCell label="Location" value={board.location} />
                <BoardCell label="Manufacturer" value={board.manufacturer} />
                <BoardCell label="Supplied from" value={board.suppliedFrom} />
                <BoardCell label="Polarity confirmed" value={board.polarityConfirmed} />
                <BoardCell label="Phases" value={board.phases} />
                <BoardCell label="Phase seq" value={board.phaseSequence} />
              </tr>
              <tr>
                <BoardCell label="Zs at DB" value={board.zsAtDb ? `${board.zsAtDb} Ω` : ''} />
                <BoardCell label="IPF at DB" value={board.ipfAtDb ? `${board.ipfAtDb} kA` : ''} />
                <BoardCell label="Main switch" value={[board.mainSwitchBs, board.mainSwitchVoltage, board.mainSwitchRating].filter(Boolean).join(' / ')} />
                <BoardCell label="RCD" value={[board.rcdRating, board.rcdTripTime].filter(Boolean).join(' / ')} />
                <BoardCell label="SPD" value={[board.spdType, board.spdStatus].filter(Boolean).join(' / ')} />
                <BoardCell label="OCPD" value={[board.ocpdBs, board.ocpdVoltage, board.ocpdRating].filter(Boolean).join(' / ')} />
              </tr>
              {board.notes.trim() && (
                <tr>
                  <td colSpan={6} className="border border-slate-400 bg-slate-50 px-1 py-0.5">
                    <strong>Notes:</strong> {board.notes}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <table className="w-full table-fixed border-collapse text-[5.5px] leading-tight">
            <thead>
              <tr className="bg-slate-200">
                {CIRCUIT_SCHEDULE_COLUMNS.map(([label]) => (
                  <th key={label} className="break-words border border-slate-400 px-0.5 py-0.5 text-center align-middle font-bold">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {board.circuits.length > 0 ? (
                board.circuits.map((circuit) => (
                  <tr key={circuit.id} className="break-inside-avoid">
                    {CIRCUIT_SCHEDULE_COLUMNS.map(([label, key]) => (
                      <td
                        key={label}
                        className="break-words border border-slate-300 px-0.5 py-0.5 text-center align-middle"
                      >
                        {circuitValue(circuit, key)}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={CIRCUIT_SCHEDULE_COLUMNS.length} className="border border-slate-300 px-1 py-1 text-center text-slate-500">
                    No circuits recorded
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      ))}
    </>
  );
}

function PrintRow({ label, value }: { label: string; value: string }) {
  if (!value?.trim()) return null;
  return (
    <tr>
      <td className="w-40 py-0.5 font-semibold text-slate-600">{label}</td>
      <td className="py-0.5">{value}</td>
    </tr>
  );
}

function BoardCell({ label, value }: { label: string; value: string }) {
  return (
    <td className="border border-slate-400 bg-slate-50 px-1 py-0.5 align-top">
      <strong>{label}:</strong> {value || '—'}
    </td>
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
