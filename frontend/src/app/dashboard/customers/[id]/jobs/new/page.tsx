'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { getJson, postJson, patchJson } from '../../../../../apiClient';
import { ArrowLeft, Save, Plus, Trash2 } from 'lucide-react';
import SearchableSelect, { type SearchableSelectOption } from '../../../../SearchableSelect';
import {
  buildCompletedServiceItemsPayload,
  formatChecklistReminderSummary,
  parseCompletedServiceItemsFromJob,
} from '../../../../jobs/serviceJobCompletedItems';

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
  reminder_interval_n?: number | null;
  reminder_interval_unit?: string | null;
  reminder_early_n?: number | null;
  reminder_early_unit?: string | null;
}

interface CustomerContactRow {
  id: number;
  title: string | null;
  first_name: string | null;
  surname: string;
  email: string | null;
  mobile: string | null;
  landline: string | null;
}

interface QuotationPrefillPayload {
  id: number;
  customer_id: number;
  quotation_number: string;
  description: string | null;
  notes: string | null;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  line_items: {
    description: string;
    quantity: number;
    unit_price: number;
    amount: number;
    sort_order: number;
  }[];
}

interface EditableJob {
  contact_name?: string | null;
  job_contact_id?: number | null;
  job_contact?: CustomerContactRow | null;
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
  completed_service_items?: unknown;
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

function formatContactOptionLabel(c: CustomerContactRow): string {
  const name = [c.title, c.first_name, c.surname].filter((x) => x && String(x).trim()).join(' ').trim() || c.surname;
  return c.email?.trim() ? `${name} (${c.email.trim()})` : name;
}

export default function AddNewJobPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const customerId = params?.id as string;
  const editJobId = searchParams.get('edit');
  const workAddressIdParam = searchParams.get('work_address_id');
  const fromQuotationId = searchParams.get('from_quotation');
  const isEdit = !!editJobId;

  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;
  const keepPricingFromQuotationRef = useRef(false);
  const quotationPrefillDoneRef = useRef(false);

  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [jobDescriptions, setJobDescriptions] = useState<JobDescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [contactName, setContactName] = useState('');
  const [jobContactId, setJobContactId] = useState<number | null>(null);
  const [customerContacts, setCustomerContacts] = useState<CustomerContactRow[]>([]);
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
  const [completedServiceNames, setCompletedServiceNames] = useState<string[]>([]);
  const [remindEmailByService, setRemindEmailByService] = useState<Record<string, boolean>>({});

  // Config lists
  const [businessUnitsList, setBusinessUnitsList] = useState<{id: number, name: string}[]>([]);
  const [userGroupsList, setUserGroupsList] = useState<{id: number, name: string}[]>([]);

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

  const priorityOptions = useMemo(
    (): SearchableSelectOption[] => [
      { value: 'low', label: 'Low' },
      { value: 'medium', label: 'Medium' },
      { value: 'high', label: 'High' },
      { value: 'critical', label: 'Critical' },
    ],
    [],
  );

  const jobContactOptions = useMemo((): SearchableSelectOption[] => {
    return customerContacts.map((c) => ({
      value: String(c.id),
      label: formatContactOptionLabel(c),
    }));
  }, [customerContacts]);

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

      const contactsQuery =
        workAddressIdParam && /^\d+$/.test(workAddressIdParam)
          ? `?work_address_id=${encodeURIComponent(workAddressIdParam)}`
          : '';
      const contactsRes = await getJson<{ contacts: CustomerContactRow[] }>(
        `/customers/${customerId}/contacts${contactsQuery}`,
        token,
      ).catch(() => ({ contacts: [] as CustomerContactRow[] }));
      setCustomerContacts(Array.isArray(contactsRes.contacts) ? contactsRes.contacts : []);

      if (isEdit) {
        const jobData = await getJson<{ job: EditableJob }>(`/jobs/${editJobId}`, token);
        const j = jobData.job;
        setJobContactId(typeof j.job_contact_id === 'number' ? j.job_contact_id : null);
        setContactName(j.contact_name || '');
        setDescriptionId(j.job_description_id || '');
        setSkills(j.skills || '');
        setJobNotes(j.job_notes || '');
        setIsServiceJob(!!j.is_service_job);
        const parsed = parseCompletedServiceItemsFromJob(j.completed_service_items);
        setCompletedServiceNames(parsed.completedNames);
        setRemindEmailByService(parsed.remindEmail);

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
        if (j.pricing_items && Array.isArray(j.pricing_items)) {
          setPricingItems(j.pricing_items.map((pi: DescPricingItem) => {
            const unit = Number(pi.unit_price);
            const qty = Number(pi.quantity);
            const lineTotal =
              pi.total != null && String(pi.total) !== ''
                ? Number(pi.total)
                : unit * qty;
            return {
              key: nextKey(),
              item_name: pi.item_name,
              time_included: pi.time_included,
              unit_price: unit,
              vat_rate: Number(pi.vat_rate),
              quantity: qty,
              total: lineTotal,
            };
          }));
        }
      } else if (custData) {
        setJobContactId(null);
        // Pre-fill contact name for new job only
        const cn = [custData.contact_first_name, custData.contact_surname].filter(Boolean).join(' ');
        setContactName(cn || custData.full_name || '');
      }

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [token, customerId, isEdit, editJobId, workAddressIdParam]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (isEdit || !fromQuotationId || !token || !customerId || loading) return;
    if (quotationPrefillDoneRef.current) return;
    const qid = parseInt(fromQuotationId, 10);
    if (!Number.isFinite(qid)) return;

    let cancelled = false;
    (async () => {
      try {
        const data = await getJson<{ quotation: QuotationPrefillPayload }>(`/quotations/${qid}`, token);
        if (cancelled) return;
        const q = data.quotation;
        if (!q || Number(q.customer_id) !== Number(customerId)) {
          setError('This quotation does not belong to this customer.');
          return;
        }

        quotationPrefillDoneRef.current = true;
        keepPricingFromQuotationRef.current = true;

        setQuotedAmount(Number.isFinite(q.total_amount) ? String(q.total_amount) : '');
        setCustomerReference((q.quotation_number || '').trim());

        const noteLines: string[] = [`Prefilled from quotation ${q.quotation_number}.`];
        if (q.description?.trim()) noteLines.push('', q.description.trim());
        if (q.notes?.trim()) noteLines.push('', 'Quotation notes:', q.notes.trim());
        setJobNotes((prev) => {
          const base = noteLines.join('\n').trim();
          const p = (prev || '').trim();
          if (!p) return base;
          if (p.includes('Prefilled from quotation')) return p;
          return `${base}\n\n${p}`;
        });

        const sub = Number(q.subtotal);
        const tax = Number(q.tax_amount);
        let vatRate = 20;
        if (sub > 0.0001) {
          const r = Math.round((tax / sub) * 10000) / 100;
          if (Number.isFinite(r) && r >= 0 && r <= 99.99) vatRate = r;
        }

        const rows = Array.isArray(q.line_items) ? q.line_items : [];
        if (rows.length > 0) {
          setPricingItems(
            rows.map((li) => {
              const unit = Number(li.unit_price);
              const qty = Number(li.quantity);
              const qRounded = Number.isFinite(qty) ? Math.max(1, Math.min(999999, Math.round(qty))) : 1;
              const amt = Number(li.amount);
              const total = Number.isFinite(amt) ? amt : (Number.isFinite(unit) ? unit : 0) * qRounded;
              const name = String(li.description || 'Line item').trim();
              return {
                key: nextKey(),
                item_name: name.length > 255 ? `${name.slice(0, 252)}...` : name || 'Line item',
                time_included: 0,
                unit_price: Number.isFinite(unit) ? unit : 0,
                vat_rate: vatRate,
                quantity: qRounded,
                total,
              };
            }),
          );
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not load quotation to prefill the job.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, fromQuotationId, token, customerId, loading]);

  // When description changes, auto-fill skills, job notes, pricing items
  const handleDescriptionChange = async (newId: number | '') => {
    setDescriptionId(newId);
    if (!newId || !token) {
      keepPricingFromQuotationRef.current = false;
      setSkills('');
      setJobNotes('');
      setIsServiceJob(false);
      setCompletedServiceNames([]);
      setRemindEmailByService({});
      setPriority('medium');
      setBusinessUnit('');
      setPricingItems([]);
      setCompletedServiceNames([]);
      setRemindEmailByService({});
      return;
    }

    try {
      const desc = await getJson<JobDescription>(`/settings/job-descriptions/${newId}`, token);
      setSkills(desc.default_skills || '');
      setJobNotes((prev) => {
        const tmpl = (desc.default_job_notes || '').trim();
        const p = (prev || '').trim();
        if (keepPricingFromQuotationRef.current) {
          if (tmpl && p) return `${tmpl}\n\n${p}`;
          return tmpl || p;
        }
        return tmpl;
      });
      setIsServiceJob(desc.is_service_job);
      if (!desc.is_service_job) {
        setCompletedServiceNames([]);
        setRemindEmailByService({});
      }
      setPriority(desc.default_priority || 'medium');
      setBusinessUnit(desc.default_business_unit || '');

      if (keepPricingFromQuotationRef.current) {
        return;
      }

      if (desc.pricing_items && desc.pricing_items.length > 0) {
        setPricingItems(
          desc.pricing_items.map((pi: DescPricingItem) => ({
            key: nextKey(),
            item_name: pi.item_name,
            time_included: pi.time_included,
            unit_price: Number(pi.unit_price),
            vat_rate: Number(pi.vat_rate),
            quantity: pi.quantity,
            total: Number(pi.unit_price) * pi.quantity,
          })),
        );
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
    if (!isEdit && (descriptionId === '' || descriptionId === null || descriptionId === undefined)) {
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

    const back =
      workAddressIdParam && !isEdit
        ? `/dashboard/customers/${customerId}?work_address_id=${encodeURIComponent(workAddressIdParam)}`
        : `/dashboard/customers/${customerId}`;

    try {
      const payload = {
        title: titleStr,
        job_description_id: descriptionId || null,
        contact_name: contactName,
        job_contact_id: jobContactId,
        expected_completion: expectedCompletion,
        priority,
        user_group: userGroup || null,
        business_unit: businessUnit || null,
        skills,
        job_notes: jobNotes,
        is_service_job: isServiceJob,
        completed_service_items: buildCompletedServiceItemsPayload(
          isServiceJob,
          completedServiceNames,
          remindEmailByService,
        ),
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
        ...(workAddressIdParam && !isEdit ? { work_address_id: Number(workAddressIdParam) } : {}),
      };

      if (isEdit) {
        await patchJson(`/jobs/${editJobId}`, payload, token);
      } else {
        const created = await postJson<{ job: { id: number } }>(`/customers/${customerId}/jobs`, payload, token);
        const newJobId = created.job?.id;
        if (newJobId && fromQuotationId && token) {
          try {
            await postJson(`/quotations/${fromQuotationId}/link-job`, { job_id: newJobId }, token);
          } catch (linkErr: unknown) {
            setSaving(false);
            setError(linkErr instanceof Error ? linkErr.message : 'Job created but the quotation could not be linked.');
            return;
          }
        }
      }

      setSaving(false);
      router.push(back);
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

          {fromQuotationId && !isEdit ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/90 p-4 text-sm text-emerald-950">
              <p className="font-semibold">Creating a job from a quotation</p>
              <p className="mt-1 text-emerald-900/90">
                Quotation line items and totals are copied below. You must still choose a <strong>job description</strong> (and any
                other required fields), then save. The quotation will be linked to this job after you create it.
              </p>
            </div>
          ) : null}

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
                    <label className={labelClass}>Job contact (from contacts list)</label>
                    <SearchableSelect
                      options={jobContactOptions}
                      value={jobContactId != null ? String(jobContactId) : ''}
                      onChange={(v) => {
                        if (!v) {
                          setJobContactId(null);
                          return;
                        }
                        const idNum = Number(v);
                        const row = customerContacts.find((c) => c.id === idNum);
                        setJobContactId(idNum);
                        if (row) {
                          const nm = [row.title, row.first_name, row.surname].filter((x) => x && String(x).trim()).join(' ').trim();
                          setContactName(nm || row.surname);
                        }
                      }}
                      allowEmpty
                      emptyButtonLabel="None — use name below"
                      emptyMenuLabel="None — use name below"
                      searchPlaceholder="Search contacts…"
                      className={inputClass}
                    />
                    <p className="text-xs text-slate-400 mt-1">
                      Optional: pick someone from this customer&apos;s contacts. Site visit and reminders use their details when set.
                    </p>
                  </div>
                  <div>
                    <label className={labelClass}>Contact name</label>
                    <input type="text" value={contactName} onChange={e => setContactName(e.target.value)} className={inputClass} />
                    <p className="text-xs text-slate-400 mt-1">Shown on the job and to engineers. Filled automatically when you pick a contact above; you can edit the wording.</p>
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
                        onChange={(e) => {
                          setIsServiceJob(e.target.checked);
                          if (!e.target.checked) {
                            setCompletedServiceNames([]);
                            setRemindEmailByService({});
                          }
                        }}
                        className="size-4 mt-0.5 rounded text-[#14B8A6] focus:ring-[#14B8A6]"
                      />
                      <div>
                        <span className="text-sm font-medium text-slate-900">Service job</span>
                        <p className="text-xs text-slate-500">
                          Per-service reminder timing is set in Settings → Job descriptions (service checklist). Here you choose which services were completed and which to include in reminder emails.
                        </p>
                      </div>
                    </label>
                  </div>

                  {isServiceJob && (
                    <div>
                      <label className={labelClass}>Completed services in this job</label>
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
                        {activeServiceChecklistItems.length === 0 ? (
                          <p className="text-sm text-slate-500">
                            No service checklist options configured yet. Add them under Settings → Job descriptions (service checklist).
                          </p>
                        ) : (
                          <div className="space-y-3">
                            {activeServiceChecklistItems.map((item) => {
                              const done = completedServiceNames.includes(item.name);
                              return (
                                <div
                                  key={item.id}
                                  className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
                                >
                                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm font-medium text-slate-800">
                                    <input
                                      type="checkbox"
                                      checked={done}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setCompletedServiceNames((prev) =>
                                            prev.includes(item.name) ? prev : [...prev, item.name],
                                          );
                                          setRemindEmailByService((prev) => ({
                                            ...prev,
                                            [item.name]: prev[item.name] !== false,
                                          }));
                                        } else {
                                          setCompletedServiceNames((prev) => prev.filter((n) => n !== item.name));
                                          setRemindEmailByService((prev) => {
                                            const next = { ...prev };
                                            delete next[item.name];
                                            return next;
                                          });
                                        }
                                      }}
                                      className="size-4 shrink-0 rounded text-[#14B8A6] focus:ring-[#14B8A6]"
                                    />
                                    <span className="min-w-0">{item.name}</span>
                                  </label>
                                  <label
                                    className={`flex cursor-pointer items-center gap-2 text-xs sm:text-sm ${done ? 'text-slate-700' : 'cursor-not-allowed text-slate-400'}`}
                                  >
                                    <input
                                      type="checkbox"
                                      disabled={!done}
                                      checked={done && remindEmailByService[item.name] !== false}
                                      onChange={(e) => {
                                        setRemindEmailByService((prev) => ({
                                          ...prev,
                                          [item.name]: e.target.checked,
                                        }));
                                      }}
                                      className="size-4 shrink-0 rounded text-[#14B8A6] focus:ring-[#14B8A6] disabled:opacity-40"
                                    />
                                    Include in reminder emails
                                  </label>
                                  <p className="w-full text-[11px] leading-snug text-slate-500 sm:order-3 sm:basis-full">
                                    {formatChecklistReminderSummary(item)}
                                  </p>
                                </div>
                              );
                            })}
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
              {saving ? (isEdit ? 'Saving...' : 'Creating...') : (isEdit ? 'Save changes' : 'Add job')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
