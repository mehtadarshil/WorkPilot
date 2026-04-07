'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteRequest, getJson, patchJson, postJson } from '../../../apiClient';
import { Plus, Search } from 'lucide-react';

interface WorkAddress {
  id: number;
  customer_id: number;
  name: string;
  branch_name: string | null;
  landlord: string | null;
  title: string | null;
  first_name: string | null;
  surname: string | null;
  company_name: string | null;
  address_line_1: string;
  address_line_2: string | null;
  address_line_3: string | null;
  town: string | null;
  county: string | null;
  postcode: string | null;
  landline: string | null;
  mobile: string | null;
  email: string | null;
  prefers_phone: boolean;
  prefers_sms: boolean;
  prefers_email: boolean;
  prefers_letter: boolean;
  uprn: string | null;
  is_active: boolean;
}

interface Branch {
  id: number;
  branch_name: string;
}

interface Props {
  customerId: string;
}

type WorkAddressForm = {
  name: string;
  branch_name: string;
  landlord: string;
  title: string;
  first_name: string;
  surname: string;
  company_name: string;
  address_line_1: string;
  address_line_2: string;
  address_line_3: string;
  town: string;
  county: string;
  postcode: string;
  landline: string;
  mobile: string;
  email: string;
  prefers_phone: boolean;
  prefers_sms: boolean;
  prefers_email: boolean;
  prefers_letter: boolean;
  uprn: string;
  is_active: boolean;
};

const emptyForm: WorkAddressForm = {
  name: '',
  branch_name: '',
  landlord: '',
  title: 'Mr',
  first_name: '',
  surname: '',
  company_name: '',
  address_line_1: '',
  address_line_2: '',
  address_line_3: '',
  town: '',
  county: '',
  postcode: '',
  landline: '',
  mobile: '',
  email: '',
  prefers_phone: false,
  prefers_sms: false,
  prefers_email: false,
  prefers_letter: false,
  uprn: '',
  is_active: true,
};

export default function CustomerWorkAddressTab({ customerId }: Props) {
  const router = useRouter();
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;
  const [rows, setRows] = useState<WorkAddress[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'active' | 'dormant'>('active');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openModal, setOpenModal] = useState(false);
  const [editing, setEditing] = useState<WorkAddress | null>(null);
  const [form, setForm] = useState<WorkAddressForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchRows = useCallback(async () => {
    if (!token || !customerId) return;
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (search.trim()) q.set('search', search.trim());
      q.set('status', status);
      const res = await getJson<{ work_addresses: WorkAddress[] }>(`/customers/${customerId}/work-addresses?${q.toString()}`, token);
      setRows(res.work_addresses || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load work addresses');
    } finally {
      setLoading(false);
    }
  }, [token, customerId, search, status]);

  const fetchBranches = useCallback(async () => {
    if (!token || !customerId) return;
    try {
      const res = await getJson<{ branches: Branch[] }>(`/customers/${customerId}/branches`, token);
      setBranches(res.branches || []);
    } catch {
      setBranches([]);
    }
  }, [token, customerId]);

  useEffect(() => {
    fetchRows();
    fetchBranches();
  }, [fetchRows, fetchBranches]);

  const startCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpenModal(true);
  };

  const startEdit = (row: WorkAddress) => {
    setEditing(row);
    setForm({
      name: row.name || '',
      branch_name: row.branch_name || '',
      landlord: row.landlord || '',
      title: row.title || 'Mr',
      first_name: row.first_name || '',
      surname: row.surname || '',
      company_name: row.company_name || '',
      address_line_1: row.address_line_1 || '',
      address_line_2: row.address_line_2 || '',
      address_line_3: row.address_line_3 || '',
      town: row.town || '',
      county: row.county || '',
      postcode: row.postcode || '',
      landline: row.landline || '',
      mobile: row.mobile || '',
      email: row.email || '',
      prefers_phone: row.prefers_phone,
      prefers_sms: row.prefers_sms,
      prefers_email: row.prefers_email,
      prefers_letter: row.prefers_letter,
      uprn: row.uprn || '',
      is_active: row.is_active,
    });
    setOpenModal(true);
  };

  const payloadFromForm = {
    name: form.name.trim(),
    branch_name: form.branch_name.trim() || null,
    landlord: form.landlord.trim() || null,
    title: form.title.trim() || null,
    first_name: form.first_name.trim() || null,
    surname: form.surname.trim() || null,
    company_name: form.company_name.trim() || null,
    address_line_1: form.address_line_1.trim(),
    address_line_2: form.address_line_2.trim() || null,
    address_line_3: form.address_line_3.trim() || null,
    town: form.town.trim() || null,
    county: form.county.trim() || null,
    postcode: form.postcode.trim() || null,
    landline: form.landline.trim() || null,
    mobile: form.mobile.trim() || null,
    email: form.email.trim() || null,
    prefers_phone: form.prefers_phone,
    prefers_sms: form.prefers_sms,
    prefers_email: form.prefers_email,
    prefers_letter: form.prefers_letter,
    uprn: form.uprn.trim() || null,
    is_active: form.is_active,
  };

  const saveRow = async () => {
    if (!token) return;
    if (!payloadFromForm.name || !payloadFromForm.address_line_1) {
      setError('Name and Address line 1 are required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await patchJson(`/customers/${customerId}/work-addresses/${editing.id}`, payloadFromForm, token);
      } else {
        await postJson(`/customers/${customerId}/work-addresses`, payloadFromForm, token);
      }
      setOpenModal(false);
      setEditing(null);
      setForm(emptyForm);
      fetchRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save work address');
    } finally {
      setSaving(false);
    }
  };

  const removeRow = async (id: number) => {
    if (!token) return;
    if (!window.confirm('Delete this work address?')) return;
    try {
      await deleteRequest(`/customers/${customerId}/work-addresses/${id}`, token);
      fetchRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete work address');
    }
  };

  const countLabel = useMemo(() => `${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}`, [rows.length]);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]" />
          </div>
          <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-1">
            <span className="px-2 text-xs font-semibold text-slate-500">Quick filter:</span>
            <button onClick={() => setStatus('active')} className={`rounded px-3 py-1 text-sm font-medium ${status === 'active' ? 'bg-white text-[#14B8A6] shadow-sm border border-slate-200' : 'text-slate-600'}`}>Active Work address</button>
            <button onClick={() => setStatus('dormant')} className={`rounded px-3 py-1 text-sm font-medium ${status === 'dormant' ? 'bg-white text-[#14B8A6] shadow-sm border border-slate-200' : 'text-slate-600'}`}>Dormant Work address</button>
          </div>
          <button onClick={fetchRows} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Search</button>
          <button onClick={startCreate} className="inline-flex items-center gap-2 rounded-lg bg-[#14B8A6] px-3 py-2 text-sm font-semibold text-white hover:bg-[#119f90]">
            <Plus className="size-4" />
            Add new Work address
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3 text-sm font-semibold text-slate-900">Active Work address</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">Name</th>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">Address line 1</th>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">Address line 2</th>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">Town</th>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">City</th>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">Postcode</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Loading work addresses...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No work addresses found.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-medium text-slate-900">{r.name}</td>
                    <td className="px-4 py-3">{r.address_line_1}</td>
                    <td className="px-4 py-3">{r.address_line_2 || '-'}</td>
                    <td className="px-4 py-3">{r.town || '-'}</td>
                    <td className="px-4 py-3">{r.county || '-'}</td>
                    <td className="px-4 py-3">{r.postcode || '-'}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          router.push(
                            `/dashboard/customers/${customerId}?work_address_id=${r.id}`,
                          )
                        }
                        className="font-semibold text-[#14B8A6] hover:underline"
                      >
                        View
                      </button>
                      <button onClick={() => startEdit(r)} className="ml-3 font-semibold text-[#14B8A6] hover:underline">Edit</button>
                      <button onClick={() => removeRow(r.id)} className="ml-3 font-semibold text-rose-600 hover:underline">Delete</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-2 text-xs text-slate-500">
          <span>Showing {rows.length === 0 ? 0 : 1} to {rows.length} of {countLabel}</span>
          <span>Manage active and dormant work addresses</span>
        </div>
      </div>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div>}

      {openModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => !saving && setOpenModal(false)}>
          <div className="w-full max-w-5xl rounded-2xl border border-slate-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-slate-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-slate-900">{editing ? 'Edit Work address' : 'Add new Work address'}</h3>
            </div>
            <div className="space-y-5 p-6">
              <div className="rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">Add new Work address</div>
                <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
                  <div className="grid grid-cols-[130px_1fr] items-center gap-2">
                    <label className="text-sm text-slate-600">Branch</label>
                    <select value={form.branch_name} onChange={(e) => setForm((f) => ({ ...f, branch_name: e.target.value }))} className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]">
                      <option value="">Please Enter Branch</option>
                      {branches.map((b) => <option key={b.id} value={b.branch_name}>{b.branch_name}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-[130px_1fr] items-center gap-2">
                    <label className="text-sm text-slate-600">Landlord</label>
                    <input value={form.landlord} onChange={(e) => setForm((f) => ({ ...f, landlord: e.target.value }))} placeholder="Please Enter Landlord" className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">Address</div>
                <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
                  <div className="grid grid-cols-[130px_1fr] items-center gap-2">
                    <label className="text-sm text-slate-600">Name *</label>
                    <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                  </div>
                  <div className="grid grid-cols-[130px_1fr] items-center gap-2">
                    <label className="text-sm text-slate-600">Address line 1 *</label>
                    <input value={form.address_line_1} onChange={(e) => setForm((f) => ({ ...f, address_line_1: e.target.value }))} className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                  </div>
                  <div className="grid grid-cols-[130px_1fr] items-center gap-2">
                    <label className="text-sm text-slate-600">Title</label>
                    <select value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]">
                      <option>Mr</option><option>Mrs</option><option>Ms</option><option>Dr</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-[130px_1fr] items-center gap-2">
                    <label className="text-sm text-slate-600">Address line 2</label>
                    <input value={form.address_line_2} onChange={(e) => setForm((f) => ({ ...f, address_line_2: e.target.value }))} className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                  </div>
                  <div className="grid grid-cols-[130px_1fr] items-center gap-2">
                    <label className="text-sm text-slate-600">Name</label>
                    <input value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                  </div>
                  <div className="grid grid-cols-[130px_1fr] items-center gap-2">
                    <label className="text-sm text-slate-600">Address line 3</label>
                    <input value={form.address_line_3} onChange={(e) => setForm((f) => ({ ...f, address_line_3: e.target.value }))} className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                  </div>
                  <div className="grid grid-cols-[130px_1fr] items-center gap-2">
                    <label className="text-sm text-slate-600">Surname</label>
                    <input value={form.surname} onChange={(e) => setForm((f) => ({ ...f, surname: e.target.value }))} className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                  </div>
                  <div className="grid grid-cols-[130px_1fr] items-center gap-2">
                    <label className="text-sm text-slate-600">Town</label>
                    <input value={form.town} onChange={(e) => setForm((f) => ({ ...f, town: e.target.value }))} className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                  </div>
                  <div className="grid grid-cols-[130px_1fr] items-center gap-2">
                    <label className="text-sm text-slate-600">Company name</label>
                    <input value={form.company_name} onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))} className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                  </div>
                  <div className="grid grid-cols-[130px_1fr] items-center gap-2">
                    <label className="text-sm text-slate-600">City</label>
                    <input value={form.county} onChange={(e) => setForm((f) => ({ ...f, county: e.target.value }))} className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                  </div>
                  <div className="grid grid-cols-[130px_1fr] items-center gap-2">
                    <label className="text-sm text-slate-600">Landline</label>
                    <input value={form.landline} onChange={(e) => setForm((f) => ({ ...f, landline: e.target.value }))} className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                  </div>
                  <div className="grid grid-cols-[130px_1fr] items-center gap-2">
                    <label className="text-sm text-slate-600">Postcode</label>
                    <input value={form.postcode} onChange={(e) => setForm((f) => ({ ...f, postcode: e.target.value }))} className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                  </div>
                  <div className="grid grid-cols-[130px_1fr] items-center gap-2">
                    <label className="text-sm text-slate-600">Mobile</label>
                    <input value={form.mobile} onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value }))} className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                  </div>
                  <div className="grid grid-cols-[130px_1fr] items-center gap-2">
                    <label className="text-sm text-slate-600">Email</label>
                    <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="mb-3 text-sm font-semibold text-slate-700">Communication rules</div>
                <div className="flex flex-wrap gap-5 text-sm text-slate-700">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={form.prefers_phone} onChange={(e) => setForm((f) => ({ ...f, prefers_phone: e.target.checked }))} className="rounded text-[#14B8A6]" /> Phone call</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={form.prefers_sms} onChange={(e) => setForm((f) => ({ ...f, prefers_sms: e.target.checked }))} className="rounded text-[#14B8A6]" /> SMS</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={form.prefers_email} onChange={(e) => setForm((f) => ({ ...f, prefers_email: e.target.checked }))} className="rounded text-[#14B8A6]" /> Email</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={form.prefers_letter} onChange={(e) => setForm((f) => ({ ...f, prefers_letter: e.target.checked }))} className="rounded text-[#14B8A6]" /> Letter</label>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="grid grid-cols-[130px_1fr] items-center gap-2">
                  <label className="text-sm text-slate-600">UPRN</label>
                  <input value={form.uprn} onChange={(e) => setForm((f) => ({ ...f, uprn: e.target.value }))} className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                </div>
              </div>
            </div>
            <div className="flex justify-between gap-2 border-t border-slate-200 px-6 py-4">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} className="rounded text-[#14B8A6]" />
                Active work address
              </label>
              <div className="flex gap-2">
                <button onClick={() => setOpenModal(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
                <button onClick={saveRow} disabled={saving} className="rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#119f90] disabled:opacity-50">
                  {saving ? 'Saving...' : editing ? 'Update Work address' : 'Add Work address'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
