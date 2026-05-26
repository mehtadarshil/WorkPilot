'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronLeft, Download, Loader2, Printer, Save } from 'lucide-react';
import type { CompanyBranding } from '@/lib/electricalCertificates/companyBranding';
import { coerceElectricalInstallationData } from '@/lib/electricalCertificates/electricalInstallationDefaults';
import {
  ELECTRICAL_INSTALLATION_EDITOR_SECTIONS,
  type ElectricalInstallationCertificateData,
  type ElectricalInstallationEditorSectionKey,
  type ElectricalInstallationSignatory,
} from '@/lib/electricalCertificates/types';
import {
  downloadCertificatePdf,
  openCertificatePdfPreviewWindow,
  previewCertificatePdf,
} from '@/lib/electricalCertificates/certificateExport';
import { getJson } from '../../../apiClient';
import { useCertificateEditor } from '../CertificateEditorContext';
import { CertificateEditorMenu } from './CertificateEditorMenu';
import {
  AppendixSection,
  BoardsListSection,
  InspectionScheduleSection,
  SupplyCharacteristicsSection,
} from './EditorSections';
import { OutcomeButtons, SectionCard, SelectField, TextAreaField, TextField } from './FormFields';

type Engineer = { key: string; full_name: string; role_position: string | null };
type UpdateEic = (updater: (data: ElectricalInstallationCertificateData) => ElectricalInstallationCertificateData) => void;

const WORK_TYPE_OPTIONS = [
  { value: 'new', label: 'New installation' },
  { value: 'addition', label: 'Addition to existing installation' },
  { value: 'alteration', label: 'Alteration to existing installation' },
];

const PREMISES_OPTIONS = [
  { value: 'residential', label: 'Residential' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'na', label: 'N/A' },
  { value: 'other', label: 'Other' },
];

const RISK_OPTIONS = [
  { value: 'yes', label: 'YES' },
  { value: 'no', label: 'NO' },
  { value: 'na', label: 'N/A' },
];

function withCompanyDefaults(value: ElectricalInstallationSignatory, branding: CompanyBranding) {
  const valueAddress = splitUkPostcode(value.address);
  const brandingAddress = splitUkPostcode(branding.company_address ?? '');
  const address = valueAddress.address || brandingAddress.address;
  return {
    ...value,
    company: value.company.trim() || branding.company_name || '',
    phone: value.phone.trim() || branding.company_phone || '',
    address,
    postcode: value.postcode.trim() || valueAddress.postcode || brandingAddress.postcode,
  };
}

function splitUkPostcode(raw: string) {
  const trimmed = raw.trim();
  const match = trimmed.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b$/i);
  if (!match) return { address: trimmed, postcode: '' };
  const postcode = match[1].toUpperCase().replace(/\s+/, ' ');
  const address = trimmed.slice(0, match.index).replace(/[,\s]+$/, '');
  return { address, postcode };
}

export function ElectricalInstallationCertificateEditor({ children }: { children?: ReactNode }) {
  const { certificate, document, setDocument, saveDocument, saving, saveError, lastSavedAt, patchMeta } =
    useCertificateEditor();
  const pathname = usePathname();
  const router = useRouter();
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;
  const routeSection = useMemo<ElectricalInstallationEditorSectionKey | null>(() => {
    const match = ELECTRICAL_INSTALLATION_EDITOR_SECTIONS.find((item) => pathname.includes(`/${item.key}`));
    return match?.key ?? null;
  }, [pathname]);
  const [section, setSection] = useState<ElectricalInstallationEditorSectionKey>(routeSection ?? 'installation-details');
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [companyBranding, setCompanyBranding] = useState<CompanyBranding | null>(null);
  const activeSection = routeSection ?? section;

  const eic = useMemo(
    () => document.electricalInstallation ?? coerceElectricalInstallationData(null, certificate.customer_full_name ?? ''),
    [certificate.customer_full_name, document.electricalInstallation],
  );

  useEffect(() => {
    if (!token) return;
    getJson<{ engineers: Engineer[] }>('/electrical-certificates/engineers', token)
      .then((res) => setEngineers(res.engineers ?? []))
      .catch(() => setEngineers([]));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    void getJson<{ branding: CompanyBranding }>('/electrical-certificates/branding', token)
      .then(({ branding }) => {
        setCompanyBranding(branding);
        setDocument((prev) => {
          const current = prev.electricalInstallation ?? coerceElectricalInstallationData(null, certificate.customer_full_name ?? '');
          const next: ElectricalInstallationCertificateData = {
            ...current,
            design: {
              ...current.design,
              designer1: withCompanyDefaults(current.design.designer1, branding),
              designer2: current.design.designer2NotApplicable
                ? current.design.designer2
                : withCompanyDefaults(current.design.designer2, branding),
            },
            construction: {
              ...current.construction,
              constructorSignatory: withCompanyDefaults(current.construction.constructorSignatory, branding),
            },
            inspection: {
              ...current.inspection,
              inspector: withCompanyDefaults(current.inspection.inspector, branding),
            },
          };
          if (
            next.design.designer1 === current.design.designer1 &&
            next.design.designer2 === current.design.designer2 &&
            next.construction.constructorSignatory === current.construction.constructorSignatory &&
            next.inspection.inspector === current.inspection.inspector
          ) {
            return prev;
          }
          return { ...prev, typeSlug: 'eic_18e_a3', electricalInstallation: next };
        });
      })
      .catch(() => {
        // Company details are a convenience; the form remains editable without them.
      });
  }, [certificate.customer_full_name, setDocument, token]);

  const updateEic: UpdateEic = (updater) => {
    setDocument((prev) => {
      const current = prev.electricalInstallation ?? coerceElectricalInstallationData(null, certificate.customer_full_name ?? '');
      return { ...prev, typeSlug: 'eic_18e_a3', electricalInstallation: updater(current) };
    });
  };

  const previewPdf = async () => {
    if (!token) return;
    const previewWindow = openCertificatePdfPreviewWindow();
    await saveDocument();
    await previewCertificatePdf(certificate.id, token, previewWindow);
  };

  const downloadPdf = async () => {
    if (!token) return;
    await saveDocument();
    await downloadCertificatePdf(certificate.id, certificate.certificate_number, token);
  };

  const markCompleted = async () => {
    await saveDocument();
    await patchMeta({ status: certificate.status === 'completed' ? 'in_progress' : 'completed' });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#f0f4f8]">
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/dashboard/certificates" className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50">
              <ChevronLeft className="size-4" />
            </Link>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Electrical Installation Certificate</p>
              <h1 className="text-lg font-bold text-slate-900">{certificate.certificate_number}</h1>
              <p className="text-sm text-slate-600">
                BS 7671 - 18th Edition Amendment 3
                {certificate.customer_full_name ? ` · ${certificate.customer_full_name}` : ''}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton onClick={previewPdf} icon={<Printer className="size-4" />} label="Preview" />
            <ActionButton onClick={downloadPdf} icon={<Download className="size-4" />} label="Download" />
            <ActionButton onClick={saveDocument} icon={saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} label="Save" />
            <button type="button" onClick={markCompleted} className="rounded-lg bg-[#14B8A6] px-3 py-2 text-sm font-semibold text-white hover:bg-[#0d9488]">
              {certificate.status === 'completed' ? 'Reopen' : 'Complete'}
            </button>
            <CertificateEditorMenu />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {ELECTRICAL_INSTALLATION_EDITOR_SECTIONS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setSection(item.key);
                if (routeSection) router.push(`/dashboard/certificates/${certificate.id}/eic`);
              }}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ${activeSection === item.key ? 'bg-[#14B8A6] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="mt-2 min-h-5 text-xs text-slate-500">
          {saveError ? <span className="text-rose-600">{saveError}</span> : lastSavedAt ? 'Saved' : null}
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-auto px-4 py-5">
        {children && routeSection ? (
          children
        ) : (
          <EicSection
            section={section}
            data={eic}
            update={updateEic}
            certificate={certificate}
            engineers={engineers}
            companyBranding={companyBranding}
          />
        )}
      </main>
    </div>
  );
}

function EicSection({
  section,
  data,
  update,
  certificate,
  engineers,
  companyBranding,
}: {
  section: ElectricalInstallationEditorSectionKey;
  data: ElectricalInstallationCertificateData;
  update: UpdateEic;
  certificate: { customer_full_name: string | null; installation_label: string | null };
  engineers: Engineer[];
  companyBranding: CompanyBranding | null;
}) {
  if (section === 'installation-details') return <DetailsSection data={data} update={update} certificate={certificate} />;
  if (section === 'design') return <DesignSection data={data} update={update} engineers={engineers} />;
  if (section === 'construction') return <ConstructionSection data={data} update={update} engineers={engineers} />;
  if (section === 'inspection-testing') return <InspectionTestingSection data={data} update={update} engineers={engineers} />;
  if (section === 'signatories') return <SignatoriesSection data={data} update={update} companyBranding={companyBranding} />;
  if (section === 'supply-characteristics') return <SupplyCharacteristicsSection />;
  if (section === 'inspection-schedule') return <InspectionScheduleSection />;
  if (section === 'boards') return <BoardsListSection />;
  return <AppendixSection />;
}

function DetailsSection({
  data,
  update,
  certificate,
}: {
  data: ElectricalInstallationCertificateData;
  update: UpdateEic;
  certificate: { customer_full_name: string | null; installation_label: string | null };
}) {
  const patch = (details: Partial<ElectricalInstallationCertificateData['details']>) =>
    update((prev) => ({ ...prev, details: { ...prev.details, ...details } }));

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Details of the client">
          <p className="text-sm text-slate-700"><span className="font-semibold">Client:</span> {certificate.customer_full_name ?? '-'}</p>
        </SectionCard>
        <SectionCard title="Installation address">
          <p className="whitespace-pre-wrap text-sm text-slate-700">{certificate.installation_label ?? '-'}</p>
        </SectionCard>
      </div>
      <SectionCard title="Description and extent of the installation">
        <SelectField label="Description of premises" value={data.details.premisesType} onChange={(premisesType) => patch({ premisesType })} options={PREMISES_OPTIONS} />
        <SelectField label="Primary work type" value={data.details.workType} onChange={(workType) => patch({ workType: workType as ElectricalInstallationCertificateData['details']['workType'] })} options={WORK_TYPE_OPTIONS} />
        <div className="grid gap-3 md:grid-cols-2">
          <CheckField label="New installation" checked={data.details.newInstallation} onChange={(newInstallation) => patch({ newInstallation })} />
          <CheckField label="An addition to an existing installation" checked={data.details.additionToExisting} onChange={(additionToExisting) => patch({ additionToExisting })} />
          <CheckField label="An alteration to an existing installation" checked={data.details.alterationToExisting} onChange={(alterationToExisting) => patch({ alterationToExisting })} />
          <CheckField label="Replacement of a distribution board" checked={data.details.replacementDistributionBoard} onChange={(replacementDistributionBoard) => patch({ replacementDistributionBoard })} />
        </div>
        <TextAreaField label="Description of installation" value={data.details.description} onChange={(description) => patch({ description })} rows={4} />
        <TextAreaField label="Extent covered by this certificate" value={data.details.extent} onChange={(extent) => patch({ extent })} rows={4} />
        <div className="grid gap-4 md:grid-cols-3">
          <TextField label="BS 7671 amended to" value={data.details.amendedTo} onChange={(amendedTo) => patch({ amendedTo })} />
          <TextField label="Circuit detail schedules" value={data.details.circuitDetailsSchedules} onChange={(circuitDetailsSchedules) => patch({ circuitDetailsSchedules })} />
          <TextField label="Test result schedules" value={data.details.testResultSchedules} onChange={(testResultSchedules) => patch({ testResultSchedules })} />
        </div>
        <TextAreaField label="Comments on existing installation" value={data.details.commentsOnExistingInstallation} onChange={(commentsOnExistingInstallation) => patch({ commentsOnExistingInstallation })} rows={4} />
      </SectionCard>
    </div>
  );
}

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function DesignSection({ data, update, engineers }: { data: ElectricalInstallationCertificateData; update: UpdateEic; engineers: Engineer[] }) {
  const patch = (design: Partial<ElectricalInstallationCertificateData['design']>) =>
    update((prev) => ({ ...prev, design: { ...prev.design, ...design } }));
  const setDesigner2NotApplicable = (designer2NotApplicable: boolean) => {
    patch({
      designer2NotApplicable,
      ...(designer2NotApplicable
        ? { designer2: { name: '', signature: '', date: '', company: '', phone: '', address: '', postcode: '' } }
        : {}),
    });
  };
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <SectionCard title="For design">
        <p className="text-sm text-slate-600">Record departures from BS 7671, permitted exceptions, and the designer responsible for the work.</p>
        <TextAreaField label="Departures from BS 7671" value={data.design.departures} onChange={(departures) => patch({ departures })} rows={4} />
        <TextAreaField label="Permitted exceptions" value={data.design.permittedExceptions} onChange={(permittedExceptions) => patch({ permittedExceptions })} rows={4} />
        <OutcomeButtons label="Risk assessment attached" value={data.design.riskAssessment} onChange={(riskAssessment) => patch({ riskAssessment: riskAssessment as ElectricalInstallationCertificateData['design']['riskAssessment'] })} options={RISK_OPTIONS} />
      </SectionCard>
      <SignatoryCard title="Designer No. 1" value={data.design.designer1} engineers={engineers} onChange={(designer1) => patch({ designer1 })} />
      <SignatoryCard
        title="Designer No. 2 (if applicable)"
        value={data.design.designer2}
        engineers={engineers}
        onChange={(designer2) => patch({ designer2 })}
        notApplicable={data.design.designer2NotApplicable}
        onNotApplicableChange={setDesigner2NotApplicable}
      />
    </div>
  );
}

function ConstructionSection({ data, update, engineers }: { data: ElectricalInstallationCertificateData; update: UpdateEic; engineers: Engineer[] }) {
  const patch = (construction: Partial<ElectricalInstallationCertificateData['construction']>) =>
    update((prev) => ({ ...prev, construction: { ...prev.construction, ...construction } }));
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <SectionCard title="For construction">
        <TextAreaField label="Departures from BS 7671" value={data.construction.departures} onChange={(departures) => patch({ departures })} rows={4} />
      </SectionCard>
      <SignatoryCard
        title="Constructor"
        value={data.construction.constructorSignatory}
        engineers={engineers}
        onChange={(constructorSignatory) => patch({ constructorSignatory })}
      />
    </div>
  );
}

function InspectionTestingSection({ data, update, engineers }: { data: ElectricalInstallationCertificateData; update: UpdateEic; engineers: Engineer[] }) {
  const patch = (inspection: Partial<ElectricalInstallationCertificateData['inspection']>) =>
    update((prev) => ({ ...prev, inspection: { ...prev.inspection, ...inspection } }));
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <SectionCard title="For inspection and testing">
        <TextAreaField label="Departures from BS 7671" value={data.inspection.departures} onChange={(departures) => patch({ departures })} rows={4} />
        <TextField label="Next inspection interval" value={data.inspection.nextInspectionInterval} onChange={(nextInspectionInterval) => patch({ nextInspectionInterval })} placeholder="e.g. 5 years" />
      </SectionCard>
      <SignatoryCard title="Inspector" value={data.inspection.inspector} engineers={engineers} onChange={(inspector) => patch({ inspector })} />
    </div>
  );
}

function SignatoriesSection({
  data,
  update,
  companyBranding,
}: {
  data: ElectricalInstallationCertificateData;
  update: UpdateEic;
  companyBranding: CompanyBranding | null;
}) {
  const setDesignSignatory = (key: 'designer1' | 'designer2', value: ElectricalInstallationSignatory) =>
    update((prev) => ({ ...prev, design: { ...prev.design, [key]: value } }));
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <SignatoryContactCard
        title="Designer No. 1 company details"
        value={data.design.designer1}
        companyBranding={companyBranding}
        onChange={(value) => setDesignSignatory('designer1', value)}
      />
      {data.design.designer2NotApplicable ? (
        <SectionCard title="Designer No. 2 company details">
          <p className="text-sm text-slate-600">Designer No. 2 is marked N/A.</p>
        </SectionCard>
      ) : (
        <SignatoryContactCard
          title="Designer No. 2 company details"
          value={data.design.designer2}
          companyBranding={companyBranding}
          onChange={(value) => setDesignSignatory('designer2', value)}
        />
      )}
      <SignatoryContactCard
        title="Constructor company details"
        value={data.construction.constructorSignatory}
        companyBranding={companyBranding}
        onChange={(constructorSignatory) =>
          update((prev) => ({ ...prev, construction: { ...prev.construction, constructorSignatory } }))
        }
      />
      <SignatoryContactCard
        title="Inspector company details"
        value={data.inspection.inspector}
        companyBranding={companyBranding}
        onChange={(inspector) => update((prev) => ({ ...prev, inspection: { ...prev.inspection, inspector } }))}
      />
    </div>
  );
}

function SignatoryCard({
  title,
  value,
  engineers,
  onChange,
  notApplicable,
  onNotApplicableChange,
}: {
  title: string;
  value: ElectricalInstallationSignatory;
  engineers: Engineer[];
  onChange: (value: ElectricalInstallationSignatory) => void;
  notApplicable?: boolean;
  onNotApplicableChange?: (value: boolean) => void;
}) {
  const pickEngineer = (key: string) => {
    const engineer = engineers.find((item) => item.key === key);
    if (!engineer) return;
    onChange({ ...value, name: engineer.full_name, signature: engineer.full_name });
  };
  return (
    <SectionCard title={title}>
      {onNotApplicableChange && (
        <CheckField label="N/A - no second designer" checked={Boolean(notApplicable)} onChange={onNotApplicableChange} />
      )}
      {notApplicable ? (
        <p className="text-sm text-slate-600">No second designer applies to this certificate.</p>
      ) : (
        <>
          <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value="" onChange={(e) => pickEngineer(e.target.value)}>
            <option value="">Autofill from engineer...</option>
            {engineers.map((engineer) => (
              <option key={engineer.key} value={engineer.key}>{engineer.full_name}</option>
            ))}
          </select>
          <div className="grid gap-4 md:grid-cols-3">
            <TextField label="Name" value={value.name} onChange={(name) => onChange({ ...value, name })} />
            <TextField label="Typed signature" value={value.signature} onChange={(signature) => onChange({ ...value, signature })} />
            <TextField label="Date" type="date" value={value.date} onChange={(date) => onChange({ ...value, date })} />
          </div>
        </>
      )}
    </SectionCard>
  );
}

function SignatoryContactCard({
  title,
  value,
  companyBranding,
  onChange,
}: {
  title: string;
  value: ElectricalInstallationSignatory;
  companyBranding: CompanyBranding | null;
  onChange: (value: ElectricalInstallationSignatory) => void;
}) {
  const displayValue = companyBranding ? withCompanyDefaults(value, companyBranding) : value;
  return (
    <SectionCard title={title}>
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="Company" value={displayValue.company} onChange={(company) => onChange({ ...displayValue, company })} />
        <TextField label="Phone" value={displayValue.phone} onChange={(phone) => onChange({ ...displayValue, phone })} />
      </div>
      <TextAreaField label="Address" value={displayValue.address} onChange={(address) => onChange({ ...displayValue, address })} />
      <TextField label="Postcode" value={displayValue.postcode} onChange={(postcode) => onChange({ ...displayValue, postcode })} />
    </SectionCard>
  );
}

function ActionButton({ onClick, icon, label }: { onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
      {icon}
      {label}
    </button>
  );
}
