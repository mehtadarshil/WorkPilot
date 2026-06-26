'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, ChevronRight, Copy, Pencil, Plus, Save, Trash2, Sparkles } from 'lucide-react';
import { getJson, postJson, putJson, patchJson, deleteRequest } from '../../apiClient';

export interface PriceBook {
  id: number;
  name: string;
  description?: string | null;
}

interface PricingDefaults {
  default_price_book_id: number | null;
  default_price_book_name: string | null;
  default_parts_markup_pct: number;
  default_travel_rate_per_hr: number | null;
  default_first_hour_rate_per_hr: number | null;
  default_additional_hour_rate_per_hr: number | null;
}

function formatRateInput(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '';
  return String(value);
}

function parseRateInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function PriceBooksSettings() {
  const router = useRouter();
  const [books, setBooks] = useState<PriceBook[]>([]);
  const [defaults, setDefaults] = useState<PricingDefaults | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingDefaults, setSavingDefaults] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [formName, setFormName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [defaultBookId, setDefaultBookId] = useState<string>('');
  const [defaultMarkup, setDefaultMarkup] = useState('0');
  const [defaultTravelRate, setDefaultTravelRate] = useState('');
  const [defaultFirstHourRate, setDefaultFirstHourRate] = useState('');
  const [defaultAdditionalHourRate, setDefaultAdditionalHourRate] = useState('');

  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  const fetchAll = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [booksData, defaultsData] = await Promise.all([
        getJson<PriceBook[]>('/settings/price-books', token),
        getJson<PricingDefaults>('/settings/pricing-defaults', token),
      ]);
      setBooks(booksData || []);
      setDefaults(defaultsData);
      setDefaultBookId(defaultsData?.default_price_book_id ? String(defaultsData.default_price_book_id) : '');
      setDefaultMarkup(String(defaultsData?.default_parts_markup_pct ?? 0));
      setDefaultTravelRate(formatRateInput(defaultsData?.default_travel_rate_per_hr));
      setDefaultFirstHourRate(formatRateInput(defaultsData?.default_first_hour_rate_per_hr));
      setDefaultAdditionalHourRate(formatRateInput(defaultsData?.default_additional_hour_rate_per_hr));
    } catch {
      setBooks([]);
      setDefaults(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const resetForm = () => {
    setEditingId(null);
    setFormName('');
    setError(null);
  };

  const saveDefaults = async () => {
    if (!token) return;
    setSavingDefaults(true);
    setError(null);
    try {
      const res = await patchJson<PricingDefaults>(
        '/settings/pricing-defaults',
        {
          default_price_book_id: defaultBookId ? parseInt(defaultBookId, 10) : null,
          default_parts_markup_pct: parseFloat(defaultMarkup) || 0,
          default_travel_rate_per_hr: parseRateInput(defaultTravelRate),
          default_first_hour_rate_per_hr: parseRateInput(defaultFirstHourRate),
          default_additional_hour_rate_per_hr: parseRateInput(defaultAdditionalHourRate),
        },
        token,
      );
      setDefaults(res);
      setDefaultTravelRate(formatRateInput(res.default_travel_rate_per_hr));
      setDefaultFirstHourRate(formatRateInput(res.default_first_hour_rate_per_hr));
      setDefaultAdditionalHourRate(formatRateInput(res.default_additional_hour_rate_per_hr));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save company defaults');
    } finally {
      setSavingDefaults(false);
    }
  };

  const handleClone = async (b: PriceBook) => {
    if (!token || !confirm(`Clone "${b.name}"?`)) return;
    try {
      await postJson('/settings/price-books', { name: `${b.name} (Copy)` }, token);
      await fetchAll();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to clone');
    }
  };

  const handleDelete = async (id: number) => {
    if (!token || !confirm('Delete this price book? Customers using it will lose their assignment.')) return;
    try {
      await deleteRequest(`/settings/price-books/${id}`, token);
      await fetchAll();
      if (editingId === id) resetForm();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError(null);
    try {
      if (editingId) {
        await putJson(`/settings/price-books/${editingId}`, { name: formName.trim() }, token);
      } else {
        const created = await postJson<PriceBook>('/settings/price-books', { name: formName.trim() }, token);
        router.push(`/dashboard/settings/price-books/${created.id}`);
      }
      resetForm();
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  const inputClass = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30';

  const defaultsDirty =
    defaults != null &&
    (defaultBookId !== (defaults.default_price_book_id ? String(defaults.default_price_book_id) : '') ||
      parseFloat(defaultMarkup) !== defaults.default_parts_markup_pct ||
      parseRateInput(defaultTravelRate) !== defaults.default_travel_rate_per_hr ||
      parseRateInput(defaultFirstHourRate) !== defaults.default_first_hour_rate_per_hr ||
      parseRateInput(defaultAdditionalHourRate) !== defaults.default_additional_hour_rate_per_hr);

  return (
    <div className="space-y-8">
      {/* Company defaults hero */}
      <section className="overflow-hidden rounded-2xl border border-[#14B8A6]/20 bg-gradient-to-br from-[#14B8A6]/5 via-white to-white shadow-sm">
        <div className="border-b border-[#14B8A6]/10 px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-[#14B8A6]/10 p-2.5 text-[#14B8A6]">
              <Sparkles className="size-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Company default pricing</h3>
              <p className="mt-1 max-w-2xl text-sm text-slate-600">
                Set once here — every job uses these labour rates for timesheet cost and engineer billing.
                Change rates on an individual job&apos;s <strong>Costs</strong> tab only when that job needs a different price.
              </p>
            </div>
          </div>
        </div>
        <div className="space-y-6 p-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Default price book</label>
              <select value={defaultBookId} onChange={(e) => setDefaultBookId(e.target.value)} className={inputClass}>
                <option value="">None — set per customer</option>
                {books.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-slate-500">
                Used when a customer has no specific price book. Customer price books always take priority.
              </p>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Default parts markup %</label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={defaultMarkup}
                onChange={(e) => setDefaultMarkup(e.target.value)}
                className={inputClass}
              />
              <p className="mt-1.5 text-xs text-slate-500">Applied to new job parts when no catalog markup is set.</p>
            </div>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Company labour rates (£ / hr)</p>
            <p className="mt-1 text-xs text-slate-500">Used account-wide for travel time, first hour on site, and additional hours.</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-slate-700">Travel rate</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={defaultTravelRate}
                  onChange={(e) => setDefaultTravelRate(e.target.value)}
                  className={inputClass}
                  placeholder="e.g. 10"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">First hour rate</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={defaultFirstHourRate}
                  onChange={(e) => setDefaultFirstHourRate(e.target.value)}
                  className={inputClass}
                  placeholder="e.g. 60"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Additional hour rate</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={defaultAdditionalHourRate}
                  onChange={(e) => setDefaultAdditionalHourRate(e.target.value)}
                  className={inputClass}
                  placeholder="e.g. 25"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              disabled={savingDefaults || !defaultsDirty}
              onClick={() => void saveDefaults()}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#14B8A6] px-5 text-sm font-semibold text-white hover:bg-[#0d9488] disabled:opacity-50"
            >
              <Save className="size-4" />
              {savingDefaults ? 'Saving…' : 'Save defaults'}
            </button>
          </div>
        </div>
        {defaults?.default_price_book_name && (
          <div className="border-t border-slate-100 bg-slate-50/80 px-6 py-3 text-sm text-slate-600">
            Active company book: <strong className="text-slate-900">{defaults.default_price_book_name}</strong>
            {' · '}
            Configure service line prices in that book below.
          </div>
        )}
      </section>

      {/* How it works */}
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { step: '1', title: 'Set defaults', body: 'Define company labour rates and standard service prices in your price books.' },
          { step: '2', title: 'Jobs inherit', body: 'New jobs copy pricing automatically. Timesheet labour uses your company rates.' },
          { step: '3', title: 'Override per job', body: 'On the job Costs tab, change rates only for that job — others stay on defaults.' },
        ].map((item) => (
          <div key={item.step} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className="inline-flex size-7 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-600">{item.step}</span>
            <h4 className="mt-2 font-bold text-slate-900">{item.title}</h4>
            <p className="mt-1 text-sm text-slate-500">{item.body}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,340px)_1fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm h-fit">
          <h3 className="text-lg font-bold text-slate-900 mb-1">{editingId ? 'Rename price book' : 'New price book'}</h3>
          <p className="text-sm text-slate-500 mb-4">Create separate books for different customer types or regions.</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Name *</label>
              <input type="text" required value={formName} onChange={(e) => setFormName(e.target.value)} className={inputClass} placeholder="e.g. Standard 2025" />
            </div>
            {error && <p className="text-sm text-rose-600 font-medium">{error}</p>}
            <div className="flex gap-2">
              {editingId && (
                <button type="button" onClick={resetForm} className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
              )}
              <button type="submit" className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0d9488]">
                <Plus className="size-4" />
                {editingId ? 'Save name' : 'Create & configure'}
              </button>
            </div>
          </form>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-200 px-6 py-4">
            <h3 className="text-lg font-bold text-slate-900">Price books</h3>
            <p className="text-sm text-slate-500 mt-0.5">Each book holds service line prices for quotations and invoicing.</p>
          </div>
          {loading ? (
            <p className="p-6 text-sm text-slate-500">Loading…</p>
          ) : books.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500">No price books yet. Create one to get started.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {books.map((b) => {
                const isDefault = defaults?.default_price_book_id === b.id;
                return (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 hover:bg-slate-50/80 transition">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="rounded-lg bg-slate-100 p-2 text-slate-500"><BookOpen className="size-4" /></div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{b.name}</p>
                        {isDefault && (
                          <span className="inline-block mt-0.5 rounded-full bg-[#14B8A6]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#14B8A6]">Company default</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => router.push(`/dashboard/settings/price-books/${b.id}`)} className="inline-flex items-center gap-1 rounded-lg bg-[#14B8A6] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#0d9488]">
                        Configure <ChevronRight className="size-3.5" />
                      </button>
                      <button type="button" onClick={() => handleClone(b)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Clone"><Copy className="size-4" /></button>
                      <button type="button" onClick={() => { setEditingId(b.id); setFormName(b.name); }} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Rename"><Pencil className="size-4" /></button>
                      <button type="button" onClick={() => void handleDelete(b.id)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Delete"><Trash2 className="size-4" /></button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
