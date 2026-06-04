'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, Download, Loader2, Printer, Save } from 'lucide-react';
import {
  MWC_EDITOR_SECTIONS,
  type MinorWorksCertificateData,
  type MwcEditorSectionKey,
} from '@/lib/electricalCertificates/types';
import { coerceMinorWorksData } from '@/lib/electricalCertificates/mwcDefaults';
import {
  downloadCertificatePdf,
  openCertificatePdfPreviewWindow,
  previewCertificatePdf,
} from '@/lib/electricalCertificates/certificateExport';
import { getJson } from '../../../apiClient';
import { useCertificateEditor } from '../CertificateEditorContext';
import { AppendixSection, BoardsListSection } from './EditorSections';
import { OutcomeButtons, SectionCard, SelectField, TextAreaField, TextField } from './FormFields';

type Engineer = { key: string; full_name: string; role_position: string | null };
type UpdateMwc = (updater: (data: MinorWorksCertificateData) => MinorWorksCertificateData) => void;

const EARTHING_OPTIONS = [
  { value: 'TN-S', label: 'TN-S' },
  { value: 'TN-C-S', label: 'TN-C-S' },
  { value: 'TN-C', label: 'TN-C' },
  { value: 'TT', label: 'TT' },
  { value: 'IT', label: 'IT' },
];

const PROTECTION_METHOD_OPTIONS = [
  { value: 'ADS', label: 'ADS' },
  { value: 'Use of Class II equipment', label: 'Use of Class II equipment' },
  { value: 'Non conducting location', label: 'Non conducting location' },
  { value: 'Earth free local bonding', label: 'Earth free local bonding' },
  { value: 'Electrical separation', label: 'Electrical separation' },
  { value: 'N/A', label: 'N/A' },
  { value: 'Other', label: 'Other...' },
];

const RISK_OPTIONS = [
  { value: 'yes', label: 'YES' },
  { value: 'na', label: 'N/A' },
];

const BONDING_OPTIONS = [
  { value: 'pass', label: 'PASS' },
  { value: 'fail', label: 'FAIL' },
  { value: 'lim', label: 'LIM' },
  { value: 'na', label: 'N/A' },
];

export function MinorWorksCertificateEditor({ children }: { children?: ReactNode }) {
  const { certificate, document, setDocument, saveDocument, saving, saveError, lastSavedAt, patchMeta } =
    useCertificateEditor();
  const pathname = usePathname();
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;
  const [section, setSection] = useState<MwcEditorSectionKey>('installation-details');
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const isSubRoute = !pathname.endsWith('/mwc');

  const mwc = useMemo(
    () => document.minorWorks ?? coerceMinorWorksData(null),
    [document.minorWorks],
  );

  useEffect(() => {
    if (!token) return;
    getJson<{ engineers: Engineer[] }>('/electrical-certificates/engineers', token)
      .then((res) => setEngineers(res.engineers ?? []))
      .catch(() => setEngineers([]));
  }, [token]);

  const updateMwc: UpdateMwc = (updater) => {
    setDocument((prev) => {
      const current = prev.minorWorks ?? coerceMinorWorksData(null);
      return { ...prev, typeSlug: 'mwc_18e_a3', minorWorks: updater(current) };
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
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Minor Works Certificate</p>
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
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {MWC_EDITOR_SECTIONS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setSection(item.key)}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ${section === item.key ? 'bg-[#14B8A6] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
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
        {isSubRoute && children ? children : <MwcSection section={section} data={mwc} update={updateMwc} engineers={engineers} />}
      </main>
    </div>
  );
}

function MwcSection({
  section,
  data,
  update,
  engineers,
}: {
  section: MwcEditorSectionKey;
  data: MinorWorksCertificateData;
  update: UpdateMwc;
  engineers: Engineer[];
}) {
  if (section === 'installation-details') return <InstallationDetailsSection data={data} update={update} />;
  if (section === 'circuits') return <BoardsListSection />;
  if (section === 'declaration') return <DeclarationSection data={data} update={update} engineers={engineers} />;
  return <AppendixSection />;
}

function InstallationDetailsSection({
  data,
  update,
}: {
  data: MinorWorksCertificateData;
  update: UpdateMwc;
}) {
  const patch = (p: Partial<MinorWorksCertificateData>) => update((prev) => ({ ...prev, ...p }));
  const patchEarthing = (p: Partial<MinorWorksCertificateData['earthingDetails']>) =>
    update((prev) => ({ ...prev, earthingDetails: { ...prev.earthingDetails, ...p } }));

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <SectionCard title="Description of the minor works">
        <TextAreaField label="Description of minor works" value={data.description} onChange={(v) => patch({ description: v })} rows={4} />
        <TextField label="Date minor works completed" type="date" value={data.dateCompleted} onChange={(v) => patch({ dateCompleted: v })} />
        <div className="grid gap-4 md:grid-cols-2">
          <OutcomeButtons label="Earthing arrangement" value={data.earthingArrangement} onChange={(v) => patch({ earthingArrangement: v })} options={EARTHING_OPTIONS} />
          <SelectField label="Method of protection" value={data.methodOfProtection} onChange={(v) => patch({ methodOfProtection: v })} options={PROTECTION_METHOD_OPTIONS} />
        </div>
      </SectionCard>

      <SectionCard title="Comments, departures and permitted exceptions">
        <TextAreaField
          label="Details of departures from BS 7671:2018+A3:2024 (18th edition), for the altered or extended circuits, and details of permitted exceptions"
          value={data.departuresAndExceptions}
          onChange={(v) => patch({ departuresAndExceptions: v })}
          rows={4}
        />
        <OutcomeButtons label="Risk assessment attached" value={data.riskAssessmentAttached} onChange={(v) => patch({ riskAssessmentAttached: v as MinorWorksCertificateData['riskAssessmentAttached'] })} options={RISK_OPTIONS} />
        <TextAreaField label="Comments on (including any defects observed in) the existing installation" value={data.commentsOnExistingInstallation} onChange={(v) => patch({ commentsOnExistingInstallation: v })} rows={4} />
      </SectionCard>

      <SectionCard title="Earthing details">
        <p className="text-sm font-semibold text-slate-700">Main protective bonding conductors</p>
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
          <OutcomeButtons label="Earthing conductor" value={data.earthingDetails.earthingConductor} onChange={(v) => patchEarthing({ earthingConductor: v as MinorWorksCertificateData['earthingDetails']['earthingConductor'] })} options={BONDING_OPTIONS} />
          <OutcomeButtons label="Water" value={data.earthingDetails.water} onChange={(v) => patchEarthing({ water: v as MinorWorksCertificateData['earthingDetails']['water'] })} options={BONDING_OPTIONS} />
          <OutcomeButtons label="Gas" value={data.earthingDetails.gas} onChange={(v) => patchEarthing({ gas: v as MinorWorksCertificateData['earthingDetails']['gas'] })} options={BONDING_OPTIONS} />
          <OutcomeButtons label="Oil" value={data.earthingDetails.oil} onChange={(v) => patchEarthing({ oil: v as MinorWorksCertificateData['earthingDetails']['oil'] })} options={BONDING_OPTIONS} />
          <OutcomeButtons label="Structural Steel" value={data.earthingDetails.structuralSteel} onChange={(v) => patchEarthing({ structuralSteel: v as MinorWorksCertificateData['earthingDetails']['structuralSteel'] })} options={BONDING_OPTIONS} />
        </div>
        <TextField label="Other" value={data.earthingDetails.other} onChange={(v) => patchEarthing({ other: v })} placeholder="Extraneous bonding to other service(s)" />
      </SectionCard>
    </div>
  );
}

function DeclarationSection({
  data,
  update,
  engineers,
}: {
  data: MinorWorksCertificateData;
  update: UpdateMwc;
  engineers: Engineer[];
}) {
  const patch = (p: Partial<MinorWorksCertificateData['declaration']>) =>
    update((prev) => ({ ...prev, declaration: { ...prev.declaration, ...p } }));

  const pickEngineer = (field: 'inspectedBy' | 'authorisedBy', key: string) => {
    const engineer = engineers.find((item) => item.key === key);
    if (!engineer) return;
    patch({ [field]: engineer.full_name });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <SectionCard title="Inspected and tested by">
        <select
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          value=""
          onChange={(e) => pickEngineer('inspectedBy', e.target.value)}
        >
          <option value="">Autofill from engineer...</option>
          {engineers.map((engineer) => (
            <option key={engineer.key} value={engineer.key}>{engineer.full_name}</option>
          ))}
        </select>
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="Name" value={data.declaration.inspectedBy} onChange={(v) => patch({ inspectedBy: v })} />
          <TextField label="Position" value={data.declaration.inspectedPosition} onChange={(v) => patch({ inspectedPosition: v })} />
        </div>
        <TextField label="Date" type="date" value={data.declaration.inspectedDate} onChange={(v) => patch({ inspectedDate: v })} />
      </SectionCard>

      <SectionCard title="Certificate authorised by">
        <select
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          value=""
          onChange={(e) => pickEngineer('authorisedBy', e.target.value)}
        >
          <option value="">Autofill from engineer...</option>
          {engineers.map((engineer) => (
            <option key={engineer.key} value={engineer.key}>{engineer.full_name}</option>
          ))}
        </select>
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="Name" value={data.declaration.authorisedBy} onChange={(v) => patch({ authorisedBy: v })} />
          <TextField label="Position" value={data.declaration.authorisedPosition} onChange={(v) => patch({ authorisedPosition: v })} />
        </div>
        <TextField label="Date" type="date" value={data.declaration.authorisedDate} onChange={(v) => patch({ authorisedDate: v })} />
      </SectionCard>
    </div>
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
