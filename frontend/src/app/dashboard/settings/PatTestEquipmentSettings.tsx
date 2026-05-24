'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { getJson, patchJson } from '../../apiClient';

type PatTestEquipmentDefaults = {
  make: string;
  serialNo: string;
  notes: string;
};

type Props = {
  token: string | null;
};

const emptyDefaults: PatTestEquipmentDefaults = {
  make: '',
  serialNo: '',
  notes: '',
};

const inputClass = 'mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30';

export default function PatTestEquipmentSettings({ token }: Props) {
  const [testEquipment, setTestEquipment] = useState<PatTestEquipmentDefaults>(emptyDefaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await getJson<{ testEquipment: PatTestEquipmentDefaults }>('/electrical-certificates/pat-defaults', token);
      setTestEquipment(res.testEquipment ?? emptyDefaults);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load PAT test equipment defaults');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      const res = await patchJson<{ testEquipment: PatTestEquipmentDefaults }>(
        '/electrical-certificates/pat-defaults',
        { testEquipment },
        token,
      );
      setTestEquipment(res.testEquipment ?? emptyDefaults);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save PAT test equipment defaults');
    } finally {
      setSaving(false);
    }
  };

  const patch = (field: keyof PatTestEquipmentDefaults, value: string) => {
    setTestEquipment((prev) => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
        <Loader2 className="size-4 animate-spin" /> Loading PAT test equipment defaults...
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-900">PAT Test Equipment Defaults</h2>
        <p className="mt-1 text-sm text-slate-600">
          Set the tester details that should appear by default in Portable Appliance Test certificates.
        </p>
      </div>

      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div> : null}
      {saved ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Saved.</div> : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold uppercase text-slate-500">Equipment make / model</span>
            <input
              value={testEquipment.make}
              onChange={(e) => patch('make', e.target.value)}
              className={inputClass}
              placeholder="e.g. Seaward Apollo 500"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase text-slate-500">Serial no</span>
            <input
              value={testEquipment.serialNo}
              onChange={(e) => patch('serialNo', e.target.value)}
              className={inputClass}
              placeholder="Tester serial number"
            />
          </label>
        </div>
        <label className="mt-4 block">
          <span className="text-xs font-semibold uppercase text-slate-500">Default notes</span>
          <textarea
            value={testEquipment.notes}
            onChange={(e) => patch('notes', e.target.value)}
            rows={4}
            className={`${inputClass} resize-y`}
            placeholder="Any default calibration or tester notes"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-lg bg-[#14B8A6] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0d9488] disabled:opacity-50"
      >
        {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
        Save PAT equipment defaults
      </button>
    </div>
  );
}
