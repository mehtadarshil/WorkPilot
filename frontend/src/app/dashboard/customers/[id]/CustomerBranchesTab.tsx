'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search, Plus, Trash2, Edit } from 'lucide-react';
import { deleteRequest, getJson, patchJson, postJson } from '../../../apiClient';

interface Branch {
  id: number;
  customer_id: number;
  branch_name: string;
  address_line_1: string;
  address_line_2: string | null;
  address_line_3: string | null;
  town: string | null;
  county: string | null;
  postcode: string | null;
}

interface BranchesResponse {
  branches: Branch[];
}

interface Props {
  customerId: string;
}

const COUNTY_OPTIONS = [
  'Bedfordshire', 'Berkshire', 'Bristol', 'Buckinghamshire', 'Cambridgeshire', 'Cheshire', 'Cornwall',
  'Cumbria', 'Derbyshire', 'Devon', 'Dorset', 'Durham', 'East Sussex', 'Essex', 'Gloucestershire',
  'Greater London', 'Greater Manchester', 'Hampshire', 'Herefordshire', 'Hertfordshire', 'Isle of Wight',
  'Kent', 'Lancashire', 'Leicestershire', 'Lincolnshire', 'Merseyside', 'Norfolk', 'North Yorkshire',
  'Northamptonshire', 'Northumberland', 'Nottinghamshire', 'Oxfordshire', 'Shropshire', 'Somerset',
  'South Yorkshire', 'Staffordshire', 'Suffolk', 'Surrey', 'Tyne and Wear', 'Warwickshire', 'West Midlands',
  'West Sussex', 'West Yorkshire', 'Wiltshire', 'Worcestershire',
];

type BranchForm = {
  branch_name: string;
  address_line_1: string;
  address_line_2: string;
  address_line_3: string;
  town: string;
  county: string;
  postcode: string;
};

const emptyForm: BranchForm = {
  branch_name: '',
  address_line_1: '',
  address_line_2: '',
  address_line_3: '',
  town: '',
  county: '',
  postcode: '',
};

export default function CustomerBranchesTab({ customerId }: Props) {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;
  const [branches, setBranches] = useState<Branch[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openModal, setOpenModal] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [form, setForm] = useState<BranchForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchBranches = useCallback(async () => {
    if (!token || !customerId) return;
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (search.trim()) q.set('search', search.trim());
      const res = await getJson<BranchesResponse>(`/customers/${customerId}/branches${q.toString() ? `?${q.toString()}` : ''}`, token);
      setBranches(res.branches || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load branches');
    } finally {
      setLoading(false);
    }
  }, [token, customerId, search]);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  const startCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpenModal(true);
  };

  const startEdit = (b: Branch) => {
    setEditing(b);
    setForm({
      branch_name: b.branch_name || '',
      address_line_1: b.address_line_1 || '',
      address_line_2: b.address_line_2 || '',
      address_line_3: b.address_line_3 || '',
      town: b.town || '',
      county: b.county || '',
      postcode: b.postcode || '',
    });
    setOpenModal(true);
  };

  const saveBranch = async () => {
    if (!token) return;
    if (!form.branch_name.trim() || !form.address_line_1.trim()) {
      setError('Branch name and Address line 1 are required');
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      branch_name: form.branch_name.trim(),
      address_line_1: form.address_line_1.trim(),
      address_line_2: form.address_line_2.trim() || null,
      address_line_3: form.address_line_3.trim() || null,
      town: form.town.trim() || null,
      county: form.county.trim() || null,
      postcode: form.postcode.trim() || null,
    };
    try {
      if (editing) {
        await patchJson(`/customers/${customerId}/branches/${editing.id}`, payload, token);
      } else {
        await postJson(`/customers/${customerId}/branches`, payload, token);
      }
      setOpenModal(false);
      setEditing(null);
      setForm(emptyForm);
      fetchBranches();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save branch');
    } finally {
      setSaving(false);
    }
  };

  const removeBranch = async (id: number) => {
    if (!token) return;
    if (!window.confirm('Delete this branch?')) return;
    setError(null);
    try {
      await deleteRequest(`/customers/${customerId}/branches/${id}`, token);
      fetchBranches();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete branch');
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search branches" className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]" />
          </div>
          <button onClick={fetchBranches} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Search</button>
          <button onClick={startCreate} className="inline-flex items-center gap-2 rounded-lg bg-[#14B8A6] px-3 py-2 text-sm font-semibold text-white hover:bg-[#119f90]">
            <Plus className="size-4" />
            Add new branch
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-4 py-3">
          <span className="text-sm font-semibold text-slate-900">Branches</span>
          <span className="rounded-full bg-[#14B8A6]/10 px-2.5 py-0.5 text-xs font-semibold text-[#14B8A6]">{branches.length} branches</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">Branch name</th>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">Address line 1</th>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">Address line 2</th>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">Address line 3</th>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">Town</th>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">City</th>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">Postcode</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">Loading branches...</td></tr>
              ) : branches.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No branches found.</td></tr>
              ) : (
                branches.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-medium text-slate-900">{b.branch_name}</td>
                    <td className="px-4 py-3">{b.address_line_1}</td>
                    <td className="px-4 py-3">{b.address_line_2 || '-'}</td>
                    <td className="px-4 py-3">{b.address_line_3 || '-'}</td>
                    <td className="px-4 py-3">{b.town || '-'}</td>
                    <td className="px-4 py-3">{b.county || '-'}</td>
                    <td className="px-4 py-3">{b.postcode || '-'}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => startEdit(b)} className="inline-flex items-center gap-1 font-semibold text-[#14B8A6] hover:underline"><Edit className="size-3.5" /> Edit</button>
                      <button onClick={() => removeBranch(b.id)} className="ml-3 inline-flex items-center gap-1 font-semibold text-rose-600 hover:underline"><Trash2 className="size-3.5" /> Delete</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-2 text-xs text-slate-500">
          <span>Showing {branches.length === 0 ? 0 : 1} to {branches.length} of {branches.length} entries</span>
          <span>Manage customer locations and branch addresses</span>
        </div>
      </div>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div>}

      {openModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => !saving && setOpenModal(false)}>
          <div className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-slate-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-slate-900">{editing ? 'Edit branch' : 'Add new branch'}</h3>
            </div>
            <div className="space-y-5 p-6">
              <div className="rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">Branch details</div>
                <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
                  <div className="md:col-span-2 grid grid-cols-[130px_1fr] items-center gap-2">
                    <label className="text-sm text-slate-600">Branch name *</label>
                    <input value={form.branch_name} onChange={(e) => setForm((f) => ({ ...f, branch_name: e.target.value }))} className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                  </div>
                  <div className="md:col-span-2 grid grid-cols-[130px_1fr] items-center gap-2">
                    <label className="text-sm text-slate-600">Address line 1 *</label>
                    <input value={form.address_line_1} onChange={(e) => setForm((f) => ({ ...f, address_line_1: e.target.value }))} className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                  </div>
                  <div className="md:col-span-2 grid grid-cols-[130px_1fr] items-center gap-2">
                    <label className="text-sm text-slate-600">Address line 2</label>
                    <input value={form.address_line_2} onChange={(e) => setForm((f) => ({ ...f, address_line_2: e.target.value }))} className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                  </div>
                  <div className="md:col-span-2 grid grid-cols-[130px_1fr] items-center gap-2">
                    <label className="text-sm text-slate-600">Address line 3</label>
                    <input value={form.address_line_3} onChange={(e) => setForm((f) => ({ ...f, address_line_3: e.target.value }))} className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                  </div>
                  <div className="grid grid-cols-[130px_1fr] items-center gap-2">
                    <label className="text-sm text-slate-600">Town</label>
                    <input value={form.town} onChange={(e) => setForm((f) => ({ ...f, town: e.target.value }))} className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                  </div>
                  <div className="grid grid-cols-[130px_1fr] items-center gap-2">
                    <label className="text-sm text-slate-600">City</label>
                    <select value={form.county} onChange={(e) => setForm((f) => ({ ...f, county: e.target.value }))} className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]">
                      <option value="">-- Please choose --</option>
                      {COUNTY_OPTIONS.map((county) => <option key={county} value={county}>{county}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-[130px_1fr] items-center gap-2">
                    <label className="text-sm text-slate-600">Postcode</label>
                    <input value={form.postcode} onChange={(e) => setForm((f) => ({ ...f, postcode: e.target.value }))} className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
              <button onClick={() => setOpenModal(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              <button onClick={saveBranch} disabled={saving} className="rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#119f90] disabled:opacity-50">
                {saving ? 'Saving...' : editing ? 'Update branch' : 'Save branch'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
