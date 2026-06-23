'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { SiteReportTemplateDefinition, SiteReportTemplateSection } from '@/lib/siteReportTemplateTypes';
import { buildSiteReportFormPages, siteReportPageTabLabel } from '@/lib/siteReportFormPages';
import { CustomerSiteReportSectionView, type CustomerSiteReportSectionHandlers } from './CustomerSiteReportSectionView';
import { CustomerSiteReportRepeatableSectionView } from './CustomerSiteReportRepeatableSectionView';
import type { SiteReportRepeatableInstance, SiteReportSectionImageRow } from '@/lib/siteReportTemplateTypes';

type RepeatableHandlers = {
  instances: SiteReportRepeatableInstance[];
  onAddInstance: () => void;
  onRemoveInstance: (instanceId: string) => void;
  onCopyInstance: (instance: SiteReportRepeatableInstance) => void;
  onSetInstanceValue: (instanceId: string, fieldId: string, value: string) => void;
};

type Props = {
  def: SiteReportTemplateDefinition;
  footerSection: SiteReportTemplateSection | null;
  clientDisplayName: string;
  siteAddressLabel: string;
  values: Record<string, string>;
  sectionImages: Record<string, SiteReportSectionImageRow[]>;
  fieldImages: Record<string, SiteReportSectionImageRow[]>;
  uploadingKey: string | null;
  signatureBusyFieldId: string | null;
  imageUrlFor: (imageId: number) => string;
  h: CustomerSiteReportSectionHandlers;
  repeatableHandlers: (sec: SiteReportTemplateSection) => RepeatableHandlers;
};

export default function CustomerSiteReportFormNavigator({
  def,
  footerSection,
  clientDisplayName,
  siteAddressLabel,
  values,
  sectionImages,
  fieldImages,
  uploadingKey,
  signatureBusyFieldId,
  imageUrlFor,
  h,
  repeatableHandlers,
}: Props) {
  const pages = useMemo(() => buildSiteReportFormPages(def), [def]);
  const [pageIndex, setPageIndex] = useState(0);
  const safeIndex = pages.length === 0 ? 0 : Math.min(pageIndex, pages.length - 1);
  const activePage = pages[safeIndex];
  const isFirst = safeIndex <= 0;
  const isLast = safeIndex >= pages.length - 1;

  const renderSection = (sec: SiteReportTemplateSection, variant: 'default' | 'footer' = 'default') =>
    sec.repeatable ? (
      <CustomerSiteReportRepeatableSectionView
        key={sec.id}
        sec={sec}
        fieldImages={fieldImages}
        uploadingKey={uploadingKey}
        signatureBusyFieldId={signatureBusyFieldId}
        imageUrlFor={imageUrlFor}
        h={h}
        {...repeatableHandlers(sec)}
      />
    ) : (
      <CustomerSiteReportSectionView
        key={sec.id}
        sec={sec}
        variant={variant}
        clientDisplayName={clientDisplayName}
        siteAddressLabel={siteAddressLabel}
        values={values}
        sectionImages={sectionImages}
        fieldImages={fieldImages}
        uploadingKey={uploadingKey}
        signatureBusyFieldId={signatureBusyFieldId}
        imageUrlFor={imageUrlFor}
        h={h}
      />
    );

  return (
    <>
      <div className="print:hidden space-y-4">
        {pages.length > 1 ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
            {pages.map((page, idx) => {
              const active = idx === safeIndex;
              return (
                <button
                  key={page.kind === 'section' ? page.section.id : 'footer'}
                  type="button"
                  onClick={() => setPageIndex(idx)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                    active
                      ? 'bg-[#14B8A6] text-white shadow-sm'
                      : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {siteReportPageTabLabel(page, idx)}
                </button>
              );
            })}
          </div>
        ) : null}

        {activePage ? (
          activePage.kind === 'section' ? (
            renderSection(activePage.section)
          ) : footerSection ? (
            renderSection(footerSection, 'footer')
          ) : null
        ) : null}

        {pages.length > 1 ? (
          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              disabled={isFirst}
              onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft className="size-4" />
              Back
            </button>
            <p className="text-xs font-medium text-slate-500">
              Page {safeIndex + 1} of {pages.length}
            </p>
            <button
              type="button"
              disabled={isLast}
              onClick={() => setPageIndex((i) => Math.min(pages.length - 1, i + 1))}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-40"
            >
              Next
              <ChevronRight className="size-4" />
            </button>
          </div>
        ) : null}
      </div>

      <div className="hidden print:block space-y-8">
        {def.sections.map((sec) => renderSection(sec))}
        {footerSection ? renderSection(footerSection, 'footer') : null}
      </div>
    </>
  );
}
