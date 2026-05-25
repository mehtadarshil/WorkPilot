'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Download, Loader2, Printer, Save } from 'lucide-react';
import { coerceDomesticFireAlarmInstData } from '@/lib/electricalCertificates/documentDefaults';
import { DOMESTIC_FIRE_ALARM_INST_STANDARD_LABEL } from '@/lib/electricalCertificates/domesticFireAlarmInstItems';
import { DOMESTIC_FIRE_ALARM_INST_EDITOR_SECTIONS } from '@/lib/electricalCertificates/types';
import type { DomesticFireAlarmInstEditorSectionKey } from '@/lib/electricalCertificates/types';
import { downloadCertificatePdf, openCertificatePdfPreviewWindow, previewCertificatePdf } from '@/lib/electricalCertificates/certificateExport';
import { getJson } from '../../../apiClient';
import { useCertificateEditor } from '../CertificateEditorContext';
import { DomesticFireAlarmInstSections, type UpdateInst } from './DomesticFireAlarmInstSections';
import type { DomesticFireAlarmInstCertificateData } from '@/lib/electricalCertificates/types';

type CertificateEngineer = {
  key: string;
  full_name: string;
  role_position: string | null;
};

export function DomesticFireAlarmInstCertificateEditor() {
  const { certificate, document, setDocument, saveDocument, saving, saveError, lastSavedAt, patchMeta } =
    useCertificateEditor();
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;
  const [section, setSection] = useState<DomesticFireAlarmInstEditorSectionKey>('installation-details');
  const [engineers, setEngineers] = useState<CertificateEngineer[]>([]);

  const inst = useMemo(
    () => document.domesticFireAlarmInst ?? coerceDomesticFireAlarmInstData(null, certificate.customer_full_name ?? ''),
    [document.domesticFireAlarmInst, certificate.customer_full_name],
  );

  useEffect(() => {
    if (!token) return;
    getJson<{ engineers: CertificateEngineer[] }>('/electrical-certificates/engineers', token)
      .then((res) => setEngineers(res.engineers ?? []))
      .catch(() => setEngineers([]));
  }, [token]);

  const updateInst: UpdateInst = (updater: (p: DomesticFireAlarmInstCertificateData) => DomesticFireAlarmInstCertificateData) => {
    setDocument((prev) => {
      const current = prev.domesticFireAlarmInst ?? coerceDomesticFireAlarmInstData(null, certificate.customer_full_name ?? '');
      return { ...prev, typeSlug: 'dfi_inst_2019_a1', domesticFireAlarmInst: updater(current) };
    });
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
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Domestic Fire Alarm Installation Certificate</p>
              <h1 className="text-lg font-bold text-slate-900">{certificate.certificate_number}</h1>
              <p className="text-sm text-slate-600">
                {DOMESTIC_FIRE_ALARM_INST_STANDARD_LABEL}
                {certificate.customer_full_name ? ` · ${certificate.customer_full_name}` : ''}
                {certificate.installation_label ? ` · ${certificate.installation_label}` : ''}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${certificate.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
              {certificate.status === 'completed' ? 'Completed' : 'In progress'}
            </span>
            {saving ? <span className="flex items-center gap-1 text-xs text-slate-500"><Loader2 className="size-3 animate-spin" /> Saving...</span> : <span className="text-xs text-slate-500">{saveError ? saveError : lastSavedAt ? 'Saved' : ''}</span>}
            <ActionButton onClick={() => void saveDocument()} icon={<Save className="size-4" />} label="Save" />
            <ActionButton onClick={() => void previewPdf()} icon={<Printer className="size-4" />} label="Preview" />
            <ActionButton onClick={() => void downloadPdf()} icon={<Download className="size-4" />} label="PDF" />
            <button type="button" onClick={() => void markCompleted()} className="rounded-lg bg-[#14B8A6] px-3 py-2 text-sm font-semibold text-white hover:bg-[#0d9488]">
              {certificate.status === 'completed' ? 'Reopen' : 'Mark complete'}
            </button>
          </div>
        </div>
        <nav className="mt-3 flex flex-wrap gap-1 border-t border-slate-100 pt-3">
          {DOMESTIC_FIRE_ALARM_INST_EDITOR_SECTIONS.map((s) => (
            <button key={s.key} type="button" onClick={() => setSection(s.key)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${section === s.key ? 'bg-[#14B8A6] text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              {s.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto max-w-5xl">
          <DomesticFireAlarmInstSections
            section={section}
            inst={inst}
            update={updateInst}
            certificate={certificate}
            engineers={engineers}
            appendix={document.appendix}
            onAppendixContent={(content) => setDocument((d) => ({ ...d, appendix: { ...d.appendix, content } }))}
            onAppendixPhotos={(photos) => setDocument((d) => ({ ...d, appendix: { ...d.appendix, photos } }))}
          />
        </div>
      </main>

      {certificate.job_number && (
        <footer className="shrink-0 border-t border-slate-200 bg-slate-800 px-4 py-2 text-center text-xs text-slate-300">
          Job No: {certificate.job_number} · {certificate.certificate_number}
        </footer>
      )}
    </div>
  );
}

function ActionButton({ onClick, icon, label }: { onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
      {icon} {label}
    </button>
  );
}
