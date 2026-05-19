'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { CERTIFICATE_TYPE_CATALOG } from '@/lib/electricalCertificates/types';
import type { ElectricalCertificate } from '@/lib/electricalCertificates/types';

type Props = {
  open: boolean;
  source: ElectricalCertificate | null;
  onClose: () => void;
  onConfirm: (typeSlug: string, mode: 'copy' | 'convert') => Promise<void>;
};

export function ConvertCertificateModal({ open, source, onClose, onConfirm }: Props) {
  const [typeSlug, setTypeSlug] = useState(source?.type_slug ?? 'eicr_18e_a3');
  const [mode, setMode] = useState<'copy' | 'convert'>('copy');
  const [busy, setBusy] = useState(false);

  if (!open || !source) return null;

  const handleSubmit = async () => {
    setBusy(true);
    try {
      await onConfirm(typeSlug, mode);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Copy / convert certificate</h2>
            <p className="mt-1 text-sm text-slate-600">
              From <span className="font-mono font-semibold">{source.certificate_number}</span>
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100">
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Action</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode('copy')}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold ${
                  mode === 'copy'
                    ? 'border-[#14B8A6] bg-[#14B8A6]/10 text-[#0d9488]'
                    : 'border-slate-200 text-slate-600'
                }`}
              >
                Copy (duplicate)
              </button>
              <button
                type="button"
                onClick={() => setMode('convert')}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold ${
                  mode === 'convert'
                    ? 'border-[#14B8A6] bg-[#14B8A6]/10 text-[#0d9488]'
                    : 'border-slate-200 text-slate-600'
                }`}
              >
                Convert type
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {mode === 'copy'
                ? 'Creates a new certificate with the same type and copied data.'
                : 'Creates a new certificate and sets the selected certificate type.'}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Certificate type</label>
            <select
              value={typeSlug}
              onChange={(e) => setTypeSlug(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              {CERTIFICATE_TYPE_CATALOG.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.shortLabel} — {t.title}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() => void handleSubmit()}
            className="w-full rounded-lg bg-[#14B8A6] py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Creating…' : mode === 'copy' ? 'Create copy' : 'Convert & create'}
          </button>
        </div>
      </div>
    </div>
  );
}
