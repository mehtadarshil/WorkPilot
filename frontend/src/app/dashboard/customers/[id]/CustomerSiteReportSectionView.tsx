'use client';

/* eslint-disable @next/next/no-img-element -- blob previews for section images */
import { ImagePlus, Loader2, Plus } from 'lucide-react';
import type { SiteReportTemplateSection, SiteReportSectionImageRow } from '@/lib/siteReportTemplateTypes';
import {
  SiteReportFieldImageList,
  SiteReportSignatureBlock,
  renderSiteReportFieldInput,
} from './CustomerSiteReportFieldBlocks';

export type CustomerSiteReportSectionHandlers = {
  setFieldValue: (id: string, v: string) => void;
  uploadFieldImage: (fieldId: string, f: File) => Promise<void>;
  updateFieldImageMeta: (fieldId: string, rowId: string, patch: Partial<SiteReportSectionImageRow>) => void;
  removeFieldImage: (fieldId: string, row: SiteReportSectionImageRow) => Promise<void>;
  replaceSignatureField: (fieldId: string, blob: Blob) => Promise<void>;
  clearSignatureField: (fieldId: string) => Promise<void>;
  uploadSectionImage: (sectionKey: string, f: File) => Promise<void>;
  updateImageMeta: (sectionKey: string, rowId: string, patch: Partial<SiteReportSectionImageRow>) => void;
  removeSectionImage: (sectionKey: string, row: SiteReportSectionImageRow) => Promise<void>;
};

type Props = {
  sec: SiteReportTemplateSection;
  variant?: 'default' | 'footer';
  clientDisplayName: string;
  siteAddressLabel: string;
  values: Record<string, string>;
  sectionImages: Record<string, SiteReportSectionImageRow[]>;
  fieldImages: Record<string, SiteReportSectionImageRow[]>;
  uploadingKey: string | null;
  signatureBusyFieldId: string | null;
  imageUrlFor: (imageId: number) => string;
  h: CustomerSiteReportSectionHandlers;
};

export function CustomerSiteReportSectionView({
  sec,
  variant = 'default',
  clientDisplayName,
  siteAddressLabel,
  values,
  sectionImages,
  fieldImages,
  uploadingKey,
  signatureBusyFieldId,
  imageUrlFor,
  h,
}: Props) {
  const imagesLabel = variant === 'footer' ? 'Images (e.g. signature)' : 'Section images';
  const AddIcon = variant === 'footer' ? Plus : ImagePlus;

  return (
    <section
      className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden print:shadow-none break-inside-avoid"
    >
      <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3">
        <h3 className="text-base font-bold text-slate-900">{sec.title}</h3>
        {sec.helper_text ? <p className="mt-1 text-xs text-slate-600">{sec.helper_text}</p> : null}
      </div>
      <div className="space-y-5 p-4">
        {sec.fields.map((field) => (
          <div key={field.id} className="space-y-1.5">
            {field.label ? <label className="block text-sm font-semibold text-slate-800">{field.label}</label> : null}
            {sec.id === 'client_header' && (field.id === 'client_name_display' || field.id === 'property_address_display') ? (
              <div className="rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm text-slate-800 whitespace-pre-wrap">
                {field.id === 'client_name_display' ? clientDisplayName : siteAddressLabel}
              </div>
            ) : field.type === 'image' ? (
              <SiteReportFieldImageList
                rows={fieldImages[field.id] || []}
                imageUrlFor={imageUrlFor}
                uploading={uploadingKey === `field:${field.id}`}
                onPickFile={(f) => void h.uploadFieldImage(field.id, f)}
                onUpdateMeta={(rowId, patch) => h.updateFieldImageMeta(field.id, rowId, patch)}
                onRemove={(row) => void h.removeFieldImage(field.id, row)}
              />
            ) : field.type === 'signature' ? (
              <SiteReportSignatureBlock
                rows={fieldImages[field.id] || []}
                imageUrlFor={imageUrlFor}
                busy={signatureBusyFieldId === field.id}
                onSaveBlob={(blob) => void h.replaceSignatureField(field.id, blob)}
                onClearSaved={() => void h.clearSignatureField(field.id)}
              />
            ) : (
              renderSiteReportFieldInput(field, values[field.id] ?? '', (v) => h.setFieldValue(field.id, v))
            )}
          </div>
        ))}

        {sec.allow_section_images ? (
          <div className="border-t border-slate-100 pt-4 print:hidden">
            <p className="text-xs font-semibold uppercase text-slate-500 mb-2">{imagesLabel}</p>
            <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <AddIcon className="size-3.5" />
              Add image
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={!!uploadingKey?.startsWith(sec.id)}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void h.uploadSectionImage(sec.id, f);
                }}
              />
            </label>
            {uploadingKey?.startsWith(sec.id) ? (
              <span className="ml-2 text-xs text-slate-500 inline-flex items-center gap-1">
                <Loader2 className="size-3.5 animate-spin" /> Uploading…
              </span>
            ) : null}
            <div className="mt-3 space-y-3">
              {(sectionImages[sec.id] || []).map((im) => {
                const src = imageUrlFor(im.image_id);
                return (
                  <div key={im.id} className="flex flex-wrap gap-3 rounded-lg border border-slate-100 p-3">
                    <div className="w-full sm:w-40 shrink-0">
                      {src ? (
                        <img
                          src={src}
                          alt=""
                          className="w-full rounded-md border border-slate-100 object-contain max-h-36 bg-slate-50"
                        />
                      ) : (
                        <div className="flex h-24 items-center justify-center rounded border border-dashed text-xs text-slate-400">
                          No preview
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <input
                        value={im.description}
                        onChange={(e) => h.updateImageMeta(sec.id, im.id, { description: e.target.value })}
                        placeholder={variant === 'footer' ? 'Description' : 'What the image shows'}
                        className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
                      />
                      <input
                        value={im.note}
                        onChange={(e) => h.updateImageMeta(sec.id, im.id, { note: e.target.value })}
                        placeholder={variant === 'footer' ? 'Note' : 'Short note (optional)'}
                        className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => void h.removeSectionImage(sec.id, im)}
                        className="text-xs font-semibold text-rose-600 hover:underline print:hidden"
                      >
                        {variant === 'footer' ? 'Remove' : 'Remove image'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
