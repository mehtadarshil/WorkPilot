'use client';

import { useState } from 'react';
import { ChevronDown, Copy, Plus, Trash2 } from 'lucide-react';
import type { SiteReportRepeatableInstance, SiteReportSectionImageRow, SiteReportTemplateSection } from '@/lib/siteReportTemplateTypes';
import { scopedRepeatableFieldKey } from '@/lib/siteReportTemplateTypes';
import { visibleSiteReportFields } from '@/lib/siteReportFieldVisibility';
import type { CustomerSiteReportSectionHandlers } from './CustomerSiteReportSectionView';
import {
  SiteReportFieldImageList,
  SiteReportSignatureBlock,
  renderSiteReportFieldInput,
} from './CustomerSiteReportFieldBlocks';

type Props = {
  sec: SiteReportTemplateSection;
  instances: SiteReportRepeatableInstance[];
  fieldImages: Record<string, SiteReportSectionImageRow[]>;
  uploadingKey: string | null;
  signatureBusyFieldId: string | null;
  imageUrlFor: (imageId: number) => string;
  h: CustomerSiteReportSectionHandlers;
  onAddInstance: () => void;
  onRemoveInstance: (instanceId: string) => void;
  onCopyInstance: (instance: SiteReportRepeatableInstance) => void;
  onSetInstanceValue: (instanceId: string, fieldId: string, value: string) => void;
};

export function CustomerSiteReportRepeatableSectionView({
  sec,
  instances,
  fieldImages,
  uploadingKey,
  signatureBusyFieldId,
  imageUrlFor,
  h,
  onAddInstance,
  onRemoveInstance,
  onCopyInstance,
  onSetInstanceValue,
}: Props) {
  const repeatLabel = sec.repeat_label?.trim() || 'Item';
  const addLabel = sec.add_label?.trim() || `Add ${repeatLabel.toLowerCase()}`;
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleCollapsed = (instanceId: string) => {
    setCollapsed((prev) => ({ ...prev, [instanceId]: !prev[instanceId] }));
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden print:shadow-none">
      <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900">{sec.title}</h3>
          {sec.helper_text ? <p className="mt-1 text-xs text-slate-600">{sec.helper_text}</p> : null}
        </div>
        <button
          type="button"
          onClick={onAddInstance}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#14B8A6] bg-white px-3 py-1.5 text-xs font-bold text-[#14B8A6] hover:bg-emerald-50 print:hidden"
        >
          <Plus className="size-3.5" />
          {addLabel}
        </button>
      </div>

      <div className="space-y-4 p-4">
        {instances.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500 print:hidden">
            No {repeatLabel.toLowerCase()} entries yet. Click &ldquo;{addLabel}&rdquo; to start.
          </p>
        ) : (
          instances.map((instance, index) => {
            const title =
              instance.values.door_location?.trim() ||
              instance.values.fire_door_rating?.trim() ||
              `${repeatLabel} ${index + 1}`;
            const isCollapsed = collapsed[instance.id] === true;
            const visibleFields = visibleSiteReportFields(sec.fields, instance.values);
            return (
              <div key={instance.id} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => toggleCollapsed(instance.id)}
                    className="inline-flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <ChevronDown className={`size-4 shrink-0 text-slate-500 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                    <span className="truncate text-sm font-bold text-slate-800">{title}</span>
                  </button>
                  <div className="flex items-center gap-1 print:hidden">
                    <button
                      type="button"
                      onClick={() => onCopyInstance(instance)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
                      title={`Copy ${repeatLabel.toLowerCase()}`}
                    >
                      <Copy className="size-3.5" />
                      Copy
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveInstance(instance.id)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50"
                      title={`Remove ${repeatLabel.toLowerCase()}`}
                    >
                      <Trash2 className="size-3.5" />
                      Remove
                    </button>
                  </div>
                </div>
                {!isCollapsed ? (
                  <div className="space-y-4 p-4 print:space-y-2 print:p-3">
                    {visibleFields.map((field) => {
                      const scopedKey = scopedRepeatableFieldKey(sec.id, instance.id, field.id);
                      const value = instance.values[field.id] ?? '';
                      return (
                        <div key={field.id} className="space-y-1.5">
                          {field.label ? (
                            <label className="block text-sm font-semibold text-slate-800">{field.label}</label>
                          ) : null}
                          {field.type === 'image' ? (
                            <SiteReportFieldImageList
                              rows={fieldImages[scopedKey] || []}
                              imageUrlFor={imageUrlFor}
                              uploading={uploadingKey === `field:${scopedKey}`}
                              onPickFile={(f) => void h.uploadFieldImage(scopedKey, f)}
                              onUpdateMeta={(rowId, patch) => h.updateFieldImageMeta(scopedKey, rowId, patch)}
                              onRemove={(row) => void h.removeFieldImage(scopedKey, row)}
                            />
                          ) : field.type === 'signature' ? (
                            <SiteReportSignatureBlock
                              rows={fieldImages[scopedKey] || []}
                              imageUrlFor={imageUrlFor}
                              busy={signatureBusyFieldId === scopedKey}
                              onSaveBlob={(blob) => void h.replaceSignatureField(scopedKey, blob)}
                              onClearSaved={() => void h.clearSignatureField(scopedKey)}
                            />
                          ) : field.type === 'static_text' ? (
                            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700 whitespace-pre-wrap">
                              {field.content || ''}
                            </div>
                          ) : (
                            renderSiteReportFieldInput(field, value, (v) => onSetInstanceValue(instance.id, field.id, v))
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
