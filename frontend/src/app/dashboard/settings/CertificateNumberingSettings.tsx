'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { getJson, patchJson } from '../../apiClient';
import { CERTIFICATE_TYPE_CATALOG } from '@/lib/electricalCertificates/types';

type NumberingRow = {
  type_slug: string;
  prefix: string;
  next_number: number;
};

type Props = {
  token: string | null;
};

export default function CertificateNumberingSettings({ token }: Props) {
  const [rows, setRows] = useState<NumberingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await getJson<{ settings: NumberingRow[] }>('/electrical-certificates/numbering-settings', token);
      setRows(res.settings ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load certificate numbering settings');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const mergedRows = useMemo(() => {
    return CERTIFICATE_TYPE_CATALOG.map((type) => {
      const existing = rows.find((row) => row.type_slug === type.slug);
      return {
        type_slug: type.slug,
        prefix: existing?.prefix ?? type.shortLabel,
        next_number: existing?.next_number ?? 1,
      };
    });
  }, [rows]);

  const patchRow = (typeSlug: string, patch: Partial<NumberingRow>) => {
    setRows((prev) => {
      const existing = prev.find((row) => row.type_slug === typeSlug);
      const next = existing
        ? prev.map((row) => (row.type_slug === typeSlug ? { ...row, ...patch } : row))
        : [...prev, { type_slug: typeSlug, prefix: '', next_number: 1, ...patch }];
      return next;
    });
  };

  const save = async () => {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      const res = await patchJson<{ settings: NumberingRow[] }>(
        '/electrical-certificates/numbering-settings',
        { settings: mergedRows },
        token,
      );
      setRows(res.settings ?? []);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save certificate numbering settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
        <Loader2 className="size-4 animate-spin" /> Loading certificate settings...
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Certificate Numbering</h2>
        <p className="mt-1 text-sm text-slate-600">
          Configure the prefix and next starting number for each certificate type. New certificates use
          <span className="font-semibold text-slate-800"> PREFIX-000001</span> style numbering.
        </p>
      </div>

      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div> : null}
      {saved ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Saved.</div> : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Certificate type</th>
              <th className="px-4 py-3">Prefix</th>
              <th className="px-4 py-3">Next number</th>
              <th className="px-4 py-3">Preview</th>
            </tr>
          </thead>
          <tbody>
            {mergedRows.map((row) => {
              const type = CERTIFICATE_TYPE_CATALOG.find((item) => item.slug === row.type_slug);
              const preview = `${row.prefix || type?.shortLabel || 'CERT'}-${String(Math.max(1, row.next_number || 1)).padStart(6, '0')}`;
              return (
                <tr key={row.type_slug} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{type?.title ?? row.type_slug}</p>
                    <p className="text-xs text-slate-500">{type?.subtitle}</p>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      value={row.prefix}
                      onChange={(e) => patchRow(row.type_slug, { prefix: e.target.value })}
                      className="w-32 rounded-lg border border-slate-200 px-3 py-2 text-sm uppercase"
                      placeholder={type?.shortLabel ?? 'CERT'}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min={1}
                      value={row.next_number}
                      onChange={(e) => patchRow(row.type_slug, { next_number: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                      className="w-32 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-700">{preview}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-lg bg-[#14B8A6] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0d9488] disabled:opacity-50"
      >
        {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
        Save certificate numbering
      </button>
    </div>
  );
}
