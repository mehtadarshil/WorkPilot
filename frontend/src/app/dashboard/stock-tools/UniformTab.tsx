'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Shirt,
  Search,
  Plus,
  Edit2,
  Trash2,
  AlertTriangle,
  X,
  Upload,
  User,
  MapPin,
  Package,
} from 'lucide-react';
import { getJson, postJson, patchJson, deleteRequest } from '../../apiClient';
import { AuthenticatedStockImage } from '@/components/AuthenticatedStockImage';
import {
  type StockPlacement,
  type StockPlacementFormRow,
  type QuantityMode,
  type QuantityLevel,
  emptyPlacementFormRow,
  formatPlacementLabel,
  parsePlacementsFromItem,
  placementFormFromApi,
  placementFormToApi,
  placementRowsToApi,
  validatePlacementsRequireBin,
  QUANTITY_LEVELS,
  quantityLevelLabel,
  quantityLevelColor,
} from '@/lib/stockPlacements';

export interface UniformItem {
  id: number;
  name: string;
  category: string;
  size: string;
  status: 'available' | 'issued' | 'retired' | 'lost' | 'damaged';
  location: string;
  locations?: StockPlacement[];
  quantity: number;
  quantity_mode?: QuantityMode;
  quantity_level?: QuantityLevel | null;
  assigned_officer_id: number | null;
  assigned_officer_name?: string | null;
  notes: string | null;
  image_url: string | null;
  created_at: string;
}

interface Officer {
  id: number;
  full_name: string;
}

type Props = {
  token: string | null;
  activeToken: string | null;
  officers: Officer[];
  locations: string[];
  uniformCategories: string[];
  uniformSizes: string[];
  storageBins: string[];
  requireBinLocations: string[];
  onManageLists: () => void;
};

const QUALITIES = ['New', 'Used - Good', 'Used - Fair', 'Damaged'];

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function imageUploadFields(dataUrl: string, originalFilename: string, contentType: string) {
  const m = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (m) {
    return { image_base64: m[2], original_filename: originalFilename, content_type: m[1] };
  }
  return { image_base64: dataUrl, original_filename: originalFilename, content_type: contentType };
}

const STATUS_LABELS: Record<UniformItem['status'], string> = {
  available: 'Available',
  issued: 'Issued',
  retired: 'Retired',
  lost: 'Lost',
  damaged: 'Damaged',
};

export function UniformTab({
  token,
  activeToken,
  officers,
  locations,
  uniformCategories,
  uniformSizes,
  storageBins,
  requireBinLocations,
  onManageLists,
}: Props) {
  const [uniforms, setUniforms] = useState<UniformItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [sizeFilter, setSizeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<UniformItem | null>(null);
  const [form, setForm] = useState({
    name: '',
    category: '',
    size: '',
    status: 'available' as UniformItem['status'],
    location: 'Store',
    locations: [emptyPlacementFormRow('Store')] as StockPlacementFormRow[],
    quantity: '1',
    quantity_mode: 'count' as QuantityMode,
    quantity_level: '' as QuantityLevel | '',
    assigned_officer_id: '',
    notes: '',
    image_base64: '',
    original_filename: '',
    content_type: '',
  });

  const fetchUniforms = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await getJson<UniformItem[]>('/uniforms', token);
      setUniforms(data || []);
    } catch (err) {
      console.error('Error fetching uniforms:', err);
      setUniforms([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void fetchUniforms();
  }, [fetchUniforms]);

  const filtered = useMemo(() => {
    return uniforms.filter((u) => {
      const q = search.toLowerCase();
      const matchesSearch =
        u.name.toLowerCase().includes(q)
        || u.category.toLowerCase().includes(q)
        || u.size.toLowerCase().includes(q)
        || (u.notes || '').toLowerCase().includes(q)
        || (u.assigned_officer_name || '').toLowerCase().includes(q);
      const matchesCategory = categoryFilter === 'All' || u.category === categoryFilter;
      const matchesSize = sizeFilter === 'All' || u.size === sizeFilter;
      const matchesStatus = statusFilter === 'All' || u.status === statusFilter;
      return matchesSearch && matchesCategory && matchesSize && matchesStatus;
    });
  }, [uniforms, search, categoryFilter, sizeFilter, statusFilter]);

  const openAdd = () => {
    setEditing(null);
    setForm({
      name: '',
      category: uniformCategories[0] ?? 'Jacket',
      size: uniformSizes[0] ?? 'M',
      status: 'available',
      location: locations[0] ?? 'Store',
      locations: [emptyPlacementFormRow(locations[0] ?? 'Store')],
      quantity: '1',
      quantity_mode: 'count',
      quantity_level: '',
      assigned_officer_id: '',
      notes: '',
      image_base64: '',
      original_filename: '',
      content_type: '',
    });
    setErrorMsg(null);
    setShowModal(true);
  };

  const openEdit = (item: UniformItem) => {
    setEditing(item);
    const initialLocs = parsePlacementsFromItem(item).map(placementFormFromApi);
    setForm({
      name: item.name,
      category: item.category,
      size: item.size,
      status: item.status,
      location: item.location,
      locations: initialLocs,
      quantity: String(item.quantity ?? 1),
      quantity_mode: item.quantity_mode || 'count',
      quantity_level: item.quantity_level || '',
      assigned_officer_id: item.assigned_officer_id ? String(item.assigned_officer_id) : '',
      notes: item.notes || '',
      image_base64: '',
      original_filename: '',
      content_type: '',
    });
    setErrorMsg(null);
    setShowModal(true);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      setForm((prev) => ({
        ...prev,
        image_base64: dataUrl,
        original_filename: file.name,
        content_type: file.type || 'image/jpeg',
      }));
    } catch {
      setErrorMsg('Could not read image file');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setErrorMsg(null);

    const isLevelMode = form.quantity_mode === 'level';
    if (isLevelMode && !form.quantity_level) {
      setErrorMsg('Please select a quantity level (Low, Medium, or High)');
      return;
    }

    const parsedLocations = placementRowsToApi(form.locations, form.quantity_mode);

    if (!isLevelMode && parsedLocations.some((l) => isNaN(l.quantity) || l.quantity < 0)) {
      setErrorMsg('All placement quantities must be 0 or greater');
      return;
    }

    const binError = isLevelMode ? null : validatePlacementsRequireBin(parsedLocations, requireBinLocations);
    if (binError) {
      setErrorMsg(binError);
      return;
    }

    const totalQty = isLevelMode ? 0 : parsedLocations.reduce((sum, loc) => sum + loc.quantity, 0);

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      category: form.category,
      size: form.size,
      status: form.status,
      location: parsedLocations[0]?.location || form.location || 'Store',
      locations: parsedLocations,
      quantity: totalQty,
      quantity_mode: form.quantity_mode,
      quantity_level: isLevelMode ? form.quantity_level : null,
      assigned_officer_id: form.assigned_officer_id ? parseInt(form.assigned_officer_id, 10) : null,
      notes: form.notes.trim() || null,
    };
    if (form.image_base64) {
      Object.assign(payload, imageUploadFields(form.image_base64, form.original_filename, form.content_type));
    }

    try {
      if (editing) {
        await patchJson(`/uniforms/${editing.id}`, payload, token);
      } else {
        await postJson('/uniforms', payload, token);
      }
      setShowModal(false);
      await fetchUniforms();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not save uniform');
    }
  };

  const handleDelete = async (id: number) => {
    if (!token || !confirm('Delete this uniform entry?')) return;
    try {
      await deleteRequest(`/uniforms/${id}`, token);
      await fetchUniforms();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not delete uniform');
    }
  };

  const statusClass = (status: UniformItem['status']) => {
    switch (status) {
      case 'issued': return 'bg-blue-100 text-blue-800';
      case 'retired': return 'bg-slate-100 text-slate-600';
      case 'lost': return 'bg-rose-100 text-rose-800';
      case 'damaged': return 'bg-amber-100 text-amber-800';
      default: return 'bg-emerald-100 text-emerald-800';
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search uniforms, types, sizes, officers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 pl-10 pr-4 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]"
            />
          </div>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]">
            <option value="All">All types</option>
            {uniformCategories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={sizeFilter} onChange={(e) => setSizeFilter(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]">
            <option value="All">All sizes</option>
            {uniformSizes.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]">
            <option value="All">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onManageLists} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Manage lists
          </button>
          <button onClick={openAdd} className="flex items-center justify-center gap-2 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0d9488] shadow-sm">
            <Plus className="size-4" /> Add uniform
          </button>
        </div>
      </div>

      {errorMsg && !showModal && (
        <div className="rounded-lg bg-rose-50 p-3 text-sm font-medium text-rose-700 border border-rose-100">{errorMsg}</div>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white text-slate-400">
          Loading uniform registry...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white text-slate-400 gap-2">
          <Shirt className="size-8 text-slate-300" />
          <p className="text-sm font-medium">No uniforms match your filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {filtered.map((item) => (
            <div key={item.id} className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm hover:border-[#14B8A6]/40 transition">
              <div className="relative aspect-video w-full bg-slate-50 border-b border-slate-100 flex items-center justify-center">
                {item.image_url && activeToken ? (
                  <AuthenticatedStockImage
                    imageUrl={item.image_url}
                    category="uniform-photos"
                    token={activeToken}
                    alt={item.name}
                    className="size-full object-cover"
                    enableZoom
                    fallback={<div className="flex size-full items-center justify-center text-slate-300"><Shirt className="size-8" /></div>}
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-slate-300"><Shirt className="size-8" /></div>
                )}
                <span className={`absolute right-3 top-3 px-2 py-0.5 rounded-full text-xs font-bold shadow-sm ${statusClass(item.status)}`}>
                  {STATUS_LABELS[item.status]}
                </span>
              </div>
              <div className="p-4 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex flex-wrap gap-1 mb-1">
                    <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{item.category}</span>
                    <span className="inline-block rounded-full bg-violet-50 px-2 py-0.5 text-xs font-bold text-violet-700 border border-violet-100">Size {item.size}</span>
                  </div>
                  <h3 className="font-bold text-slate-900 truncate mb-2">{item.name}</h3>
                  <div className="flex flex-col gap-1.5 text-xs text-slate-600">
                    {item.quantity_mode === 'level' ? (
                      <div className="flex items-center gap-1.5"><Package className="size-3.5 text-slate-400" /><span>Qty: <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold ${quantityLevelColor(item.quantity_level)}`}>{quantityLevelLabel(item.quantity_level)}</span></span></div>
                    ) : (
                      <div className="flex items-center gap-1.5"><Package className="size-3.5 text-slate-400" /><span>Qty: <strong>{item.quantity ?? 1}</strong></span></div>
                    )}
                    {item.quantity_mode !== 'level' && (
                    <div className="flex flex-col gap-0.5">
                      {parsePlacementsFromItem(item).slice(0, 3).map((p, idx) => (
                        <div key={idx} className="flex items-center gap-1.5"><MapPin className="size-3.5 text-slate-400 shrink-0" /><span className="truncate">{formatPlacementLabel(p)} ({p.quantity})</span></div>
                      ))}
                      {parsePlacementsFromItem(item).length > 3 && (
                        <div className="text-xs text-slate-400 pl-5">+{parsePlacementsFromItem(item).length - 3} more</div>
                      )}
                    </div>
                    )}
                    <div className="flex items-center gap-1.5"><User className="size-3.5 text-slate-400" /><span>Issued to: <strong>{item.assigned_officer_name || 'Unassigned'}</strong></span></div>
                  </div>
                  {item.notes && <p className="mt-2 text-xs text-slate-500 line-clamp-2">{item.notes}</p>}
                </div>
                <div className="flex items-center justify-end border-t border-slate-100 mt-4 pt-3 gap-1">
                  <button onClick={() => openEdit(item)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="Edit"><Edit2 className="size-4" /></button>
                  <button onClick={() => void handleDelete(item.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Delete"><Trash2 className="size-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-slate-100 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <h2 className="text-lg font-bold text-slate-900">{editing ? 'Edit uniform' : 'Add uniform'}</h2>
              <button onClick={() => setShowModal(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50"><X className="size-5" /></button>
            </div>
            <form onSubmit={(e) => void handleSave(e)} className="flex-1 flex flex-col gap-4 overflow-y-auto pr-1">
              {errorMsg && (
                <div className="rounded-lg bg-rose-50 p-3 text-xs font-semibold text-rose-700 border border-rose-100 flex items-center gap-2">
                  <AlertTriangle className="size-4 shrink-0" />{errorMsg}
                </div>
              )}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Name *</label>
                <input type="text" required value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Company branded jacket" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Type</label>
                  <select value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]">
                    {uniformCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Size</label>
                  <select value={form.size} onChange={(e) => setForm((p) => ({ ...p, size: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]">
                    {uniformSizes.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Quantity mode toggle */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Quantity tracking</label>
                <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, quantity_mode: 'count', quantity_level: '' }))}
                    className={`flex-1 px-3 py-2 text-xs font-bold transition ${form.quantity_mode === 'count' ? 'bg-[#14B8A6] text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                  >
                    Exact count
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, quantity_mode: 'level', quantity_level: p.quantity_level || 'medium' }))}
                    className={`flex-1 px-3 py-2 text-xs font-bold transition ${form.quantity_mode === 'level' ? 'bg-[#14B8A6] text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                  >
                    Level (Low / Med / High)
                  </button>
                </div>
                {form.quantity_mode === 'level' && (
                  <div className="mt-2 flex gap-2">
                    {QUANTITY_LEVELS.map((lvl) => (
                      <button
                        key={lvl.value}
                        type="button"
                        onClick={() => setForm((p) => ({ ...p, quantity_level: lvl.value }))}
                        className={`flex-1 rounded-lg border px-3 py-2 text-xs font-bold transition ${form.quantity_level === lvl.value ? quantityLevelColor(lvl.value) : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}
                      >
                        {lvl.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Storage placements — available in both count and level modes */}
              <div className="border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Storage placements</label>
                  <button
                    type="button"
                    onClick={() => {
                      setForm(prev => ({
                        ...prev,
                        locations: [...prev.locations, emptyPlacementFormRow(locations[0] || 'Store')]
                      }));
                    }}
                    className="text-xs font-bold text-[#14B8A6] hover:underline flex items-center gap-1"
                  >
                    <Plus className="size-3.5" /> Add placement
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mb-3">
                  {form.quantity_mode === 'level'
                    ? 'Record where this uniform is stored. Stock level (Low / Med / High) is tracked separately above.'
                    : 'Record site, aisle, shelf, and box/cell so staff can find uniforms quickly.'}
                  {requireBinLocations.length > 0 && form.quantity_mode === 'count' && (
                    <> Box or storage code required for: {requireBinLocations.join(', ')}.</>
                  )}
                </p>
                <div className="flex flex-col gap-3">
                  {form.locations.map((loc, index) => (
                    <div key={index} className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-400">Site</label>
                          <select
                            value={loc.location}
                            onChange={(e) => {
                              const newLocs = [...form.locations];
                              newLocs[index] = { ...newLocs[index], location: e.target.value };
                              setForm(prev => ({ ...prev, locations: newLocs }));
                            }}
                            className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-[#14B8A6]"
                          >
                            {locations.map(l => (
                              <option key={l} value={l}>{l}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-400">Zone</label>
                          <input
                            value={loc.zone}
                            onChange={(e) => {
                              const newLocs = [...form.locations];
                              newLocs[index] = { ...newLocs[index], zone: e.target.value };
                              setForm(prev => ({ ...prev, locations: newLocs }));
                            }}
                            placeholder="WH-A"
                            className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-[#14B8A6]"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-400">Aisle</label>
                          <input
                            value={loc.aisle}
                            onChange={(e) => {
                              const newLocs = [...form.locations];
                              newLocs[index] = { ...newLocs[index], aisle: e.target.value };
                              setForm(prev => ({ ...prev, locations: newLocs }));
                            }}
                            placeholder="3"
                            className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-[#14B8A6]"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-400">Shelf</label>
                          <input
                            value={loc.shelf}
                            onChange={(e) => {
                              const newLocs = [...form.locations];
                              newLocs[index] = { ...newLocs[index], shelf: e.target.value };
                              setForm(prev => ({ ...prev, locations: newLocs }));
                            }}
                            placeholder="B"
                            className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-[#14B8A6]"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-400">Box / Cell</label>
                          <input
                            value={loc.box}
                            list={storageBins.length > 0 ? 'uniform-storage-bin-suggestions' : undefined}
                            onChange={(e) => {
                              const newLocs = [...form.locations];
                              newLocs[index] = { ...newLocs[index], box: e.target.value };
                              setForm(prev => ({ ...prev, locations: newLocs }));
                            }}
                            placeholder="14"
                            className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-[#14B8A6]"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-400">Storage code</label>
                          <input
                            value={loc.storage_code}
                            list={storageBins.length > 0 ? 'uniform-storage-bin-suggestions' : undefined}
                            onChange={(e) => {
                              const newLocs = [...form.locations];
                              newLocs[index] = { ...newLocs[index], storage_code: e.target.value };
                              setForm(prev => ({ ...prev, locations: newLocs }));
                            }}
                            placeholder="A3-B-14"
                            className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-[#14B8A6]"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-400">Quality</label>
                          <select
                            value={loc.quality}
                            onChange={(e) => {
                              const newLocs = [...form.locations];
                              newLocs[index] = { ...newLocs[index], quality: e.target.value };
                              setForm(prev => ({ ...prev, locations: newLocs }));
                            }}
                            className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-[#14B8A6]"
                          >
                            {QUALITIES.map(q => (
                              <option key={q} value={q}>{q}</option>
                            ))}
                          </select>
                        </div>
                        {form.quantity_mode === 'count' && (
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-400">Qty</label>
                          <input
                            type="number"
                            min="0"
                            required
                            value={loc.quantity}
                            onChange={(e) => {
                              const newLocs = [...form.locations];
                              newLocs[index] = { ...newLocs[index], quantity: e.target.value };
                              setForm(prev => ({ ...prev, locations: newLocs }));
                            }}
                            className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-[#14B8A6]"
                          />
                        </div>
                        )}
                        <div className="flex justify-end">
                          {form.locations.length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                setForm(prev => ({
                                  ...prev,
                                  locations: prev.locations.filter((_, i) => i !== index)
                                }));
                              }}
                              className="rounded-lg p-2 text-rose-500 hover:bg-rose-50 transition"
                              title="Remove placement"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          )}
                        </div>
                      </div>
                      <input
                        value={loc.notes}
                        onChange={(e) => {
                          const newLocs = [...form.locations];
                          newLocs[index] = { ...newLocs[index], notes: e.target.value };
                          setForm(prev => ({ ...prev, locations: newLocs }));
                        }}
                        placeholder="Notes (optional) — e.g. top shelf, left side"
                        className="mt-2 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-[#14B8A6]"
                      />
                    </div>
                  ))}
                </div>
                {storageBins.length > 0 && (
                  <datalist id="uniform-storage-bin-suggestions">
                    {storageBins.map((bin) => (
                      <option key={bin} value={bin} />
                    ))}
                  </datalist>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Status</label>
                  <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as UniformItem['status'] }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]">
                    {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Issued to</label>
                  <select value={form.assigned_officer_id} onChange={(e) => setForm((p) => ({ ...p, assigned_officer_id: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]">
                    <option value="">Unassigned</option>
                    {officers.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Optional — e.g. fire retardant, embroidered logo" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
              </div>
              <div className="border-t border-slate-100 pt-4">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Photo</label>
                <div className="flex items-center gap-4">
                  <div className="flex items-center justify-center size-20 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                    {form.image_base64 ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={form.image_base64} alt="Preview" className="size-full object-cover" />
                    ) : editing?.image_url && activeToken ? (
                      <AuthenticatedStockImage imageUrl={editing.image_url} category="uniform-photos" token={activeToken} alt="Preview" className="size-full object-cover" />
                    ) : (
                      <Upload className="size-6 text-slate-400" />
                    )}
                  </div>
                  <div>
                    <input type="file" accept="image/*" id="uniform-image-input" onChange={(e) => void handleFileChange(e)} className="hidden" />
                    <label htmlFor="uniform-image-input" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
                      <Upload className="size-3.5" /> Select image
                    </label>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="submit" className="rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0d9488]">Save uniform</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
