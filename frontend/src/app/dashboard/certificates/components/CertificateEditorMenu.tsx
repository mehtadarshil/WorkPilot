'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronDown,
  FileDown,
  Home,
  MoreVertical,
  Trash2,
  CheckCircle2,
  RotateCcw,
  Copy,
} from 'lucide-react';
import { deleteRequest, getJson, postJson } from '../../../apiClient';
import { cloneDocument } from '@/lib/electricalCertificates/documentHelpers';
import { downloadCertificatePdf } from '@/lib/electricalCertificates/certificateExport';
import { useCertificateEditor } from '../CertificateEditorContext';
import { ConvertCertificateModal } from './ConvertCertificateModal';

export function CertificateEditorMenu() {
  const router = useRouter();
  const { certificate, patchMeta, runValidate, setValidateOpen } = useCertificateEditor();
  const [open, setOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  const handleDelete = async () => {
    if (!token) return;
    if (!window.confirm(`Delete certificate ${certificate.certificate_number}? This cannot be undone.`)) {
      return;
    }
    try {
      await deleteRequest(`/electrical-certificates/${certificate.id}`, token);
      router.push('/dashboard/certificates');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        <MoreVertical className="size-4" /> Menu
        <ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul className="absolute right-0 z-50 mt-1 min-w-[200px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          <li className="px-3 py-1.5 text-xs font-semibold uppercase text-slate-400">Status</li>
          <li>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
              onClick={() => {
                void patchMeta({ status: 'in_progress' });
                setOpen(false);
              }}
            >
              <RotateCcw className="size-4 text-amber-600" /> Mark in progress
            </button>
          </li>
          <li>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
              onClick={() => {
                void patchMeta({ status: 'completed' });
                setOpen(false);
              }}
            >
              <CheckCircle2 className="size-4 text-emerald-600" /> Mark completed
            </button>
          </li>
          <li className="my-1 border-t border-slate-100" />
          <li>
            <button
              type="button"
              className="flex w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
              onClick={async () => {
                await runValidate();
                setValidateOpen(true);
                setOpen(false);
              }}
            >
              Validate
            </button>
          </li>
          <li>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
              onClick={() => {
                window.open(`/dashboard/certificates/${certificate.id}/print`, '_blank');
                setOpen(false);
              }}
            >
              <FileDown className="size-4" /> Print preview
            </button>
          </li>
          <li>
            <button
              type="button"
              disabled={pdfBusy}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50"
              onClick={() => {
                if (!token) return;
                setPdfBusy(true);
                void downloadCertificatePdf(certificate.id, certificate.certificate_number, token)
                  .catch((e) => alert(e instanceof Error ? e.message : 'PDF download failed'))
                  .finally(() => {
                    setPdfBusy(false);
                    setOpen(false);
                  });
              }}
            >
              <FileDown className="size-4" /> {pdfBusy ? 'Generating PDF…' : 'Download PDF'}
            </button>
          </li>
          <li>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
              onClick={() => {
                setOpen(false);
                setConvertOpen(true);
              }}
            >
              <Copy className="size-4" /> Copy / convert…
            </button>
          </li>
          <li>
            <button
              type="button"
              className="flex w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
              onClick={() => {
                router.push('/dashboard/settings?tab=company');
                setOpen(false);
              }}
            >
              Company branding (settings)
            </button>
          </li>
          <li className="my-1 border-t border-slate-100" />
          <li>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
              onClick={() => {
                setOpen(false);
                void handleDelete();
              }}
            >
              <Trash2 className="size-4" /> Delete certificate
            </button>
          </li>
          <li className="my-1 border-t border-slate-100" />
          <li>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
              onClick={() => {
                router.push('/dashboard/certificates');
                setOpen(false);
              }}
            >
              <Home className="size-4" /> Back to list
            </button>
          </li>
        </ul>
      )}
      <ConvertCertificateModal
        open={convertOpen}
        source={certificate}
        onClose={() => setConvertOpen(false)}
        onConfirm={async (typeSlug) => {
          if (!token) return;
          const full = await getJson<{ certificate: typeof certificate }>(
            `/electrical-certificates/${certificate.id}`,
            token,
          );
          const doc = cloneDocument(full.certificate.document);
          doc.typeSlug = typeSlug as typeof doc.typeSlug;
          const res = await postJson<{ certificate: typeof certificate }>(
            '/electrical-certificates',
            {
              customer_id: full.certificate.customer_id,
              work_address_id: full.certificate.work_address_id,
              job_number: full.certificate.job_number,
              type_slug: typeSlug,
              document: doc,
            },
            token,
          );
          setConvertOpen(false);
          router.push(`/dashboard/certificates/${res.certificate.id}/installation-details`);
        }}
      />
    </div>
  );
}
