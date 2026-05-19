'use client';

import Link from 'next/link';
import { X } from 'lucide-react';
import { useCertificateEditor } from '../CertificateEditorContext';
import type { EditorSectionKey } from '@/lib/electricalCertificates/types';

const SECTION_ROUTES: Record<string, EditorSectionKey> = {
  installation: 'installation-details',
  observations: 'observations',
  supply: 'supply-characteristics',
  inspection: 'inspection-schedule',
  boards: 'boards',
  appendix: 'appendix',
};

export function ValidateSheet() {
  const { certificate, validationIssues, validateOpen, setValidateOpen } = useCertificateEditor();
  if (!validateOpen) return null;

  const grouped = validationIssues.reduce<Record<string, typeof validationIssues>>((acc, issue) => {
    const key = issue.section;
    if (!acc[key]) acc[key] = [];
    acc[key].push(issue);
    return acc;
  }, {});

  return (
  <>
    <button
      type="button"
      aria-label="Close validation"
      className="fixed inset-0 z-40 bg-slate-900/40"
      onClick={() => setValidateOpen(false)}
    />
    <aside className="fixed inset-x-0 bottom-0 z-50 max-h-[70vh] overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl md:inset-x-auto md:right-4 md:bottom-4 md:left-auto md:w-[420px] md:rounded-2xl">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Validate certificate</h2>
          <p className="text-xs text-slate-500">
            {validationIssues.length === 0
              ? 'No issues found'
              : `${validationIssues.length} issue${validationIssues.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setValidateOpen(false)}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
        >
          <X className="size-5" />
        </button>
      </div>
      <div className="overflow-y-auto px-4 py-3" style={{ maxHeight: 'calc(70vh - 56px)' }}>
        {validationIssues.length === 0 ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-4 text-sm text-emerald-800">
            This certificate passes validation. You can mark it completed when ready.
          </p>
        ) : (
          <ul className="space-y-4">
            {Object.entries(grouped).map(([section, items]) => {
              const routeKey = SECTION_ROUTES[section] ?? 'installation-details';
              const href = `/dashboard/certificates/${certificate.id}/${routeKey}`;
              return (
                <li key={section}>
                  <Link
                    href={href}
                    onClick={() => setValidateOpen(false)}
                    className="mb-2 block text-xs font-bold uppercase tracking-wide text-[#0d9488] hover:underline"
                  >
                    {section} ({items.length})
                  </Link>
                  <ul className="space-y-1">
                    {items.slice(0, 12).map((issue) => (
                      <li key={issue.id} className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs text-rose-900">
                        {issue.label}
                      </li>
                    ))}
                    {items.length > 12 && (
                      <li className="text-xs text-slate-500">+ {items.length - 12} more…</li>
                    )}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  </>
  );
}
