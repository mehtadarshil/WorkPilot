'use client';

import { useCallback, useEffect, useState } from 'react';
import { getJson, putJson } from '../../apiClient';
import { Plus, Trash2, ChevronUp, ChevronDown, Save } from 'lucide-react';

export interface AbortReasonRow {
  id?: number;
  label: string;
  sort_order: number;
}

interface Props {
  token: string;
}

export default function AbortReasonsSettings({ token }: Props) {
  const [reasons, setReasons] = useState<AbortReasonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getJson<{ reasons: AbortReasonRow[] }>('/diary-abort-reasons', token);
      const list = res.reasons || [];
      setReasons(
        list.map((r, i) => ({
          ...r,
          label: (r.label ?? '').trim(),
          sort_order: r.sort_order ?? i,
        })),
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= reasons.length) return;
    const next = [...reasons];
    const t = next[index];
    next[index] = next[j];
    next[j] = t;
    setReasons(next.map((r, i) => ({ ...r, sort_order: i })));
  };

  const addRow = () => {
    setReasons([...reasons, { label: '', sort_order: reasons.length }]);
  };

  const removeRow = (index: number) => {
    setReasons(reasons.filter((_, i) => i !== index).map((r, i) => ({ ...r, sort_order: i })));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setSavedAt(null);
    try {
      const res = await putJson<{ reasons: AbortReasonRow[] }>(
        '/settings/diary-abort-reasons',
        { reasons: reasons.map((r) => ({ label: r.label.trim() })) },
        token,
      );
      const list = res.reasons || [];
      setReasons(
        list.map((r, i) => ({
          ...r,
          label: (r.label ?? '').trim(),
          sort_order: r.sort_order ?? i,
        })),
      );
      setSavedAt(new Date().toLocaleTimeString());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Loading abort reasons…</p>;
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-sm text-slate-600 leading-relaxed">
        Field officers and web users must pick one of these reasons when aborting an active visit. Defaults are created
        on first install; you can rename, reorder, remove, or add entries at any time.
      </p>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {savedAt && <p className="text-sm text-emerald-600">Saved at {savedAt}</p>}

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="divide-y divide-slate-100">
          {reasons.map((row, index) => (
            <div key={index} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-3">
              <div className="flex gap-1 shrink-0">
                <button
                  type="button"
                  className="rounded border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-30"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  aria-label="Move up"
                >
                  <ChevronUp className="size-4" />
                </button>
                <button
                  type="button"
                  className="rounded border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-30"
                  disabled={index === reasons.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label="Move down"
                >
                  <ChevronDown className="size-4" />
                </button>
              </div>
              <input
                className="flex-1 min-w-0 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="Reason label"
                value={row.label}
                onChange={(e) => {
                  const v = e.target.value;
                  setReasons((prev) => prev.map((r, i) => (i === index ? { ...r, label: v } : r)));
                }}
              />
              <button
                type="button"
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 shrink-0"
                onClick={() => removeRow(index)}
                disabled={reasons.length <= 1}
              >
                <Trash2 className="size-4" />
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Plus className="size-4" />
          Add reason
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="inline-flex items-center gap-2 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-[#119f8e] disabled:opacity-50"
        >
          <Save className="size-4" />
          {saving ? 'Saving…' : 'Save list'}
        </button>
      </div>
    </div>
  );
}
