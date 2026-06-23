import type { SiteReportTemplateDefinition, SiteReportTemplateSection } from './siteReportTemplateTypes';

export type SiteReportFormPage =
  | { kind: 'section'; section: SiteReportTemplateSection; pageNumber: number }
  | { kind: 'footer'; title: string; pageNumber: number };

export function buildSiteReportFormPages(def: SiteReportTemplateDefinition): SiteReportFormPage[] {
  const pages: SiteReportFormPage[] = [];
  let pageNumber = 1;
  for (const section of def.sections) {
    pages.push({ kind: 'section', section, pageNumber: pageNumber++ });
  }
  if (def.footer?.fields?.length) {
    pages.push({
      kind: 'footer',
      title: def.footer.title?.trim() || 'Certificate / footer',
      pageNumber,
    });
  }
  return pages;
}

export function siteReportPageTabLabel(page: SiteReportFormPage, index: number): string {
  if (page.kind === 'section') {
    const title = page.section.title?.trim();
    if (title) return title.length > 28 ? `${title.slice(0, 26)}…` : title;
    return `Page ${index + 1}`;
  }
  const title = page.title.trim();
  return title.length > 28 ? `${title.slice(0, 26)}…` : title;
}
