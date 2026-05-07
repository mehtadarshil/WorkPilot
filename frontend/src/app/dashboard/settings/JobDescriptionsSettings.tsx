'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getJson, postJson, patchJson, deleteRequest } from '../../apiClient';
import { Plus } from 'lucide-react';

interface JobDescription {
  id: number;
  name: string;
  default_skills: string | null;
  default_job_notes: string | null;
  default_priority: string;
  default_business_unit: string | null;
  is_service_job: boolean;
}

interface PricingItem {
  id: number;
  item_name: string;
  time_included: number;
  unit_price: number;
  vat_rate: number;
  quantity: number;
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
  customer_reminder_weeks_before?: number | null;
  customer_email_subject?: string | null;
  customer_email_body_html?: string | null;
}

type ServiceReminderDraft = {
  interval_n: number;
  interval_u: string;
  early_n: number;
  early_u: string;
  customer_weeks: string;
  customer_subject: string;
  customer_body: string;
};

export default function JobDescriptionsSettings() {
  const [descriptions, setDescriptions] = useState<JobDescription[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formName, setFormName] = useState('');
  const [formSkills, setFormSkills] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formPriority, setFormPriority] = useState('medium');
  const [formBusinessUnit, setFormBusinessUnit] = useState('');
  const [formIsService, setFormIsService] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pricing items for editing
  const [showPricingFor, setShowPricingFor] = useState<number | null>(null);
  const [pricingItems, setPricingItems] = useState<PricingItem[]>([]);
  const [piName, setPiName] = useState('');
  const [piTime, setPiTime] = useState(0);
  const [piPrice, setPiPrice] = useState(0);
  const [piVat, setPiVat] = useState(20);
  const [piQty, setPiQty] = useState(1);
  const [serviceItems, setServiceItems] = useState<ServiceChecklistItem[]>([]);
  const [newServiceName, setNewServiceName] = useState('');
  const [serviceReminderDrafts, setServiceReminderDrafts] = useState<Record<number, ServiceReminderDraft>>({});
  const [savingReminderId, setSavingReminderId] = useState<number | null>(null);

  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  const fetchDescriptions = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await getJson<JobDescription[]>('/settings/job-descriptions', token);
      setDescriptions(data || []);
    } catch {
      setDescriptions([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchDescriptions();
  }, [fetchDescriptions]);

  const fetchPricingItems = useCallback(async (descId: number) => {
    if (!token) return;
    try {
      const data = await getJson<PricingItem[]>(`/settings/job-descriptions/${descId}/pricing-items`, token);
      setPricingItems(data || []);
    } catch {
      setPricingItems([]);
    }
  }, [token]);

  const fetchServiceItems = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getJson<{ items: ServiceChecklistItem[] }>('/settings/service-checklist', token);
      setServiceItems(data.items || []);
    } catch {
      setServiceItems([]);
    }
  }, [token]);

  useEffect(() => {
    fetchServiceItems();
  }, [fetchServiceItems]);

  useEffect(() => {
    const m: Record<number, ServiceReminderDraft> = {};
    for (const it of serviceItems) {
      m[it.id] = {
        interval_n: it.reminder_interval_n ?? 1,
        interval_u: it.reminder_interval_unit || 'years',
        early_n: it.reminder_early_n ?? 14,
        early_u: it.reminder_early_unit || 'days',
        customer_weeks:
          it.customer_reminder_weeks_before != null && Number.isFinite(it.customer_reminder_weeks_before)
            ? String(it.customer_reminder_weeks_before)
            : '',
        customer_subject: it.customer_email_subject ?? '',
        customer_body: it.customer_email_body_html ?? '',
      };
    }
    setServiceReminderDrafts(m);
  }, [serviceItems]);

  const resetForm = () => {
    setEditingId(null);
    setFormName('');
    setFormSkills('');
    setFormNotes('');
    setFormPriority('medium');
    setFormBusinessUnit('');
    setFormIsService(false);
    setError(null);
  };

  const handleEdit = (d: JobDescription) => {
    setEditingId(d.id);
    setFormName(d.name);
    setFormSkills(d.default_skills || '');
    setFormNotes(d.default_job_notes || '');
    setFormPriority(d.default_priority || 'medium');
    setFormBusinessUnit(d.default_business_unit || '');
    setFormIsService(d.is_service_job);
    setError(null);
  };

  const handleDelete = async (id: number) => {
    if (!token || !confirm('Delete this job description template?')) return;
    try {
      await deleteRequest(`/settings/job-descriptions/${id}`, token);
      fetchDescriptions();
      if (editingId === id) resetForm();
      if (showPricingFor === id) setShowPricingFor(null);
    } catch (err: any) {
      alert(err?.message || 'Failed to delete');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError(null);
    try {
      const payload = {
        name: formName.trim(),
        default_skills: formSkills.trim() || null,
        default_job_notes: formNotes.trim() || null,
        default_priority: formPriority,
        default_business_unit: formBusinessUnit.trim() || null,
        is_service_job: formIsService,
      };

      if (editingId) {
        await patchJson(`/settings/job-descriptions/${editingId}`, payload, token);
      } else {
        await postJson('/settings/job-descriptions', payload, token);
      }
      resetForm();
      fetchDescriptions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  const handleAddPricingItem = async () => {
    if (!token || !showPricingFor || !piName.trim()) return;
    try {
      await postJson(`/settings/job-descriptions/${showPricingFor}/pricing-items`, {
        item_name: piName.trim(),
        time_included: piTime,
        unit_price: piPrice,
        vat_rate: piVat,
        quantity: piQty,
      }, token);
      setPiName('');
      setPiTime(0);
      setPiPrice(0);
      setPiVat(20);
      setPiQty(1);
      fetchPricingItems(showPricingFor);
    } catch (err: any) {
      alert(err?.message || 'Failed to add');
    }
  };

  const handleDeletePricingItem = async (itemId: number) => {
    if (!token || !showPricingFor) return;
    try {
      await deleteRequest(`/settings/job-descriptions/${showPricingFor}/pricing-items/${itemId}`, token);
      fetchPricingItems(showPricingFor);
    } catch (err: any) {
      alert(err?.message || 'Failed to delete');
    }
  };

  const addServiceItem = async () => {
    if (!token || !newServiceName.trim()) return;
    try {
      await postJson('/settings/service-checklist', {
        name: newServiceName.trim(),
        sort_order: serviceItems.length,
        is_active: true,
      }, token);
      setNewServiceName('');
      fetchServiceItems();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add service');
    }
  };

  const toggleServiceItem = async (item: ServiceChecklistItem) => {
    if (!token) return;
    try {
      await patchJson(`/settings/service-checklist/${item.id}`, { is_active: !item.is_active }, token);
      fetchServiceItems();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update service');
    }
  };

  const deleteServiceItem = async (itemId: number) => {
    if (!token || !confirm('Delete this service from checklist?')) return;
    try {
      await deleteRequest(`/settings/service-checklist/${itemId}`, token);
      fetchServiceItems();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete service');
    }
  };

  const saveServiceReminders = async (itemId: number) => {
    if (!token) return;
    const d = serviceReminderDrafts[itemId];
    if (!d) return;
    setSavingReminderId(itemId);
    try {
      const weeksRaw = d.customer_weeks.trim();
      const weeksParsed = weeksRaw ? parseInt(weeksRaw, 10) : NaN;
      const customer_reminder_weeks_before =
        weeksRaw && Number.isFinite(weeksParsed) && weeksParsed >= 1 && weeksParsed <= 52
          ? weeksParsed
          : null;
      await patchJson(`/settings/service-checklist/${itemId}`, {
        reminder_interval_n: d.interval_n,
        reminder_interval_unit: d.interval_u,
        reminder_early_n: d.early_n,
        reminder_early_unit: d.early_u,
        customer_reminder_weeks_before,
        customer_email_subject: d.customer_subject.trim() || null,
        customer_email_body_html: d.customer_body.trim() || null,
      }, token);
      await fetchServiceItems();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save reminder settings');
    } finally {
      setSavingReminderId(null);
    }
  };

  const inputClass = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30';

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Form Side */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm h-fit">
          <h3 className="text-lg font-bold text-slate-900 mb-1">{editingId ? 'Edit job description' : 'Add a job description'}</h3>
          <p className="text-sm text-slate-500 mb-4">Templates auto-fill skills, notes & pricing when creating new jobs.</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Description name *</label>
              <input type="text" required value={formName} onChange={e => setFormName(e.target.value)} className={inputClass} placeholder="e.g. Domestic Gas Boiler Service" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Default skills</label>
              <input type="text" value={formSkills} onChange={e => setFormSkills(e.target.value)} className={inputClass} placeholder="e.g. Gas Safe, Plumbing" />
              <p className="text-xs text-slate-400 mt-1">Comma-separated list of skills auto-filled on job creation</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Default job notes</label>
              <textarea rows={3} value={formNotes} onChange={e => setFormNotes(e.target.value)} className={inputClass} placeholder="e.g. Carry out service of gas-fired boiler." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Default priority</label>
                <select value={formPriority} onChange={e => setFormPriority(e.target.value)} className={inputClass}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Business unit</label>
                <select value={formBusinessUnit} onChange={e => setFormBusinessUnit(e.target.value)} className={inputClass}>
                  <option value="">None</option>
                  <option value="Service & Maintenance">Service & Maintenance</option>
                  <option value="Installation">Installation</option>
                  <option value="Emergency">Emergency</option>
                  <option value="Consultation">Consultation</option>
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
              <input type="checkbox" checked={formIsService} onChange={e => setFormIsService(e.target.checked)} className="size-4 rounded text-[#14B8A6] focus:ring-[#14B8A6]" />
              This is a service job (shows completed-service checklists on new jobs)
            </label>

            {error && <p className="text-sm text-red-600 font-medium pt-2">{error}</p>}

            <div className="pt-4 flex gap-3">
              {editingId && (
                <button type="button" onClick={resetForm} className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50 transition-colors">Cancel</button>
              )}
              <button type="submit" className="flex-1 rounded-lg bg-[#14B8A6] px-4 py-2 font-semibold text-white shadow-sm hover:bg-[#119f8e] transition-colors">
                {editingId ? 'Save changes' : 'Add description'}
              </button>
            </div>
          </form>
        </div>

        {/* List Side */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col h-fit">
          <div className="p-6 border-b border-slate-200">
            <h3 className="text-lg font-bold text-slate-900">Existing job descriptions</h3>
            <p className="text-sm text-slate-500 mt-1">These templates are shown in the "Description" dropdown when adding a new job.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td className="p-4 text-center text-slate-500 text-sm">Loading...</td></tr>
                ) : descriptions.length === 0 ? (
                  <tr><td className="p-4 text-center text-slate-500 text-sm">No job descriptions defined yet.</td></tr>
                ) : (
                  descriptions.map(d => (
                    <tr key={d.id} className="hover:bg-slate-50 group transition-colors">
                      <td className="p-4">
                        <div className="font-medium text-sm text-slate-900">{d.name}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {d.default_business_unit || 'No unit'} · {d.default_priority} priority
                          {d.is_service_job && <span className="ml-2 bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-[10px] font-bold">Service</span>}
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { setShowPricingFor(d.id); fetchPricingItems(d.id); }} className="text-[#14B8A6] text-sm font-semibold hover:underline">Pricing</button>
                          <button onClick={() => handleEdit(d)} className="text-[#14B8A6] text-sm font-semibold hover:underline">Edit</button>
                          <button onClick={() => handleDelete(d.id)} className="text-rose-500 text-sm font-semibold hover:underline">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Pricing Items Section */}
      {showPricingFor && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
            <div>
              <h3 className="text-[15px] font-bold text-slate-800">Default Pricing Items</h3>
              <p className="text-xs text-slate-500 mt-1">These items are automatically added when this job description is selected.</p>
            </div>
            <button onClick={() => setShowPricingFor(null)} className="text-sm font-semibold text-slate-500 hover:text-slate-700">Close</button>
          </div>
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-white border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">#</th>
                <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Pricing item</th>
                <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Time inc.</th>
                <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Unit price</th>
                <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">VAT %</th>
                <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Qty</th>
                <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pricingItems.map((pi, idx) => (
                <tr key={pi.id} className="hover:bg-slate-50 group">
                  <td className="px-6 py-3 text-slate-400 font-medium">{idx + 1}</td>
                  <td className="px-6 py-3 font-medium text-slate-900">{pi.item_name}</td>
                  <td className="px-6 py-3 text-slate-600">{pi.time_included}</td>
                  <td className="px-6 py-3 text-slate-600">{Number(pi.unit_price).toFixed(2)}</td>
                  <td className="px-6 py-3 text-slate-600">{Number(pi.vat_rate).toFixed(2)}</td>
                  <td className="px-6 py-3 text-slate-600">{pi.quantity}</td>
                  <td className="px-6 py-3 text-right">
                    <button onClick={() => handleDeletePricingItem(pi.id)} className="text-rose-500 text-sm font-semibold hover:underline opacity-0 group-hover:opacity-100 transition-opacity">Delete</button>
                  </td>
                </tr>
              ))}
              {/* Inline add row */}
              <tr className="bg-emerald-50/20">
                <td className="px-6 py-3 text-slate-400 font-medium">{pricingItems.length + 1}</td>
                <td className="px-6 py-3"><input type="text" value={piName} onChange={e => setPiName(e.target.value)} placeholder="Item name" className={inputClass} /></td>
                <td className="px-6 py-3"><input type="number" value={piTime} onChange={e => setPiTime(Number(e.target.value))} className={inputClass + ' w-20'} /></td>
                <td className="px-6 py-3"><input type="number" step="0.01" value={piPrice} onChange={e => setPiPrice(Number(e.target.value))} className={inputClass + ' w-24'} /></td>
                <td className="px-6 py-3"><input type="number" step="0.01" value={piVat} onChange={e => setPiVat(Number(e.target.value))} className={inputClass + ' w-20'} /></td>
                <td className="px-6 py-3"><input type="number" value={piQty} onChange={e => setPiQty(Number(e.target.value))} className={inputClass + ' w-16'} /></td>
                <td className="px-6 py-3 text-right">
                  <button onClick={handleAddPricingItem} className="text-[#14B8A6] text-sm font-semibold hover:underline">Add</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div id="wp-service-checklist" className="scroll-mt-24 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-[15px] font-bold text-slate-800">Service checklist options</h3>
            <p className="text-xs text-slate-500 mt-1">
              This list defines each <strong>service type</strong> name, repeat interval, and optional per-type customer email (like Commusoft &quot;configure reminder&quot;). Automated emails go to the customer for each{' '}
              <strong>completed service job</strong> where that service was ticked with reminder email on, the name matches a row here (same spelling, case-insensitive), and renewal timing falls in the send window. Global on/off and who receives the email (account vs job contact) are under{' '}
              <Link href="/dashboard/settings?tab=service-reminders" className="font-semibold text-[#14B8A6] hover:underline">
                Settings → Service renewal reminders
              </Link>
              . Default subject/body: Settings → Email → Templates → <code className="rounded bg-white px-0.5">service_reminder</code>. SMS and letter are not implemented yet.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newServiceName}
              onChange={(e) => setNewServiceName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addServiceItem(); } }}
              placeholder="Add service name"
              className="w-64 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
            />
            <button onClick={addServiceItem} className="inline-flex items-center gap-1 rounded-lg bg-[#14B8A6] px-3 py-2 text-sm font-semibold text-white hover:bg-[#119f8e]">
              <Plus className="size-4" /> Add
            </button>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {serviceItems.length === 0 ? (
            <div className="px-6 py-6 text-sm text-slate-500">No checklist services added yet.</div>
          ) : (
            serviceItems.map((item) => {
              const draft = serviceReminderDrafts[item.id];
              return (
                <div key={item.id} className="space-y-3 px-6 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-sm font-medium text-slate-800">{item.name}</span>
                      <span
                        className={`rounded px-2 py-0.5 text-[11px] font-semibold ${item.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}
                      >
                        {item.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <button type="button" onClick={() => toggleServiceItem(item)} className="font-semibold text-[#14B8A6] hover:underline">
                        {item.is_active ? 'Disable' : 'Enable'}
                      </button>
                      <button type="button" onClick={() => deleteServiceItem(item.id)} className="font-semibold text-rose-600 hover:underline">
                        Delete
                      </button>
                    </div>
                  </div>
                  {draft && (
                    <div className="grid gap-3 rounded-lg border border-slate-100 bg-slate-50/80 p-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">Repeat every</label>
                        <div className="mt-1 flex gap-2">
                          <input
                            type="number"
                            min={1}
                            className={inputClass + ' mt-0 max-w-[100px]'}
                            value={draft.interval_n}
                            onChange={(e) => {
                              const v = parseInt(e.target.value, 10);
                              setServiceReminderDrafts((prev) => ({
                                ...prev,
                                [item.id]: { ...draft, interval_n: Number.isFinite(v) && v >= 1 ? v : 1 },
                              }));
                            }}
                          />
                          <select
                            className={inputClass + ' mt-0'}
                            value={draft.interval_u}
                            onChange={(e) =>
                              setServiceReminderDrafts((prev) => ({
                                ...prev,
                                [item.id]: { ...draft, interval_u: e.target.value },
                              }))
                            }
                          >
                            <option value="days">Days</option>
                            <option value="weeks">Weeks</option>
                            <option value="months">Months</option>
                            <option value="years">Years</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">First reminder (early)</label>
                        <div className="mt-1 flex gap-2">
                          <input
                            type="number"
                            min={1}
                            className={inputClass + ' mt-0 max-w-[100px]'}
                            value={draft.early_n}
                            onChange={(e) => {
                              const v = parseInt(e.target.value, 10);
                              setServiceReminderDrafts((prev) => ({
                                ...prev,
                                [item.id]: { ...draft, early_n: Number.isFinite(v) && v >= 1 ? v : 1 },
                              }));
                            }}
                          />
                          <select
                            className={inputClass + ' mt-0'}
                            value={draft.early_u}
                            onChange={(e) =>
                              setServiceReminderDrafts((prev) => ({
                                ...prev,
                                [item.id]: { ...draft, early_u: e.target.value },
                              }))
                            }
                          >
                            <option value="days">Days</option>
                            <option value="weeks">Weeks</option>
                          </select>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500">
                          Used when no &quot;weeks before due&quot; override is set below.
                        </p>
                      </div>
                      <div className="sm:col-span-2 border-t border-slate-200 pt-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Customer email (optional)</p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          Tags: <code className="rounded bg-white px-1">{`{{customer_name}}`}</code>{' '}
                          <code className="rounded bg-white px-1">{`{{customer_surname}}`}</code>{' '}
                          <code className="rounded bg-white px-1">{`{{customer_account_no}}`}</code>{' '}
                          <code className="rounded bg-white px-1">{`{{customer_email}}`}</code>{' '}
                          <code className="rounded bg-white px-1">{`{{customer_telephone}}`}</code>{' '}
                          <code className="rounded bg-white px-1">{`{{customer_mobile}}`}</code>{' '}
                          <code className="rounded bg-white px-1">{`{{customer_address_line_1}}`}</code>{' '}
                          <code className="rounded bg-white px-1">{`{{customer_town}}`}</code>{' '}
                          <code className="rounded bg-white px-1">{`{{customer_postcode}}`}</code>{' '}
                          <code className="rounded bg-white px-1">{`{{customer_address}}`}</code>{' '}
                          <code className="rounded bg-white px-1">{`{{work_address}}`}</code>{' '}
                          <code className="rounded bg-white px-1">{`{{site_address}}`}</code>{' '}
                          <code className="rounded bg-white px-1">{`{{service_name}}`}</code>{' '}
                          <code className="rounded bg-white px-1">{`{{service_reminder_name}}`}</code>{' '}
                          <code className="rounded bg-white px-1">{`{{service_contact}}`}</code>{' '}
                          <code className="rounded bg-white px-1">{`{{service_reminder_booking_portal_url}}`}</code>{' '}
                          <code className="rounded bg-white px-1">{`{{due_date}}`}</code>{' '}
                          <code className="rounded bg-white px-1">{`{{service_due_date}}`}</code>{' '}
                          <code className="rounded bg-white px-1">{`{{job_title}}`}</code>{' '}
                          <code className="rounded bg-white px-1">{`{{job_id}}`}</code>{' '}
                          <code className="rounded bg-white px-1">{`{{company_name}}`}</code>{' '}
                          <code className="rounded bg-white px-1">{`{{phase_label}}`}</code>
                        </p>
                        <div className="mt-2 grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="block text-xs font-semibold text-slate-600">Weeks before due (optional)</label>
                            <input
                              type="number"
                              min={1}
                              max={52}
                              placeholder="e.g. 2"
                              className={inputClass + ' mt-1 max-w-[120px]'}
                              value={draft.customer_weeks}
                              onChange={(e) =>
                                setServiceReminderDrafts((prev) => ({
                                  ...prev,
                                  [item.id]: { ...draft, customer_weeks: e.target.value },
                                }))
                              }
                            />
                            <p className="mt-1 text-[11px] text-slate-500">
                              If set (1–52), customer emails use this many weeks before the due date instead of &quot;First reminder&quot; above.
                            </p>
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-semibold text-slate-600">Subject override</label>
                            <input
                              type="text"
                              className={inputClass + ' mt-1'}
                              value={draft.customer_subject}
                              placeholder="Leave blank to use global service_reminder template subject"
                              onChange={(e) =>
                                setServiceReminderDrafts((prev) => ({
                                  ...prev,
                                  [item.id]: { ...draft, customer_subject: e.target.value },
                                }))
                              }
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-semibold text-slate-600">Body HTML override</label>
                            <textarea
                              rows={5}
                              className={inputClass + ' mt-1 font-mono text-xs'}
                              value={draft.customer_body}
                              placeholder="Leave blank to use global template body"
                              onChange={(e) =>
                                setServiceReminderDrafts((prev) => ({
                                  ...prev,
                                  [item.id]: { ...draft, customer_body: e.target.value },
                                }))
                              }
                            />
                          </div>
                        </div>
                      </div>
                      <div className="sm:col-span-2">
                        <button
                          type="button"
                          disabled={savingReminderId === item.id}
                          onClick={() => void saveServiceReminders(item.id)}
                          className="rounded-lg bg-[#14B8A6] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#119f8e] disabled:opacity-50"
                        >
                          {savingReminderId === item.id ? 'Saving…' : 'Save reminder settings'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
