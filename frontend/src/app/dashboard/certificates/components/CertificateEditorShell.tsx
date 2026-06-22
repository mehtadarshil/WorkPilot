'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import {
  Building2,
  ClipboardList,
  Eye,
  FileText,
  Grid3X3,
  Menu,
  Zap,
  ChevronLeft,
  Loader2,
} from 'lucide-react';
import { EDITOR_SECTIONS, type EditorSectionKey } from '@/lib/electricalCertificates/types';
import { countIssuesBySection } from '@/lib/electricalCertificates/certificateUxUtils';
import { validateElectricalCertificate } from '@/lib/electricalCertificates/validation';
import { useCertificateEditor } from '../CertificateEditorContext';
import { ValidateSheet } from './ValidateSheet';
import { CertificateEditorMenu } from './CertificateEditorMenu';
import { EditorQuickNav } from './EditorQuickNav';

const SECTION_ICONS: Record<EditorSectionKey, React.ReactNode> = {
  'installation-details': <Building2 className="size-4" />,
  observations: <Eye className="size-4" />,
  'supply-characteristics': <Zap className="size-4" />,
  'inspection-schedule': <ClipboardList className="size-4" />,
  boards: <Grid3X3 className="size-4" />,
  appendix: <FileText className="size-4" />,
};

export function CertificateEditorShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { certificate, document, saving, saveError, lastSavedAt, runValidate, setValidateOpen } =
    useCertificateEditor();
  const base = `/dashboard/certificates/${certificate.id}`;
  const obsCount = certificate.document.observations.items.length;
  const boardCount = certificate.document.boards.length;
  const sectionIssueCounts = useMemo(
    () => countIssuesBySection(validateElectricalCertificate(document)),
    [document],
  );

  const activeSection =
    EDITOR_SECTIONS.find((s) => pathname.includes(`/${s.key}`))?.key ?? 'installation-details';

  const isBoardCircuitEditor =
    /\/boards\/[^/]+$/.test(pathname) && !pathname.endsWith('/print');

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#f0f4f8]">
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/certificates"
              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
            >
              <ChevronLeft className="size-4" />
            </Link>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">EICR</p>
              <h1 className="text-lg font-bold text-slate-900">{certificate.certificate_number}</h1>
              <p className="text-sm text-slate-600">
                {certificate.customer_full_name}
                {certificate.installation_label ? ` · ${certificate.installation_label}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                certificate.status === 'completed'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {certificate.status === 'completed' ? 'Completed' : 'In progress'}
            </span>
            {saving ? (
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <Loader2 className="size-3 animate-spin" /> Saving…
              </span>
            ) : (
              <span className="text-xs text-slate-500">
                {saveError ? saveError : lastSavedAt ? 'Saved' : ''}
              </span>
            )}
            <button
              type="button"
              onClick={async () => {
                await runValidate();
                setValidateOpen(true);
              }}
              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Menu className="size-4" /> Validate
            </button>
            <CertificateEditorMenu />
          </div>
        </div>
        <nav className="mt-3 flex gap-1 overflow-x-auto pb-1">
          {EDITOR_SECTIONS.map((s) => {
            const href = `${base}/${s.key}`;
            const active = activeSection === s.key;
            const badge =
              s.key === 'observations' && obsCount > 0
                ? obsCount
                : s.key === 'boards' && boardCount > 0
                  ? boardCount
                  : null;
            const issueCount =
              s.key === 'installation-details'
                ? sectionIssueCounts.installation ?? 0
                : s.key === 'observations'
                  ? sectionIssueCounts.observations ?? 0
                  : s.key === 'supply-characteristics'
                    ? sectionIssueCounts.supply ?? 0
                    : s.key === 'inspection-schedule'
                      ? sectionIssueCounts.inspection ?? 0
                      : s.key === 'boards'
                        ? sectionIssueCounts.boards ?? 0
                        : 0;
            return (
              <Link
                key={s.key}
                href={href}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                  active
                    ? 'bg-[#14B8A6]/15 text-[#0d9488]'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {SECTION_ICONS[s.key]}
                {s.label}
                {badge != null && (
                  <span className="rounded-full bg-[#14B8A6] px-1.5 text-[10px] text-white">{badge}</span>
                )}
                {issueCount > 0 && (
                  <span className="rounded-full bg-rose-500 px-1.5 text-[10px] text-white" title={`${issueCount} validation issue(s)`}>
                    !
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </header>
      <main
        className={`min-h-0 flex-1 overflow-y-auto pb-24 ${
          isBoardCircuitEditor ? 'overflow-x-hidden p-1 md:p-2' : 'p-3 md:p-5'
        }`}
      >
        {children}
      </main>
      <EditorQuickNav />
      <ValidateSheet />
    </div>
  );
}
