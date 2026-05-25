'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeft, Download, Loader2, Plus, Printer, Save } from 'lucide-react';
import { coerceFireExtinguisherData, emptyFireBlanket, emptyFireExtinguisher } from '@/lib/electricalCertificates/documentDefaults';
import { FIRE_EXTINGUISHER_STANDARD_LABEL } from '@/lib/electricalCertificates/fireExtinguisherItems';
import { FIRE_EXTINGUISHER_EDITOR_SECTIONS, type FireExtinguisherEditorSectionKey } from '@/lib/electricalCertificates/types';
import {
  downloadCertificatePdf,
  openCertificatePdfPreviewWindow,
  previewCertificatePdf,
} from '@/lib/electricalCertificates/certificateExport';
import { getJson } from '../../../apiClient';
import { useCertificateEditor } from '../CertificateEditorContext';
import { AppendixSection, ObservationsSection } from './EditorSections';
import { FireExtinguisherSections, type UpdateFireExtinguisher } from './FireExtinguisherSections';

type CertificateEngineer = {
  key: string;
  full_name: string;
  role_position: string | null;
};

function sectionLabel(key: FireExtinguisherEditorSectionKey, extinguisherCount: number, blanketCount: number): string {
  const base = FIRE_EXTINGUISHER_EDITOR_SECTIONS.find((s) => s.key === key)?.label ?? key;
  if (key === 'fire-extinguishers' && extinguisherCount > 0) return `${base} (${extinguisherCount})`;
  if (key === 'fire-blankets' && blanketCount > 0) return `${base} (${blanketCount})`;
  return base;
}

export function FireExtinguisherCertificateEditor() {
  const { certificate, document, setDocument, saveDocument, saving, saveError, lastSavedAt, patchMeta } =
    useCertificateEditor();
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;
  const [section, setSection] = useState<FireExtinguisherEditorSectionKey>('installation-details');
  const [engineers, setEngineers] = useState<CertificateEngineer[]>([]);

  const fireExtinguisher = useMemo(
    () => document.fireExtinguisher ?? coerceFireExtinguisherData(null, certificate.customer_full_name ?? ''),
    [document.fireExtinguisher, certificate.customer_full_name],
  );

  useEffect(() => {
    if (!token) return;
    getJson<{ engineers: CertificateEngineer[] }>('/electrical-certificates/engineers', token)
      .then((res) => setEngineers(res.engineers ?? []))
      .catch(() => setEngineers([]));
  }, [token]);

  const updateFireExtinguisher: UpdateFireExtinguisher = (updater) => {
    setDocument((prev) => {
      const current = prev.fireExtinguisher ?? coerceFireExtinguisherData(null, certificate.customer_full_name ?? '');
      return { ...prev, typeSlug: 'fi_extinsp_5306', fireExtinguisher: updater(current) };
    });
  };

  const addExtinguisher = () => {
    updateFireExtinguisher((data) => ({
      ...data,
      extinguishers: [...data.extinguishers, emptyFireExtinguisher(data.extinguishers.length + 1)],
    }));
    setSection('fire-extinguishers');
  };

  const addBlanket = () => {
    updateFireExtinguisher((data) => ({
      ...data,
      blankets: [...data.blankets, emptyFireBlanket(data.blankets.length + 1)],
    }));
    setSection('fire-blankets');
  };

  const markCompleted = async () => {
    await saveDocument();
    await patchMeta({ status: certificate.status === 'completed' ? 'in_progress' : 'completed' });
  };

  const previewPdf = async () => {
    if (!token) return;
    const previewWindow = openCertificatePdfPreviewWindow();
    await saveDocument();
    await previewCertificatePdf(certificate.id, token, previewWindow);
  };

  const downloadPdf = async () => {
    if (!token) return;
    await saveDocument();
    await downloadCertificatePdf(certificate.id, certificate.certificate_number, token);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#f0f4f8]">
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/dashboard/certificates" className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50">
              <ChevronLeft className="size-4" />
            </Link>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fire Extinguisher Inspection Certificate</p>
              <h1 className="text-lg font-bold text-slate-900">{certificate.certificate_number}</h1>
              <p className="text-sm text-slate-600">
                {FIRE_EXTINGUISHER_STANDARD_LABEL}
                {certificate.customer_full_name ? ` · ${certificate.customer_full_name}` : ''}
                {certificate.installation_label ? ` · ${certificate.installation_label}` : ''}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <QuickAddButton label="Add extinguisher" onClick={addExtinguisher} />
            <QuickAddButton label="Add blanket" onClick={addBlanket} />
            <ActionButton onClick={previewPdf} icon={<Printer className="size-4" />} label="Preview" />
            <ActionButton onClick={downloadPdf} icon={<Download className="size-4" />} label="Download" />
            <ActionButton onClick={saveDocument} icon={saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} label="Save" />
            <button
              type="button"
              onClick={markCompleted}
              className="rounded-lg bg-[#14B8A6] px-3 py-2 text-sm font-semibold text-white hover:bg-[#0d9488]"
            >
              {certificate.status === 'completed' ? 'Reopen' : 'Complete'}
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {FIRE_EXTINGUISHER_EDITOR_SECTIONS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setSection(item.key)}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                section === item.key ? 'bg-[#14B8A6] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {sectionLabel(item.key, fireExtinguisher.extinguishers.length, fireExtinguisher.blankets.length)}
            </button>
          ))}
        </div>
        <div className="mt-2 min-h-5 text-xs text-slate-500">
          {saveError ? <span className="text-rose-600">{saveError}</span> : lastSavedAt ? 'Saved' : null}
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-auto px-4 py-5">
        {section === 'observations' ? (
          <ObservationsSection />
        ) : section === 'appendix' ? (
          <AppendixSection />
        ) : (
          <FireExtinguisherSections
            section={section}
            data={fireExtinguisher}
            update={updateFireExtinguisher}
            certificate={certificate}
            engineers={engineers}
            onAddExtinguisher={addExtinguisher}
            onAddBlanket={addBlanket}
          />
        )}
      </main>
    </div>
  );
}

function QuickAddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-lg border border-[#14B8A6]/40 bg-[#14B8A6]/10 px-3 py-2 text-sm font-semibold text-[#0f766e] hover:bg-[#14B8A6]/15"
    >
      <Plus className="size-4" />
      {label}
    </button>
  );
}

function ActionButton({ onClick, icon, label }: { onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
    >
      {icon}
      {label}
    </button>
  );
}
