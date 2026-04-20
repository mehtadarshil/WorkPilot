'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getJson, postJson } from '../../../apiClient';
import { ArrowLeft, Save, Plus, Trash2 } from 'lucide-react';
import ImportCustomerSelect, { type ImportCustomerOption } from '../../ImportCustomerSelect';
import SearchableSelect, { type SearchableSelectOption } from '../../SearchableSelect';

interface JobDescription {
  id: number;
  name: string;
  default_skills: string | null;
  default_job_notes: string | null;
  default_priority: string;
  default_business_unit: string | null;
  is_service_job: boolean;
  service_reminder_frequency?: number | null;
  service_reminder_unit?: string | null;
  pricing_items: DescPricingItem[];
}

interface DescPricingItem {
  id: number;
  item_name: string;
  time_included: number;
  unit_price: number;
  vat_rate: number;
  quantity: number;
  /** Present on saved job rows from API; omitted on job-description templates */
  total?: number | string | null;
}

interface PricingItemRow {
  key: string;
  item_name: string;
  time_included: number;
  unit_price: number;
  vat_rate: number;
  quantity: number;
  total: number;
}

interface CustomerInfo {
  id: number;
  full_name: string;
  company: string | null;
  address_line_1: string | null;
  town: string | null;
  county: string | null;
  postcode: string | null;
  contact_first_name: string | null;
  contact_surname: string | null;
}

interface ServiceChecklistItem {
  id: number;
  name: string;
  sort_order: number;
  is_active: boolean;
}

let keyCounter = 0;
function nextKey() { return `pi_${++keyCounter}_${Date.now()}`; }

const PIPELINE_OPTIONS: SearchableSelectOption[] = [
  { value: 'Service/Reactive Workflow', label: 'Service / Reactive Workflow' },
  { value: 'Installation Workflow', label: 'Installation Workflow' },
  { value: 'Emergency Workflow', label: 'Emergency Workflow' },
  { value: 'Maintenance Workflow', label: 'Maintenance Workflow' },
];

const FALLBACK_USER_GROUPS = ['Field Engineers', 'Senior Technicians', 'Apprentices', 'Subcontractors'];
const FALLBACK_BUSINESS_UNITS = ['Service & Maintenance', 'Installation', 'Emergency', 'Consultation'];

export default function JobsNewJobPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [customerId, setCustomerId] = useState(() => {
    const q = searchParams.get('customer_id');
    return q && /^\d+$/.test(q) ? q : '';
  });
  const [customersList, setCustomersList] = useState<ImportCustomerOption[]>([]);

  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [jobDescriptions, setJobDescriptions] = useState<JobDescription[]>([]);
  const [loading, setLoading] = useState(() => !!customerId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [contactName, setContactName] = useState('');
  const [descriptionId, setDescriptionId] = useState<number | ''>('');
  const [skills, setSkills] = useState('');
  const [jobNotes, setJobNotes] = useState('');
  const [isServiceJob, setIsServiceJob] = useState(false);
  const [reminderFrequency, setReminderFrequency] = useState<number | ''>('');
  const [reminderUnit, setReminderUnit] = useState<string>('years');

  // Right side
  const [expectedDate, setExpectedDate] = useState('');
  const [expectedTime, setExpectedTime] = useState('');
  const [priority, setPriority] = useState('medium');
  const [userGroup, setUserGroup] = useState('');
  const [businessUnit, setBusinessUnit] = useState('');
  const [bookIntoDiary, setBookIntoDiary] = useState(true);

  // Bottom section
  const [quotedAmount, setQuotedAmount] = useState('');
  const [customerReference, setCustomerReference] = useState('');
  const [jobPipeline, setJobPipeline] = useState('Service/Reactive Workflow');

  // Pricing items
  const [pricingItems, setPricingItems] = useState<PricingItemRow[]>([]);
  const [serviceChecklistItems, setServiceChecklistItems] = useState<ServiceChecklistItem[]>([]);
  const [completedServiceItems, setCompletedServiceItems] = useState<string[]>([]);

  // Config lists
  const [businessUnitsList, setBusinessUnitsList] = useState<{id: number, name: string}[]>([]);
  const [userGroupsList, setUserGroupsList] = useState<{id: number, name: string}[]>([]);

  useEffect(() => {
    if (!token) return;
    getJson<{ customers: ImportCustomerOption[] }>('/customers?limit=5000&page=1', token)
      .then((d) => setCustomersList(d.customers ?? []))
      .catch(() => setCustomersList([]));
  }, [token]);

  const userGroupOptions = useMemo((): SearchableSelectOption[] => {
    const seen = new Set<string>();
    const out: SearchableSelectOption[] = [];
    for (const u of userGroupsList) {
      if (u.name && !seen.has(u.name)) {
        seen.add(u.name);
        out.push({ value: u.name, label: u.name });
      }
    }
    if (out.length === 0) {
      FALLBACK_USER_GROUPS.forEach((n) => out.push({ value: n, label: n }));
    }
    return out;
  }, [userGroupsList]);

  const businessUnitOptions = useMemo((): SearchableSelectOption[] => {
    const seen = new Set<string>();
    const out: SearchableSelectOption[] = [];
    for (const u of businessUnitsList) {
      if (u.name && !seen.has(u.name)) {
        seen.add(u.name);
        out.push({ value: u.name, label: u.name });
      }
    }
    if (out.length === 0) {
      FALLBACK_BUSINESS_UNITS.forEach((n) => out.push({ value: n, label: n }));
    }
    return out;
  }, [businessUnitsList]);

  const jobDescriptionOptions = useMemo(
    () => jobDescriptions.map((d) => ({ value: String(d.id), label: d.name })),
    [jobDescriptions],
  );

  const fetchData = useCallback(async () => {
    if (!token) return;
    if (!customerId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [custData, descsData, buData, ugData, serviceData] = await Promise.all([
        getJson<CustomerInfo>(`/customers/${customerId}`, token),
        getJson<JobDescription[]>('/settings/job-descriptions', token),
        getJson<{ units: {id: number, name: string}[] }>('/settings/business-units', token).catch(() => ({ units: [] })),
        getJson<{ groups: {id: number, name: string}[] }>('/settings/user-groups', token).catch(() => ({ groups: [] })),
        getJson<{ items: ServiceChecklistItem[] }>('/settings/service-checklist', token).catch(() => ({ items: [] })),
      ]);
      setCustomer(custData);
      setJobDescriptions(descsData || []);
      setBusinessUnitsList(buData.units || []);
      setUserGroupsList(ugData.groups || []);
      setServiceChecklistItems(serviceData.items || []);

      if (custData) {
        const cn = [custData.contact_first_name, custData.contact_surname].filter(Boolean).join(' ');
        setContactName(cn || custData.full_name || '');
      }

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [token, customerId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // When description changes, auto-fill skills, job notes, pricing items
  const handleDescriptionChange = async (newId: number | '') => {
    setDescriptionId(newId);
    if (!newId || !token) {
      // Clear auto-filled
      setSkills('');
      setJobNotes('');
      setIsServiceJob(false);
      setReminderFrequency('');
      setReminderUnit('years');
      setPriority('medium');
      setBusinessUnit('');
      setPricingItems([]);
        setCompletedServiceItems([]);
      return;
    }

    try {
      const desc = await getJson<JobDescription>(`/settings/job-descriptions/${newId}`, token);
      setSkills(desc.default_skills || '');
      setJobNotes(desc.default_job_notes || '');
      setIsServiceJob(desc.is_service_job);
      if (desc.is_service_job) {
        setReminderFrequency(desc.service_reminder_frequency || '');
        setReminderUnit(desc.service_reminder_unit || 'years');
      } else {
        setCompletedServiceItems([]);
        setReminderFrequency('');
        setReminderUnit('years');
      }
      setPriority(desc.default_priority || 'medium');
      setBusinessUnit(desc.default_business_unit || '');

      // Auto-populate pricing items from template
      if (desc.pricing_items && desc.pricing_items.length > 0) {
        setPricingItems(desc.pricing_items.map((pi: DescPricingItem) => ({
          key: nextKey(),
          item_name: pi.item_name,
          time_included: pi.time_included,
          unit_price: Number(pi.unit_price),
          vat_rate: Number(pi.vat_rate),
          quantity: pi.quantity,
          total: Number(pi.unit_price) * pi.quantity,
        })));
      } else {
        setPricingItems([]);
      }
    } catch {
      // Silently fail on fetch details
    }
  };

  const activeServiceChecklistItems = serviceChecklistItems.filter((item) => item.is_active);

  const addEmptyPricingItem = () => {
    setPricingItems(prev => [...prev, {
      key: nextKey(),
      item_name: '',
      time_included: 0,
      unit_price: 0,
      vat_rate: 20,
      quantity: 1,
      total: 0,
    }]);
  };

  const updatePricingItem = (key: string, field: keyof PricingItemRow, value: string | number) => {
    setPricingItems(prev => prev.map(pi => {
      if (pi.key !== key) return pi;
      const updated = { ...pi, [field]: value };
      updated.total = Number(updated.unit_price) * Number(updated.quantity);
      return updated;
    }));
  };

  const removePricingItem = (key: string) => {
    setPricingItems(prev => prev.filter(pi => pi.key !== key));
  };

  const pricingTotal = pricingItems.reduce((sum, pi) => sum + pi.total, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (descriptionId === '' || descriptionId === null || descriptionId === undefined) {
      setError('Please choose a job description.');
      return;
    }
    setSaving(true);
    setError(null);

    const selectedDesc = jobDescriptions.find((d) => d.id === descriptionId);
    const titleStr = selectedDesc?.name || 'New Job';

    // Build expected completion datetime
    let expectedCompletion: string | null = null;
    if (expectedDate) {
      expectedCompletion = expectedTime ? `${expectedDate}T${expectedTime}:00` : `${expectedDate}T23:59:00`;
    }

    try {
      const payload = {
        title: titleStr,
        job_description_id: descriptionId || null,
        contact_name: contactName,
        expected_completion: expectedCompletion,
        priority,
        user_group: userGroup || null,
        business_unit: businessUnit || null,
        skills,
        job_notes: jobNotes,
        is_service_job: isServiceJob,
        service_reminder_frequency: isServiceJob && reminderFrequency ? reminderFrequency : null,
        service_reminder_unit: isServiceJob ? reminderUnit : null,
        completed_service_items: isServiceJob ? completedServiceItems : [],
        quoted_amount: quotedAmount ? Number(quotedAmount) : null,
        customer_reference: customerReference || null,
        job_pipeline: jobPipeline || null,
        book_into_diary: bookIntoDiary,
        pricing_items: pricingItems.filter(pi => pi.item_name.trim()).map(pi => ({
          item_name: pi.item_name,
          time_included: pi.time_included,
          unit_price: pi.unit_price,
          vat_rate: pi.vat_rate,
          quantity: pi.quantity,
        })),
      };

      const res = await postJson<{ job: { id: number } }>(`/customers/${customerId}/jobs`, payload, token);
      setSaving(false);
      const jid = res?.job?.id;
      if (bookIntoDiary && jid) {
        router.push(`/dashboard/diary?jobId=${jid}`);
      } else if (jid) {
        router.push(`/dashboard/jobs/${jid}`);
      } else {
        router.push('/dashboard/jobs');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create job');
      setSaving(false);
    }
  };

  const inputClass = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/20 bg-white";
  const labelClass = "text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1 block";

  const priorityOptions = useMemo(
    (): SearchableSelectOption[] => [
      { value: 'low', label: 'Low' },
      { value: 'medium', label: 'Medium' },
      { value: 'high', label: 'High' },
      { value: 'critical', label: 'Critical' },
    ],
    [],
  );

  const reminderUnitOptions = useMemo(
    (): SearchableSelectOption[] => [
      { value: 'days', label: 'Days' },
      { value: 'weeks', label: 'Weeks' },
      { value: 'months', label: 'Months' },
      { value: 'years', label: 'Years' },
    ],
    [],
  );

  if (!customerId) {
    return (
      <div className="flex h-full flex-col bg-slate-50">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 md:px-6 shadow-sm">
          <button type="button" onClick={() => router.push('/dashboard/jobs')} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100">
            <ArrowLeft className="size-5" />
          </button>
          <nav className="text-sm font-medium text-slate-600">
            <span className="cursor-pointer text-[#14B8A6] hover:underline" onClick={() => router.push('/dashboard/jobs')}>
              Job Management
            </span>
            <span className="mx-2 text-slate-300">/</span>
            <span className="font-semibold text-slate-900">Create job</span>
          </nav>
        </header>
        <div className="flex flex-1 items-start justify-center p-6 md:p-10">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="text-xl font-bold text-slate-900">Who is this job for?</h1>
            <p className="mt-1 text-sm text-slate-500">Choose a customer, then configure the job with descriptions, pricing, and options.</p>
            <label className="mt-6 block text-sm font-medium text-slate-700">Customer *</label>
            <div className="mt-1 flex gap-2">
              <div className="min-w-0 flex-1">
                <ImportCustomerSelect
                  customers={customersList}
                  value={null}
                  onChange={(id) => {
                    if (id != null) setCustomerId(String(id));
                  }}
                  className="w-full"
                />
              </div>
              <button
                type="button"
                onClick={() => window.open('/dashboard/customers/new', '_blank')}
                className="flex size-[38px] shrink-0 items-center justify-center rounded-lg border border-slate-200 text-[#14B8A6] transition-colors hover:bg-[#14B8A6] hover:text-white"
                title="Add new customer"
              >
                <Plus className="size-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) return <div className="flex h-full items-center justify-center text-slate-500 font-medium">Loading...</div>;

  const addressStr = customer ? [customer.address_line_1, customer.town, customer.county, customer.postcode].filter(Boolean).join(', ') : '';

  return (
    <div className="flex h-full flex-col bg-slate-50">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 md:px-6 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 transition-colors">
            <ArrowLeft className="size-5" />
          </button>
          <div className="flex items-center text-sm font-medium text-slate-600">
            <span className="cursor-pointer hover:underline hover:text-slate-900" onClick={() => router.push('/dashboard/jobs')}>
              Job Management
            </span>
            <span className="mx-2 text-slate-300">/</span>
            <span className="cursor-pointer hover:underline hover:text-slate-900" onClick={() => router.push(`/dashboard/customers/${customerId}`)}>
              {customer?.full_name || 'Customer'}
            </span>
            <span className="mx-2 text-slate-300">/</span>
            <span className="font-semibold text-slate-900">Create job</span>
          </div>
        </div>
      </header>

      {/* Customer banner */}
      <div className="bg-white border-b border-slate-200 px-6 py-3">
        <div className="flex items-center gap-6 text-sm">
          <span className="text-slate-600"><strong className="text-slate-800">Customer:</strong> {customer?.full_name}</span>
          {addressStr && <span className="text-slate-600"><strong className="text-slate-800">Address:</strong> {addressStr}</span>}
        </div>
      </div>

      {/* Main form */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <form onSubmit={handleSubmit} className="mx-auto max-w-5xl space-y-6">


          {error && (
            <div className="rounded-lg bg-rose-50 p-4 text-sm font-medium text-rose-800 border border-rose-200">{error}</div>
          )}

          {/* Card: Add new job */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-200 bg-slate-50/80 px-6 py-4">
              <h2 className="text-lg font-bold text-slate-800">Add new job</h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-5">

                {/* LEFT COLUMN */}
                <div className="space-y-5">
                  <div>
                    <label className={labelClass}>Customer contacts</label>
                    <input type="text" value={contactName} onChange={e => setContactName(e.target.value)} className={inputClass} />
                    <p className="text-xs text-slate-400 mt-1">The customer contact responsible for this job. You may send this person updates.</p>
                  </div>

                  <div>
                    <label className={labelClass}>Description *</label>
                    <SearchableSelect
                      options={jobDescriptionOptions}
                      value={descriptionId === '' ? '' : String(descriptionId)}
                      onChange={(v) => void handleDescriptionChange(v ? Number(v) : '')}
                      allowEmpty
                      emptyButtonLabel="-- Please choose --"
                      emptyMenuLabel="-- Please choose --"
                      searchPlaceholder="Search job descriptions…"
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>Skills</label>
                    <div className="flex flex-wrap gap-2 min-h-[38px] items-center rounded-lg border border-slate-200 px-3 py-2 bg-white">
                      {skills ? skills.split(',').map((s, i) => (
                        <span key={i} className="inline-flex items-center bg-slate-100 text-slate-800 px-2 py-0.5 rounded text-xs font-medium">
                          {s.trim()}
                          <button type="button" onClick={() => {
                            const arr = skills.split(',').map(x => x.trim()).filter((_, idx) => idx !== i);
                            setSkills(arr.join(', '));
                          }} className="ml-1.5 text-slate-400 hover:text-slate-600">&times;</button>
                        </span>
                      )) : <span className="text-sm text-slate-400">Auto-filled from description</span>}
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>Job notes</label>
                    <textarea
                      rows={4}
                      value={jobNotes}
                      onChange={e => setJobNotes(e.target.value)}
                      className={inputClass}
                      placeholder="Auto-filled from description template..."
                    />
                  </div>

                  <div>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isServiceJob}
                        onChange={e => {
                          setIsServiceJob(e.target.checked);
                          if (!e.target.checked) setCompletedServiceItems([]);
                        }}
                        className="size-4 mt-0.5 rounded text-[#14B8A6] focus:ring-[#14B8A6]"
                      />
                      <div>
                        <span className="text-sm font-medium text-slate-900">Service job</span>
                        <p className="text-xs text-slate-500">Enable automatic service reminder scheduling for this job type.</p>
                      </div>
                    </label>
                  </div>

                  {isServiceJob && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                      <label className="block text-sm font-medium text-slate-700">Service reminder frequency</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min="1"
                          value={reminderFrequency}
                          onChange={e => setReminderFrequency(e.target.value ? Number(e.target.value) : '')}
                          className={inputClass}
                          placeholder="e.g. 1"
                        />
                        <SearchableSelect
                          options={reminderUnitOptions}
                          value={reminderUnit}
                          onChange={setReminderUnit}
                          allowEmpty={false}
                          emptyButtonLabel="Unit"
                          emptyMenuLabel=""
                          searchPlaceholder="Search unit…"
                          className={inputClass}
                        />
                      </div>
                      <p className="text-xs text-slate-500">How often should a reminder be triggered for this service job?</p>
                    </div>
                  )}

                  {isServiceJob && (
                    <div>
                      <label className={labelClass}>Completed services in this job</label>
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
                        {activeServiceChecklistItems.length === 0 ? (
                          <p className="text-sm text-slate-500">No service checklist options configured yet. Add them in Settings → Job Descriptions.</p>
                        ) : (
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {activeServiceChecklistItems.map((item) => (
                              <label key={item.id} className="flex items-center gap-2 text-sm text-slate-700">
                                <input
                                  type="checkbox"
                                  checked={completedServiceItems.includes(item.name)}
                                  onChange={(e) => {
                                    setCompletedServiceItems((prev) =>
                                      e.target.checked ? [...prev, item.name] : prev.filter((name) => name !== item.name),
                                    );
                                  }}
                                  className="size-4 rounded text-[#14B8A6] focus:ring-[#14B8A6]"
                                />
                                {item.name}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* RIGHT COLUMN */}
                <div className="space-y-5">
                  <div>
                    <label className={labelClass}>Expected completion date</label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} className={inputClass} />
                      </div>
                      <div className="relative w-32">
                        <input type="time" value={expectedTime} onChange={e => setExpectedTime(e.target.value)} className={inputClass} />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>Priority</label>
                    <SearchableSelect
                      options={priorityOptions}
                      value={priority}
                      onChange={setPriority}
                      allowEmpty={false}
                      emptyButtonLabel="Priority"
                      emptyMenuLabel=""
                      searchPlaceholder="Search priority…"
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>User group</label>
                    <SearchableSelect
                      options={userGroupOptions}
                      value={userGroup}
                      onChange={setUserGroup}
                      allowEmpty
                      emptyButtonLabel="-- Please choose --"
                      emptyMenuLabel="-- Please choose --"
                      searchPlaceholder="Search user groups…"
                      className={inputClass}
                    />
                    <p className="mt-1 text-xs text-slate-400">Assign this job to a specific team or user group.</p>
                  </div>

                  <div>
                    <label className={labelClass}>Business unit</label>
                    <SearchableSelect
                      options={businessUnitOptions}
                      value={businessUnit}
                      onChange={setBusinessUnit}
                      allowEmpty
                      emptyButtonLabel="-- Please choose --"
                      emptyMenuLabel="-- Please choose --"
                      searchPlaceholder="Search business units…"
                      className={inputClass}
                    />
                    <p className="mt-1 text-[11px] font-medium text-[#14B8A6]">
                      When this job is invoiced the system will automatically select this category.
                    </p>
                  </div>

                  <div>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input type="checkbox" checked={bookIntoDiary} onChange={e => setBookIntoDiary(e.target.checked)} className="size-4 mt-0.5 rounded text-[#14B8A6] focus:ring-[#14B8A6]" />
                      <div>
                        <span className="text-sm font-medium text-slate-900">Book into diary after adding job</span>
                        <p className="text-xs text-slate-500">After completing this form you will be redirected to the calendar to schedule an event.</p>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Bottom row — single-line fields */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-6 pt-6 border-t border-slate-100">
                <div>
                  <label className={labelClass}>Quoted amount</label>
                  <input type="number" step="0.01" value={quotedAmount} onChange={e => setQuotedAmount(e.target.value)} className={inputClass} placeholder="0.00" />
                </div>
                <div>
                  <label className={labelClass}>Customer reference</label>
                  <input type="text" value={customerReference} onChange={e => setCustomerReference(e.target.value)} className={inputClass} placeholder="PO number, ref, etc." />
                </div>
                <div>
                  <label className={labelClass}>Job pipeline</label>
                  <SearchableSelect
                    options={PIPELINE_OPTIONS}
                    value={jobPipeline}
                    onChange={setJobPipeline}
                    allowEmpty={false}
                    emptyButtonLabel="Pipeline"
                    emptyMenuLabel=""
                    searchPlaceholder="Search pipeline…"
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Pricing Items Card */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-200 bg-slate-50/80 px-6 py-4 flex justify-between items-center">
              <h2 className="text-lg font-bold text-slate-800">Pricing items</h2>
              <button
                type="button"
                onClick={addEmptyPricingItem}
                className="flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-lg text-sm font-semibold shadow-sm transition"
              >
                <Plus className="size-4" /> Add row
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="bg-white border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 w-12 text-center">#</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Pricing item</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 w-24">Time incl.</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 w-28">Unit price</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 w-24">VAT %</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 w-20">Qty</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 w-28 text-right">Total</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 w-20 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pricingItems.length === 0 && (
                    <tr><td colSpan={8} className="px-5 py-8 text-center text-slate-400">No pricing items. Select a description to auto-fill or add manually.</td></tr>
                  )}
                  {pricingItems.map((pi, idx) => (
                    <tr key={pi.key} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3 text-center text-slate-400 font-medium">{idx + 1}</td>
                      <td className="px-5 py-3">
                        <input type="text" value={pi.item_name} onChange={e => updatePricingItem(pi.key, 'item_name', e.target.value)} className={inputClass} placeholder="Item name" />
                      </td>
                      <td className="px-5 py-3">
                        <input type="number" value={pi.time_included} onChange={e => updatePricingItem(pi.key, 'time_included', Number(e.target.value))} className={inputClass} />
                      </td>
                      <td className="px-5 py-3">
                        <input type="number" step="0.01" value={pi.unit_price} onChange={e => updatePricingItem(pi.key, 'unit_price', Number(e.target.value))} className={inputClass} />
                      </td>
                      <td className="px-5 py-3">
                        <input type="number" step="0.01" value={pi.vat_rate} onChange={e => updatePricingItem(pi.key, 'vat_rate', Number(e.target.value))} className={inputClass} />
                      </td>
                      <td className="px-5 py-3">
                        <input type="number" min="1" value={pi.quantity} onChange={e => updatePricingItem(pi.key, 'quantity', Number(e.target.value))} className={inputClass} />
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-slate-800">{pi.total.toFixed(2)}</td>
                      <td className="px-5 py-3 text-center">
                        <button type="button" onClick={() => removePricingItem(pi.key)} className="text-rose-500 hover:text-rose-700 transition-colors">
                          <Trash2 className="size-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {pricingItems.length > 0 && (
                    <tr className="bg-slate-50 font-semibold">
                      <td colSpan={6} className="px-5 py-3 text-right text-sm text-slate-600 uppercase tracking-wide">Grand Total</td>
                      <td className="px-5 py-3 text-right text-slate-900">{pricingTotal.toFixed(2)}</td>
                      <td></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Action bar */}
          <div className="flex items-center justify-end gap-4 pb-12">
            <button type="button" onClick={() => router.back()} className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-[#14B8A6] px-6 py-2.5 text-sm font-bold text-white hover:bg-[#119f8e] disabled:opacity-50 shadow-sm transition-colors"
            >
              <Save className="size-4" />
              {saving ? 'Creating...' : 'Add job'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
