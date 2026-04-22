'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getJson, postJson, patchJson, deleteRequest } from '../../../apiClient';
import SearchableSelect, { type SearchableSelectOption } from '../../SearchableSelect';
import {
  Package,
  Plus,
  Search,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  X,
  Layers,
} from 'lucide-react';
import dayjs from 'dayjs';
import advancedFormat from 'dayjs/plugin/advancedFormat';

dayjs.extend(advancedFormat);

const STATUSES = [
  { key: 'requested', label: 'Requested', dot: 'bg-sky-500' },
  { key: 'on_order', label: 'On order', dot: 'bg-sky-300' },
  { key: 'available', label: 'Available', dot: 'bg-emerald-500' },
  { key: 'picked_up', label: 'Picked up', dot: 'bg-emerald-600' },
  { key: 'installed', label: 'Installed', dot: 'bg-slate-500' },
  { key: 'cancelled', label: 'Cancelled', dot: 'bg-rose-500' },
  { key: 'returned', label: 'Returned', dot: 'bg-amber-700' },
] as const;

const VAT_OPTIONS = [0, 5, 20];

export type JobPartRow = {
  id: number;
  part_name: string;
  mpn: string | null;
  quantity: number;
  fulfillment_type: string | null;
  status: string;
  unit_cost_price: number;
  markup_pct: number;
  vat_rate: number;
  unit_sell_price: number;
  created_at: string;
  created_by_name: string;
};

interface Props {
  jobId: string;
}

const PAGE_SIZE = 15;

function formatMoney(n: number): string {
  return `£${Number(n).toFixed(2)}`;
}

export default function JobPartsTab({ jobId }: Props) {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;
  const [parts, setParts] = useState<JobPartRow[]>([]);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [catalogOptions, setCatalogOptions] = useState<SearchableSelectOption[]>([]);
  const [selectedCatalogId, setSelectedCatalogId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitCost, setUnitCost] = useState('');
  const [markup, setMarkup] = useState('0');
  const [vatRate, setVatRate] = useState('20');
  const [fulfillment, setFulfillment] = useState('');
  const [savingPart, setSavingPart] = useState(false);

  const [showNewCatalog, setShowNewCatalog] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatMpn, setNewCatMpn] = useState('');
  const [newCatCost, setNewCatCost] = useState('0');
  const [newCatMarkup, setNewCatMarkup] = useState('0');
  const [newCatVat, setNewCatVat] = useState('20');

  const [editing, setEditing] = useState<JobPartRow | null>(null);

  const [kitDrawer, setKitDrawer] = useState(false);
  const [kits, setKits] = useState<{ id: number; name: string; item_count: number }[]>([]);
  const [kitSelect, setKitSelect] = useState('');
  const [kitPreview, setKitPreview] = useState<{ part_name: string; mpn: string | null; quantity: number }[]>([]);
  const [kitSaving, setKitSaving] = useState(false);

  const [showCreateKit, setShowCreateKit] = useState(false);
  const [newKitName, setNewKitName] = useState('');
  const [kitLines, setKitLines] = useState<
    { part_name: string; mpn: string; quantity: string; unit_cost: string; markup_pct: string; vat_rate: string }[]
  >([{ part_name: '', mpn: '', quantity: '1', unit_cost: '0', markup_pct: '0', vat_rate: '20' }]);

  const fetchParts = useCallback(async () => {
    if (!token || !jobId) return;
    setError(null);
    try {
      const q = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
      if (search.trim()) q.set('search', search.trim());
      if (statusFilter) q.set('status', statusFilter);
      const res = await getJson<{
        parts: JobPartRow[];
        total: number;
        status_counts: Record<string, number>;
      }>(`/jobs/${jobId}/parts?${q.toString()}`, token);
      setParts(res.parts || []);
      setTotal(res.total ?? 0);
      setStatusCounts(res.status_counts || {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load parts');
    }
  }, [token, jobId, search, statusFilter, page]);

  useEffect(() => {
    fetchParts();
  }, [fetchParts]);

  const loadCatalog = useCallback(async () => {
    if (!token) return;
    try {
      const res = await getJson<{ parts: { id: number; name: string; mpn: string | null; default_unit_cost: number; default_markup_pct: number; default_vat_rate: number }[] }>(
        '/part-catalog?limit=200',
        token,
      );
      setCatalogOptions(
        (res.parts || []).map((p) => ({
          value: String(p.id),
          label: p.name,
          hint: p.mpn ? `MPN ${p.mpn}` : undefined,
        })),
      );
    } catch {
      setCatalogOptions([]);
    }
  }, [token]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const loadKits = useCallback(async () => {
    if (!token) return;
    try {
      const res = await getJson<{ kits: { id: number; name: string; item_count: number }[] }>('/part-kits', token);
      setKits(res.kits || []);
    } catch {
      setKits([]);
    }
  }, [token]);

  useEffect(() => {
    if (kitDrawer) void loadKits();
  }, [kitDrawer, loadKits]);

  useEffect(() => {
    const run = async () => {
      if (!token || !kitSelect) {
        setKitPreview([]);
        return;
      }
      try {
        const res = await getJson<{ kit: { items: { part_name: string; mpn: string | null; quantity: number }[] } }>(
          `/part-kits/${kitSelect}`,
          token,
        );
        setKitPreview(res.kit?.items || []);
      } catch {
        setKitPreview([]);
      }
    };
    void run();
  }, [kitSelect, token]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const resetAddForm = () => {
    setSelectedCatalogId('');
    setQuantity('1');
    setUnitCost('');
    setMarkup('0');
    setVatRate('20');
    setFulfillment('');
  };

  const savePart = async () => {
    if (!token) return;
    setSavingPart(true);
    setError(null);
    try {
      if (editing) {
        await patchJson(
          `/jobs/${jobId}/parts/${editing.id}`,
          {
            quantity: parseFloat(quantity) || 1,
            unit_cost_price: parseFloat(unitCost) || 0,
            markup_pct: parseFloat(markup) || 0,
            vat_rate: parseFloat(vatRate) || 20,
            fulfillment_type: fulfillment.trim() || null,
          },
          token,
        );
        setEditing(null);
      } else {
        if (!selectedCatalogId) {
          setError('Select a part from the catalogue or add a new catalogue entry first.');
          setSavingPart(false);
          return;
        }
        const body: Record<string, unknown> = {
          part_catalog_id: parseInt(selectedCatalogId, 10),
          quantity: parseFloat(quantity) || 1,
          fulfillment_type: fulfillment.trim() || null,
        };
        if (unitCost.trim() !== '') body.unit_cost_price = parseFloat(unitCost);
        if (markup.trim() !== '') body.markup_pct = parseFloat(markup);
        if (vatRate.trim() !== '') body.vat_rate = parseFloat(vatRate);
        await postJson(`/jobs/${jobId}/parts`, body, token);
      }
      resetAddForm();
      setPage(0);
      await fetchParts();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingPart(false);
    }
  };

  const createCatalogPart = async () => {
    if (!token || !newCatName.trim()) return;
    setError(null);
    try {
      const res = await postJson<{ part: { id: number } }>(
        '/part-catalog',
        {
          name: newCatName.trim(),
          mpn: newCatMpn.trim() || null,
          default_unit_cost: parseFloat(newCatCost) || 0,
          default_markup_pct: parseFloat(newCatMarkup) || 0,
          default_vat_rate: parseFloat(newCatVat) || 20,
        },
        token,
      );
      await loadCatalog();
      setSelectedCatalogId(String(res.part.id));
      setUnitCost(newCatCost);
      setMarkup(newCatMarkup);
      setVatRate(newCatVat);
      setShowNewCatalog(false);
      setNewCatName('');
      setNewCatMpn('');
      setNewCatCost('0');
      setNewCatMarkup('0');
      setNewCatVat('20');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create catalogue part');
    }
  };

  const applyKit = async () => {
    if (!token || !kitSelect) return;
    setKitSaving(true);
    setError(null);
    try {
      await postJson(`/jobs/${jobId}/parts/from-kit`, { kit_id: parseInt(kitSelect, 10) }, token);
      setKitDrawer(false);
      setKitSelect('');
      setKitPreview([]);
      setPage(0);
      await fetchParts();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add kit');
    } finally {
      setKitSaving(false);
    }
  };

  const createKit = async () => {
    if (!token || !newKitName.trim()) return;
    const items = kitLines
      .filter((l) => l.part_name.trim())
      .map((l) => ({
        part_name: l.part_name.trim(),
        mpn: l.mpn.trim() || null,
        quantity: parseFloat(l.quantity) || 1,
        unit_cost: parseFloat(l.unit_cost) || 0,
        markup_pct: parseFloat(l.markup_pct) || 0,
        vat_rate: parseFloat(l.vat_rate) || 20,
      }));
    if (items.length === 0) {
      setError('Add at least one line to the kit.');
      return;
    }
    setError(null);
    try {
      await postJson('/part-kits', { name: newKitName.trim(), items }, token);
      setShowCreateKit(false);
      setNewKitName('');
      setKitLines([{ part_name: '', mpn: '', quantity: '1', unit_cost: '0', markup_pct: '0', vat_rate: '20' }]);
      await loadKits();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create kit');
    }
  };

  const deletePart = async (p: JobPartRow) => {
    if (!token) return;
    if (!window.confirm(`Remove "${p.part_name}" from this job?`)) return;
    try {
      await deleteRequest(`/jobs/${jobId}/parts/${p.id}`, token);
      await fetchParts();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const updateStatus = async (p: JobPartRow, status: string) => {
    if (!token) return;
    try {
      await patchJson(`/jobs/${jobId}/parts/${p.id}`, { status }, token);
      await fetchParts();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    }
  };

  const startEdit = (p: JobPartRow) => {
    setEditing(p);
    setSelectedCatalogId('');
    setQuantity(String(p.quantity));
    setUnitCost(String(p.unit_cost_price));
    setMarkup(String(p.markup_pct));
    setVatRate(String(p.vat_rate));
    setFulfillment(p.fulfillment_type || '');
    void loadCatalog();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditing(null);
    resetAddForm();
  };

  const kitOptions: SearchableSelectOption[] = useMemo(
    () => kits.map((k) => ({ value: String(k.id), label: k.name, hint: `${k.item_count} line(s)` })),
    [kits],
  );

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="relative min-w-[200px] flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="Search parts"
              className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                void loadCatalog();
                setEditing(null);
                resetAddForm();
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-[#14B8A6] px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#119f90]"
            >
              <Plus className="size-4" />
              Add new part
            </button>
            <button
              type="button"
              onClick={() => {
                setKitDrawer(true);
                void loadKits();
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-[#14B8A6] bg-emerald-50/40 px-4 py-2.5 text-sm font-bold text-[#14B8A6] hover:bg-emerald-50"
            >
              <Layers className="size-4" />
              Add part kit
            </button>
            <button
              type="button"
              onClick={() => setShowCreateKit(true)}
              className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              New kit template
            </button>
          </div>
        </div>

        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Filter by status</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setStatusFilter('');
                setPage(0);
              }}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                !statusFilter ? 'border-[#14B8A6] bg-emerald-50 text-[#14B8A6]' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              All
            </button>
            {STATUSES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => {
                  setStatusFilter(statusFilter === s.key ? '' : s.key);
                  setPage(0);
                }}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  statusFilter === s.key ? 'border-[#14B8A6] bg-emerald-50 text-[#14B8A6]' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className={`size-2 rounded-full ${s.dot}`} />
                {s.label}
                {(statusCounts[s.key] ?? 0) > 0 && (
                  <span className="ml-0.5 rounded-full bg-slate-200 px-1.5 py-0 text-[10px] text-slate-700">{statusCounts[s.key]}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      )}

      {/* Add / edit form */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
          <Package className="size-5 text-[#14B8A6]" />
          <h2 className="text-base font-black tracking-tight text-slate-800">
            {editing ? 'Edit part line' : 'Add new part'}
          </h2>
          {editing && (
            <button type="button" onClick={cancelEdit} className="ml-auto text-sm font-bold text-slate-500 hover:text-slate-800">
              Cancel edit
            </button>
          )}
        </div>
        {!editing && (
          <p className="mb-4 text-xs text-slate-500">
            Choose a catalogue part (with optional defaults). Unit sell price is calculated from cost + markup. VAT is stored for invoicing.
          </p>
        )}
        {editing && (
          <p className="mb-4 text-xs text-slate-500">
            Editing <strong className="text-slate-800">{editing.part_name}</strong> — adjust quantities, costs, or status from the table.
          </p>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {!editing && (
            <div className="md:col-span-2">
              <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Part *</label>
              <div className="mt-1">
                <SearchableSelect
                  options={catalogOptions}
                  value={selectedCatalogId}
                  onChange={(v) => {
                    setSelectedCatalogId(v);
                  }}
                  searchPlaceholder="Search catalogue…"
                  emptyButtonLabel="Please select a part"
                  allowEmpty
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  void loadCatalog();
                  setShowNewCatalog(true);
                }}
                className="mt-2 text-xs font-bold text-[#14B8A6] hover:underline"
              >
                Add new catalogue part
              </button>
            </div>
          )}

          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Quantity *</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Unit cost (£) *</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
            />
            <p className="mt-1 text-[11px] leading-snug text-emerald-700/90">
              Cost can be updated later when linked to purchase orders or stock.
            </p>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Mark up (%) *</label>
            <input
              type="number"
              step="0.1"
              value={markup}
              onChange={(e) => setMarkup(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
            />
            <p className="mt-1 text-[11px] leading-snug text-emerald-700/90">Markup is applied on top of unit cost for sell price.</p>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-slate-600">VAT (%) *</label>
            <select
              value={vatRate}
              onChange={(e) => setVatRate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
            >
              {VAT_OPTIONS.map((v) => (
                <option key={v} value={String(v)}>
                  {v}%
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Fulfillment type</label>
            <input
              value={fulfillment}
              onChange={(e) => setFulfillment(e.target.value)}
              placeholder="e.g. Van stock, Supplier order"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          {editing && (
            <button type="button" onClick={cancelEdit} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
          )}
          <button
            type="button"
            disabled={savingPart || (!editing && !selectedCatalogId)}
            onClick={() => void savePart()}
            className="rounded-lg bg-[#14B8A6] px-5 py-2 text-sm font-black text-white shadow-sm hover:bg-[#119f90] disabled:opacity-50"
          >
            {savingPart ? 'Saving…' : editing ? 'Update part' : 'Save part'}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-4">
          <h3 className="text-sm font-black uppercase tracking-wide text-slate-800">All parts</h3>
          <p className="mt-1 text-xs text-slate-500">Change status from the dropdown on each row.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-[13px]">
            <thead className="border-b border-slate-100 bg-[#FBFCFD] text-[11px] font-black uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 w-10" />
                <th className="px-4 py-3">Part</th>
                <th className="px-4 py-3">MPN</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3">Fulfillment</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created by</th>
                <th className="px-4 py-3">Created on</th>
                <th className="px-4 py-3 text-right">Unit cost</th>
                <th className="px-4 py-3 text-right">Unit sell</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {parts.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-6 py-16 text-center">
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-2 text-slate-400">
                      <Package className="size-10 stroke-1 opacity-40" />
                      <p className="font-bold text-slate-500">No parts on this job yet.</p>
                      <p className="text-xs">Add parts from your catalogue or drop in a part kit.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                parts.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => startEdit(p)}
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-[#14B8A6]"
                        title="Edit"
                      >
                        <Pencil className="size-4" />
                      </button>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{p.part_name}</td>
                    <td className="px-4 py-3 text-slate-600">{p.mpn || '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{Number(p.quantity).toFixed(2)}</td>
                    <td className="px-4 py-3 text-slate-600">{p.fulfillment_type || '—'}</td>
                    <td className="px-4 py-3">
                      <select
                        value={p.status}
                        onChange={(e) => void updateStatus(p, e.target.value)}
                        className="max-w-[140px] rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold outline-none focus:border-[#14B8A6]"
                      >
                        {STATUSES.map((s) => (
                          <option key={s.key} value={s.key}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{p.created_by_name}</td>
                    <td className="px-4 py-3 text-slate-600">{dayjs(p.created_at).format('Do MMMM YYYY (h:mm a)')}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-800">{formatMoney(p.unit_cost_price)}</td>
                    <td className="px-4 py-3 text-right font-bold text-[#14B8A6]">{formatMoney(p.unit_sell_price)}</td>
                    <td className="px-4 py-3 text-right">
                      <button type="button" onClick={() => void deletePart(p)} className="text-rose-600 hover:underline">
                        <Trash2 className="inline size-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-50 bg-[#FBFCFD] px-4 py-3">
          <button
            type="button"
            disabled={page <= 0}
            onClick={() => setPage((x) => Math.max(0, x - 1))}
            className="inline-flex items-center gap-1 rounded border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 disabled:opacity-40"
          >
            <ChevronLeft className="size-4" /> Prev
          </button>
          <span className="text-xs font-bold text-slate-500">
            Page {page + 1} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((x) => x + 1)}
            className="inline-flex items-center gap-1 rounded border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 disabled:opacity-40"
          >
            Next <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      {/* New catalogue modal */}
      {showNewCatalog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setShowNewCatalog(false)}>
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900">New catalogue part</h3>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-600">Name *</label>
                <input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600">MPN</label>
                <input value={newCatMpn} onChange={(e) => setNewCatMpn(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs font-bold text-slate-600">Default cost</label>
                  <input value={newCatCost} onChange={(e) => setNewCatCost(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600">Markup %</label>
                  <input value={newCatMarkup} onChange={(e) => setNewCatMarkup(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600">VAT %</label>
                  <select value={newCatVat} onChange={(e) => setNewCatVat(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm">
                    {VAT_OPTIONS.map((v) => (
                      <option key={v} value={String(v)}>
                        {v}%
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowNewCatalog(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">
                Cancel
              </button>
              <button type="button" onClick={() => void createCatalogPart()} className="rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-bold text-white">
                Save to catalogue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create kit modal */}
      {showCreateKit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setShowCreateKit(false)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900">New part kit template</h3>
            <p className="mt-1 text-xs text-slate-500">Save a reusable kit, then add it to any job from &quot;Add part kit&quot;.</p>
            <div className="mt-4">
              <label className="text-xs font-bold text-slate-600">Kit name *</label>
              <input value={newKitName} onChange={(e) => setNewKitName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div className="mt-4 space-y-2">
              {kitLines.map((line, i) => (
                <div key={i} className="grid gap-2 rounded-lg border border-slate-100 bg-slate-50/50 p-3 md:grid-cols-6">
                  <input
                    placeholder="Part name *"
                    value={line.part_name}
                    onChange={(e) => {
                      const next = [...kitLines];
                      next[i] = { ...next[i], part_name: e.target.value };
                      setKitLines(next);
                    }}
                    className="md:col-span-2 rounded border border-slate-200 px-2 py-1.5 text-sm"
                  />
                  <input
                    placeholder="MPN"
                    value={line.mpn}
                    onChange={(e) => {
                      const next = [...kitLines];
                      next[i] = { ...next[i], mpn: e.target.value };
                      setKitLines(next);
                    }}
                    className="rounded border border-slate-200 px-2 py-1.5 text-sm"
                  />
                  <input
                    placeholder="Qty"
                    value={line.quantity}
                    onChange={(e) => {
                      const next = [...kitLines];
                      next[i] = { ...next[i], quantity: e.target.value };
                      setKitLines(next);
                    }}
                    className="rounded border border-slate-200 px-2 py-1.5 text-sm"
                  />
                  <input
                    placeholder="Cost"
                    value={line.unit_cost}
                    onChange={(e) => {
                      const next = [...kitLines];
                      next[i] = { ...next[i], unit_cost: e.target.value };
                      setKitLines(next);
                    }}
                    className="rounded border border-slate-200 px-2 py-1.5 text-sm"
                  />
                  <div className="flex gap-1">
                    <input
                      placeholder="% mk"
                      value={line.markup_pct}
                      onChange={(e) => {
                        const next = [...kitLines];
                        next[i] = { ...next[i], markup_pct: e.target.value };
                        setKitLines(next);
                      }}
                      className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setKitLines(kitLines.filter((_, j) => j !== i))}
                      className="shrink-0 rounded p-1 text-rose-500 hover:bg-rose-50"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setKitLines([...kitLines, { part_name: '', mpn: '', quantity: '1', unit_cost: '0', markup_pct: '0', vat_rate: '20' }])
                }
                className="text-xs font-bold text-[#14B8A6] hover:underline"
              >
                + Add line
              </button>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowCreateKit(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold">
                Cancel
              </button>
              <button type="button" onClick={() => void createKit()} className="rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-bold text-white">
                Save kit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Kit drawer */}
      {kitDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setKitDrawer(false)}>
          <div className="flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="text-lg font-bold text-slate-900">Add part kit</h3>
              <button type="button" onClick={() => setKitDrawer(false)} className="rounded p-1 text-slate-500 hover:bg-slate-100">
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <label className="text-xs font-bold uppercase text-slate-600">Select a part kit</label>
              <div className="mt-1">
                <SearchableSelect
                  options={kitOptions}
                  value={kitSelect}
                  onChange={(v) => setKitSelect(v)}
                  searchPlaceholder="Search kits…"
                  emptyButtonLabel="Choose kit…"
                  allowEmpty
                />
              </div>
              {kitPreview.length > 0 && (
                <div className="mt-6 rounded-lg border border-slate-100 bg-slate-50/80 p-4">
                  <p className="text-xs font-bold uppercase text-slate-500">This kit contains</p>
                  <ul className="mt-2 space-y-2 text-sm text-slate-700">
                    {kitPreview.map((l, idx) => (
                      <li key={idx}>
                        <span className="font-bold tabular-nums text-[#14B8A6]">{Number(l.quantity).toFixed(2)}</span> × {l.part_name}
                        {l.mpn && <span className="text-xs text-slate-500"> ({l.mpn})</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {kits.length === 0 && (
                <p className="mt-4 text-sm text-slate-500">No kits yet. Use &quot;New kit template&quot; on the main screen to create one.</p>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 p-4">
              <button type="button" onClick={() => setKitDrawer(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">
                Cancel
              </button>
              <button
                type="button"
                disabled={!kitSelect || kitSaving}
                onClick={() => void applyKit()}
                className="rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {kitSaving ? 'Saving…' : 'Save to job'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
