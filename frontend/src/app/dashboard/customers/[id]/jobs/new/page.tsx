'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { getJson, postJson, patchJson } from '../../../../../apiClient';
import { ArrowLeft, Save, Plus, Trash2, Calendar, Clock } from 'lucide-react';

interface JobDescription {
  id: number;
  name: string;
  default_skills: string | null;
  default_job_notes: string | null;
  default_priority: string;
  default_business_unit: string | null;
  is_service_job: boolean;
  pricing_items: DescPricingItem[];
}

interface DescPricingItem {
  id: number;
  item_name: string;
  time_included: number;
  unit_price: number;
  vat_rate: number;
  quantity: number;
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

interface EditableJob {
  contact_name?: string | null;
  job_description_id?: number | null;
  skills?: string | null;
  job_notes?: string | null;
  is_service_job?: boolean;
  expected_completion?: string | null;
  priority?: string | null;
  user_group?: string | null;
  business_unit?: string | null;
  book_into_diary?: boolean;
  quoted_amount?: number | null;
  customer_reference?: string | null;
  job_pipeline?: string | null;
  pricing_items?: DescPricingItem[];
  completed_service_items?: string[] | null;
}

let keyCounter = 0;
function nextKey() { return `pi_${++keyCounter}_${Date.now()}`; }

export default function AddNewJobPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const customerId = params?.id as string;
  const editJobId = searchParams.get('edit');
  const isEdit = !!editJobId;

  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [jobDescriptions, setJobDescriptions] = useState<JobDescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [contactName, setContactName] = useState('');
  const [descriptionId, setDescriptionId] = useState<number | ''>('');
  const [skills, setSkills] = useState('');
  const [jobNotes, setJobNotes] = useState('');
  const [isServiceJob, setIsServiceJob] = useState(false);

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

  const fetchData = useCallback(async () => {
    if (!token || !customerId) return;
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

      if (isEdit) {
        const jobData = await getJson<{ job: EditableJob }>(`/jobs/${editJobId}`, token);
        const j = jobData.job;
        setContactName(j.contact_name || '');
        setDescriptionId(j.job_description_id || '');
        setSkills(j.skills || '');
        setJobNotes(j.job_notes || '');
        setIsServiceJob(!!j.is_service_job);
        
        if (j.expected_completion) {
          const d = new Date(j.expected_completion);
          setExpectedDate(d.toISOString().slice(0,10));
          setExpectedTime(d.toTimeString().slice(0,5));
        }
        
        setPriority(j.priority || 'medium');
        setUserGroup(j.user_group || '');
        setBusinessUnit(j.business_unit || '');
        setBookIntoDiary(!!j.book_into_diary);
        setQuotedAmount(j.quoted_amount ? String(j.quoted_amount) : '');
        setCustomerReference(j.customer_reference || '');
        setJobPipeline(j.job_pipeline || 'Service/Reactive Workflow');
        setCompletedServiceItems(Array.isArray(j.completed_service_items) ? j.completed_service_items : []);

        if (j.pricing_items && Array.isArray(j.pricing_items)) {
          setPricingItems(j.pricing_items.map((pi: DescPricingItem) => ({
             key: nextKey(),
             item_name: pi.item_name,
             time_included: pi.time_included,
             unit_price: Number(pi.unit_price),
             vat_rate: Number(pi.vat_rate),
             quantity: pi.quantity,
             total: Number(pi.total)
          })));
        }
      } else if (custData) {
        // Pre-fill contact name for new job only
        const cn = [custData.contact_first_name, custData.contact_surname].filter(Boolean).join(' ');
        setContactName(cn || custData.full_name || '');
      }

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [token, customerId, isEdit, editJobId]);

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
      if (!desc.is_service_job) setCompletedServiceItems([]);
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

  const updatePricingItem = (key: string, field: keyof PricingItemRow, value: any) => {
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
    setSaving(true);
    setError(null);

    const selectedDesc = jobDescriptions.find(d => d.id === descriptionId);
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

      if (isEdit) {
        await patchJson(`/jobs/${editJobId}`, payload, token);
      } else {
        await postJson(`/customers/${customerId}/jobs`, payload, token);
      }

      // Navigate back to customer detail
      router.push(`/dashboard/customers/${customerId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : `Failed to ${isEdit ? 'update' : 'create'} job`);
      setSaving(false);
    }
  };

  const inputClass = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/20 bg-white";
  const labelClass = "text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1 block";

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
             <span className="cursor-pointer hover:underline hover:text-slate-900" onClick={() => router.push('/dashboard/customers')}>Customers</span>
             <span className="mx-2 text-slate-300">/</span>
             <span className="cursor-pointer hover:underline hover:text-slate-900" onClick={() => router.push(`/dashboard/customers/${customerId}`)}>{customer?.full_name || 'Customer'}</span>
             <span className="mx-2 text-slate-300">/</span>
             <span className="text-slate-900 font-semibold">{isEdit ? 'Edit job' : 'Add new job'}</span>
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
              <h2 className="text-lg font-bold text-slate-800">{isEdit ? 'Edit job details' : 'Add new job'}</h2>
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
                    <select
                      required
                      value={descriptionId}
                      onChange={e => handleDescriptionChange(e.target.value ? Number(e.target.value) : '')}
                      className={inputClass}
                    >
                      <option value="">-- Please choose --</option>
                      {jobDescriptions.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
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
                    <select value={priority} onChange={e => setPriority(e.target.value)} className={inputClass}>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>

                  <div>
                    <label className={labelClass}>User group</label>
                    <select value={userGroup} onChange={e => setUserGroup(e.target.value)} className={inputClass}>
                      <option value="">-- Please choose --</option>
                      {userGroupsList.length > 0 ? (
                        userGroupsList.map(u => (
                          <option key={u.id} value={u.name}>{u.name}</option>
                        ))
                      ) : (
                        <>
                           <option value="Field Engineers">Field Engineers</option>
                           <option value="Senior Technicians">Senior Technicians</option>
                           <option value="Apprentices">Apprentices</option>
                           <option value="Subcontractors">Subcontractors</option>
                        </>
                      )}
                    </select>
                    <p className="text-xs text-slate-400 mt-1">Assign this job to a specific team or user group.</p>
                  </div>

                  <div>
                    <label className={labelClass}>Business unit</label>
                    <select value={businessUnit} onChange={e => setBusinessUnit(e.target.value)} className={inputClass}>
                      <option value="">-- Please choose --</option>
                      {businessUnitsList.length > 0 ? (
                        businessUnitsList.map(u => (
                          <option key={u.id} value={u.name}>{u.name}</option>
                        ))
                      ) : (
                        <>
                           <option value="Service & Maintenance">Service & Maintenance</option>
                           <option value="Installation">Installation</option>
                           <option value="Emergency">Emergency</option>
                           <option value="Consultation">Consultation</option>
                        </>
                      )}
                    </select>
                    <p className="text-[11px] text-[#14B8A6] mt-1 font-medium">When this job is invoiced the system will automatically select this category.</p>
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
                  <select value={jobPipeline} onChange={e => setJobPipeline(e.target.value)} className={inputClass}>
                    <option value="Service/Reactive Workflow">Service / Reactive Workflow</option>
                    <option value="Installation Workflow">Installation Workflow</option>
                    <option value="Emergency Workflow">Emergency Workflow</option>
                    <option value="Maintenance Workflow">Maintenance Workflow</option>
                  </select>
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
              {saving ? (isEdit ? 'Saving...' : 'Creating...') : (isEdit ? 'Save changes' : 'Add job')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
