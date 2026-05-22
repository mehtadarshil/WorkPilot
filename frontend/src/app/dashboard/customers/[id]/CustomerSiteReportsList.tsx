'use client';

import { useState } from 'react';
import { FileText, Loader2, Plus } from 'lucide-react';
import dayjs from 'dayjs';

type ReportListRow = {
  id: number;
  template_id: number | null;
  template_name: string | null;
  report_title: string | null;
  updated_at: string;
  created_at: string;
  certificate_number: string | null;
};

type TemplateRow = {
  id: number;
  name: string;
  slug: string | null;
};

type Props = {
  reports: ReportListRow[];
  templates: TemplateRow[];
  newTemplateId: string;
  onTemplateChange: (id: string) => void;
  creatingReport: boolean;
  onCreate: () => void;
  onOpen: (id: number) => void;
};

export default function CustomerSiteReportsList({
  reports,
  templates,
  newTemplateId,
  onTemplateChange,
  creatingReport,
  onCreate,
  onOpen,
}: Props) {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-black tracking-tight text-slate-900">Reports</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Create report drafts from templates, continue editing them later, and download the generated PDFs from the Files tab.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-[#119f8e]"
        >
          <Plus className="size-4" />
          Create new report
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3">Report</th>
              <th className="px-5 py-3">Template</th>
              <th className="px-5 py-3">Certificate</th>
              <th className="px-5 py-3">Updated</th>
              <th className="px-5 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {reports.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-slate-500">
                  No reports yet. Create a report from a template to start a draft.
                </td>
              </tr>
            ) : (
              reports.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                        <FileText className="size-4" />
                      </span>
                      <div>
                        <p className="font-bold text-slate-900">{r.report_title || r.template_name || `Report #${r.id}`}</p>
                        <p className="text-xs text-slate-500">Created {dayjs(r.created_at).format('D MMM YYYY HH:mm')}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-slate-600">{r.template_name || 'Template'}</td>
                  <td className="px-5 py-4 font-mono text-xs text-slate-600">{r.certificate_number || 'Draft'}</td>
                  <td className="px-5 py-4 text-slate-600">{dayjs(r.updated_at).format('D MMM YYYY HH:mm')}</td>
                  <td className="px-5 py-4 text-right">
                    <button type="button" onClick={() => onOpen(r.id)} className="font-bold text-[#14B8A6] hover:text-[#119f8e]">
                      Open
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setCreateOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900">Create report draft</h3>
            <p className="mt-1 text-sm text-slate-500">Choose a template. The report opens as a draft, so it can be completed later.</p>
            <label className="mt-5 block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Template</span>
              <select
                value={newTemplateId}
                onChange={(e) => onTemplateChange(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={creatingReport || !newTemplateId}
                onClick={onCreate}
                className="flex-1 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-bold text-white hover:bg-[#119f8e] disabled:opacity-50"
              >
                {creatingReport ? <Loader2 className="mx-auto size-4 animate-spin" /> : 'Create draft'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
