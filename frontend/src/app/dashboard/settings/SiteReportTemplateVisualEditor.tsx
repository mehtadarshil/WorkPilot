'use client';

import { useEffect, useState } from 'react';
import {
  AlignLeft,
  Calendar,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  FileText,
  ImageIcon,
  List,
  PenLine,
  Plus,
  Settings2,
  Trash2,
  Type,
} from 'lucide-react';
import type {
  SiteReportFieldHideFollowingRule,
  SiteReportFieldType,
  SiteReportTemplateDefinition,
  SiteReportTemplateField,
  SiteReportTemplateSection,
} from '@/lib/siteReportTemplateTypes';
import {
  SITE_REPORT_FIELD_TYPE_OPTIONS,
  YES_NO_NA_OPTIONS,
  emptyFooter,
  newTemplateField,
  newTemplateSection,
} from '@/lib/siteReportTemplateTypes';

function HideFollowingEditor({
  field,
  onPatch,
}: {
  field: SiteReportTemplateField;
  onPatch: (patch: Partial<SiteReportTemplateField>) => void;
}) {
  const rule = field.hide_following_when;
  const enabled = !!rule;

  const setRule = (next: SiteReportFieldHideFollowingRule | undefined) => {
    onPatch({ hide_following_when: next });
  };

  const defaultWhenValues =
    field.type === 'yes_no_na'
      ? ['no', 'na']
      : field.type === 'pass_fail'
        ? ['fail']
        : [];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            if (e.target.checked) {
              setRule({ when_values: defaultWhenValues.length ? defaultWhenValues : ['no'], hide_next_count: 2 });
            } else {
              setRule(undefined);
            }
          }}
          className="rounded border-slate-300"
        />
        Hide follow-up questions when answer matches
      </label>
      {enabled && rule ? (
        <div className="grid gap-3 sm:grid-cols-2 pl-6">
          <div>
            <label className="text-[11px] font-semibold uppercase text-slate-500">When answer is</label>
            {field.type === 'yes_no_na' ? (
              <div className="mt-1 flex flex-wrap gap-2">
                {YES_NO_NA_OPTIONS.map((opt) => (
                  <label key={opt.value} className="inline-flex items-center gap-1 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={rule.when_values.includes(opt.value)}
                      onChange={(e) => {
                        const set = new Set(rule.when_values);
                        if (e.target.checked) set.add(opt.value);
                        else set.delete(opt.value);
                        const when_values = [...set];
                        if (when_values.length === 0) return;
                        setRule({ ...rule, when_values });
                      }}
                      className="rounded border-slate-300"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            ) : (
              <input
                type="text"
                value={rule.when_values.join(', ')}
                onChange={(e) => {
                  const when_values = e.target.value
                    .split(',')
                    .map((v) => v.trim().toLowerCase())
                    .filter(Boolean);
                  if (when_values.length === 0) return;
                  setRule({ ...rule, when_values });
                }}
                placeholder="no, na"
                className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
              />
            )}
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase text-slate-500">Hide next questions</label>
            <input
              type="number"
              min={1}
              max={20}
              value={rule.hide_next_count}
              onChange={(e) => {
                const hide_next_count = Math.min(20, Math.max(1, parseInt(e.target.value, 10) || 1));
                setRule({ ...rule, hide_next_count });
              }}
              className="mt-0.5 w-full max-w-[120px] rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
        </div>
      ) : null}
      {enabled ? (
        <p className="pl-6 text-[11px] text-slate-500">
          Example: if this question is No or N/A, the next {rule?.hide_next_count ?? 2} question(s) are hidden on the form and PDF.
        </p>
      ) : null}
    </div>
  );
}

function moveItem<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const j = index + delta;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  const [it] = next.splice(index, 1);
  next.splice(j, 0, it);
  return next;
}

function parseChoicesInput(raw: string): string[] {
  return raw.split(',').map((x) => x.trim()).filter(Boolean);
}

function ChoicesInput({
  choices,
  onChange,
}: {
  choices?: string[];
  onChange: (choices: string[]) => void;
}) {
  const [draft, setDraft] = useState(choices?.join(', ') ?? '');
  const choicesText = choices?.join(', ') ?? '';

  useEffect(() => {
    setDraft(choicesText);
  }, [choicesText]);

  const commit = () => {
    const parsed = parseChoicesInput(draft);
    onChange(parsed);
    setDraft(parsed.join(', '));
  };

  return (
    <input
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
      placeholder="Option 1, Option 2"
    />
  );
}

function slugFieldId(label: string, fallback: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
  return slug || fallback;
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

function updateFooter(def: SiteReportTemplateDefinition, patch: Partial<NonNullable<SiteReportTemplateDefinition['footer']>>): SiteReportTemplateDefinition {
  const prev = def.footer || { fields: [] };
  return { ...def, footer: { ...prev, ...patch } };
}

function updateFieldInFooter(def: SiteReportTemplateDefinition, fIdx: number, patch: Partial<SiteReportTemplateField>): SiteReportTemplateDefinition {
  const footer = def.footer || emptyFooter();
  const fields = footer.fields.map((f, i) => (i === fIdx ? { ...f, ...patch } : f));
  return { ...def, footer: { ...footer, fields } };
}

const FIELD_PALETTE: { type: SiteReportFieldType; label: string; Icon: typeof Type }[] = [
  { type: 'text', label: 'Short text', Icon: Type },
  { type: 'textarea', label: 'Long text', Icon: AlignLeft },
  { type: 'date', label: 'Date', Icon: Calendar },
  { type: 'yes_no_na', label: 'Yes / No / N/A', Icon: CheckSquare },
  { type: 'pass_fail', label: 'Pass / Fail', Icon: CheckSquare },
  { type: 'select', label: 'Dropdown', Icon: List },
  { type: 'static_text', label: 'Read-only text', Icon: FileText },
  { type: 'image', label: 'Photo', Icon: ImageIcon },
  { type: 'signature', label: 'Signature', Icon: PenLine },
];

type ActiveTab = { kind: 'page'; index: number } | { kind: 'footer' };

type Props = {
  value: SiteReportTemplateDefinition;
  onChange: (next: SiteReportTemplateDefinition) => void;
};

export default function SiteReportTemplateVisualEditor({ value, onChange }: Props) {
  const def = value;
  const [activeTab, setActiveTab] = useState<ActiveTab>({ kind: 'page', index: 0 });
  const [showPageSettings, setShowPageSettings] = useState(false);
  const [expandedField, setExpandedField] = useState<string | null>(null);

  const activePageIndex = activeTab.kind === 'page' ? activeTab.index : 0;
  const activeSection = def.sections[activePageIndex];

  const setReportTitleDefault = (report_title_default: string) => {
    onChange({ ...def, report_title_default: report_title_default.trim() ? report_title_default.trim().slice(0, 500) : undefined });
  };

  const addPage = () => {
    const next = { ...def, sections: [...def.sections, newTemplateSection()] };
    onChange(next);
    setActiveTab({ kind: 'page', index: next.sections.length - 1 });
  };

  const removePage = (idx: number) => {
    if (def.sections.length <= 1) return;
    const sections = def.sections.filter((_, i) => i !== idx);
    onChange({ ...def, sections });
    if (activeTab.kind === 'page') {
      setActiveTab({ kind: 'page', index: Math.min(activeTab.index, sections.length - 1) });
    }
  };

  const addField = (type: SiteReportFieldType, target: ActiveTab) => {
    const opt = SITE_REPORT_FIELD_TYPE_OPTIONS.find((o) => o.value === type);
    const field = newTemplateField({ type, label: opt?.label ?? 'New field' });
    if (target.kind === 'footer') {
      const footer = def.footer || emptyFooter();
      onChange({ ...def, footer: { ...footer, fields: [...footer.fields, field] } });
      setExpandedField(`footer-${footer.fields.length}`);
      return;
    }
    const sIdx = target.index;
    const sec = def.sections[sIdx];
    onChange(updateSection(def, sIdx, { fields: [...sec.fields, field] }));
    setExpandedField(`page-${sIdx}-${sec.fields.length}`);
  };

  const renderFieldCard = (
    field: SiteReportTemplateField,
    fIdx: number,
    fieldCount: number,
    keyPrefix: string,
    onPatch: (patch: Partial<SiteReportTemplateField>) => void,
    onRemove: () => void,
    onMove: (d: -1 | 1) => void,
    requireAtLeastOne: boolean,
  ) => {
    const expandKey = `${keyPrefix}-${fIdx}`;
    const expanded = expandedField === expandKey;
    const typeLabel = SITE_REPORT_FIELD_TYPE_OPTIONS.find((o) => o.value === field.type)?.label ?? field.type;

    return (
      <div key={field.id} className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2.5">
          <div className="flex shrink-0 flex-col">
            <button type="button" onClick={() => onMove(-1)} disabled={fIdx === 0} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30" title="Move up">
              <ChevronUp className="size-3.5" />
            </button>
            <button type="button" onClick={() => onMove(1)} disabled={fIdx >= fieldCount - 1} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30" title="Move down">
              <ChevronDown className="size-3.5" />
            </button>
          </div>
          <input
            value={field.label}
            onChange={(e) => onPatch({ label: e.target.value })}
            onBlur={(e) => {
              const label = e.target.value.trim();
              if (label && (field.id.startsWith('field_') || !field.id)) {
                onPatch({ id: slugFieldId(label, field.id) });
              }
            }}
            className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold text-slate-800 outline-none focus:border-slate-200 focus:bg-slate-50"
            placeholder="Field label"
          />
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
            {typeLabel}
          </span>
          <button
            type="button"
            onClick={() => setExpandedField(expanded ? null : expandKey)}
            className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"
          >
            {expanded ? 'Less' : 'Options'}
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={requireAtLeastOne && fieldCount <= 1}
            className="shrink-0 rounded-md p-1.5 text-rose-500 hover:bg-rose-50 disabled:opacity-30"
            title="Remove field"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
        {expanded && (
          <div className="border-t border-slate-100 bg-slate-50/80 px-3 py-3 space-y-3">
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
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase text-slate-500">Field key (advanced)</label>
                <input
                  value={field.id}
                  onChange={(e) => onPatch({ id: e.target.value.replace(/\s+/g, '_').slice(0, 120) })}
                  className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 font-mono text-xs text-slate-700"
                  spellCheck={false}
                />
              </div>
            </div>
            {field.type === 'textarea' && (
              <div>
                <label className="text-[11px] font-semibold uppercase text-slate-500">Rows</label>
                <input
                  type="number"
                  min={2}
                  max={40}
                  value={field.rows ?? 4}
                  onChange={(e) => onPatch({ rows: Math.min(40, Math.max(2, parseInt(e.target.value, 10) || 4)) })}
                  className="mt-0.5 w-full max-w-[120px] rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                />
              </div>
            )}
            {field.type === 'static_text' && (
              <div>
                <label className="text-[11px] font-semibold uppercase text-slate-500">Fixed text</label>
                <textarea
                  value={field.content ?? ''}
                  onChange={(e) => onPatch({ content: e.target.value })}
                  rows={4}
                  className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm resize-y"
                />
              </div>
            )}
            {field.type === 'select' && (
              <div>
                <label className="text-[11px] font-semibold uppercase text-slate-500">Choices (comma-separated)</label>
                <ChoicesInput
                  key={field.id}
                  choices={field.choices}
                  onChange={(choices) => onPatch({ choices })}
                />
              </div>
            )}
            {field.type !== 'static_text' && field.type !== 'image' && field.type !== 'signature' && (
              <HideFollowingEditor field={field} onPatch={onPatch} />
            )}
          </div>
        )}
      </div>
    );
  };

  const paletteTarget: ActiveTab = activeTab;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Form name (default report title)</label>
        <input
          value={def.report_title_default ?? ''}
          onChange={(e) => setReportTitleDefault(e.target.value)}
          placeholder="e.g. Fire Risk Assessment"
          className="mt-1 w-full max-w-md rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/25"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex min-h-[480px] flex-col lg:flex-row">
          {/* Field palette */}
          <aside className="shrink-0 border-b border-slate-200 bg-slate-50 p-3 lg:w-52 lg:border-b-0 lg:border-r">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Input types</p>
            <p className="mb-3 text-xs text-slate-500">Click to add to the active page.</p>
            <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-1">
              {FIELD_PALETTE.map(({ type, label, Icon }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => addField(type, paletteTarget)}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left text-xs font-semibold text-slate-700 shadow-sm transition hover:border-[#14B8A6] hover:text-[#0d9488]"
                >
                  <Icon className="size-3.5 shrink-0 text-[#14B8A6]" />
                  {label}
                </button>
              ))}
            </div>
          </aside>

          {/* Canvas */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50/80 px-2 py-2">
              {def.sections.map((sec, sIdx) => (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => {
                    setActiveTab({ kind: 'page', index: sIdx });
                    setShowPageSettings(false);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                    activeTab.kind === 'page' && activeTab.index === sIdx
                      ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
                      : 'text-slate-600 hover:bg-white/70'
                  }`}
                >
                  Page {sIdx + 1}
                  {sec.title && sec.title !== 'New section' ? ` · ${sec.title.slice(0, 18)}${sec.title.length > 18 ? '…' : ''}` : ''}
                </button>
              ))}
              <button
                type="button"
                onClick={addPage}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#14B8A6] hover:bg-white"
              >
                <Plus className="size-3.5" />
                Add page
              </button>
              {def.footer ? (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab({ kind: 'footer' });
                    setShowPageSettings(false);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                    activeTab.kind === 'footer'
                      ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
                      : 'text-slate-600 hover:bg-white/70'
                  }`}
                >
                  Footer
                </button>
              ) : null}
            </div>

            {activeTab.kind === 'page' && activeSection && (
              <>
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2">
                  <input
                    value={activeSection.title}
                    onChange={(e) => onChange(updateSection(def, activePageIndex, { title: e.target.value }))}
                    className="min-w-[140px] flex-1 rounded-md border border-slate-200 px-2 py-1.5 text-sm font-semibold text-slate-800"
                    placeholder="Page title"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPageSettings((v) => !v)}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    <Settings2 className="size-3.5" />
                    Page options
                  </button>
                  <button
                    type="button"
                    onClick={() => removePage(activePageIndex)}
                    disabled={def.sections.length <= 1}
                    className="text-xs font-semibold text-rose-600 hover:underline disabled:opacity-40"
                  >
                    Delete page
                  </button>
                </div>
                {showPageSettings && (
                  <div className="border-b border-slate-100 bg-slate-50/50 px-3 py-3 space-y-2">
                    <textarea
                      value={activeSection.helper_text ?? ''}
                      onChange={(e) => onChange(updateSection(def, activePageIndex, { helper_text: e.target.value || undefined }))}
                      rows={2}
                      className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm resize-y"
                      placeholder="Optional intro text for this page"
                    />
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={!!activeSection.allow_section_images}
                        onChange={(e) => onChange(updateSection(def, activePageIndex, { allow_section_images: e.target.checked ? true : undefined }))}
                        className="size-4 rounded border-slate-300 text-[#14B8A6]"
                      />
                      Allow extra photos on this page
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={!!activeSection.omit_from_pdf}
                        onChange={(e) => onChange(updateSection(def, activePageIndex, { omit_from_pdf: e.target.checked ? true : undefined }))}
                        className="size-4 rounded border-slate-300 text-[#14B8A6]"
                      />
                      Hide this page from PDF (screen only)
                    </label>
                  </div>
                )}
                <div className="flex-1 space-y-2 p-4">
                  {activeSection.fields.map((field, fIdx) =>
                    renderFieldCard(
                      field,
                      fIdx,
                      activeSection.fields.length,
                      `page-${activePageIndex}`,
                      (patch) => onChange(updateFieldInSection(def, activePageIndex, fIdx, patch)),
                      () => {
                        if (activeSection.fields.length <= 1) return;
                        onChange(updateSection(def, activePageIndex, { fields: activeSection.fields.filter((_, i) => i !== fIdx) }));
                      },
                      (d) => onChange(updateSection(def, activePageIndex, { fields: moveItem(activeSection.fields, fIdx, d) })),
                      true,
                    ),
                  )}
                  <div className="rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/50 px-4 py-6 text-center text-xs text-slate-500">
                    Click an input type on the left to add a field to this page
                  </div>
                </div>
              </>
            )}

            {activeTab.kind === 'footer' && def.footer && (
              <div className="flex-1 p-4 space-y-3">
                <input
                  value={def.footer.title ?? ''}
                  onChange={(e) => onChange(updateFooter(def, { title: e.target.value || undefined }))}
                  className="w-full max-w-md rounded-md border border-slate-200 px-2 py-1.5 text-sm font-semibold"
                  placeholder="Footer title"
                />
                {def.footer.fields.map((field, fIdx) =>
                  renderFieldCard(
                    field,
                    fIdx,
                    def.footer!.fields.length,
                    'footer',
                    (patch) => onChange(updateFieldInFooter(def, fIdx, patch)),
                    () => onChange(updateFooter(def, { fields: def.footer!.fields.filter((_, i) => i !== fIdx) })),
                    (d) => onChange(updateFooter(def, { fields: moveItem(def.footer!.fields, fIdx, d) })),
                    false,
                  ),
                )}
                <div className="rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/50 px-4 py-6 text-center text-xs text-slate-500">
                  Add signature, date, or legal text fields for the footer
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
        {!def.footer ? (
          <button
            type="button"
            onClick={() => {
              onChange({ ...def, footer: emptyFooter() });
              setActiveTab({ kind: 'footer' });
            }}
            className="font-semibold text-[#14B8A6] hover:underline"
          >
            + Add footer / certificate page
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              const next = { ...def };
              delete next.footer;
              onChange(next);
              setActiveTab({ kind: 'page', index: 0 });
            }}
            className="font-semibold text-rose-600 hover:underline"
          >
            Remove footer page
          </button>
        )}
        <p className="text-xs text-slate-500">
          {def.sections.length} page{def.sections.length === 1 ? '' : 's'}
          {def.footer ? ' + footer' : ''} · Split long forms across pages so mobile stays easy to complete
        </p>
      </div>
    </div>
  );

}
