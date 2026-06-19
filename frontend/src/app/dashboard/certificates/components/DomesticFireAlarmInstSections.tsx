'use client';

import { Plus, Trash2 } from 'lucide-react';
import { newId } from '@/lib/electricalCertificates/documentDefaults';
import {
  DOMESTIC_FIRE_ALARM_CATEGORIES,
  DOMESTIC_FIRE_ALARM_GRADES,
  DOMESTIC_FIRE_ALARM_INST_FIXED_TESTS,
  DOMESTIC_FIRE_ALARM_INST_PASS_NA_LABELS,
  DOMESTIC_FIRE_ALARM_INST_TEXT_PRESETS,
  DOMESTIC_FIRE_ALARM_INST_TEST_RESULTS_RECORDED,
  DOMESTIC_FIRE_ALARM_SYSTEM_IS_OPTIONS,
} from '@/lib/electricalCertificates/domesticFireAlarmInstItems';
import type {
  DomesticFireAlarmInstCertificateData,
  DomesticFireAlarmInstEditorSectionKey,
  DomesticFireAlarmInstPassNa,
} from '@/lib/electricalCertificates/types';
import { CertificatePhotoGallery } from './CertificatePhotoGallery';
import { DateInput } from './FormFields';

const inputClass =
  'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30';
const labelClass = 'mb-1 block text-sm font-medium text-slate-700';

export type UpdateInst = (fn: (p: DomesticFireAlarmInstCertificateData) => DomesticFireAlarmInstCertificateData) => void;

type EngineerOption = {
  key: string;
  full_name: string;
  role_position: string | null;
};

type Props = {
  section: DomesticFireAlarmInstEditorSectionKey;
  inst: DomesticFireAlarmInstCertificateData;
  update: UpdateInst;
  certificate: { customer_full_name: string | null; installation_label: string | null };
  engineers: EngineerOption[];
  appendix: { content: string; photos: { id: string; caption: string; dataUrl: string }[] };
  onAppendixContent: (content: string) => void;
  onAppendixPhotos: (photos: { id: string; caption: string; dataUrl: string }[]) => void;
};

export function DomesticFireAlarmInstSections({
  section,
  inst,
  update,
  certificate,
  engineers,
  appendix,
  onAppendixContent,
  onAppendixPhotos,
}: Props) {
  if (section === 'installation-details') {
    return <InstallationDetailsSection inst={inst} update={update} certificate={certificate} engineers={engineers} />;
  }
  if (section === 'test-schedule') {
    return <TestScheduleSection inst={inst} update={update} />;
  }
  return (
    <AppendixSection content={appendix.content} photos={appendix.photos} onContent={onAppendixContent} onPhotos={onAppendixPhotos} />
  );
}

function InstallationDetailsSection({
  inst,
  update,
  certificate,
  engineers,
}: {
  inst: DomesticFireAlarmInstCertificateData;
  update: UpdateInst;
  certificate: { customer_full_name: string | null; installation_label: string | null };
  engineers: EngineerOption[];
}) {
  const pickEngineer = (field: 'installed' | 'authorised', key: string) => {
    const member = engineers.find((e) => e.key === key);
    if (!member) return;
    update((p) => ({
      ...p,
      declaration: {
        ...p.declaration,
        ...(field === 'installed'
          ? { installedBy: member.full_name, installedPosition: member.role_position ?? '' }
          : { authorisedBy: member.full_name, authorisedPosition: member.role_position ?? '' }),
      },
    }));
  };

  return (
    <div className="space-y-4">
      <Panel title="Details of the client and installation">
        <p className="text-sm text-slate-700">
          <span className="font-semibold">Client:</span> {certificate.customer_full_name ?? '—'}
        </p>
        <p className="text-sm text-slate-700">
          <span className="font-semibold">Installation:</span> {certificate.installation_label ?? '—'}
        </p>
        <Field label="Occupier name" value={inst.installation.occupierName} onChange={(occupierName) => update((p) => ({ ...p, installation: { ...p.installation, occupierName } }))} />
        <ChoicePanel
          title="System is"
          values={DOMESTIC_FIRE_ALARM_SYSTEM_IS_OPTIONS.map((o) => o.value)}
          labels={Object.fromEntries(DOMESTIC_FIRE_ALARM_SYSTEM_IS_OPTIONS.map((o) => [o.value, o.label]))}
          value={inst.installation.systemIs || 'new'}
          onChange={(systemIs) => update((p) => ({ ...p, installation: { ...p.installation, systemIs: systemIs as typeof p.installation.systemIs } }))}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <ChoicePanel title="System grade" values={DOMESTIC_FIRE_ALARM_GRADES} value={inst.installation.systemGrade} onChange={(systemGrade) => update((p) => ({ ...p, installation: { ...p.installation, systemGrade: systemGrade as typeof p.installation.systemGrade } }))} />
          <ChoicePanel title="System category" values={DOMESTIC_FIRE_ALARM_CATEGORIES} value={inst.installation.systemCategory} onChange={(systemCategory) => update((p) => ({ ...p, installation: { ...p.installation, systemCategory: systemCategory as typeof p.installation.systemCategory } }))} />
        </div>
      </Panel>

      <PresetTextArea
        title="Accompanying documentation"
        label="Related reference documents and certificate numbers"
        hint="See BS 5839-1:2017, Clause 7"
        presets={DOMESTIC_FIRE_ALARM_INST_TEXT_PRESETS.relatedReferenceDocuments}
        value={inst.documentation.relatedReferenceDocuments}
        onChange={(relatedReferenceDocuments) => update((p) => ({ ...p, documentation: { relatedReferenceDocuments } }))}
      />

      <PresetTextArea
        title="Extent of installation covered"
        label="Extent of the fire detection and alarm system covered by this certificate"
        presets={DOMESTIC_FIRE_ALARM_INST_TEXT_PRESETS.extentOfSystem}
        value={inst.extent.extentOfSystem}
        onChange={(extentOfSystem) => update((p) => ({ ...p, extent: { extentOfSystem } }))}
      />

      <PresetTextArea
        title="Specification of system"
        label="Specification against which the system was installed"
        presets={DOMESTIC_FIRE_ALARM_INST_TEXT_PRESETS.specificationText}
        value={inst.specification.specificationText}
        onChange={(specificationText) => update((p) => ({ ...p, specification: { specificationText } }))}
      />

      <PresetTextArea
        title="Variations from specification"
        label="Variations from the specification and/or BS 5839-1:2017, Section 4"
        presets={DOMESTIC_FIRE_ALARM_INST_TEXT_PRESETS.variationsText}
        value={inst.variationsFromSpec.variationsText}
        onChange={(variationsText) => update((p) => ({ ...p, variationsFromSpec: { variationsText } }))}
      />

      <Panel title="Declaration">
        <p className="text-xs text-slate-500">Person responsible for the installation and authorising issue.</p>
        <div className="grid gap-4 md:grid-cols-2">
          <EngineerSelect label="Installed by" engineers={engineers} value={inst.declaration.installedBy} onSelect={(key) => pickEngineer('installed', key)} />
          <Field label="Installer position" value={inst.declaration.installedPosition} onChange={(installedPosition) => update((p) => ({ ...p, declaration: { ...p.declaration, installedPosition } }))} />
          <DateField label="Installation date" value={inst.declaration.installedDate} onChange={(installedDate) => update((p) => ({ ...p, declaration: { ...p.declaration, installedDate } }))} />
          <EngineerSelect label="Authorised for issue by" engineers={engineers} value={inst.declaration.authorisedBy} onSelect={(key) => pickEngineer('authorised', key)} />
          <Field label="Authorised position" value={inst.declaration.authorisedPosition} onChange={(authorisedPosition) => update((p) => ({ ...p, declaration: { ...p.declaration, authorisedPosition } }))} />
          <DateField label="Authorised date" value={inst.declaration.authorisedDate} onChange={(authorisedDate) => update((p) => ({ ...p, declaration: { ...p.declaration, authorisedDate } }))} />
        </div>
      </Panel>
    </div>
  );
}

function TestScheduleSection({ inst, update }: { inst: DomesticFireAlarmInstCertificateData; update: UpdateInst }) {
  const ts = inst.testSchedule;
  const setTest = (patch: Partial<typeof ts>) => update((p) => ({ ...p, testSchedule: { ...p.testSchedule, ...patch } }));

  return (
    <div className="space-y-4">
      <Panel title="Wiring and testing">
        <p className="text-sm text-slate-600">
          Wiring has been tested in accordance with the recommendations of BS 5839-1:2017, Clause 38
        </p>
        <PassNaButtons value={ts.wiringTested} onChange={(wiringTested) => setTest({ wiringTested })} />
        <p className="mt-4 text-sm font-medium text-slate-700">Test results have been recorded and have been:</p>
        <div className="space-y-2">
          {DOMESTIC_FIRE_ALARM_INST_TEST_RESULTS_RECORDED.map((opt) => (
            <label key={opt.value} className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name="testResultsRecorded"
                checked={ts.testResultsRecorded === opt.value}
                onChange={() => setTest({ testResultsRecorded: opt.value })}
                className="mt-1"
              />
              {opt.label}
            </label>
          ))}
        </div>
        <p className="text-xs text-slate-500">Further test results may be recorded below.</p>
      </Panel>

      <Panel title="Insulation resistance tests">
        {DOMESTIC_FIRE_ALARM_INST_FIXED_TESTS.slice(0, 3).map((item) => (
          <TestRow key={item.id} label={item.label} value={ts[item.id as keyof typeof ts] as DomesticFireAlarmInstPassNa} onChange={(outcome) => setTest({ [item.id]: outcome })} />
        ))}
      </Panel>

      <Panel title="Supply circuit(s) tests">
        {DOMESTIC_FIRE_ALARM_INST_FIXED_TESTS.slice(3, 5).map((item) => (
          <TestRow key={item.id} label={item.label} value={ts[item.id as keyof typeof ts] as DomesticFireAlarmInstPassNa} onChange={(outcome) => setTest({ [item.id]: outcome })} />
        ))}
      </Panel>

      <Panel title="Manufacturer required test(s) (if any)">
        {DOMESTIC_FIRE_ALARM_INST_FIXED_TESTS.slice(5).map((item) => (
          <TestRow key={item.id} label={item.label} value={ts[item.id as keyof typeof ts] as DomesticFireAlarmInstPassNa} onChange={(outcome) => setTest({ [item.id]: outcome })} />
        ))}
      </Panel>

      <Panel title="Additional tests">
        <button type="button" onClick={() => setTest({ additionalTests: [...ts.additionalTests, { id: newId('dfitest'), description: '', outcome: '' }] })} className="inline-flex items-center gap-1 rounded-lg bg-[#14B8A6] px-3 py-2 text-sm font-semibold text-white">
          <Plus className="size-4" /> Add test
        </button>
        {ts.additionalTests.length === 0 && <p className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-sm text-slate-500">No additional tests</p>}
        {ts.additionalTests.map((row, index) => (
          <div key={row.id} className="space-y-2 rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-slate-800">Test {index + 1}</p>
              <button type="button" onClick={() => setTest({ additionalTests: ts.additionalTests.filter((t) => t.id !== row.id) })} className="text-rose-600"><Trash2 className="size-4" /></button>
            </div>
            <Field label="Description" value={row.description} onChange={(description) => setTest({ additionalTests: ts.additionalTests.map((t) => (t.id === row.id ? { ...t, description } : t)) })} />
            <PassNaButtons value={row.outcome} onChange={(outcome) => setTest({ additionalTests: ts.additionalTests.map((t) => (t.id === row.id ? { ...t, outcome } : t)) })} />
          </div>
        ))}
      </Panel>
    </div>
  );
}

function AppendixSection({
  content,
  photos,
  onContent,
  onPhotos,
}: {
  content: string;
  photos: { id: string; caption: string; dataUrl: string }[];
  onContent: (content: string) => void;
  onPhotos: (photos: { id: string; caption: string; dataUrl: string }[]) => void;
}) {
  return (
    <div className="space-y-4">
      <Panel title="Additional page">
        <TextArea label="Any additional content" value={content} onChange={onContent} placeholder="Enter additional page content here..." />
        <p className="text-xs text-slate-500">This text appears on an additional page at the end of the certificate, above appendix photos.</p>
      </Panel>
      <Panel title="Appendix photos">
        <CertificatePhotoGallery photos={photos} onChange={onPhotos} label="Appendix photos" />
      </Panel>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function PresetTextArea({
  title,
  label,
  hint,
  presets,
  value,
  onChange,
}: {
  title: string;
  label: string;
  hint?: string;
  presets: readonly string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Panel title={title}>
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => (
          <button key={preset} type="button" onClick={() => onChange(preset)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50">
            Preset
          </button>
        ))}
      </div>
      <TextArea label={label} value={value} onChange={onChange} />
    </Panel>
  );
}

function TestRow({ label, value, onChange }: { label: string; value: DomesticFireAlarmInstPassNa; onChange: (v: DomesticFireAlarmInstPassNa) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 p-3">
      <p className="text-sm font-medium text-slate-700">{label}</p>
      <PassNaButtons value={value} onChange={onChange} />
    </div>
  );
}

function PassNaButtons({ value, onChange }: { value: DomesticFireAlarmInstPassNa; onChange: (v: DomesticFireAlarmInstPassNa) => void }) {
  return (
    <div className="flex gap-1">
      {(['pass', 'na'] as const).map((outcome) => (
        <button key={outcome} type="button" onClick={() => onChange(outcome)} className={`rounded border px-3 py-1 text-xs font-bold ${value === outcome ? 'border-[#14B8A6] bg-[#14B8A6]/10 text-[#0d9488]' : 'border-slate-200 text-slate-500'}`}>
          {DOMESTIC_FIRE_ALARM_INST_PASS_NA_LABELS[outcome]}
        </button>
      ))}
    </div>
  );
}

function EngineerSelect({ label, engineers, value, onSelect }: { label: string; engineers: EngineerOption[]; value: string; onSelect: (key: string) => void }) {
  const matched = engineers.find((e) => e.full_name === value)?.key ?? '';
  return (
    <label className={labelClass}>
      {label}
      <select className={inputClass} value={matched} onChange={(e) => onSelect(e.target.value)}>
        <option value="">Select team member...</option>
        {engineers.map((engineer) => (
          <option key={engineer.key} value={engineer.key}>{engineer.full_name}</option>
        ))}
      </select>
    </label>
  );
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className={labelClass}>
      {label}
      <input type={type} className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <DateInput
            label={label}
            value={value}
            onChange={onChange}
            inputClassName={inputClass}
            labelClassName={labelClass}
          />
        </div>
        <button type="button" onClick={() => onChange(today)} className="shrink-0 rounded-lg border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 mb-0.5">
          Today
        </button>
      </div>
    </div>
  );
}

function TextArea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className={labelClass}>
      {label}
      <textarea className={`${inputClass} min-h-24`} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function ChoicePanel({ title, values, labels = {}, value, onChange }: { title: string; values: readonly string[]; labels?: Record<string, string>; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <p className={labelClass}>{title}</p>
      <div className="flex flex-wrap gap-2">
        {values.map((item) => (
          <button key={item} type="button" onClick={() => onChange(item)} className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${value === item ? 'border-[#14B8A6] bg-[#14B8A6]/10 text-[#0d9488]' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {labels[item] ?? item}
          </button>
        ))}
      </div>
    </div>
  );
}
