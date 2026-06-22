'use client';

import { useState } from 'react';
import CustomerSiteReportSignaturePad from '@/app/dashboard/customers/[id]/CustomerSiteReportSignaturePad';

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Could not read signature'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read signature'));
    reader.readAsDataURL(blob);
  });
}

export function DeclarationSignatureField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (dataUrl: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  const save = async (blob: Blob) => {
    setBusy(true);
    try {
      onChange(await blobToDataUrl(blob));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">{label}</p>
      {value ? (
        <div className="mb-2 rounded border border-slate-200 bg-white p-2">
          <img src={value} alt={label} className="mx-auto h-16 max-w-full object-contain" />
        </div>
      ) : null}
      <CustomerSiteReportSignaturePad busy={busy} saveLabel={`Save ${label.toLowerCase()}`} onSave={save} />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          className="mt-2 text-xs font-semibold text-rose-600 hover:underline"
        >
          Clear signature
        </button>
      ) : null}
    </div>
  );
}
