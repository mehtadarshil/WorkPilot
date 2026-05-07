'use client';

/* eslint-disable @next/next/no-img-element -- blob previews */
import { ImagePlus, Loader2 } from 'lucide-react';
import type { SiteReportTemplateField, SiteReportSectionImageRow } from '@/lib/siteReportTemplateTypes';
import { YES_NO_NA_OPTIONS } from '@/lib/siteReportTemplateTypes';
import CustomerSiteReportSignaturePad from './CustomerSiteReportSignaturePad';

export function SiteReportFieldImageList({
  rows,
  imageUrlFor,
  uploading,
  onPickFile,
  onUpdateMeta,
  onRemove,
}: {
  rows: SiteReportSectionImageRow[];
  imageUrlFor: (imageId: number) => string;
  uploading: boolean;
  onPickFile: (file: File) => void;
  onUpdateMeta: (rowId: string, patch: Partial<SiteReportSectionImageRow>) => void;
  onRemove: (row: SiteReportSectionImageRow) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
        <ImagePlus className="size-3.5" />
        Add image
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onPickFile(file);
          }}
        />
      </label>
      {uploading ? (
        <span className="text-xs text-slate-500 inline-flex items-center gap-1">
          <Loader2 className="size-3.5 animate-spin" /> Uploading…
        </span>
      ) : null}
      <div className="mt-2 space-y-3">
        {rows.map((im) => {
          const src = imageUrlFor(im.image_id);
          return (
            <div key={im.id} className="flex flex-wrap gap-3 rounded-lg border border-slate-100 p-3">
              <div className="w-full sm:w-40 shrink-0">
                {src ? (
                  <img src={src} alt="" className="w-full rounded-md border border-slate-100 object-contain max-h-36 bg-slate-50" />
                ) : (
                  <div className="flex h-24 items-center justify-center rounded border border-dashed text-xs text-slate-400">No preview</div>
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <input
                  value={im.description}
                  onChange={(e) => onUpdateMeta(im.id, { description: e.target.value })}
                  placeholder="Caption (e.g. Before work)"
                  className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
                />
                <input
                  value={im.note}
                  onChange={(e) => onUpdateMeta(im.id, { note: e.target.value })}
                  placeholder="Short note (optional)"
                  className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
                />
                <button type="button" onClick={() => void onRemove(im)} className="text-xs font-semibold text-rose-600 hover:underline">
                  Remove image
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SiteReportSignatureBlock({
  rows,
  imageUrlFor,
  busy,
  onSaveBlob,
  onClearSaved,
}: {
  rows: SiteReportSectionImageRow[];
  imageUrlFor: (imageId: number) => string;
  busy: boolean;
  onSaveBlob: (blob: Blob) => void | Promise<void>;
  onClearSaved: () => void | Promise<void>;
}) {
  const primary = rows[0];
  const src = primary ? imageUrlFor(primary.image_id) : '';
  return (
    <div className="space-y-3">
      {primary && src ? (
        <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 space-y-2">
          <p className="text-xs font-semibold text-slate-600">Saved signature</p>
          <img src={src} alt="" className="max-h-32 max-w-full rounded border border-slate-200 bg-white object-contain" />
          <button
            type="button"
            disabled={busy}
            onClick={() => void onClearSaved()}
            className="text-xs font-semibold text-rose-600 hover:underline disabled:opacity-50"
          >
            Remove saved signature
          </button>
        </div>
      ) : null}
      <div>
        <p className="text-xs font-semibold text-slate-600 mb-1">{primary ? 'Replace signature' : 'Sign here'}</p>
        <CustomerSiteReportSignaturePad disabled={busy} busy={busy} onSave={onSaveBlob} />
      </div>
    </div>
  );
}

export function renderSiteReportFieldInput(
  f: SiteReportTemplateField,
  value: string,
  onChange: (v: string) => void,
) {
  if (f.type === 'image' || f.type === 'signature') return null;
  if (f.type === 'static_text') {
    return (
      <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm text-slate-700 whitespace-pre-wrap">
        {f.content || ''}
      </div>
    );
  }
  if (f.type === 'yes_no_na') {
    return (
      <div className="flex flex-wrap gap-3">
        {YES_NO_NA_OPTIONS.map((opt) => (
          <label key={opt.value} className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="radio"
              name={`sr_${f.id}`}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className="size-4 border-slate-300 text-[#14B8A6] focus:ring-[#14B8A6]"
            />
            {opt.label}
          </label>
        ))}
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-500">
          <input
            type="radio"
            name={`sr_${f.id}`}
            value=""
            checked={!value}
            onChange={() => onChange('')}
            className="size-4 border-slate-300 text-[#14B8A6] focus:ring-[#14B8A6]"
          />
          Clear
        </label>
      </div>
    );
  }
  if (f.type === 'textarea') {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={f.rows ?? 4}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30 resize-y min-h-[72px]"
      />
    );
  }
  if (f.type === 'date') {
    return (
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-xs rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
      />
    );
  }
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
    />
  );
}
