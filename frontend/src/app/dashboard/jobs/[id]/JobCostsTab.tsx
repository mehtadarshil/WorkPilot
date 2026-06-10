'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { AlertCircle, Calculator, Loader2, Paperclip, Plus, Receipt, RotateCcw, Save, UploadCloud } from 'lucide-react';
import { getBlob, getJson, patchJson, postJson } from '../../../apiClient';

type CostSource = 'manual' | 'timesheet' | 'job_pricing' | 'quotation' | 'part';

interface ProofFile {
  original_filename: string;
  content_type: string;
  byte_size: number;
  href: string;
}

interface CostLine {
  id: string;
  source: CostSource;
  label: string;
  description: string | null;
  quantity: number | null;
  unit_amount: number | null;
  amount: number;
  currency: string;
  created_at: string | null;
  created_by_name: string | null;
  proof_files?: ProofFile[];
}

interface CostPayload {
  rate_config: {
    default_hourly_rate: number;
    default_rate_name: string | null;
    travel_hourly_rate: number;
    on_site_hourly_rate: number;
    travel_override: number | null;
    on_site_override: number | null;
    updated_at: string | null;
    updated_by_name: string | null;
  };
  summary: {
    total: number;
    manual_total: number;
    timesheet_total: number;
    job_pricing_total: number;
    quotation_total: number;
    parts_total: number;
    currency: string;
  };
  lines: CostLine[];
}

interface Props {
  jobId: string;
  token: string;
}

const sourceLabels: Record<CostSource, string> = {
  manual: 'Site cost',
  timesheet: 'Timesheet labour',
  job_pricing: 'Job pricing',
  quotation: 'Quotation',
  part: 'Parts',
};

function money(value: number | null | undefined) {
  return `£${Number(value ?? 0).toFixed(2)}`;
}

function bytesLabel(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

async function fileToPayload(file: File) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return {
    filename: file.name || 'proof',
    content_type: file.type || 'application/octet-stream',
    content_base64: window.btoa(binary),
  };
}

export default function JobCostsTab({ jobId, token }: Props) {
  const [payload, setPayload] = useState<CostPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [costType, setCostType] = useState('site_cost');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [proofFiles, setProofFiles] = useState<File[]>([]);
  const [rateSaving, setRateSaving] = useState(false);
  const [travelRateInput, setTravelRateInput] = useState('');
  const [onSiteRateInput, setOnSiteRateInput] = useState('');

  const loadCosts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getJson<CostPayload>(`/jobs/${jobId}/costs`, token);
      setPayload(res);
      setTravelRateInput(res.rate_config.travel_override == null ? '' : String(res.rate_config.travel_override));
      setOnSiteRateInput(res.rate_config.on_site_override == null ? '' : String(res.rate_config.on_site_override));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load job costs');
    } finally {
      setLoading(false);
    }
  }, [jobId, token]);

  useEffect(() => {
    void loadCosts();
  }, [loadCosts]);

  const grouped = useMemo(() => {
    const lines = payload?.lines ?? [];
    return lines.reduce<Record<CostSource, CostLine[]>>(
      (acc, line) => {
        acc[line.source].push(line);
        return acc;
      },
      { manual: [], timesheet: [], job_pricing: [], quotation: [], part: [] },
    );
  }, [payload?.lines]);

  const resetForm = () => {
    setCostType('site_cost');
    setDescription('');
    setAmount('');
    setNotes('');
    setProofFiles([]);
    setShowForm(false);
  };

  const submitCost = async () => {
    const numericAmount = Number(amount);
    if (!description.trim() || !(numericAmount > 0) || proofFiles.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const encoded = await Promise.all(proofFiles.map(fileToPayload));
      await postJson(
        `/jobs/${jobId}/costs`,
        {
          cost_type: costType,
          description,
          amount: numericAmount,
          notes,
          proof_files: encoded,
        },
        token,
      );
      resetForm();
      await loadCosts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save job cost');
    } finally {
      setSaving(false);
    }
  };

  const openProof = async (proof: ProofFile) => {
    try {
      const blob = await getBlob(proof.href, token);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open proof file');
    }
  };

  const saveRates = async () => {
    const travel = travelRateInput.trim();
    const onSite = onSiteRateInput.trim();
    const travelNumber = travel === '' ? null : Number(travel);
    const onSiteNumber = onSite === '' ? null : Number(onSite);
    if ((travel !== '' && (!Number.isFinite(travelNumber) || travelNumber < 0)) || (onSite !== '' && (!Number.isFinite(onSiteNumber) || onSiteNumber < 0))) {
      setError('Rates must be positive numbers, or blank to use the price book default.');
      return;
    }
    setRateSaving(true);
    setError(null);
    try {
      await patchJson(
        `/jobs/${jobId}/costs/rates`,
        {
          travel_hourly_rate: travel === '' ? null : travelNumber,
          on_site_hourly_rate: onSite === '' ? null : onSiteNumber,
        },
        token,
      );
      await loadCosts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save labour rates');
    } finally {
      setRateSaving(false);
    }
  };

  const resetRates = async () => {
    setRateSaving(true);
    setError(null);
    try {
      await patchJson(`/jobs/${jobId}/costs/rates`, { reset_to_default: true }, token);
      await loadCosts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset labour rates');
    } finally {
      setRateSaving(false);
    }
  };

  const canSave = description.trim().length > 0 && Number(amount) > 0 && proofFiles.length > 0 && !saving;
  const summary = payload?.summary;
  const rateConfig = payload?.rate_config;
  const rateDirty =
    rateConfig != null &&
    (travelRateInput.trim() !== (rateConfig.travel_override == null ? '' : String(rateConfig.travel_override)) ||
      onSiteRateInput.trim() !== (rateConfig.on_site_override == null ? '' : String(rateConfig.on_site_override)));

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/40 px-6 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-[17px] font-black uppercase tracking-tight text-slate-800">
              <Calculator className="size-5 text-[#14B8A6]" />
              Job costs
            </h2>
            <p className="mt-1 text-sm text-slate-500">Aggregates site costs, timesheet labour, job pricing, quotations, and parts for this job.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 rounded bg-[#14B8A6] px-4 py-2 text-[13px] font-black uppercase text-white shadow-sm hover:bg-[#13a89a]"
          >
            <Plus className="size-4" />
            Add cost
          </button>
        </div>

        {error ? (
          <div className="mx-6 mt-5 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm font-semibold text-slate-500">
            <Loader2 className="size-4 animate-spin" />
            Loading job costs...
          </div>
        ) : (
          <div className="space-y-6 p-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
              <SummaryCard label="Total counted" value={money(summary?.total)} strong />
              <SummaryCard label="Site costs" value={money(summary?.manual_total)} />
              <SummaryCard label="Timesheet" value={money(summary?.timesheet_total)} />
              <SummaryCard label="Job pricing" value={money(summary?.job_pricing_total)} />
              <SummaryCard label="Quotations" value={money(summary?.quotation_total)} />
              <SummaryCard label="Parts" value={money(summary?.parts_total)} />
            </div>

            {rateConfig ? (
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wide text-slate-800">Timesheet labour rates</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Used for travel and on-site timesheet costs on this job. Leave blank to use the customer price book default
                      {rateConfig.default_rate_name ? ` (${rateConfig.default_rate_name})` : ''}: {money(rateConfig.default_hourly_rate)}/hr.
                    </p>
                  </div>
                  {rateConfig.updated_at ? (
                    <p className="text-xs font-semibold text-slate-400">
                      Updated {dayjs(rateConfig.updated_at).format('DD/MM/YYYY h:mm a')}
                      {rateConfig.updated_by_name ? ` by ${rateConfig.updated_by_name}` : ''}
                    </p>
                  ) : null}
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto]">
                  <RateInput
                    label="Travel £/hr"
                    value={travelRateInput}
                    effective={rateConfig.travel_hourly_rate}
                    usingDefault={rateConfig.travel_override == null}
                    onChange={setTravelRateInput}
                    disabled={rateSaving}
                  />
                  <RateInput
                    label="On-site £/hr"
                    value={onSiteRateInput}
                    effective={rateConfig.on_site_hourly_rate}
                    usingDefault={rateConfig.on_site_override == null}
                    onChange={setOnSiteRateInput}
                    disabled={rateSaving}
                  />
                  <div className="flex items-end gap-2">
                    <button
                      type="button"
                      disabled={rateSaving || !rateDirty}
                      onClick={saveRates}
                      className="inline-flex h-10 items-center gap-2 rounded-md bg-[#14B8A6] px-3 text-xs font-black uppercase text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {rateSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                      Save
                    </button>
                    <button
                      type="button"
                      disabled={rateSaving || (rateConfig.travel_override == null && rateConfig.on_site_override == null)}
                      onClick={resetRates}
                      className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-black uppercase text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <RotateCcw className="size-4" />
                      Default
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {showForm ? (
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <input
                    value={costType}
                    onChange={(event) => setCostType(event.target.value)}
                    placeholder="Cost type"
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
                  />
                  <input
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Amount"
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
                  />
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-[#14B8A6]/40 bg-white px-3 py-2 text-sm font-bold text-[#14B8A6]">
                    <UploadCloud className="size-4" />
                    Proof required
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(event) => setProofFiles(Array.from(event.target.files ?? []))}
                    />
                  </label>
                </div>
                <input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Description"
                  className="mt-3 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
                />
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={3}
                  placeholder="Notes"
                  className="mt-3 w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
                />
                {proofFiles.length > 0 ? (
                  <p className="mt-2 text-xs font-semibold text-slate-500">
                    {proofFiles.map((f) => `${f.name} (${bytesLabel(f.size)})`).join(', ')}
                  </p>
                ) : (
                  <p className="mt-2 text-xs font-semibold text-amber-700">At least one proof file is required.</p>
                )}
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" onClick={resetForm} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600">
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!canSave}
                    onClick={submitCost}
                    className="rounded-md bg-[#14B8A6] px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save cost'}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-left text-[13px]">
                <thead className="border-b border-slate-100 bg-[#FBFCFD] text-[11px] font-black uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Item</th>
                    <th className="px-4 py-3 text-right">Qty / hours</th>
                    <th className="px-4 py-3 text-right">Unit</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3">Proof</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(payload?.lines ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center font-semibold text-slate-400">No costs found for this job.</td>
                    </tr>
                  ) : (
                    (Object.keys(grouped) as CostSource[]).flatMap((source) =>
                      grouped[source].map((line) => (
                        <tr key={line.id} className="hover:bg-slate-50/60">
                          <td className="px-4 py-4 font-bold text-slate-600">{sourceLabels[line.source]}</td>
                          <td className="px-4 py-4">
                            <p className="font-bold text-slate-800">{line.label}</p>
                            {line.description ? <p className="mt-1 whitespace-pre-wrap text-xs text-slate-500">{line.description}</p> : null}
                            {line.created_at ? <p className="mt-1 text-[11px] text-slate-400">{dayjs(line.created_at).format('DD/MM/YYYY h:mm a')}</p> : null}
                          </td>
                          <td className="px-4 py-4 text-right font-semibold text-slate-600">{line.quantity == null ? '-' : line.quantity.toFixed(2)}</td>
                          <td className="px-4 py-4 text-right font-semibold text-slate-600">{line.unit_amount == null ? '-' : money(line.unit_amount)}</td>
                          <td className="px-4 py-4 text-right font-black text-slate-900">{money(line.amount)}</td>
                          <td className="px-4 py-4">
                            {line.proof_files?.length ? (
                              <div className="flex flex-col gap-1">
                                {line.proof_files.map((proof) => (
                                  <button
                                    key={proof.href}
                                    type="button"
                                    onClick={() => void openProof(proof)}
                                    className="inline-flex items-center gap-1 text-left text-xs font-bold text-[#14B8A6] hover:underline"
                                  >
                                    <Paperclip className="size-3" />
                                    {proof.original_filename}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-300">-</span>
                            )}
                          </td>
                        </tr>
                      )),
                    )
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${strong ? 'border-[#14B8A6]/30 bg-[#14B8A6]/5' : 'border-slate-200 bg-slate-50/50'}`}>
      <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-lg font-black ${strong ? 'text-[#0f766e]' : 'text-slate-900'}`}>
        <Receipt className="mr-1 inline size-4 align-[-2px] text-slate-400" />
        {value}
      </p>
    </div>
  );
}

function RateInput({
  label,
  value,
  effective,
  usingDefault,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  effective: number;
  usingDefault: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</span>
      <input
        type="number"
        min="0"
        step="0.01"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Price book default"
        className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/20 disabled:opacity-60"
      />
      <span className="mt-1 block text-[11px] font-semibold text-slate-500">
        Effective: {money(effective)}/hr {usingDefault ? '(price book default)' : '(job override)'}
      </span>
    </label>
  );
}
