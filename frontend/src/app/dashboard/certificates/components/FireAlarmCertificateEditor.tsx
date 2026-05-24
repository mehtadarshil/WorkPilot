'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Download, Loader2, Plus, Printer, Save, Trash2 } from 'lucide-react';
import {
  coerceFireAlarmData,
  newId,
} from '@/lib/electricalCertificates/documentDefaults';
import {
  FIRE_ALARM_INSPECTION_SCHEDULE_ITEMS,
  FIRE_ALARM_OUTCOME_LABELS,
  FIRE_ALARM_SECTION_LABELS,
} from '@/lib/electricalCertificates/fireAlarmInspectionScheduleItems';
import type {
  FireAlarmCertificateData,
  FireAlarmEditorSectionKey,
  FireAlarmInspectionOutcome,
  FireAlarmVariation,
  FireAlarmVariationCode,
  FireAlarmYesNa,
} from '@/lib/electricalCertificates/types';
import { FIRE_ALARM_EDITOR_SECTIONS } from '@/lib/electricalCertificates/types';
import { downloadCertificatePdf } from '@/lib/electricalCertificates/certificateExport';
import { CertificatePhotoGallery } from './CertificatePhotoGallery';
import { useCertificateEditor } from '../CertificateEditorContext';

const inputClass =
  'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30';
const labelClass = 'mb-1 block text-sm font-medium text-slate-700';

export function FireAlarmCertificateEditor() {
  const { certificate, document, setDocument, saveDocument, saving, saveError, lastSavedAt, patchMeta } =
    useCertificateEditor();
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;
  const [section, setSection] = useState<FireAlarmEditorSectionKey>('installation-details');

  const fa = useMemo(
    () =>
      document.fireAlarm
        ? document.fireAlarm
        : coerceFireAlarmData(null, certificate.customer_full_name ?? ''),
    [document.fireAlarm, certificate.customer_full_name],
  );

  const updateFa = (updater: (prev: FireAlarmCertificateData) => FireAlarmCertificateData) => {
    setDocument((prev) => {
      const current = prev.fireAlarm ?? coerceFireAlarmData(null, certificate.customer_full_name ?? '');
      return { ...prev, typeSlug: 'fi_insp_2025', fireAlarm: updater(current) };
    });
  };

  const downloadPdf = async () => {
    if (!token) return;
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
            <Link
              href="/dashboard/certificates"
              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
            >
              <ChevronLeft className="size-4" />
            </Link>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Fire Alarm Inspection &amp; Servicing Report
              </p>
              <h1 className="text-lg font-bold text-slate-900">{certificate.certificate_number}</h1>
              <p className="text-sm text-slate-600">
                BS 5839-1:2025
                {certificate.customer_full_name ? ` · ${certificate.customer_full_name}` : ''}
                {certificate.installation_label ? ` · ${certificate.installation_label}` : ''}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                certificate.status === 'completed'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {certificate.status === 'completed' ? 'Completed' : 'In progress'}
            </span>
            {saving ? (
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <Loader2 className="size-3 animate-spin" /> Saving…
              </span>
            ) : (
              <span className="text-xs text-slate-500">{saveError ? saveError : lastSavedAt ? 'Saved' : ''}</span>
            )}
            <button
              type="button"
              onClick={() => void saveDocument()}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Save className="size-4" /> Save
            </button>
            <button
              type="button"
              onClick={() => window.open(`/dashboard/certificates/${certificate.id}/print`, '_blank')}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Printer className="size-4" /> Preview
            </button>
            <button
              type="button"
              onClick={() => void downloadPdf()}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Download className="size-4" /> PDF
            </button>
            <button
              type="button"
              onClick={() => void markCompleted()}
              className="rounded-lg bg-[#14B8A6] px-3 py-2 text-sm font-semibold text-white hover:bg-[#0d9488]"
            >
              {certificate.status === 'completed' ? 'Reopen' : 'Mark complete'}
            </button>
          </div>
        </div>
        <nav className="mt-3 flex flex-wrap gap-1 border-t border-slate-100 pt-3">
          {FIRE_ALARM_EDITOR_SECTIONS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSection(s.key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                section === s.key
                  ? 'bg-[#14B8A6] text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {s.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto max-w-5xl">
          {section === 'installation-details' && (
            <InstallationDetailsSection fa={fa} updateFa={updateFa} certificate={certificate} />
          )}
          {section === 'variations' && <VariationsSection fa={fa} updateFa={updateFa} />}
          {section === 'inspection-schedule' && <InspectionScheduleSection fa={fa} updateFa={updateFa} />}
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

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function InstallationDetailsSection({
  fa,
  updateFa,
  certificate,
}: {
  fa: FireAlarmCertificateData;
  updateFa: (fn: (p: FireAlarmCertificateData) => FireAlarmCertificateData) => void;
  certificate: { customer_full_name: string | null; installation_label: string | null };
}) {
  return (
    <div className="space-y-4">
      <Panel title="Details of the client">
        <p className="text-sm text-slate-700">
          <span className="font-semibold">Client:</span> {certificate.customer_full_name ?? '—'}
        </p>
        {certificate.installation_label && (
          <p className="text-sm text-slate-700">
            <span className="font-semibold">Installation:</span> {certificate.installation_label}
          </p>
        )}
      </Panel>

      <Panel title="Details of the installation">
        <label className={labelClass}>
          Occupier name
          <input
            className={inputClass}
            value={fa.installation.occupierName}
            onChange={(e) =>
              updateFa((p) => ({ ...p, installation: { ...p.installation, occupierName: e.target.value } }))
            }
          />
        </label>
        <label className={labelClass}>
          Details of system
          <textarea
            className={inputClass}
            rows={3}
            value={fa.installation.detailsOfSystem}
            onChange={(e) =>
              updateFa((p) => ({ ...p, installation: { ...p.installation, detailsOfSystem: e.target.value } }))
            }
          />
        </label>
        <label className={labelClass}>
          Extent of system covered by this certificate
          <textarea
            className={inputClass}
            rows={3}
            value={fa.installation.extentOfSystem}
            onChange={(e) =>
              updateFa((p) => ({ ...p, installation: { ...p.installation, extentOfSystem: e.target.value } }))
            }
          />
        </label>
        <div className="flex flex-wrap items-end gap-3">
          <label className={`${labelClass} flex-1 min-w-[200px]`}>
            Previous service date
            <input
              type="date"
              className={inputClass}
              disabled={fa.installation.previousServiceUnknown}
              value={fa.installation.previousServiceDate}
              onChange={(e) =>
                updateFa((p) => ({
                  ...p,
                  installation: { ...p.installation, previousServiceDate: e.target.value },
                }))
              }
            />
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={fa.installation.previousServiceUnknown}
              onChange={(e) =>
                updateFa((p) => ({
                  ...p,
                  installation: {
                    ...p.installation,
                    previousServiceUnknown: e.target.checked,
                    previousServiceDate: e.target.checked ? '' : p.installation.previousServiceDate,
                  },
                }))
              }
            />
            Unknown
          </label>
        </div>
      </Panel>

      <Panel title="Limitations & documentation">
        <label className={labelClass}>
          Limitations of inspection, testing and servicing
          <textarea
            className={inputClass}
            rows={3}
            value={fa.limitations.limitationsText}
            onChange={(e) =>
              updateFa((p) => ({ ...p, limitations: { ...p.limitations, limitationsText: e.target.value } }))
            }
          />
        </label>
        <label className={labelClass}>
          Related reference documents and certificate numbers
          <textarea
            className={inputClass}
            rows={2}
            value={fa.limitations.relatedDocuments}
            onChange={(e) =>
              updateFa((p) => ({ ...p, limitations: { ...p.limitations, relatedDocuments: e.target.value } }))
            }
          />
        </label>
        <label className={labelClass}>
          List any essential reference documents relevant to this certificate
          <textarea
            className={inputClass}
            rows={2}
            value={fa.limitations.essentialReferenceDocs}
            onChange={(e) =>
              updateFa((p) => ({
                ...p,
                limitations: { ...p.limitations, essentialReferenceDocs: e.target.value },
              }))
            }
          />
        </label>
      </Panel>

      <Panel title="Condition of installation">
        <label className={labelClass}>
          General condition of the fire detection and alarm system
          <textarea
            className={inputClass}
            rows={3}
            value={fa.condition.generalCondition}
            onChange={(e) =>
              updateFa((p) => ({ ...p, condition: { ...p.condition, generalCondition: e.target.value } }))
            }
          />
        </label>
        <label className={labelClass}>
          Date of inspection and servicing
          <input
            type="date"
            className={inputClass}
            value={fa.condition.inspectionDate}
            onChange={(e) =>
              updateFa((p) => ({ ...p, condition: { ...p.condition, inspectionDate: e.target.value } }))
            }
          />
        </label>
        <YesNaField
          label="Outstanding defects reported to responsible person"
          value={fa.condition.outstandingDefectsReported}
          onChange={(v) => updateFa((p) => ({ ...p, condition: { ...p.condition, outstandingDefectsReported: v } }))}
        />
        <YesNaField
          label="Relevant details entered in the system log book (Clause 40.2)"
          value={fa.condition.logBookUpdated}
          onChange={(v) => updateFa((p) => ({ ...p, condition: { ...p.condition, logBookUpdated: v } }))}
        />
        <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
          <p className="mb-2 text-sm font-medium text-slate-700">
            During the last 12 months, false alarms have occurred
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className={`${inputClass} max-w-[120px]`}
              placeholder="Count"
              disabled={fa.condition.falseAlarmsNa}
              value={fa.condition.falseAlarmsCount}
              onChange={(e) =>
                updateFa((p) => ({ ...p, condition: { ...p.condition, falseAlarmsCount: e.target.value } }))
              }
            />
            <ToggleChip
              label="N/A"
              active={fa.condition.falseAlarmsNa}
              onClick={() =>
                updateFa((p) => ({
                  ...p,
                  condition: { ...p.condition, falseAlarmsNa: !p.condition.falseAlarmsNa },
                }))
              }
            />
            <ToggleChip
              label="LIM"
              active={fa.condition.falseAlarmsLim}
              onClick={() =>
                updateFa((p) => ({
                  ...p,
                  condition: { ...p.condition, falseAlarmsLim: !p.condition.falseAlarmsLim },
                }))
              }
            />
          </div>
          <p className="mt-3 mb-2 text-sm text-slate-600">This number of false alarms equates to</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className={`${inputClass} max-w-[140px]`}
              placeholder="0.00"
              disabled={fa.condition.falseAlarmsEquatesNa}
              value={fa.condition.falseAlarmsEquates}
              onChange={(e) =>
                updateFa((p) => ({ ...p, condition: { ...p.condition, falseAlarmsEquates: e.target.value } }))
              }
            />
            <span className="text-xs text-slate-500">false alarms per 100 automatic fire detectors per annum</span>
            <ToggleChip
              label="N/A"
              active={fa.condition.falseAlarmsEquatesNa}
              onClick={() =>
                updateFa((p) => ({
                  ...p,
                  condition: { ...p.condition, falseAlarmsEquatesNa: !p.condition.falseAlarmsEquatesNa },
                }))
              }
            />
            <ToggleChip
              label="LIM"
              active={fa.condition.falseAlarmsEquatesLim}
              onClick={() =>
                updateFa((p) => ({
                  ...p,
                  condition: { ...p.condition, falseAlarmsEquatesLim: !p.condition.falseAlarmsEquatesLim },
                }))
              }
            />
          </div>
        </div>
      </Panel>

      <Panel title="Summary and next inspection">
        <p className="text-sm text-slate-600">
          Overall assessment of the installation in terms of its suitability for continued use:
        </p>
        <div className="flex flex-wrap gap-2">
          <AssessmentBtn
            label="Satisfactory"
            active={fa.summary.overallAssessment === 'satisfactory'}
            onClick={() =>
              updateFa((p) => ({ ...p, summary: { ...p.summary, overallAssessment: 'satisfactory' } }))
            }
          />
          <AssessmentBtn
            label="Unsatisfactory"
            active={fa.summary.overallAssessment === 'unsatisfactory'}
            variant="bad"
            onClick={() =>
              updateFa((p) => ({ ...p, summary: { ...p.summary, overallAssessment: 'unsatisfactory' } }))
            }
          />
        </div>
        <p className="text-sm text-slate-600">
          Based upon risk assessment, I recommend inspection and servicing no later than:
        </p>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['6months', '6 months'],
              ['1year', '1 year'],
              ['5years', '5 years'],
              ['10years', '10 years'],
              ['other', 'Other…'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => updateFa((p) => ({ ...p, summary: { ...p.summary, nextInspectionPreset: key } }))}
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                fa.summary.nextInspectionPreset === key
                  ? 'border-[#14B8A6] bg-[#14B8A6]/10 text-[#0d9488]'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className={labelClass}>
          Next inspection date
          <input
            type="date"
            className={inputClass}
            value={fa.summary.nextInspectionDate}
            onChange={(e) =>
              updateFa((p) => ({ ...p, summary: { ...p.summary, nextInspectionDate: e.target.value } }))
            }
          />
        </label>
      </Panel>

      <Panel title="Declaration">
        <label className={labelClass}>
          Inspected by
          <input
            className={inputClass}
            value={fa.declaration.inspectedBy}
            onChange={(e) =>
              updateFa((p) => ({ ...p, declaration: { ...p.declaration, inspectedBy: e.target.value } }))
            }
          />
        </label>
        <label className={labelClass}>
          Date (inspection &amp; servicing)
          <input
            type="date"
            className={inputClass}
            value={fa.declaration.inspectionDate}
            onChange={(e) =>
              updateFa((p) => ({ ...p, declaration: { ...p.declaration, inspectionDate: e.target.value } }))
            }
          />
        </label>
        <label className={labelClass}>
          Authorised for issue by
          <input
            className={inputClass}
            value={fa.declaration.authorisedBy}
            onChange={(e) =>
              updateFa((p) => ({ ...p, declaration: { ...p.declaration, authorisedBy: e.target.value } }))
            }
          />
        </label>
        <label className={labelClass}>
          Date (authorised)
          <input
            type="date"
            className={inputClass}
            value={fa.declaration.authorisedDate}
            onChange={(e) =>
              updateFa((p) => ({ ...p, declaration: { ...p.declaration, authorisedDate: e.target.value } }))
            }
          />
        </label>
      </Panel>
    </div>
  );
}

function VariationsSection({
  fa,
  updateFa,
}: {
  fa: FireAlarmCertificateData;
  updateFa: (fn: (p: FireAlarmCertificateData) => FireAlarmCertificateData) => void;
}) {
  const addVariation = () => {
    updateFa((p) => ({
      ...p,
      variations: [
        ...p.variations,
        { id: newId('fav'), details: '', code: '', location: '', photos: [] },
      ],
    }));
  };

  const updateVariation = (id: string, patch: Partial<FireAlarmVariation>) => {
    updateFa((p) => ({
      ...p,
      variations: p.variations.map((v) => (v.id === id ? { ...v, ...patch } : v)),
    }));
  };

  const removeVariation = (id: string) => {
    updateFa((p) => ({ ...p, variations: p.variations.filter((v) => v.id !== id) }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">Variations</h2>
        <button
          type="button"
          onClick={addVariation}
          className="inline-flex items-center gap-1 rounded-lg bg-[#14B8A6] px-3 py-2 text-sm font-semibold text-white hover:bg-[#0d9488]"
        >
          <Plus className="size-4" /> Add variation
        </button>
      </div>

      {fa.variations.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          No variations yet.
        </p>
      )}

      {fa.variations.map((v, idx) => (
        <section key={v.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">Variation {idx + 1}</h3>
            <button
              type="button"
              onClick={() => removeVariation(v.id)}
              className="rounded-lg p-1.5 text-red-600 hover:bg-red-50"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
          <label className={labelClass}>
            Details
            <textarea
              className={inputClass}
              rows={3}
              value={v.details}
              onChange={(e) => updateVariation(v.id, { details: e.target.value })}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {(['', 'c1', 'c2', 'fi', 'c3'] as FireAlarmVariationCode[]).map((code) => (
              <button
                key={code || 'none'}
                type="button"
                onClick={() => updateVariation(v.id, { code })}
                className={`rounded-lg border px-3 py-1 text-sm font-bold ${
                  v.code === code ? 'border-[#14B8A6] bg-[#14B8A6]/10' : 'border-slate-200'
                }`}
              >
                {code || '—'}
              </button>
            ))}
          </div>
          <label className={labelClass}>
            Location
            <input
              className={inputClass}
              value={v.location}
              onChange={(e) => updateVariation(v.id, { location: e.target.value })}
            />
          </label>
          <CertificatePhotoGallery
            label="Photos"
            photos={v.photos}
            onChange={(photos) => updateVariation(v.id, { photos })}
          />
        </section>
      ))}

      <Panel title="Remedial actions">
        <label className={labelClass}>
          The following remedial work/action is considered necessary
          <textarea
            className={inputClass}
            rows={4}
            value={fa.remedialActions}
            onChange={(e) => updateFa((p) => ({ ...p, remedialActions: e.target.value }))}
          />
        </label>
      </Panel>
    </div>
  );
}

function InspectionScheduleSection({
  fa,
  updateFa,
}: {
  fa: FireAlarmCertificateData;
  updateFa: (fn: (p: FireAlarmCertificateData) => FireAlarmCertificateData) => void;
}) {
  const sections = [...new Set(FIRE_ALARM_INSPECTION_SCHEDULE_ITEMS.map((i) => i.section))];

  const setOutcome = (itemId: string, outcome: FireAlarmInspectionOutcome) => {
    updateFa((p) => ({
      ...p,
      inspectionSchedule: {
        ...p.inspectionSchedule,
        [itemId]: p.inspectionSchedule[itemId] === outcome ? '' : outcome,
      },
    }));
  };

  const setSectionAll = (section: string, outcome: FireAlarmInspectionOutcome) => {
    updateFa((p) => {
      const next = { ...p.inspectionSchedule };
      for (const item of FIRE_ALARM_INSPECTION_SCHEDULE_ITEMS.filter((i) => i.section === section)) {
        next[item.id] = outcome;
      }
      return { ...p, inspectionSchedule: next };
    });
  };

  const setAll = (outcome: FireAlarmInspectionOutcome) => {
    updateFa((p) => {
      const next: Record<string, FireAlarmInspectionOutcome> = {};
      for (const item of FIRE_ALARM_INSPECTION_SCHEDULE_ITEMS) {
        next[item.id] = outcome;
      }
      return { ...p, inspectionSchedule: next };
    });
  };

  const clearAll = () => {
    updateFa((p) => ({ ...p, inspectionSchedule: {} }));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <button
          type="button"
          onClick={() => setAll('pass')}
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800"
        >
          Set all ✓
        </button>
        <button
          type="button"
          onClick={clearAll}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600"
        >
          Clear all
        </button>
      </div>

      {sections.map((sec) => {
        const items = FIRE_ALARM_INSPECTION_SCHEDULE_ITEMS.filter((i) => i.section === sec);
        return (
          <Panel key={sec} title={`${sec}. ${FIRE_ALARM_SECTION_LABELS[sec] ?? sec}`}>
            <div className="mb-3 flex flex-wrap gap-2">
              {(['pass', 'fail', 'na', 'lim'] as FireAlarmInspectionOutcome[]).map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setSectionAll(sec, o)}
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold hover:bg-slate-50"
                >
                  Set {FIRE_ALARM_OUTCOME_LABELS[o]}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  const next = { ...fa.inspectionSchedule };
                  for (const item of items) delete next[item.id];
                  updateFa((p) => ({ ...p, inspectionSchedule: next }));
                }}
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold hover:bg-slate-50"
              >
                Clear section
              </button>
            </div>
            <ul className="space-y-2">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50/80 p-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-mono text-xs text-slate-500">{item.id}</span>
                    {item.group && (
                      <span className="ml-2 text-xs font-medium text-slate-400">{item.group}</span>
                    )}
                    <p className="text-sm text-slate-800">{item.label}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1">
                    {(['pass', 'fail', 'na', 'lim'] as FireAlarmInspectionOutcome[]).map((o) => (
                      <button
                        key={o}
                        type="button"
                        onClick={() => setOutcome(item.id, o)}
                        className={`min-w-[2.5rem] rounded-lg border px-2 py-1 text-xs font-bold ${
                          fa.inspectionSchedule[item.id] === o
                            ? 'border-[#14B8A6] bg-[#14B8A6] text-white'
                            : 'border-slate-200 bg-white text-slate-600'
                        }`}
                      >
                        {FIRE_ALARM_OUTCOME_LABELS[o]}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        );
      })}
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
  photos: import('@/lib/electricalCertificates/types').CertificatePhoto[];
  onContent: (v: string) => void;
  onPhotos: (photos: import('@/lib/electricalCertificates/types').CertificatePhoto[]) => void;
}) {
  return (
    <div className="space-y-4">
      <Panel title="Additional page">
        <p className="text-sm text-slate-600">
          This text appears on an additional page at the end of the certificate, above appendix photos.
        </p>
        <textarea
          className={inputClass}
          rows={6}
          placeholder="Enter additional page content here…"
          value={content}
          onChange={(e) => onContent(e.target.value)}
        />
      </Panel>
      <Panel title="Appendix photos">
        <CertificatePhotoGallery photos={photos} onChange={onPhotos} label="Appendix photographs" />
      </Panel>
    </div>
  );
}

function YesNaField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: FireAlarmYesNa;
  onChange: (v: FireAlarmYesNa) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-slate-700">{label}</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange(value === 'yes' ? '' : 'yes')}
          className={`rounded-lg border px-4 py-1.5 text-sm font-semibold ${
            value === 'yes' ? 'border-[#14B8A6] bg-[#14B8A6]/10' : 'border-slate-200'
          }`}
        >
          YES
        </button>
        <button
          type="button"
          onClick={() => onChange(value === 'na' ? '' : 'na')}
          className={`rounded-lg border px-4 py-1.5 text-sm font-semibold ${
            value === 'na' ? 'border-[#14B8A6] bg-[#14B8A6]/10' : 'border-slate-200'
          }`}
        >
          N/A
        </button>
      </div>
    </div>
  );
}

function ToggleChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
        active ? 'border-amber-400 bg-amber-50 text-amber-900' : 'border-slate-200 text-slate-600'
      }`}
    >
      {label}
    </button>
  );
}

function AssessmentBtn({
  label,
  active,
  onClick,
  variant = 'good',
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  variant?: 'good' | 'bad';
}) {
  const activeClass =
    variant === 'bad'
      ? 'border-red-500 bg-red-50 text-red-800'
      : 'border-emerald-500 bg-emerald-50 text-emerald-800';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
        active ? activeClass : 'border-slate-200 text-slate-600 hover:bg-slate-50'
      }`}
    >
      {label}
    </button>
  );
}
