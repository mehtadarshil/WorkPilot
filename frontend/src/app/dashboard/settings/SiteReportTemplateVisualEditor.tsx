'use client';

import { ChevronDown, ChevronUp, Plus, Trash2, ImageIcon } from 'lucide-react';
import type {
  SiteReportFieldType,
  SiteReportTemplateDefinition,
  SiteReportTemplateField,
  SiteReportTemplateSection,
  SiteReportTemplateFooter,
} from '@/lib/siteReportTemplateTypes';
import { SITE_REPORT_FIELD_TYPE_OPTIONS, newTemplateField, newTemplateSection, emptyFooter } from '@/lib/siteReportTemplateTypes';

function moveItem<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const j = index + delta;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  const [it] = next.splice(index, 1);
  next.splice(j, 0, it);
  return next;
}

function updateSection(def: SiteReportTemplateDefinition, index: number, patch: Partial<SiteReportTemplateSection>): SiteReportTemplateDefinition {
  const sections = def.sections.map((s, i) => (i === index ? { ...s, ...patch } : s));
  return { ...def, sections };
}

function updateFieldInSection(
  def: SiteReportTemplateDefinition,
  sIdx: number,
  fIdx: number,
  patch: Partial<SiteReportTemplateField>,
): SiteReportTemplateDefinition {
  const sec = def.sections[sIdx];
  if (!sec) return def;
  const fields = sec.fields.map((f, i) => (i === fIdx ? { ...f, ...patch } : f));
  return updateSection(def, sIdx, { fields });
}

function updateFooter(def: SiteReportTemplateDefinition, patch: Partial<SiteReportTemplateFooter>): SiteReportTemplateDefinition {
  const prev: SiteReportTemplateFooter = def.footer || { fields: [] };
  return { ...def, footer: { ...prev, ...patch } };
}

function updateFieldInFooter(def: SiteReportTemplateDefinition, fIdx: number, patch: Partial<SiteReportTemplateField>): SiteReportTemplateDefinition {
  const footer = def.footer || emptyFooter();
  const fields = footer.fields.map((f, i) => (i === fIdx ? { ...f, ...patch } : f));
  return { ...def, footer: { ...footer, fields } };
}

type Props = {
  value: SiteReportTemplateDefinition;
  onChange: (next: SiteReportTemplateDefinition) => void;
};

export default function SiteReportTemplateVisualEditor({ value, onChange }: Props) {
  const def = value;

  const setReportTitleDefault = (report_title_default: string) => {
    onChange({ ...def, report_title_default: report_title_default.trim() ? report_title_default.trim().slice(0, 500) : undefined });
  };

  const addSection = () => {
    onChange({ ...def, sections: [...def.sections, newTemplateSection()] });
  };

  const removeSection = (idx: number) => {
    if (def.sections.length <= 1) return;
    onChange({ ...def, sections: def.sections.filter((_, i) => i !== idx) });
  };

  const moveSection = (idx: number, delta: -1 | 1) => {
    onChange({ ...def, sections: moveItem(def.sections, idx, delta) });
  };

  const addField = (sIdx: number) => {
    const sec = def.sections[sIdx];
    onChange(updateSection(def, sIdx, { fields: [...sec.fields, newTemplateField()] }));
  };

  const removeField = (sIdx: number, fIdx: number) => {
    const sec = def.sections[sIdx];
    if (sec.fields.length <= 1) return;
    onChange(updateSection(def, sIdx, { fields: sec.fields.filter((_, i) => i !== fIdx) }));
  };

  const moveField = (sIdx: number, fIdx: number, delta: -1 | 1) => {
    const sec = def.sections[sIdx];
    onChange(updateSection(def, sIdx, { fields: moveItem(sec.fields, fIdx, delta) }));
  };

  const ensureFooter = () => {
    if (!def.footer) onChange({ ...def, footer: emptyFooter() });
  };

  const removeFooter = () => {
    const next = { ...def };
    delete next.footer;
    onChange(next);
  };

  const addFooterField = () => {
    const footer = def.footer || emptyFooter();
    onChange({ ...def, footer: { ...footer, fields: [...footer.fields, newTemplateField()] } });
  };

  const removeFooterField = (fIdx: number) => {
    const footer = def.footer;
    if (!footer) return;
    onChange(updateFooter(def, { fields: footer.fields.filter((_, i) => i !== fIdx) }));
  };

  const moveFooterField = (fIdx: number, delta: -1 | 1) => {
    const footer = def.footer;
    if (!footer) return;
    onChange(updateFooter(def, { fields: moveItem(footer.fields, fIdx, delta) }));
  };

  const renderFieldRow = (
    field: SiteReportTemplateField,
    fIdx: number,
    fieldCount: number,
    onPatch: (patch: Partial<SiteReportTemplateField>) => void,
    onRemove: () => void,
    onMove: (d: -1 | 1) => void,
    requireAtLeastOneField: boolean,
  ) => (
    <div key={field.id} className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-[11px] font-semibold uppercase text-slate-500">Field id (key)</label>
          <input
            value={field.id}
            onChange={(e) => onPatch({ id: e.target.value.replace(/\s+/g, '_').slice(0, 120) })}
            className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 font-mono text-xs text-slate-800"
            spellCheck={false}
          />
        </div>
        <div>
          <label className="text-[11px] font-semibold uppercase text-slate-500">Label</label>
          <input
            value={field.label}
            onChange={(e) => onPatch({ label: e.target.value })}
            className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            placeholder="Question or heading shown on the report"
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-[11px] font-semibold uppercase text-slate-500">Answer type</label>
          <select
            value={field.type}
            onChange={(e) => onPatch({ type: e.target.value as SiteReportFieldType })}
            className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm bg-white"
          >
            {SITE_REPORT_FIELD_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-slate-500">
            {SITE_REPORT_FIELD_TYPE_OPTIONS.find((o) => o.value === field.type)?.hint}
          </p>
        </div>
        {field.type === 'textarea' ? (
          <div>
            <label className="text-[11px] font-semibold uppercase text-slate-500">Rows (height)</label>
            <input
              type="number"
              min={2}
              max={40}
              value={field.rows ?? 4}
              onChange={(e) => onPatch({ rows: Math.min(40, Math.max(2, parseInt(e.target.value, 10) || 4)) })}
              className="mt-0.5 w-full max-w-[120px] rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
        ) : (
          <div />
        )}
      </div>
      {field.type === 'static_text' ? (
        <div>
          <label className="text-[11px] font-semibold uppercase text-slate-500">Fixed text (shown to staff / on print)</label>
          <textarea
            value={field.content ?? ''}
            onChange={(e) => onPatch({ content: e.target.value })}
            rows={5}
            className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-800 resize-y min-h-[100px]"
          />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={fIdx === 0}
          className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
          title="Move up"
        >
          <ChevronUp className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={fIdx >= fieldCount - 1}
          className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
          title="Move down"
        >
          <ChevronDown className="size-4" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={requireAtLeastOneField && fieldCount <= 1}
          className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-40"
        >
          <Trash2 className="size-3.5" />
          Remove field
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Default report title</label>
        <input
          value={def.report_title_default ?? ''}
          onChange={(e) => setReportTitleDefault(e.target.value)}
          placeholder="e.g. Fire Risk Assessment"
          className="mt-1 w-full max-w-lg rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
        />
        <p className="mt-1 text-xs text-slate-500">Suggested title when staff open a new customer site report.</p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-800">Sections</h3>
          <button
            type="button"
            onClick={addSection}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
          >
            <Plus className="size-3.5" />
            Add section
          </button>
        </div>

        {def.sections.map((sec, sIdx) => (
          <div key={sec.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200/80 pb-3 mb-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => moveSection(sIdx, -1)}
                  disabled={sIdx === 0}
                  className="rounded p-1 text-slate-500 hover:bg-white disabled:opacity-30"
                  title="Move section up"
                >
                  <ChevronUp className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => moveSection(sIdx, 1)}
                  disabled={sIdx >= def.sections.length - 1}
                  className="rounded p-1 text-slate-500 hover:bg-white disabled:opacity-30"
                  title="Move section down"
                >
                  <ChevronDown className="size-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => removeSection(sIdx)}
                disabled={def.sections.length <= 1}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-40"
              >
                <Trash2 className="size-3.5" />
                Remove section
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 mb-3">
              <div>
                <label className="text-[11px] font-semibold uppercase text-slate-500">Section id</label>
                <input
                  value={sec.id}
                  onChange={(e) => onChange(updateSection(def, sIdx, { id: e.target.value.replace(/\s+/g, '_').slice(0, 120) }))}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (!v) onChange(updateSection(def, sIdx, { id: `section_${sIdx + 1}` }));
                  }}
                  className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 font-mono text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase text-slate-500">Section title</label>
                <input
                  value={sec.title}
                  onChange={(e) => onChange(updateSection(def, sIdx, { title: e.target.value }))}
                  className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm font-semibold"
                />
              </div>
            </div>
            <div className="mb-3">
              <label className="text-[11px] font-semibold uppercase text-slate-500">Intro / guidance (optional)</label>
              <textarea
                value={sec.helper_text ?? ''}
                onChange={(e) => onChange(updateSection(def, sIdx, { helper_text: e.target.value || undefined }))}
                rows={2}
                className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm resize-y"
                placeholder="Optional helper text under the section title"
              />
            </div>
            <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={!!sec.allow_section_images}
                onChange={(e) => onChange(updateSection(def, sIdx, { allow_section_images: e.target.checked ? true : undefined }))}
                className="size-4 rounded border-slate-300 text-[#14B8A6] focus:ring-[#14B8A6]"
              />
              <ImageIcon className="size-4 text-slate-400" />
              Allow photos under this section (e.g. evidence, signatures)
            </label>
            <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={!!sec.omit_from_pdf}
                onChange={(e) => onChange(updateSection(def, sIdx, { omit_from_pdf: e.target.checked ? true : undefined }))}
                className="size-4 rounded border-slate-300 text-[#14B8A6] focus:ring-[#14B8A6]"
              />
              <span>
                Hide entire section from PDF{' '}
                <span className="text-slate-500 font-normal">(still shown on the customer report screen)</span>
              </span>
            </label>

            <p className="mb-2 text-[11px] font-semibold uppercase text-slate-500">Fields in this section</p>
            <div className="space-y-3">
              {sec.fields.map((field, fIdx) =>
                renderFieldRow(
                  field,
                  fIdx,
                  sec.fields.length,
                  (patch) => onChange(updateFieldInSection(def, sIdx, fIdx, patch)),
                  () => removeField(sIdx, fIdx),
                  (d) => moveField(sIdx, fIdx, d),
                  true,
                ),
              )}
            </div>
            <button
              type="button"
              onClick={() => addField(sIdx)}
              className="mt-3 inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-[#14B8A6] hover:text-[#14B8A6]"
            >
              <Plus className="size-3.5" />
              Add field
            </button>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-800">Footer / certificate block</h3>
          {!def.footer ? (
            <button type="button" onClick={ensureFooter} className="text-xs font-semibold text-[#14B8A6] hover:underline">
              Add footer block
            </button>
          ) : (
            <button type="button" onClick={removeFooter} className="text-xs font-semibold text-rose-600 hover:underline">
              Remove footer block
            </button>
          )}
        </div>
        {def.footer ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="text-[11px] font-semibold uppercase text-slate-500">Footer title</label>
                <input
                  value={def.footer.title ?? ''}
                  onChange={(e) => onChange(updateFooter(def, { title: e.target.value || undefined }))}
                  className="mt-0.5 w-full max-w-lg rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                  placeholder="e.g. Certificate of commissioning"
                />
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={!!def.footer.allow_section_images}
                onChange={(e) => onChange(updateFooter(def, { allow_section_images: e.target.checked ? true : undefined }))}
                className="size-4 rounded border-slate-300 text-[#14B8A6] focus:ring-[#14B8A6]"
              />
              <ImageIcon className="size-4 text-slate-400" />
              Allow images in footer (e.g. scanned signature)
            </label>
            <p className="text-[11px] font-semibold uppercase text-slate-500">Footer fields</p>
            <div className="space-y-3">
              {def.footer.fields.map((field, fIdx) =>
                renderFieldRow(
                  field,
                  fIdx,
                  def.footer!.fields.length,
                  (patch) => onChange(updateFieldInFooter(def, fIdx, patch)),
                  () => removeFooterField(fIdx),
                  (d) => moveFooterField(fIdx, d),
                  false,
                ),
              )}
            </div>
            <button
              type="button"
              onClick={addFooterField}
              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-[#14B8A6] hover:text-[#14B8A6]"
            >
              <Plus className="size-3.5" />
              Add footer field
            </button>
          </>
        ) : (
          <p className="text-sm text-slate-500">Optional closing block (legal text, sign-off fields, date).</p>
        )}
      </div>
    </div>
  );
}
