'use client';

import type { ElectricalCertificate, InspectionOutcome } from '@/lib/electricalCertificates/types';
import type { CompanyBranding } from '@/lib/electricalCertificates/companyBranding';
import {
  INSPECTION_SCHEDULE_ITEMS,
  INSPECTION_SECTION_LABELS,
} from '@/lib/electricalCertificates/inspectionScheduleItems';
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

export function CertificatePrintTemplate({
  certificate,
  branding,
}: {
  certificate: ElectricalCertificate;
  branding: CompanyBranding;
}) {
  const doc = certificate.document;
  if (doc.typeSlug === 'portable_appliance_test') {
    return <PatPrintTemplate certificate={certificate} branding={branding} />;
  }
  const inst = doc.installation;
  const sup = doc.supply;
  const sections = [...new Set(INSPECTION_SCHEDULE_ITEMS.map((i) => i.section))];

  return (
    <div className="mx-auto max-w-[210mm] bg-white p-8 text-sm text-black print:p-6">
      <CertificateBrandedHeader
        branding={branding}
        certificateNumber={certificate.certificate_number}
      />

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
            {doc.observations.items.map((o) => (
              <li key={o.id}>
                <strong>{o.code.toUpperCase()}</strong> {o.location}: {o.details}
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

      <section className="mb-6 break-inside-avoid">
        <h2 className="mb-2 border-b border-slate-300 font-bold">Inspection schedule</h2>
        {sections.map((sec) => {
          const items = INSPECTION_SCHEDULE_ITEMS.filter((i) => i.section === sec);
          return (
            <div key={sec} className="mb-4">
              <h3 className="text-xs font-bold text-slate-700">
                {sec}. {INSPECTION_SECTION_LABELS[sec]}
              </h3>
              <table className="mt-1 w-full border-collapse text-[9px]">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-300 px-1 py-0.5 w-10">Ref</th>
                    <th className="border border-slate-300 px-1 py-0.5 text-left">Item</th>
                    <th className="border border-slate-300 px-1 py-0.5 w-10">Out</th>
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

      <section className="mb-6">
        <h2 className="mb-2 border-b border-slate-300 font-bold">Distribution boards</h2>
        {doc.boards.map((b) => (
          <div key={b.id} className="mb-4 rounded border border-slate-200 p-3">
            <p className="font-bold">{b.name}</p>
            <p className="text-xs text-slate-600">
              {b.circuits.length} circuits · {b.status === 'done' ? 'Done' : 'In progress'}
              {b.zsAtDb ? ` · Zdb ${b.zsAtDb} Ω` : ''}
            </p>
            {b.photos.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {b.photos.map((p) => (
                  <figure key={p.id} className="w-32">
                    <img src={p.dataUrl} alt="" className="h-24 w-full border object-cover" />
                    {p.caption && <figcaption className="text-[8px] text-slate-500">{p.caption}</figcaption>}
                  </figure>
                ))}
              </div>
            )}
          </div>
        ))}
      </section>

      {doc.appendix.content.trim() && (
        <section className="mb-6">
          <h2 className="mb-2 border-b border-slate-300 font-bold">Appendix</h2>
          <p className="whitespace-pre-wrap">{doc.appendix.content}</p>
        </section>
      )}

      {doc.appendix.photos.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 border-b border-slate-300 font-bold">Appendix photographs</h2>
          <div className="flex flex-wrap gap-3">
            {doc.appendix.photos.map((p) => (
              <figure key={p.id} className="w-40">
                <img src={p.dataUrl} alt="" className="h-28 w-full border object-cover" />
                {p.caption && <figcaption className="text-[9px] text-slate-500">{p.caption}</figcaption>}
              </figure>
            ))}
          </div>
        </section>
      )}

      <footer className="mt-8 border-t border-slate-200 pt-3 text-center text-xs text-slate-500">
        {branding.footer_text || `${branding.company_name} · ${certificate.certificate_number}`}
      </footer>
    </div>
  );
}

function PatPrintTemplate({ certificate, branding }: { certificate: ElectricalCertificate; branding: CompanyBranding }) {
  const pat = certificate.document.pat;
  if (!pat) return null;
  return (
    <div className="mx-auto max-w-[210mm] bg-white p-8 text-sm text-black print:p-6">
      <CertificateBrandedHeader branding={branding} certificateNumber={certificate.certificate_number} />
      <section className="mb-6">
        <h1 className="text-lg font-bold">Portable Appliance Test Certificate</h1>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <InfoBlock title="Registered Business" lines={[pat.registeredBusiness.name, pat.registeredBusiness.address, pat.registeredBusiness.phone]} />
          <InfoBlock title="Job Address" lines={[pat.jobAddress.customerName, pat.jobAddress.address, pat.jobAddress.landlordAgent]} />
          <InfoBlock
            title="Certificate Information"
            lines={[
              `Date: ${pat.certificateInfo.date || '—'}`,
              `Number: ${pat.certificateInfo.number || certificate.certificate_number}`,
              `Total tested: ${pat.certificateInfo.totalTested || '0'}`,
              `Passed: ${pat.certificateInfo.totalPassed || '0'}`,
              `Failed: ${pat.certificateInfo.totalFailed || '0'}`,
            ]}
          />
        </div>
      </section>
      <section className="mb-6">
        <h2 className="mb-2 border-b border-slate-300 font-bold">Appliance details and test results</h2>
        <table className="w-full border-collapse text-[9px]">
          <thead>
            <tr className="bg-slate-100">
              {['ID', 'Brand', 'Description', 'Location', 'Serial no', 'Retest period', 'Status'].map((h) => (
                <th key={h} className="border border-slate-300 px-1 py-0.5 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pat.appliances.map((row) => (
              <tr key={row.id}>
                <td className="border border-slate-200 px-1">{row.applianceId}</td>
                <td className="border border-slate-200 px-1">{row.brand || 'N/A'}</td>
                <td className="border border-slate-200 px-1">{row.description}</td>
                <td className="border border-slate-200 px-1">{row.location}</td>
                <td className="border border-slate-200 px-1">{row.serialNo || 'N/A'}</td>
                <td className="border border-slate-200 px-1">{row.retestPeriod}</td>
                <td className="border border-slate-200 px-1 font-bold">{row.status ? row.status[0].toUpperCase() + row.status.slice(1) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="grid grid-cols-2 gap-4">
        <InfoBlock title="Test equipment used" lines={[pat.testEquipment.make, `Serial no: ${pat.testEquipment.serialNo}`, pat.testEquipment.notes]} />
        <InfoBlock title="Engineer declaration" lines={[pat.engineer.name, pat.engineer.notes]} />
      </section>
      <footer className="mt-8 border-t border-slate-200 pt-3 text-center text-xs text-slate-500">
        {branding.footer_text || `${branding.company_name} · ${certificate.certificate_number}`}
      </footer>
    </div>
  );
}

function InfoBlock({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded border border-slate-200 p-3">
      <h2 className="mb-2 font-bold">{title}</h2>
      <div className="space-y-1 whitespace-pre-wrap text-xs">
        {lines.filter((line) => line && line.trim()).map((line, idx) => <p key={idx}>{line}</p>)}
      </div>
    </div>
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
