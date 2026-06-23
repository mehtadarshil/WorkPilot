'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, Plus, Trash2 } from 'lucide-react';
import { getJson, patchJson, postJson } from '../../apiClient';
import ImportCustomerSelect, { type ImportCustomerOption } from '../ImportCustomerSelect';
import WorkAddressSelect from '../WorkAddressSelect';
import {
  EMPTY_PPM_WIZARD,
  PPM_WIZARD_STEPS,
  type PpmContract,
  type PpmContractTask,
  type PpmWizardState,
} from '../../../lib/ppmContractTypes';

type Props = {
  contractId?: number;
  initialCustomerId?: number | null;
  initialStep?: number;
};

function wizardFromContract(c: PpmContract, tasks: PpmContractTask[]): PpmWizardState {
  return {
    customer_id: c.customer_id,
    work_address_id: c.work_address_id ?? null,
    title: c.title,
    reference: c.reference || '',
    status: c.status,
    start_date: c.start_date || '',
    end_date: c.end_date || '',
    renewal_type: c.renewal_type,
    renewal_notice_days: c.renewal_notice_days ?? 60,
    price_book_id: c.price_book_id ?? null,
    job_description_id: c.job_description_id ?? null,
    default_officer_id: c.default_officer_id ?? null,
    sla_response_minutes: c.sla_response_minutes != null ? String(c.sla_response_minutes) : '',
    sla_completion_minutes: c.sla_completion_minutes != null ? String(c.sla_completion_minutes) : '',
    auto_create_jobs_days_before: c.auto_create_jobs_days_before ?? 14,
    asset_ids: Array.isArray(c.asset_ids) ? c.asset_ids : [],
    tasks: tasks.length > 0 ? tasks : EMPTY_PPM_WIZARD.tasks,
    communications_json: c.communications_json || EMPTY_PPM_WIZARD.communications_json,
    invoicing_json: c.invoicing_json || EMPTY_PPM_WIZARD.invoicing_json,
    rate_overrides_json: c.rate_overrides_json || {},
  };
}

function payloadFromWizard(w: PpmWizardState, step: number) {
  const base = {
    customer_id: w.customer_id,
    work_address_id: w.work_address_id,
    title: w.title.trim(),
    reference: w.reference.trim() || null,
    status: step >= 4 ? 'active' : w.status,
    start_date: w.start_date || null,
    end_date: w.renewal_type === 'open_ended' ? null : w.end_date || null,
    renewal_type: w.renewal_type,
    renewal_notice_days: w.renewal_notice_days,
    price_book_id: w.price_book_id,
    job_description_id: w.job_description_id,
    default_officer_id: w.default_officer_id,
    sla_response_minutes: w.sla_response_minutes ? parseInt(w.sla_response_minutes, 10) : null,
    sla_completion_minutes: w.sla_completion_minutes ? parseInt(w.sla_completion_minutes, 10) : null,
    auto_create_jobs_days_before: w.auto_create_jobs_days_before,
    asset_ids: w.asset_ids,
    tasks: w.tasks.filter((t) => t.name.trim() && t.next_due_date),
    communications_json: w.communications_json,
    invoicing_json: w.invoicing_json,
    rate_overrides_json: w.rate_overrides_json,
  };
  return base;
}

export default function PpmContractWizard({ contractId, initialCustomerId, initialStep = 0 }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(initialStep);
  const [savedContractId, setSavedContractId] = useState<number | null>(contractId ?? null);
  const activeContractId = contractId ?? savedContractId;
  const [wizard, setWizard] = useState<PpmWizardState>({
    ...EMPTY_PPM_WIZARD,
    customer_id: initialCustomerId ?? null,
  });
  const [loading, setLoading] = useState(!!activeContractId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assets, setAssets] = useState<{ id: number; name: string }[]>([]);
  const [priceBooks, setPriceBooks] = useState<{ id: number; name: string }[]>([]);
  const [jobDescriptions, setJobDescriptions] = useState<{ id: number; name: string }[]>([]);
  const [officers, setOfficers] = useState<{ id: number; full_name: string }[]>([]);
  const [customers, setCustomers] = useState<ImportCustomerOption[]>([]);
  const [workAddressOptions, setWorkAddressOptions] = useState<{ id: number; label: string }[]>([]);

  useEffect(() => {
    setStep(initialStep);
  }, [initialStep]);

  useEffect(() => {
    if (!activeContractId) return;
    setLoading(true);
    getJson<{ contract: PpmContract; tasks: PpmContractTask[] }>(`/ppm-contracts/${activeContractId}`)
      .then((d) => setWizard(wizardFromContract(d.contract, d.tasks)))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load contract'))
      .finally(() => setLoading(false));
  }, [activeContractId]);

  useEffect(() => {
    getJson<{ customers: ImportCustomerOption[] }>('/customers?limit=500')
      .then((d) => setCustomers(d.customers || []))
      .catch(() => {});
    getJson<{ price_books: { id: number; name: string }[] }>('/settings/price-books')
      .then((d) => setPriceBooks(d.price_books || []))
      .catch(() => {});
    getJson<{ job_descriptions: { id: number; name: string }[] }>('/settings/job-descriptions')
      .then((d) => setJobDescriptions(d.job_descriptions || []))
      .catch(() => {});
    getJson<{ officers: { id: number; full_name: string }[] }>('/officers/list')
      .then((d) => setOfficers(d.officers || []))
      .catch(() => {});
  }, []);

  const loadAssets = useCallback(async (customerId: number, workAddressId: number | null) => {
    try {
      const q = workAddressId ? `?work_address_id=${workAddressId}` : '';
      const d = await getJson<{ assets: Record<string, unknown>[] }>(`/customers/${customerId}/assets${q}`);
      setAssets(
        (d.assets || []).map((a) => ({
          id: Number(a.id),
          name: String(a.description || a.asset_group || `Asset #${a.id}`),
        })),
      );
    } catch {
      setAssets([]);
    }
  }, []);

  useEffect(() => {
    if (!wizard.customer_id) {
      setWorkAddressOptions([]);
      return;
    }
    getJson<{
      work_addresses: { id: number; name: string; address_line_1?: string | null; town?: string | null; postcode?: string | null }[];
    }>(`/customers/${wizard.customer_id}/work-addresses?status=active`)
      .then((res) => {
        const rows = res.work_addresses ?? [];
        setWorkAddressOptions(
          rows.map((w) => {
            const addr = [w.address_line_1, w.town, w.postcode].filter((x): x is string => Boolean(x && String(x).trim())).join(', ');
            const label = [w.name?.trim() || `Site #${w.id}`, addr].filter(Boolean).join(' — ');
            return { id: w.id, label: label || `Work #${w.id}` };
          }),
        );
      })
      .catch(() => setWorkAddressOptions([]));
  }, [wizard.customer_id]);

  useEffect(() => {
    if (wizard.customer_id) loadAssets(wizard.customer_id, wizard.work_address_id);
  }, [wizard.customer_id, wizard.work_address_id, loadAssets]);

  const update = (patch: Partial<PpmWizardState>) => setWizard((w) => ({ ...w, ...patch }));

  const updateTask = (index: number, patch: Partial<PpmContractTask>) => {
    setWizard((w) => {
      const tasks = [...w.tasks];
      tasks[index] = { ...tasks[index], ...patch };
      return { ...w, tasks };
    });
  };

  const validateStep = (): string | null => {
    if (step === 0) {
      if (!wizard.customer_id) return 'Select a customer';
      if (!wizard.title.trim()) return 'Contract title is required';
    }
    if (step === 3) {
      const valid = wizard.tasks.filter((t) => t.name.trim() && t.next_due_date);
      if (valid.length === 0) return 'Add at least one PPM task with a due date';
    }
    return null;
  };

  const save = async (finalStep: boolean) => {
    const v = validateStep();
    if (v) {
      setError(v);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = payloadFromWizard(wizard, finalStep ? 7 : step + 1);
      if (activeContractId) {
        await patchJson(`/ppm-contracts/${activeContractId}`, body);
        if (finalStep) {
          router.push(`/dashboard/ppm-contracts/${activeContractId}`);
        } else {
          const nextStep = Math.min(step + 1, PPM_WIZARD_STEPS.length - 1);
          setStep(nextStep);
          if (typeof window !== 'undefined') {
            window.history.replaceState(null, '', `/dashboard/ppm-contracts/${activeContractId}/edit?step=${nextStep}`);
          }
        }
      } else {
        const res = await postJson<{ contract: PpmContract }>('/ppm-contracts', body);
        const id = res.contract.id;
        setSavedContractId(id);
        if (finalStep || step >= 3) {
          router.push(`/dashboard/ppm-contracts/${id}`);
        } else {
          const nextStep = Math.min(step + 1, PPM_WIZARD_STEPS.length - 1);
          setStep(nextStep);
          router.replace(`/dashboard/ppm-contracts/${id}/edit?step=${nextStep}`);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-slate-500">Loading contract…</div>;
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/dashboard/ppm-contracts" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
          <ArrowLeft className="size-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            {activeContractId ? 'Edit PPM contract' : 'New PPM contract'}
          </h1>
          <p className="text-sm text-slate-500">Step {step + 1} of {PPM_WIZARD_STEPS.length}: {PPM_WIZARD_STEPS[step]}</p>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {PPM_WIZARD_STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => i <= step && setStep(i)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              i === step ? 'bg-[#14B8A6] text-white' : i < step ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
            }`}
          >
            {i < step ? <Check className="inline size-3 mr-1" /> : null}
            {label}
          </button>
        ))}
      </div>

      {error && <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Customer</label>
              <ImportCustomerSelect
                customers={customers}
                value={wizard.customer_id}
                onChange={(id) => update({ customer_id: id, work_address_id: null, asset_ids: [] })}
              />
            </div>
            {wizard.customer_id && (
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Work site</label>
                <WorkAddressSelect
                  options={workAddressOptions}
                  value={wizard.work_address_id}
                  onChange={(id) => update({ work_address_id: id, asset_ids: [] })}
                  emptyButtonLabel="Select work site"
                />
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Contract title</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={wizard.title}
                onChange={(e) => update({ title: e.target.value })}
                placeholder="e.g. Fire alarm maintenance"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Reference</label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={wizard.reference}
                  onChange={(e) => update({ reference: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Start date</label>
                <input
                  type="date"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={wizard.start_date}
                  onChange={(e) => update({ start_date: e.target.value })}
                />
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Renewal type</label>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={wizard.renewal_type}
                onChange={(e) => update({ renewal_type: e.target.value as PpmWizardState['renewal_type'] })}
              >
                <option value="open_ended">Open-ended</option>
                <option value="fixed">Fixed end date</option>
              </select>
            </div>
            {wizard.renewal_type === 'fixed' && (
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">End date</label>
                <input
                  type="date"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={wizard.end_date}
                  onChange={(e) => update({ end_date: e.target.value })}
                />
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Renewal notice (days before expiry)</label>
              <input
                type="number"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={wizard.renewal_notice_days}
                onChange={(e) => update({ renewal_notice_days: parseInt(e.target.value, 10) || 60 })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Auto-create jobs (days before due)</label>
              <input
                type="number"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={wizard.auto_create_jobs_days_before}
                onChange={(e) => update({ auto_create_jobs_days_before: parseInt(e.target.value, 10) || 14 })}
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Select assets covered by this contract at the chosen site.</p>
            {assets.length === 0 ? (
              <p className="text-sm text-slate-500">No assets found for this customer/site.</p>
            ) : (
              assets.map((a) => (
                <label key={a.id} className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={wizard.asset_ids.includes(a.id)}
                    onChange={(e) => {
                      const ids = e.target.checked
                        ? [...wizard.asset_ids, a.id]
                        : wizard.asset_ids.filter((x) => x !== a.id);
                      update({ asset_ids: ids });
                    }}
                  />
                  <span className="text-sm">{a.name}</span>
                </label>
              ))
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            {wizard.tasks.map((task, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-slate-700">Task {i + 1}</span>
                  {wizard.tasks.length > 1 && (
                    <button type="button" onClick={() => update({ tasks: wizard.tasks.filter((_, j) => j !== i) })} className="text-rose-600">
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Task name (e.g. Fire alarm inspection)"
                  value={task.name}
                  onChange={(e) => updateTask(i, { name: e.target.value })}
                />
                <div className="grid grid-cols-3 gap-3">
                  <input
                    type="number"
                    min={1}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={task.interval_n}
                    onChange={(e) => updateTask(i, { interval_n: parseInt(e.target.value, 10) || 1 })}
                  />
                  <select
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={task.interval_unit}
                    onChange={(e) => updateTask(i, { interval_unit: e.target.value as PpmContractTask['interval_unit'] })}
                  >
                    <option value="days">Days</option>
                    <option value="weeks">Weeks</option>
                    <option value="months">Months</option>
                    <option value="years">Years</option>
                  </select>
                  <input
                    type="date"
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={task.next_due_date}
                    onChange={(e) => updateTask(i, { next_due_date: e.target.value })}
                  />
                </div>
                {assets.length > 0 && (
                  <select
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={task.asset_id ?? ''}
                    onChange={(e) => updateTask(i, { asset_id: e.target.value ? parseInt(e.target.value, 10) : null })}
                  >
                    <option value="">No linked asset</option>
                    {assets.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => update({ tasks: [...wizard.tasks, { name: '', interval_n: 6, interval_unit: 'months', next_due_date: '' }] })}
              className="flex items-center gap-2 text-sm font-medium text-[#14B8A6]"
            >
              <Plus className="size-4" /> Add task
            </button>
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Default job type</label>
                <select
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={wizard.job_description_id ?? ''}
                  onChange={(e) => update({ job_description_id: e.target.value ? parseInt(e.target.value, 10) : null })}
                >
                  <option value="">—</option>
                  {jobDescriptions.map((jd) => (
                    <option key={jd.id} value={jd.id}>{jd.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Default officer</label>
                <select
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={wizard.default_officer_id ?? ''}
                  onChange={(e) => update({ default_officer_id: e.target.value ? parseInt(e.target.value, 10) : null })}
                >
                  <option value="">—</option>
                  {officers.map((o) => (
                    <option key={o.id} value={o.id}>{o.full_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">SLA response (minutes)</label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={wizard.sla_response_minutes}
                  onChange={(e) => update({ sla_response_minutes: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">SLA completion (minutes after due)</label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={wizard.sla_completion_minutes}
                  onChange={(e) => update({ sla_completion_minutes: e.target.value })}
                />
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Price book</label>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={wizard.price_book_id ?? ''}
                onChange={(e) => update({ price_book_id: e.target.value ? parseInt(e.target.value, 10) : null })}
              >
                <option value="">Default rates</option>
                {priceBooks.map((pb) => (
                  <option key={pb.id} value={pb.id}>{pb.name}</option>
                ))}
              </select>
            </div>
            <p className="text-sm text-slate-500">Optional per-contract rate overrides (leave blank to use price book).</p>
            <div className="grid grid-cols-3 gap-3">
              {(['travel_hourly_rate', 'first_hour_labour_rate', 'additional_hour_labour_rate'] as const).map((key) => (
                <div key={key}>
                  <label className="mb-1 block text-xs font-medium text-slate-600">{key.replace(/_/g, ' ')}</label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={wizard.rate_overrides_json[key] ?? ''}
                    onChange={(e) =>
                      update({
                        rate_overrides_json: {
                          ...wizard.rate_overrides_json,
                          [key]: e.target.value ? parseFloat(e.target.value) : null,
                        },
                      })
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Default charge type</label>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={wizard.invoicing_json.charge_type || 'chargeable'}
                onChange={(e) =>
                  update({
                    invoicing_json: {
                      ...wizard.invoicing_json,
                      charge_type: e.target.value as 'chargeable' | 'free' | 'callback',
                    },
                  })
                }
              >
                <option value="chargeable">Chargeable</option>
                <option value="free">Free</option>
                <option value="callback">Callback</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Invoice description template</label>
              <textarea
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                rows={3}
                value={wizard.invoicing_json.invoice_description_template || ''}
                onChange={(e) =>
                  update({
                    invoicing_json: { ...wizard.invoicing_json, invoice_description_template: e.target.value },
                  })
                }
                placeholder="PPM visit — {{task_name}}"
              />
              <p className="mt-1 text-xs text-slate-500">
                Variables: {'{{task_name}}'}, {'{{contract_title}}'}, {'{{contract_reference}}'}, {'{{job_number}}'}, {'{{job_title}}'}, {'{{due_date}}'}, {'{{customer_name}}'}
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!wizard.invoicing_json.auto_invoice_on_complete}
                onChange={(e) =>
                  update({
                    invoicing_json: { ...wizard.invoicing_json, auto_invoice_on_complete: e.target.checked },
                  })
                }
              />
              Auto-create invoice when job is completed
            </label>
          </div>
        )}

        {step === 6 && (
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={wizard.communications_json.email_enabled !== false}
                onChange={(e) =>
                  update({
                    communications_json: { ...wizard.communications_json, email_enabled: e.target.checked },
                  })
                }
              />
              Send task due reminder emails
            </label>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Reminder days before due (comma-separated)</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={(wizard.communications_json.reminder_days_before || [60, 30, 7]).join(', ')}
                onChange={(e) => {
                  const days = e.target.value
                    .split(',')
                    .map((s) => parseInt(s.trim(), 10))
                    .filter((n) => Number.isFinite(n) && n > 0);
                  update({ communications_json: { ...wizard.communications_json, reminder_days_before: days } });
                }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-between">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => setStep((s) => s - 1)}
          className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
        >
          <ArrowLeft className="size-4" /> Back
        </button>
        <div className="flex gap-2">
          {step < PPM_WIZARD_STEPS.length - 1 ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => save(false)}
              className="flex items-center gap-2 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white"
            >
              {saving ? 'Saving…' : 'Save & continue'}
              <ArrowRight className="size-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={() => save(true)}
              className="flex items-center gap-2 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white"
            >
              {saving ? 'Saving…' : 'Finish'}
              <Check className="size-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
