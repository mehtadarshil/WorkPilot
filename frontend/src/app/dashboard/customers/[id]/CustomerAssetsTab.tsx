'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { deleteRequest, getJson, patchJson, postJson } from '../../../apiClient';
import { Plus, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Asset {
  id: number;
  customer_id: number;
  asset_group: string;
  asset_type: string | null;
  description: string;
  make: string | null;
  model: string | null;
  serial_number: string | null;
  photo_url: string | null;
  barcode: string | null;
  installed_by_us: boolean;
  under_warranty: boolean;
  is_functioning: string | null;
  location: string | null;
}

interface Props {
  customerId: string;
  workAddressId?: string;
}

type AssetForm = {
  asset_group: string;
  asset_type: string;
  description: string;
  make: string;
  model: string;
  serial_number: string;
  photo_url: string;
  barcode: string;
  installed_by_us: boolean;
  under_warranty: boolean;
  is_functioning: string;
  location: string;
};

const emptyForm: AssetForm = {
  asset_group: 'Audio',
  asset_type: '',
  description: '',
  make: '',
  model: '',
  serial_number: '',
  photo_url: '',
  barcode: '',
  installed_by_us: false,
  under_warranty: false,
  is_functioning: '',
  location: '',
};

const ASSET_GROUPS = ['Audio', 'Audio Visual', 'Electrical', 'HVAC', 'Fire', 'Security', 'Other'];
const FUNCTIONING_OPTIONS = ['Yes', 'No', 'Unknown'];

export default function CustomerAssetsTab({ customerId, workAddressId }: Props) {
  const router = useRouter();
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;
  const [assets, setAssets] = useState<Asset[]>([]);
  const [search, setSearch] = useState('');
  const [groupBy, setGroupBy] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openModal, setOpenModal] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [form, setForm] = useState<AssetForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchAssets = useCallback(async () => {
    if (!token || !customerId) return;
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (search.trim()) q.set('search', search.trim());
      if (groupBy) q.set('group_by', groupBy);
      if (workAddressId) q.set('work_address_id', workAddressId);
      const res = await getJson<{ assets: Asset[] }>(`/customers/${customerId}/assets${q.toString() ? `?${q.toString()}` : ''}`, token);
      setAssets(res.assets || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assets');
    } finally {
      setLoading(false);
    }
  }, [token, customerId, search, groupBy, workAddressId]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const startCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpenModal(true);
  };

  const startEdit = (asset: Asset) => {
    setEditing(asset);
    setForm({
      asset_group: asset.asset_group || 'Audio',
      asset_type: asset.asset_type || '',
      description: asset.description || '',
      make: asset.make || '',
      model: asset.model || '',
      serial_number: asset.serial_number || '',
      photo_url: asset.photo_url || '',
      barcode: asset.barcode || '',
      installed_by_us: asset.installed_by_us,
      under_warranty: asset.under_warranty,
      is_functioning: asset.is_functioning || '',
      location: asset.location || '',
    });
    setOpenModal(true);
  };

  const saveAsset = async () => {
    if (!token) return;
    if (!form.asset_group.trim() || !form.description.trim()) {
      setError('Asset group and description are required');
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      asset_group: form.asset_group.trim(),
      asset_type: form.asset_type.trim() || null,
      description: form.description.trim(),
      make: form.make.trim() || null,
      model: form.model.trim() || null,
      serial_number: form.serial_number.trim() || null,
      photo_url: form.photo_url.trim() || null,
      barcode: form.barcode.trim() || null,
      installed_by_us: form.installed_by_us,
      under_warranty: form.under_warranty,
      is_functioning: form.is_functioning.trim() || null,
      location: form.location.trim() || null,
    };
    try {
      if (editing) {
        await patchJson(`/customers/${customerId}/assets/${editing.id}`, payload, token);
      } else {
        await postJson(`/customers/${customerId}/assets`, payload, token);
      }
      setOpenModal(false);
      setEditing(null);
      setForm(emptyForm);
      fetchAssets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save asset');
    } finally {
      setSaving(false);
    }
  };

  const removeAsset = async (id: number) => {
    if (!token) return;
    if (!window.confirm('Delete this asset?')) return;
    try {
      await deleteRequest(`/customers/${customerId}/assets/${id}`, token);
      fetchAssets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete asset');
    }
  };

  const grouped = useMemo(() => {
    if (groupBy !== 'group') return [{ key: 'all', label: 'Asset list', rows: assets }];
    const map: Record<string, Asset[]> = {};
    assets.forEach((a) => {
      const k = a.asset_group || 'Other';
      if (!map[k]) map[k] = [];
      map[k].push(a);
    });
    return Object.keys(map).map((k) => ({ key: k, label: `${k} assets`, rows: map[k] }));
  }, [assets, groupBy]);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]" />
          </div>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]">
            <option value="">Group by</option>
            <option value="group">Asset group</option>
          </select>
          <button onClick={fetchAssets} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Search</button>
          <button onClick={startCreate} className="inline-flex items-center gap-2 rounded-lg bg-[#14B8A6] px-3 py-2 text-sm font-semibold text-white hover:bg-[#119f90]">
            <Plus className="size-4" />
            Add new asset
          </button>
        </div>
      </div>

      {grouped.map((section) => (
        <div key={section.key} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3 text-sm font-semibold text-slate-900">{section.label}</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">Asset group</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">Asset type</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">Description</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">Make</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">Model</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {loading ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Loading assets...</td></tr>
                ) : section.rows.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No assets found.</td></tr>
                ) : (
                  section.rows.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3">{a.asset_group}</td>
                      <td className="px-4 py-3">{a.asset_type || '-'}</td>
                      <td className="px-4 py-3">{a.description}</td>
                      <td className="px-4 py-3">{a.make || '-'}</td>
                      <td className="px-4 py-3">{a.model || '-'}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => router.push(`/dashboard/customers/${customerId}/assets/${a.id}`)} className="font-semibold text-[#14B8A6] hover:underline">View</button>
                        <button onClick={() => startEdit(a)} className="ml-3 font-semibold text-[#14B8A6] hover:underline">Edit</button>
                        <button onClick={() => removeAsset(a.id)} className="ml-3 font-semibold text-rose-600 hover:underline">Delete</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-2 text-xs text-slate-500">
            <span>Showing {section.rows.length === 0 ? 0 : 1} to {section.rows.length} of {section.rows.length} entries</span>
            <span>Manage customer assets inventory</span>
          </div>
        </div>
      ))}

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div>}

      {openModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => !saving && setOpenModal(false)}>
          <div className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-slate-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-slate-900">{editing ? 'Edit asset' : 'Add asset'}</h3>
            </div>
            <div className="space-y-5 p-6">
              <div className="rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">Add asset</div>
                <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
                  <div className="grid grid-cols-[130px_1fr] items-center gap-2">
                    <label className="text-sm text-slate-600">Asset group *</label>
                    <select value={form.asset_group} onChange={(e) => setForm((f) => ({ ...f, asset_group: e.target.value }))} className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]">
                      {ASSET_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">Asset details</div>
                <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
                  <div className="md:col-span-2 grid grid-cols-[130px_1fr] items-center gap-2">
                    <label className="text-sm text-slate-600">Description *</label>
                    <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                  </div>
                  <div className="grid grid-cols-[130px_1fr] items-center gap-2">
                    <label className="text-sm text-slate-600">Make</label>
                    <input value={form.make} onChange={(e) => setForm((f) => ({ ...f, make: e.target.value }))} className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                  </div>
                  <div className="grid grid-cols-[130px_1fr] items-center gap-2">
                    <label className="text-sm text-slate-600">Model</label>
                    <input value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                  </div>
                  <div className="grid grid-cols-[130px_1fr] items-center gap-2">
                    <label className="text-sm text-slate-600">Asset type</label>
                    <input value={form.asset_type} onChange={(e) => setForm((f) => ({ ...f, asset_type: e.target.value }))} className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                  </div>
                  <div className="grid grid-cols-[130px_1fr] items-center gap-2">
                    <label className="text-sm text-slate-600">Serial number</label>
                    <input value={form.serial_number} onChange={(e) => setForm((f) => ({ ...f, serial_number: e.target.value }))} className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                  </div>
                  <div className="grid grid-cols-[130px_1fr] items-center gap-2">
                    <label className="text-sm text-slate-600">Photo URL</label>
                    <input value={form.photo_url} onChange={(e) => setForm((f) => ({ ...f, photo_url: e.target.value }))} className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                  </div>
                  <div className="grid grid-cols-[130px_1fr] items-center gap-2">
                    <label className="text-sm text-slate-600">Barcode</label>
                    <input value={form.barcode} onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))} className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                  </div>
                  <div className="grid grid-cols-[130px_1fr] items-center gap-2">
                    <label className="text-sm text-slate-600">Is the asset functioning?</label>
                    <select value={form.is_functioning} onChange={(e) => setForm((f) => ({ ...f, is_functioning: e.target.value }))} className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]">
                      <option value="">-- Please choose --</option>
                      {FUNCTIONING_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-[130px_1fr] items-center gap-2">
                    <label className="text-sm text-slate-600">Location</label>
                    <input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                  </div>
                  <div className="md:col-span-2 flex flex-wrap gap-5 pt-2">
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={form.installed_by_us} onChange={(e) => setForm((f) => ({ ...f, installed_by_us: e.target.checked }))} className="rounded text-[#14B8A6]" />
                      Did you install this asset?
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={form.under_warranty} onChange={(e) => setForm((f) => ({ ...f, under_warranty: e.target.checked }))} className="rounded text-[#14B8A6]" />
                      Is this asset under warranty?
                    </label>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
              <button onClick={() => setOpenModal(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              <button onClick={saveAsset} disabled={saving} className="rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#119f90] disabled:opacity-50">
                {saving ? 'Saving...' : editing ? 'Update asset' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
