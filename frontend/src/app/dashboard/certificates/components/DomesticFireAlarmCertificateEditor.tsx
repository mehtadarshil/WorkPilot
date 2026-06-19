'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Download, Loader2, Plus, Printer, Save, Trash2 } from 'lucide-react';
import {
  coerceDomesticFireAlarmData,
  emptyDomesticDetector,
  newId,
} from '@/lib/electricalCertificates/documentDefaults';
import {
  DOMESTIC_FIRE_ALARM_CATEGORIES,
  DOMESTIC_FIRE_ALARM_CHECKLIST_ITEMS,
  DOMESTIC_FIRE_ALARM_CHECKLIST_OUTCOME_LABELS,
  DOMESTIC_FIRE_ALARM_CHECKLIST_SECTION_LABELS,
  DOMESTIC_FIRE_ALARM_DETECTOR_MAKES,
  DOMESTIC_FIRE_ALARM_DETECTOR_TYPES,
  DOMESTIC_FIRE_ALARM_GRADES,
  DOMESTIC_FIRE_ALARM_INTERLINK_TYPES,
  DOMESTIC_FIRE_ALARM_NEXT_INSPECTION_PRESETS,
  DOMESTIC_FIRE_ALARM_POWER_SOURCES,
  DOMESTIC_FIRE_ALARM_STANDARD,
  DOMESTIC_FIRE_ALARM_REVISION,
} from '@/lib/electricalCertificates/domesticFireAlarmItems';
import type {
  DomesticFireAlarmCertificateData,
  DomesticFireAlarmChecklistOutcome,
  DomesticFireAlarmDetector,
  DomesticFireAlarmEditorSectionKey,
  FireAlarmOverallAssessment,
  FireAlarmVariation,
  FireAlarmVariationCode,
} from '@/lib/electricalCertificates/types';
import { DOMESTIC_FIRE_ALARM_EDITOR_SECTIONS } from '@/lib/electricalCertificates/types';
import { downloadCertificatePdf, openCertificatePdfPreviewWindow, previewCertificatePdf } from '@/lib/electricalCertificates/certificateExport';
import { CertificatePhotoGallery } from './CertificatePhotoGallery';
import { useCertificateEditor } from '../CertificateEditorContext';
import { DateInput } from './FormFields';

const inputClass =
  'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30';
const labelClass = 'mb-1 block text-sm font-medium text-slate-700';

type UpdateDomestic = (fn: (p: DomesticFireAlarmCertificateData) => DomesticFireAlarmCertificateData) => void;

export function DomesticFireAlarmCertificateEditor() {
  const { certificate, document, setDocument, saveDocument, saving, saveError, lastSavedAt, patchMeta } =
    useCertificateEditor();
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;
  const [section, setSection] = useState<DomesticFireAlarmEditorSectionKey>('installation-details');

  const domestic = useMemo(
    () => document.domesticFireAlarm ?? coerceDomesticFireAlarmData(null, certificate.customer_full_name ?? ''),
    [document.domesticFireAlarm, certificate.customer_full_name],
  );

  const updateDomestic: UpdateDomestic = (updater) => {
    setDocument((prev) => {
      const current = prev.domesticFireAlarm ?? coerceDomesticFireAlarmData(null, certificate.customer_full_name ?? '');
      return { ...prev, typeSlug: 'dfi_insp_2019_a1', domesticFireAlarm: updater(current) };
    });
  };

  const markCompleted = async () => {
    await saveDocument();
    await patchMeta({ status: certificate.status === 'completed' ? 'in_progress' : 'completed' });
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

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#f0f4f8]">
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/dashboard/certificates" className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50">
              <ChevronLeft className="size-4" />
            </Link>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Domestic Fire Alarm Inspection and Servicing Report
              </p>
              <h1 className="text-lg font-bold text-slate-900">{certificate.certificate_number}</h1>
              <p className="text-sm text-slate-600">
                Standard: {DOMESTIC_FIRE_ALARM_STANDARD} · Revision: {DOMESTIC_FIRE_ALARM_REVISION}
                {certificate.customer_full_name ? ` · ${certificate.customer_full_name}` : ''}
                {certificate.installation_label ? ` · ${certificate.installation_label}` : ''}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${certificate.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
              {certificate.status === 'completed' ? 'Completed' : 'In progress'}
            </span>
            {saving ? (
              <span className="flex items-center gap-1 text-xs text-slate-500"><Loader2 className="size-3 animate-spin" /> Saving...</span>
            ) : (
              <span className="text-xs text-slate-500">{saveError ? saveError : lastSavedAt ? 'Saved' : ''}</span>
            )}
            <ActionButton onClick={() => void saveDocument()} icon={<Save className="size-4" />} label="Save" />
            <ActionButton onClick={() => void previewPdf()} icon={<Printer className="size-4" />} label="Preview" />
            <ActionButton onClick={() => void downloadPdf()} icon={<Download className="size-4" />} label="PDF" />
            <button type="button" onClick={() => void markCompleted()} className="rounded-lg bg-[#14B8A6] px-3 py-2 text-sm font-semibold text-white hover:bg-[#0d9488]">
              {certificate.status === 'completed' ? 'Reopen' : 'Mark complete'}
            </button>
          </div>
        </div>
        <nav className="mt-3 flex flex-wrap gap-1 border-t border-slate-100 pt-3">
          {DOMESTIC_FIRE_ALARM_EDITOR_SECTIONS.map((s) => (
            <button key={s.key} type="button" onClick={() => setSection(s.key)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${section === s.key ? 'bg-[#14B8A6] text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              {s.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto max-w-5xl">
          {section === 'installation-details' && <InstallationSection domestic={domestic} update={updateDomestic} certificate={certificate} />}
          {section === 'variations' && <VariationsSection domestic={domestic} update={updateDomestic} />}
          {section === 'checklist' && <ChecklistSection domestic={domestic} update={updateDomestic} />}
          {section === 'detectors' && <DetectorsSection domestic={domestic} update={updateDomestic} />}
          {section === 'appendix' && (
            <AppendixSection
              content={document.appendix.content}
              photos={document.appendix.photos}
              onContent={(content) => setDocument((d) => ({ ...d, appendix: { ...d.appendix, content } }))}
              onPhotos={(photos) => setDocument((d) => ({ ...d, appendix: { ...d.appendix, photos } }))}
            />
          )}
        </div>
      </main>

      {certificate.job_number && (
        <footer className="shrink-0 border-t border-slate-200 bg-slate-800 px-4 py-2 text-center text-xs text-slate-300">
          Job No: {certificate.job_number} · {certificate.certificate_number}
        </footer>
      )}
    </div>
  );
}

function ActionButton({ onClick, icon, label }: { onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
      {icon} {label}
    </button>
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

function InstallationSection({ domestic, update, certificate }: { domestic: DomesticFireAlarmCertificateData; update: UpdateDomestic; certificate: { customer_full_name: string | null; installation_label: string | null } }) {
  return (
    <div className="space-y-4">
      <Panel title="Details of the client and installation">
        <p className="text-sm text-slate-700"><span className="font-semibold">Client:</span> {certificate.customer_full_name ?? '-'}</p>
        <p className="text-sm text-slate-700"><span className="font-semibold">Installation:</span> {certificate.installation_label ?? '-'}</p>
        <Field label="Occupier name" value={domestic.installation.occupierName} onChange={(occupierName) => update((p) => ({ ...p, installation: { ...p.installation, occupierName } }))} />
        <div className="grid gap-4 md:grid-cols-2">
          <ChoicePanel title="System grade" values={DOMESTIC_FIRE_ALARM_GRADES} value={domestic.installation.systemGrade} onChange={(systemGrade) => update((p) => ({ ...p, installation: { ...p.installation, systemGrade: systemGrade as typeof p.installation.systemGrade } }))} />
          <ChoicePanel title="System category" values={DOMESTIC_FIRE_ALARM_CATEGORIES} value={domestic.installation.systemCategory} onChange={(systemCategory) => update((p) => ({ ...p, installation: { ...p.installation, systemCategory: systemCategory as typeof p.installation.systemCategory } }))} />
        </div>
      </Panel>

      <Panel title="Summary and next inspection">
        <ChoicePanel
          title="Overall assessment"
          values={['satisfactory', 'unsatisfactory']}
          labels={{ satisfactory: 'Satisfactory', unsatisfactory: 'Unsatisfactory' }}
          value={domestic.summary.overallAssessment}
          onChange={(overallAssessment) => update((p) => ({ ...p, summary: { ...p.summary, overallAssessment: overallAssessment as FireAlarmOverallAssessment } }))}
        />
        <DateInput
          label="Recommended next inspection date"
          value={domestic.summary.nextInspectionDate}
          onChange={(v) => update((p) => ({ ...p, summary: { ...p.summary, nextInspectionDate: v, nextInspectionPreset: '' } }))}
          inputClassName={inputClass}
          labelClassName={labelClass}
        />
        <div className="flex flex-wrap gap-2">
          {DOMESTIC_FIRE_ALARM_NEXT_INSPECTION_PRESETS.map((preset) => (
            <button key={preset.value} type="button" onClick={() => update((p) => ({ ...p, summary: { ...p.summary, nextInspectionPreset: preset.value, nextInspectionDate: preset.value === 'other' ? p.summary.nextInspectionDate : dateAfterPreset(preset.value) } }))} className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${domestic.summary.nextInspectionPreset === preset.value ? 'border-[#14B8A6] bg-[#14B8A6]/10 text-[#0d9488]' : 'border-slate-200 text-slate-600'}`}>
              {preset.label}
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="Extent, limitations and condition">
        <TextArea label="Extent of system covered by this certificate" value={domestic.installation.extentOfSystem} onChange={(extentOfSystem) => update((p) => ({ ...p, installation: { ...p.installation, extentOfSystem } }))} />
        <TextArea label="Agreed limitations of inspection, testing and servicing" value={domestic.installation.limitations} onChange={(limitations) => update((p) => ({ ...p, installation: { ...p.installation, limitations } }))} />
        <TextArea label="General condition of the fire detection and alarm system" value={domestic.installation.generalCondition} onChange={(generalCondition) => update((p) => ({ ...p, installation: { ...p.installation, generalCondition } }))} />
      </Panel>

      <Panel title="Declaration">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Inspected and tested by" value={domestic.declaration.inspectedBy} onChange={(inspectedBy) => update((p) => ({ ...p, declaration: { ...p.declaration, inspectedBy } }))} />
          <Field label="Inspector position" value={domestic.declaration.inspectedPosition} onChange={(inspectedPosition) => update((p) => ({ ...p, declaration: { ...p.declaration, inspectedPosition } }))} />
          <Field label="Authorised for issue by" value={domestic.declaration.authorisedBy} onChange={(authorisedBy) => update((p) => ({ ...p, declaration: { ...p.declaration, authorisedBy } }))} />
          <Field label="Authorised position" value={domestic.declaration.authorisedPosition} onChange={(authorisedPosition) => update((p) => ({ ...p, declaration: { ...p.declaration, authorisedPosition } }))} />
          <Field label="Inspection date" type="date" value={domestic.declaration.inspectionDate} onChange={(inspectionDate) => update((p) => ({ ...p, declaration: { ...p.declaration, inspectionDate } }))} />
          <Field label="Authorised date" type="date" value={domestic.declaration.authorisedDate} onChange={(authorisedDate) => update((p) => ({ ...p, declaration: { ...p.declaration, authorisedDate } }))} />
        </div>
      </Panel>
    </div>
  );
}

function VariationsSection({ domestic, update }: { domestic: DomesticFireAlarmCertificateData; update: UpdateDomestic }) {
  const addVariation = () => update((p) => ({ ...p, variations: [...p.variations, { id: newId('dfv'), details: '', code: '', location: '', photos: [] }] }));
  const updateVariation = (id: string, patch: Partial<FireAlarmVariation>) => update((p) => ({ ...p, variations: p.variations.map((v) => (v.id === id ? { ...v, ...patch } : v)) }));
  return (
    <div className="space-y-4">
      <Panel title="Variations">
        <button type="button" onClick={addVariation} className="inline-flex items-center gap-1 rounded-lg bg-[#14B8A6] px-3 py-2 text-sm font-semibold text-white"><Plus className="size-4" /> Add variation</button>
        {domestic.variations.length === 0 && <p className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-sm text-slate-500">No variations</p>}
        {domestic.variations.map((v, index) => (
          <div key={v.id} className="space-y-3 rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between"><p className="font-semibold">Variation {index + 1}</p><DeleteButton onClick={() => update((p) => ({ ...p, variations: p.variations.filter((item) => item.id !== v.id) }))} /></div>
            <TextArea label="Details" value={v.details} onChange={(details) => updateVariation(v.id, { details })} />
            <ChoicePanel title="Code" values={['c1', 'c2', 'fi', 'c3']} labels={{ c1: 'C1', c2: 'C2', fi: 'FI', c3: 'C3' }} value={v.code} onChange={(code) => updateVariation(v.id, { code: code as FireAlarmVariationCode })} />
            <Field label="Location" value={v.location} onChange={(location) => updateVariation(v.id, { location })} />
            <CertificatePhotoGallery photos={v.photos} label="Variation photos" onChange={(photos) => updateVariation(v.id, { photos })} />
          </div>
        ))}
      </Panel>
      <Panel title="Remedial actions">
        <TextArea label="The following remedial work/action is considered necessary" value={domestic.remedialActions} onChange={(remedialActions) => update((p) => ({ ...p, remedialActions }))} />
      </Panel>
    </div>
  );
}

function ChecklistSection({ domestic, update }: { domestic: DomesticFireAlarmCertificateData; update: UpdateDomestic }) {
  const sections = [...new Set(DOMESTIC_FIRE_ALARM_CHECKLIST_ITEMS.map((item) => item.section))];
  const setSection = (section: string, outcome: DomesticFireAlarmChecklistOutcome) => update((p) => {
    const checklist = { ...p.checklist };
    DOMESTIC_FIRE_ALARM_CHECKLIST_ITEMS.filter((i) => i.section === section).forEach((i) => { checklist[i.id] = outcome; });
    return { ...p, checklist };
  });
  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <Panel key={section} title={DOMESTIC_FIRE_ALARM_CHECKLIST_SECTION_LABELS[section]}>
          <div className="flex flex-wrap gap-2">
            {(['pass', 'fail', 'na'] as DomesticFireAlarmChecklistOutcome[]).map((outcome) => (
              <button key={outcome} type="button" onClick={() => setSection(section, outcome)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                Set all as {DOMESTIC_FIRE_ALARM_CHECKLIST_OUTCOME_LABELS[outcome]}
              </button>
            ))}
          </div>
          {DOMESTIC_FIRE_ALARM_CHECKLIST_ITEMS.filter((i) => i.section === section).map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 p-3">
              <p className="min-w-[240px] flex-1 text-sm font-medium text-slate-700">{item.label}</p>
              <OutcomeButtons value={domestic.checklist[item.id] ?? ''} onChange={(outcome) => update((p) => ({ ...p, checklist: { ...p.checklist, [item.id]: outcome } }))} />
            </div>
          ))}
          {section === 'testing' && (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Sound Level Instrument Model" value={domestic.soundLevelInstrumentModel} onChange={(soundLevelInstrumentModel) => update((p) => ({ ...p, soundLevelInstrumentModel }))} />
              <Field label="Sound Level Instrument Serial" value={domestic.soundLevelInstrumentSerial} onChange={(soundLevelInstrumentSerial) => update((p) => ({ ...p, soundLevelInstrumentSerial }))} />
            </div>
          )}
        </Panel>
      ))}
    </div>
  );
}

function DetectorsSection({ domestic, update }: { domestic: DomesticFireAlarmCertificateData; update: UpdateDomestic }) {
  const addDetector = () => update((p) => ({ ...p, detectors: [...p.detectors, emptyDomesticDetector()] }));
  const updateDetector = (id: string, patch: Partial<DomesticFireAlarmDetector>) => update((p) => ({ ...p, detectors: p.detectors.map((d) => (d.id === id ? { ...d, ...patch } : d)) }));
  return (
    <Panel title="Detectors">
      <button type="button" onClick={addDetector} className="inline-flex items-center gap-1 rounded-lg bg-[#14B8A6] px-3 py-2 text-sm font-semibold text-white"><Plus className="size-4" /> Add detector</button>
      {domestic.detectors.length === 0 && <p className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-sm text-slate-500">No detectors</p>}
      {domestic.detectors.map((d, index) => (
        <div key={d.id} className="space-y-3 rounded-lg border border-slate-200 p-3">
          <div className="flex items-center justify-between"><p className="font-semibold">Detector {index + 1}</p><DeleteButton onClick={() => update((p) => ({ ...p, detectors: p.detectors.filter((item) => item.id !== d.id) }))} /></div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Detector Reference" value={d.reference} onChange={(reference) => updateDetector(d.id, { reference })} />
            <Field label="Location" value={d.location} onChange={(location) => updateDetector(d.id, { location })} />
            <SelectField label="Make" value={d.make} options={DOMESTIC_FIRE_ALARM_DETECTOR_MAKES} onChange={(make) => updateDetector(d.id, { make })} />
            <Field label="Model" value={d.model} onChange={(model) => updateDetector(d.id, { model })} />
            <SelectField label="Power Source" value={d.powerSource} options={DOMESTIC_FIRE_ALARM_POWER_SOURCES} onChange={(powerSource) => updateDetector(d.id, { powerSource })} />
            <SelectField label="Interlink" value={d.interlink} options={DOMESTIC_FIRE_ALARM_INTERLINK_TYPES} onChange={(interlink) => updateDetector(d.id, { interlink })} />
            <Field label="Expiry Date" type="date" value={d.expiryDate} onChange={(expiryDate) => updateDetector(d.id, { expiryDate })} />
            <ChoicePanel title="Fit for Continued Service" values={['yes', 'no', 'na']} labels={{ yes: 'YES', no: 'NO', na: 'N/A' }} value={d.fitForContinuedService} onChange={(fitForContinuedService) => updateDetector(d.id, { fitForContinuedService: fitForContinuedService as DomesticFireAlarmDetector['fitForContinuedService'] })} />
          </div>
          <CheckboxGroup values={DOMESTIC_FIRE_ALARM_DETECTOR_TYPES} selected={d.detectorTypes} onChange={(detectorTypes) => updateDetector(d.id, { detectorTypes })} />
          <TextArea label="Notes" value={d.notes} onChange={(notes) => updateDetector(d.id, { notes })} />
          <CertificatePhotoGallery photos={d.photos} label="Detector photos" onChange={(photos) => updateDetector(d.id, { photos })} />
        </div>
      ))}
    </Panel>
  );
}

function AppendixSection({ content, photos, onContent, onPhotos }: { content: string; photos: { id: string; caption: string; dataUrl: string }[]; onContent: (content: string) => void; onPhotos: (photos: { id: string; caption: string; dataUrl: string }[]) => void }) {
  return (
    <div className="space-y-4">
      <Panel title="Additional page">
        <TextArea label="Any additional content" value={content} onChange={onContent} placeholder="Enter additional page content here..." />
      </Panel>
      <Panel title="Appendix photos">
        <CertificatePhotoGallery photos={photos} onChange={onPhotos} label="Appendix photos" />
      </Panel>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  if (type === 'date') {
    return (
      <DateInput
        label={label}
        value={value}
        onChange={onChange}
        inputClassName={inputClass}
        labelClassName={labelClass}
      />
    );
  }
  return (
    <label className={labelClass}>
      {label}
      <input type={type} className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
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

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void }) {
  return (
    <label className={labelClass}>
      {label}
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select...</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
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

function OutcomeButtons({ value, onChange }: { value: DomesticFireAlarmChecklistOutcome; onChange: (value: DomesticFireAlarmChecklistOutcome) => void }) {
  return (
    <div className="flex gap-1">
      {(['pass', 'fail', 'na'] as DomesticFireAlarmChecklistOutcome[]).map((outcome) => (
        <button key={outcome} type="button" onClick={() => onChange(outcome)} className={`rounded border px-2 py-1 text-xs font-bold ${value === outcome ? 'border-[#14B8A6] bg-[#14B8A6]/10 text-[#0d9488]' : 'border-slate-200 text-slate-500'}`}>
          {DOMESTIC_FIRE_ALARM_CHECKLIST_OUTCOME_LABELS[outcome]}
        </button>
      ))}
    </div>
  );
}

function CheckboxGroup({ values, selected, onChange }: { values: readonly string[]; selected: string[]; onChange: (value: string[]) => void }) {
  return (
    <div>
      <p className={labelClass}>Type</p>
      <div className="flex flex-wrap gap-2">
        {values.map((value) => {
          const checked = selected.includes(value);
          return (
            <button key={value} type="button" onClick={() => onChange(checked ? selected.filter((v) => v !== value) : [...selected, value])} className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${checked ? 'border-[#14B8A6] bg-[#14B8A6]/10 text-[#0d9488]' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              {value}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Delete">
      <Trash2 className="size-4" />
    </button>
  );
}

function dateAfterPreset(preset: string): string {
  const date = new Date();
  if (preset === '6months') date.setMonth(date.getMonth() + 6);
  if (preset === '1year') date.setFullYear(date.getFullYear() + 1);
  if (preset === '5years') date.setFullYear(date.getFullYear() + 5);
  if (preset === '10years') date.setFullYear(date.getFullYear() + 10);
  return date.toISOString().slice(0, 10);
}
