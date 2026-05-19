'use client';

import Link from 'next/link';
import { Camera, FileText, Search } from 'lucide-react';
import { useCertificateEditor } from '../CertificateEditorContext';

export function EditorQuickNav() {
  const { certificate } = useCertificateEditor();
  const base = `/dashboard/certificates/${certificate.id}`;

  return (
    <div className="fixed bottom-4 left-4 z-30 flex flex-col gap-2 print:hidden">
      <Link
        href={`${base}/appendix`}
        className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-md hover:bg-slate-50"
      >
        <FileText className="size-4" /> Notes
      </Link>
      <Link
        href={`${base}/observations`}
        className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-md hover:bg-slate-50"
      >
        <Search className="size-4" /> Observation
      </Link>
      <Link
        href={`${base}/appendix`}
        className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-md hover:bg-slate-50"
      >
        <Camera className="size-4" /> Appendix
      </Link>
    </div>
  );
}
