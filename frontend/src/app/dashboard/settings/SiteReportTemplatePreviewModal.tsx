'use client';

import { useEffect } from 'react';
import type { SiteReportTemplateDefinition, SiteReportTemplateField, SiteReportTemplateSection } from '@/lib/siteReportTemplateTypes';
import { YES_NO_NA_OPTIONS } from '@/lib/siteReportTemplateTypes';
import { X } from 'lucide-react';

const SAMPLE_CLIENT = 'Sample Client Ltd';
const SAMPLE_SITE = 'Sample property\n1 Example Street\nLondon, EX1 2MP';

function PreviewField({
  field,
  sectionId,
}: {
  field: SiteReportTemplateField;
  sectionId: string;
}) {
  if (sectionId === 'client_header' && (field.id === 'client_name_display' || field.id === 'property_address_display')) {
    return (
      <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700 whitespace-pre-wrap">
        {field.id === 'client_name_display' ? SAMPLE_CLIENT : SAMPLE_SITE}
      </div>
    );
  }

  if (field.type === 'static_text') {
    return (
      <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm text-slate-700 whitespace-pre-wrap">
        {field.content || '—'}
      </div>
    );
  }

  if (field.type === 'yes_no_na') {
    return (
      <div className="flex flex-wrap gap-3 opacity-80">
        {YES_NO_NA_OPTIONS.map((opt) => (
          <span key={opt.value} className="inline-flex items-center gap-2 text-sm font-medium text-slate-500">
            <span className="inline-flex size-4 shrink-0 rounded-full border-2 border-slate-200 bg-white" />
            {opt.label}
          </span>
        ))}
      </div>
    );
  }

  if (field.type === 'textarea') {
    return (
      <textarea
        readOnly
        rows={Math.min(6, field.rows ?? 4)}
        placeholder="Staff enter answers here…"
        className="w-full cursor-default resize-none rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-400 placeholder:text-slate-400"
        value=""
      />
    );
  }

  if (field.type === 'date') {
    return (
      <input
        type="text"
        readOnly
        placeholder="dd/mm/yyyy"
        className="max-w-xs cursor-default rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-400"
        value=""
      />
    );
  }

  if (field.type === 'image') {
    return (
      <div className="flex min-h-[100px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-center text-sm text-slate-500">
        Staff attach images here on the job report.
      </div>
    );
  }

  if (field.type === 'signature') {
    return (
      <div className="flex min-h-[88px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-4 py-5 text-center text-sm text-slate-500">
        Signature captured on the job report.
      </div>
    );
  }

  return (
    <input
      type="text"
      readOnly
      placeholder="Short answer…"
      className="w-full cursor-default rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-400 placeholder:text-slate-400"
      value=""
    />
  );
}

function PreviewSection({ sec }: { sec: SiteReportTemplateSection }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden break-inside-avoid">
      <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="text-base font-bold text-slate-900">{sec.title}</h3>
          {sec.omit_from_pdf ? (
            <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 ring-1 ring-amber-200">
              Omitted from PDF
            </span>
          ) : null}
        </div>
        {sec.helper_text ? <p className="mt-1 text-xs text-slate-600">{sec.helper_text}</p> : null}
      </div>
      <div className="space-y-5 p-4">
        {sec.fields.map((field) => (
          <div key={field.id} className="space-y-1.5">
            {field.label ? <div className="block text-sm font-semibold text-slate-800">{field.label}</div> : null}
            <PreviewField field={field} sectionId={sec.id} />
          </div>
        ))}
        {sec.allow_section_images ? (
          <div className="border-t border-slate-100 pt-4">
            <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Section images</p>
            <div className="flex min-h-[72px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/60 text-sm text-slate-500">
              Optional photos under this section on the job report.
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default function SiteReportTemplatePreviewModal({
  open,
  onClose,
  definition,
  templateName,
}: {
  open: boolean;
  onClose: () => void;
  definition: SiteReportTemplateDefinition;
  templateName: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const reportTitle = (definition.report_title_default || templateName || 'Report').trim();

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="site-report-preview-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <div>
            <h2 id="site-report-preview-title" className="text-base font-bold text-slate-900">
              Template preview
            </h2>
            <p className="text-xs text-slate-500">Shows the current editor layout with sample data (nothing is saved).</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
            aria-label="Close preview"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          <div className="mx-auto max-w-2xl space-y-5">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Report title</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{reportTitle}</p>
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Client</span>
                  <p className="mt-0.5 font-semibold text-slate-900">{SAMPLE_CLIENT}</p>
                </div>
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Property / site</span>
                  <p className="mt-0.5 whitespace-pre-wrap text-slate-800">{SAMPLE_SITE}</p>
                </div>
              </div>
            </div>

            {definition.sections.map((sec) => (
              <PreviewSection key={sec.id} sec={sec} />
            ))}

            {definition.footer && definition.footer.fields.length > 0 ? (
              <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden break-inside-avoid">
                <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="text-base font-bold text-slate-900">{definition.footer.title || 'Footer'}</h3>
                    {definition.footer.allow_section_images ? (
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                        Images allowed
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="space-y-5 p-4">
                  {definition.footer.fields.map((field) => (
                    <div key={field.id} className="space-y-1.5">
                      {field.label ? <div className="block text-sm font-semibold text-slate-800">{field.label}</div> : null}
                      <PreviewField field={field} sectionId="footer" />
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
