'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { AlertCircle, Calculator, Loader2, Paperclip, Pencil, Plus, Receipt, RotateCcw, Save, Trash2, UploadCloud } from 'lucide-react';
import { deleteRequest, getBlob, getJson, patchJson, postJson } from '../../../apiClient';
import EditTimelineModal from './components/EditTimelineModal';
import type { VisitStatusLog, VisitTimesheetSegment } from './visitStatusLabels';

type CostSource = 'manual' | 'timesheet' | 'job_pricing' | 'quotation' | 'part' | 'expense';

interface ProofFile {
  original_filename: string;
  content_type: string;
  byte_size: number;
  href: string;
}

interface CostLine {
  id: string;
  source: CostSource;
  editable?: boolean;
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
    first_hour_labour_rate: number;
    additional_hour_labour_rate: number;
    travel_override: number | null;
    on_site_override: number | null;
    first_hour_override: number | null;
    additional_hour_override: number | null;
    price_book_name: string | null;
    price_book_source: 'customer' | 'company_default' | null;
    updated_at: string | null;
    updated_by_name: string | null;
  };
  timesheet_summary: {
    on_site_duration_label: string;
    travel_duration_label: string;
    on_site_hours: number;
    travel_hours: number;
    labour_amount: number;
    travel_amount: number;
    first_hour_labour_rate: number;
    additional_hour_labour_rate: number;
    travel_hourly_rate: number;
  } | null;
  summary: {
    total: number;
    manual_total: number;
    timesheet_total: number;
    job_pricing_total: number;
    quotation_total: number;
    parts_total: number;
    expenses_total: number;
    currency: string;
  };
  lines: CostLine[];
  visits?: {
    id: number;
    start_time: string;
    status: string;
    officer_name: string;
    travel_seconds: number;
    on_site_seconds: number;
  }[];
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
  expense: 'Approved expenses',
};

function money(value: number | null | undefined) {
  return `£${Number(value ?? 0).toFixed(2)}`;
}

function bytesLabel(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function manualCostId(lineId: string): number | null {
  if (!lineId.startsWith('manual-')) return null;
  const id = Number(lineId.slice('manual-'.length));
  return Number.isFinite(id) ? id : null;
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

function formatSeconds(sec: number): string {
  if (sec <= 0) return '0 min';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || h === 0) parts.push(`${m}m`);
  return parts.join(' ');
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
  const [firstHourRateInput, setFirstHourRateInput] = useState('');
  const [additionalHourRateInput, setAdditionalHourRateInput] = useState('');
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editCostType, setEditCostType] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const [editingDiaryEventId, setEditingDiaryEventId] = useState<number | null>(null);
  const [editTimelineOpen, setEditTimelineOpen] = useState(false);
  const [visitStatusLogs, setVisitStatusLogs] = useState<VisitStatusLog[]>([]);
  const [visitTimesheetEntries, setVisitTimesheetEntries] = useState<VisitTimesheetSegment[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  const handleEditVisitTimesheet = async (visitId: number) => {
    setLoadingTimeline(true);
    setError(null);
    try {
      const [resTimesheet, resEvent] = await Promise.all([
        getJson<{ entries: VisitTimesheetSegment[] }>(`/diary-events/${visitId}/timesheet`, token),
        getJson<{ status_logs?: VisitStatusLog[] }>(`/diary-events/${visitId}`, token),
      ]);
      setVisitTimesheetEntries(resTimesheet.entries || []);
      setVisitStatusLogs(resEvent.status_logs || []);
      setEditingDiaryEventId(visitId);
      setEditTimelineOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load timesheet data');
    } finally {
      setLoadingTimeline(false);
    }
  };

  const loadCosts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getJson<CostPayload>(`/jobs/${jobId}/costs`, token);
      setPayload(res);
      setTravelRateInput(res.rate_config.travel_override == null ? '' : String(res.rate_config.travel_override));
      setFirstHourRateInput(res.rate_config.first_hour_override == null ? '' : String(res.rate_config.first_hour_override));
      setAdditionalHourRateInput(res.rate_config.additional_hour_override == null ? '' : String(res.rate_config.additional_hour_override));
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
    const lines = (payload?.lines ?? []).filter((line) => line.source !== 'timesheet');
    return lines.reduce<Record<CostSource, CostLine[]>>(
      (acc, line) => {
        acc[line.source].push(line);
        return acc;
      },
      { manual: [], timesheet: [], job_pricing: [], quotation: [], part: [], expense: [] },
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
    if (!description.trim() || !(numericAmount > 0)) return;
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
    const firstHour = firstHourRateInput.trim();
    const additionalHour = additionalHourRateInput.trim();
    const travelNumber = travel === '' ? null : Number(travel);
    const firstHourNumber = firstHour === '' ? null : Number(firstHour);
    const additionalHourNumber = additionalHour === '' ? null : Number(additionalHour);
    const invalidTravelRate = travelNumber !== null && (!Number.isFinite(travelNumber) || travelNumber < 0);
    const invalidFirstHourRate = firstHourNumber !== null && (!Number.isFinite(firstHourNumber) || firstHourNumber < 0);
    const invalidAdditionalHourRate = additionalHourNumber !== null && (!Number.isFinite(additionalHourNumber) || additionalHourNumber < 0);
    if (invalidTravelRate || invalidFirstHourRate || invalidAdditionalHourRate) {
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
          first_hour_labour_rate: firstHour === '' ? null : firstHourNumber,
          additional_hour_labour_rate: additionalHour === '' ? null : additionalHourNumber,
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

  const startEditLine = (line: CostLine) => {
    if (!line.editable) return;
    setEditingLineId(line.id);
    setEditCostType(line.label || 'site_cost');
    const [mainDescription, ...noteLines] = (line.description ?? '').split('\n');
    setEditDescription(mainDescription ?? '');
    setEditNotes(noteLines.join('\n'));
    setEditAmount(String(line.amount));
    setShowForm(false);
  };

  const cancelEditLine = () => {
    setEditingLineId(null);
    setEditCostType('');
    setEditDescription('');
    setEditAmount('');
    setEditNotes('');
  };

  const saveEditLine = async () => {
    if (!editingLineId) return;
    const id = manualCostId(editingLineId);
    const numericAmount = Number(editAmount);
    if (id == null || !editDescription.trim() || !(numericAmount > 0)) return;
    setEditSaving(true);
    setError(null);
    try {
      await patchJson(
        `/jobs/${jobId}/costs/${id}`,
        {
          cost_type: editCostType,
          description: editDescription,
          amount: numericAmount,
          notes: editNotes,
        },
        token,
      );
      cancelEditLine();
      await loadCosts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update job cost');
    } finally {
      setEditSaving(false);
    }
  };

  const deleteLine = async (line: CostLine) => {
    const id = manualCostId(line.id);
    if (id == null) return;
    if (!window.confirm('Delete this cost entry?')) return;
    setEditSaving(true);
    setError(null);
    try {
      await deleteRequest(`/jobs/${jobId}/costs/${id}`, token);
      if (editingLineId === line.id) cancelEditLine();
      await loadCosts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete job cost');
    } finally {
      setEditSaving(false);
    }
  };

  const canSave = description.trim().length > 0 && Number(amount) > 0 && !saving;
  const canSaveEdit = editDescription.trim().length > 0 && Number(editAmount) > 0 && !editSaving;
  const summary = payload?.summary;
  const rateConfig = payload?.rate_config;
  const timesheetSummary = payload?.timesheet_summary;

  const travelByOfficer = useMemo(() => {
    if (!payload?.visits?.length) return [];
    const map = new Map<string, { officer_name: string; travel_seconds: number; travel_hours: number; travel_amount: number }>();
    for (const v of payload.visits) {
      if (v.travel_seconds <= 0) continue;
      const key = v.officer_name;
      const existing = map.get(key);
      const hours = v.travel_seconds / 3600;
      const amount = hours * (rateConfig?.travel_hourly_rate ?? 0);
      if (existing) {
        existing.travel_seconds += v.travel_seconds;
        existing.travel_hours += hours;
        existing.travel_amount += amount;
      } else {
        map.set(key, {
          officer_name: v.officer_name,
          travel_seconds: v.travel_seconds,
          travel_hours: hours,
          travel_amount: amount,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.travel_seconds - a.travel_seconds);
  }, [payload?.visits, rateConfig?.travel_hourly_rate]);

  const tableLines = useMemo(
    () => (payload?.lines ?? []).filter((line) => line.source !== 'timesheet'),
    [payload?.lines],
  );
  const rateDirty =
    rateConfig != null &&
    (travelRateInput.trim() !== (rateConfig.travel_override == null ? '' : String(rateConfig.travel_override)) ||
      firstHourRateInput.trim() !== (rateConfig.first_hour_override == null ? '' : String(rateConfig.first_hour_override)) ||
      additionalHourRateInput.trim() !==
        (rateConfig.additional_hour_override == null ? '' : String(rateConfig.additional_hour_override)));

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
              <SummaryCard label="Approved expenses" value={money(summary?.expenses_total)} />
            </div>

            {rateConfig ? (
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wide text-slate-800">Timesheet labour rates</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {rateConfig.price_book_name ? (
                        <>
                          Using price book <strong className="text-slate-700">{rateConfig.price_book_name}</strong>
                          {rateConfig.price_book_source === 'customer' ? ' (customer-specific)' : rateConfig.price_book_source === 'company_default' ? ' (company default)' : ''}.
                          {' '}Leave fields blank to keep these defaults. Enter a value to override for this job only.
                        </>
                      ) : (
                        <>
                          No price book assigned — set company defaults in Settings → Price books.
                          Enter rates below for this job.
                        </>
                      )}
                    </p>
                  </div>
                  {rateConfig.updated_at ? (
                    <p className="text-xs font-semibold text-slate-400">
                      Updated {dayjs(rateConfig.updated_at).format('DD/MM/YYYY h:mm a')}
                      {rateConfig.updated_by_name ? ` by ${rateConfig.updated_by_name}` : ''}
                    </p>
                  ) : null}
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto]">
                  <RateInput
                    label="Travel £/hr"
                    value={travelRateInput}
                    effective={rateConfig.travel_hourly_rate}
                    usingDefault={rateConfig.travel_override == null}
                    onChange={setTravelRateInput}
                    disabled={rateSaving}
                  />
                  <RateInput
                    label="First hour labour £/hr"
                    value={firstHourRateInput}
                    effective={rateConfig.first_hour_labour_rate}
                    usingDefault={rateConfig.first_hour_override == null}
                    onChange={setFirstHourRateInput}
                    disabled={rateSaving}
                  />
                  <RateInput
                    label="Additional hour labour £/hr"
                    value={additionalHourRateInput}
                    effective={rateConfig.additional_hour_labour_rate}
                    usingDefault={rateConfig.additional_hour_override == null}
                    onChange={setAdditionalHourRateInput}
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
                      disabled={
                        rateSaving ||
                        (rateConfig.travel_override == null &&
                          rateConfig.first_hour_override == null &&
                          rateConfig.additional_hour_override == null)
                      }
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

            {timesheetSummary ? (
              <div className="space-y-4">
                {timesheetSummary.on_site_hours > 0 ? (
                  <TimesheetCostSection
                    title="Labour"
                    total={timesheetSummary.labour_amount}
                    columns={[
                      { label: 'On-site time', value: timesheetSummary.on_site_duration_label },
                      { label: 'First hour rate', value: `${money(timesheetSummary.first_hour_labour_rate)}/hr` },
                      { label: 'Additional hour rate', value: `${money(timesheetSummary.additional_hour_labour_rate)}/hr` },
                    ]}
                  />
                ) : null}
                {timesheetSummary.travel_hours > 0 ? (
                  <TimesheetCostSection
                    title="Travel"
                    total={timesheetSummary.travel_amount}
                    columns={[
                      { label: 'Travel time', value: timesheetSummary.travel_duration_label },
                      { label: 'Travel rate', value: `${money(timesheetSummary.travel_hourly_rate)}/hr` },
                    ]}
                  >
                    {travelByOfficer.length > 0 && (
                      <div className="border-t border-slate-100 bg-slate-50/40 px-4 py-3">
                        <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-slate-500">Per engineer</p>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-[13px]">
                            <thead className="text-[11px] font-black uppercase text-slate-500">
                              <tr>
                                <th className="pb-2 pr-4">Engineer</th>
                                <th className="pb-2 pr-4">Travel time</th>
                                <th className="pb-2 pr-4 text-right">Hours</th>
                                <th className="pb-2 text-right">Cost</th>
                              </tr>
                            </thead>
                            <tbody className="font-semibold text-slate-700">
                              {travelByOfficer.map((row) => (
                                <tr key={row.officer_name}>
                                  <td className="py-1.5 pr-4">{row.officer_name}</td>
                                  <td className="py-1.5 pr-4">{formatSeconds(row.travel_seconds)}</td>
                                  <td className="py-1.5 pr-4 text-right">{row.travel_hours.toFixed(2)}</td>
                                  <td className="py-1.5 text-right font-black text-slate-900">{money(row.travel_amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </TimesheetCostSection>
                ) : null}
              </div>
            ) : null}

            {loadingTimeline && (
              <div className="flex items-center gap-2 text-sm text-[#14B8A6] font-semibold">
                <Loader2 className="size-4 animate-spin" />
                Loading timesheet editor...
              </div>
            )}

            {payload?.visits && payload.visits.length > 0 && (
              <div className="rounded-lg border border-slate-200 bg-white">
                <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3">
                  <h3 className="text-sm font-black uppercase tracking-wide text-slate-800">Timesheet visits</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[13px] divide-y divide-slate-100">
                    <thead className="bg-[#FBFCFD] text-[11px] font-black uppercase text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Engineer</th>
                        <th className="px-4 py-3">On-site time</th>
                        <th className="px-4 py-3">Travel time</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                      {payload.visits.map((v) => (
                        <tr key={v.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3.5">
                            {dayjs(v.start_time).format('DD MMM YYYY, HH:mm')}
                          </td>
                          <td className="px-4 py-3.5">{v.officer_name}</td>
                          <td className="px-4 py-3.5">{formatSeconds(v.on_site_seconds)}</td>
                          <td className="px-4 py-3.5">{formatSeconds(v.travel_seconds)}</td>
                          <td className="px-4 py-3.5 text-right">
                            <button
                              type="button"
                              disabled={loadingTimeline}
                              onClick={() => void handleEditVisitTimesheet(v.id)}
                              className="inline-flex items-center gap-1 text-xs font-bold text-[#14B8A6] hover:underline disabled:opacity-50"
                            >
                              <Pencil className="size-3" />
                              Edit Timesheet
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

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
                    Proof (optional)
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
                {proofFiles.length > 0 && (
                  <p className="mt-2 text-xs font-semibold text-slate-500">
                    {proofFiles.map((f) => `${f.name} (${bytesLabel(f.size)})`).join(', ')}
                  </p>
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

            {editingLineId ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wide text-slate-800">Edit cost entry</h3>
                    <p className="mt-1 text-xs text-slate-500">Manual site costs can be corrected here. Proof files remain attached.</p>
                  </div>
                  <button type="button" onClick={cancelEditLine} className="text-xs font-bold text-slate-500 hover:text-slate-700">
                    Cancel
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_160px]">
                  <input
                    value={editCostType}
                    onChange={(event) => setEditCostType(event.target.value)}
                    placeholder="Cost type"
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
                  />
                  <input
                    value={editAmount}
                    onChange={(event) => setEditAmount(event.target.value)}
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Amount"
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
                  />
                </div>
                <input
                  value={editDescription}
                  onChange={(event) => setEditDescription(event.target.value)}
                  placeholder="Description"
                  className="mt-3 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
                />
                <textarea
                  value={editNotes}
                  onChange={(event) => setEditNotes(event.target.value)}
                  rows={3}
                  placeholder="Notes"
                  className="mt-3 w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
                />
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" onClick={cancelEditLine} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600">
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!canSaveEdit}
                    onClick={saveEditLine}
                    className="rounded-md bg-[#14B8A6] px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {editSaving ? 'Saving...' : 'Save changes'}
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
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(tableLines ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center font-semibold text-slate-400">No other costs found for this job.</td>
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
                          <td className="px-4 py-4 text-right">
                            {line.editable ? (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => startEditLine(line)}
                                  className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                  title="Edit cost"
                                >
                                  <Pencil className="size-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void deleteLine(line)}
                                  disabled={editSaving}
                                  className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                                  title="Delete cost"
                                >
                                  <Trash2 className="size-4" />
                                </button>
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
      {editingDiaryEventId !== null && token && (
        <EditTimelineModal
          open={editTimelineOpen}
          token={token}
          diaryEventId={editingDiaryEventId}
          initialStatusLogs={visitStatusLogs}
          initialTimesheetEntries={visitTimesheetEntries}
          onClose={() => setEditTimelineOpen(false)}
          onSaved={() => {
            void loadCosts();
          }}
        />
      )}
    </div>
  );
}

function TimesheetCostSection({
  title,
  total,
  columns,
  children,
}: {
  title: string;
  total: number;
  columns: { label: string; value: string }[];
  children?: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-black uppercase tracking-wide text-slate-800">{title}</h3>
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-black text-emerald-700">{money(total)}</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead className="border-b border-slate-100 bg-[#FBFCFD] text-[11px] font-black uppercase text-slate-500">
            <tr>
              {columns.map((col) => (
                <th key={col.label} className="px-4 py-3">{col.label}</th>
              ))}
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              {columns.map((col) => (
                <td key={col.label} className="px-4 py-4 font-semibold text-slate-700">{col.value}</td>
              ))}
              <td className="px-4 py-4 text-right font-black text-slate-900">{money(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {children}
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
