'use client';

import { useCallback, useEffect, useState } from 'react';
import { getJson, putJson, postJson, deleteRequest } from '../../apiClient';
import { Loader2, Save, RotateCcw, CopyPlus, Plus, Eye, Trash2 } from 'lucide-react';
import type { SiteReportTemplateDefinition } from '@/lib/siteReportTemplateTypes';
import { coerceSiteReportDefinition } from '@/lib/siteReportTemplateTypes';
import SiteReportTemplateVisualEditor from './SiteReportTemplateVisualEditor';
import SiteReportTemplatePreviewModal from './SiteReportTemplatePreviewModal';

type TemplateRow = { id: number; name: string; slug: string | null; updated_at: string };

export default function SiteReportTemplatesSettings({ token }: { token: string }) {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [definition, setDefinition] = useState<SiteReportTemplateDefinition | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [blankTemplateName, setBlankTemplateName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setError(null);
    try {
      const res = await getJson<{ templates: TemplateRow[] }>('/settings/site-report-templates', token);
      setTemplates(Array.isArray(res.templates) ? res.templates : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load templates');
      setTemplates([]);
    } finally {
      setLoadingList(false);
    }
  }, [token]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const loadDetail = useCallback(
    async (id: number) => {
      setLoadingDetail(true);
      setError(null);
      try {
        const res = await getJson<{ template: { id: number; name: string; slug: string | null; definition: unknown } }>(
          `/settings/site-report-templates/${id}`,
          token,
        );
        setSelectedId(id);
        setName(res.template.name);
        setDefinition(coerceSiteReportDefinition(res.template.definition));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load template');
        setDefinition(null);
      } finally {
        setLoadingDetail(false);
      }
    },
    [token],
  );

  useEffect(() => {
    if (templates.length === 0 || selectedId != null) return;
    const fra = templates.find((t) => t.slug === 'fra');
    void loadDetail(fra?.id ?? templates[0].id);
  }, [templates, selectedId, loadDetail]);

  const handleSave = async () => {
    if (!selectedId || !definition) return;
    setSaving(true);
    setOk(false);
    setError(null);
    try {
      await putJson(`/settings/site-report-templates/${selectedId}`, { name, definition }, token);
      setOk(true);
      window.setTimeout(() => setOk(false), 2000);
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleResetFra = async () => {
    setResetting(true);
    setError(null);
    try {
      const res = await postJson<{ template: { id: number; definition: unknown; name: string } }>(
        '/settings/site-report-templates/fra/reset',
        {},
        token,
      );
      setSelectedId(res.template.id);
      setName(res.template.name);
      setDefinition(coerceSiteReportDefinition(res.template.definition));
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reset failed');
    } finally {
      setResetting(false);
    }
  };

  const handleDuplicate = async () => {
    const src = templates.find((t) => t.slug === 'fra') ?? templates[0];
    if (!src) return;
    const nm = newName.trim();
    if (!nm) {
      setError('Enter a name for the new template.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await postJson<{ template: { id: number; name: string; definition: unknown } }>(
        '/settings/site-report-templates',
        { name: nm, duplicate_from_template_id: src.id },
        token,
      );
      setNewName('');
      await loadList();
      setSelectedId(res.template.id);
      setName(res.template.name);
      setDefinition(coerceSiteReportDefinition(res.template.definition));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteTemplate = async (t: TemplateRow) => {
    if (t.slug === 'fra') return;
    const okConfirm = window.confirm(
      `Delete template "${t.name}"?\n\nCustomer reports that used this template will switch to the default Fire Risk Assessment. Their answers are kept where field IDs still match.`,
    );
    if (!okConfirm) return;
    setDeletingId(t.id);
    setError(null);
    try {
      await deleteRequest(`/settings/site-report-templates/${t.id}`, token);
      setPreviewOpen(false);
      if (selectedId === t.id) {
        setSelectedId(null);
        setDefinition(null);
        setName('');
      }
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  const handleCreateBlank = async () => {
    const nm = blankTemplateName.trim();
    if (!nm) {
      setError('Enter a name for the new template.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const definition = coerceSiteReportDefinition(null);
      const res = await postJson<{ template: { id: number; name: string; definition: unknown } }>(
        '/settings/site-report-templates',
        { name: nm, definition },
        token,
      );
      setBlankTemplateName('');
      await loadList();
      setSelectedId(res.template.id);
      setName(res.template.name);
      setDefinition(coerceSiteReportDefinition(res.template.definition));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Reports</h2>
        <p className="mt-1 text-sm text-slate-600 max-w-3xl">
          Design the forms your team fills on the job <strong className="text-slate-800">Reports</strong> tab (job detail page). The
          default <strong className="text-slate-800">Fire Risk Assessment</strong> matches a typical UK-style layout: sections,
          yes/no/N/A questions, note areas, and a certificate block. Use the editor below to add or change sections and fields
          without touching raw code.
        </p>
      </div>

      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div> : null}
      {ok ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Saved.</div> : null}

      <div className="flex flex-wrap gap-6">
        <div className="w-full sm:w-56 shrink-0 space-y-2">
          <p className="text-xs font-semibold uppercase text-slate-500">Templates</p>
          {loadingList ? (
            <Loader2 className="size-5 animate-spin text-slate-400" />
          ) : (
            <ul className="rounded-lg border border-slate-200 divide-y divide-slate-100 bg-white text-sm shadow-sm">
              {templates.map((t) => (
                <li key={t.id} className="flex items-stretch gap-0">
                  <button
                    type="button"
                    onClick={() => void loadDetail(t.id)}
                    className={`min-w-0 flex-1 px-3 py-2.5 text-left font-medium transition hover:bg-slate-50 ${
                      selectedId === t.id ? 'bg-[#14B8A6]/10 text-[#14B8A6]' : 'text-slate-800'
                    }`}
                  >
                    {t.name}
                    {t.slug === 'fra' ? <span className="ml-1 text-[10px] font-normal uppercase text-slate-400">(default)</span> : null}
                  </button>
                  {t.slug !== 'fra' ? (
                    <button
                      type="button"
                      title="Delete template"
                      disabled={deletingId === t.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDeleteTemplate(t);
                      }}
                      className="shrink-0 border-l border-slate-100 px-2.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                    >
                      {deletingId === t.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {!loadingList ? (
            <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50/80 p-3 shadow-sm">
              <p className="text-xs font-semibold uppercase text-slate-500">New template</p>
              <label className="mt-2 block text-xs text-slate-600">Name</label>
              <input
                value={blankTemplateName}
                onChange={(e) => setBlankTemplateName(e.target.value)}
                placeholder="e.g. Site inspection checklist"
                className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm shadow-sm"
              />
              <button
                type="button"
                disabled={creating}
                onClick={() => void handleCreateBlank()}
                className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
              >
                {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                Create blank template
              </button>
              <p className="mt-2 text-[11px] leading-snug text-slate-500">
                Starts with one empty section and a sample text field. Use Save template when you are done editing.
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex-1 min-w-0 space-y-5">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={resetting}
              onClick={() => void handleResetFra()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              {resetting ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
              Reset FRA to factory fields
            </button>
            <button
              type="button"
              disabled={!definition}
              onClick={() => setPreviewOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              <Eye className="size-4" />
              Preview
            </button>
            <button
              type="button"
              disabled={saving || !selectedId || !definition}
              onClick={() => void handleSave()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#14B8A6] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#119f8e] disabled:opacity-50"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save template
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase text-slate-500">Duplicate as new template</p>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <div className="min-w-[200px] flex-1">
                <label className="text-xs text-slate-600">Name</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. FRA — retail unit"
                  className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
                />
              </div>
              <button
                type="button"
                disabled={creating || templates.length === 0}
                onClick={() => void handleDuplicate()}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
              >
                {creating ? <Loader2 className="size-4 animate-spin" /> : <CopyPlus className="size-4" />}
                Duplicate from FRA
              </button>
            </div>
          </div>

          {loadingDetail ? (
            <div className="flex items-center gap-2 py-12 text-sm font-medium text-slate-500">
              <Loader2 className="size-5 animate-spin" /> Loading template…
            </div>
          ) : selectedId && definition ? (
            <div className="space-y-6">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Template name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={templates.find((x) => x.id === selectedId)?.slug === 'fra'}
                  className="mt-1 w-full max-w-md rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm disabled:bg-slate-100 disabled:text-slate-500"
                />
                {templates.find((x) => x.id === selectedId)?.slug === 'fra' ? (
                  <p className="mt-1 text-xs text-slate-500">The built-in Fire Risk Assessment name is fixed; all structure below is editable.</p>
                ) : null}
              </div>

              <SiteReportTemplateVisualEditor value={definition} onChange={setDefinition} />
            </div>
          ) : (
            <p className="text-sm text-slate-500">Select a template from the list.</p>
          )}
        </div>
      </div>

      {definition ? (
        <SiteReportTemplatePreviewModal
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          definition={definition}
          templateName={name}
        />
      ) : null}
    </div>
  );
}
