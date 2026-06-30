'use client';

import { useCallback, useEffect, useState } from 'react';
import { getJson, postJson, patchJson, deleteRequest } from '../../apiClient';
import { Plus, Trash2, Pencil, X, Check } from 'lucide-react';

export interface QuotationQuickPhrase {
  id: number;
  label: string;
  phrase_text: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default function QuotationQuickPhrasesSettings() {
  const [phrases, setPhrases] = useState<QuotationQuickPhrase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [formLabel, setFormLabel] = useState('');
  const [formText, setFormText] = useState('');
  const [formOrder, setFormOrder] = useState(0);
  const [formActive, setFormActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  const fetchPhrases = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await getJson<{ phrases: QuotationQuickPhrase[] }>('/settings/quotation-quick-phrases', token);
      setPhrases(data.phrases || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load quick phrases');
      setPhrases([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchPhrases();
  }, [fetchPhrases]);

  const resetForm = () => {
    setEditingId(null);
    setFormLabel('');
    setFormText('');
    setFormOrder(0);
    setFormActive(true);
    setError(null);
  };

  const startEdit = (phrase: QuotationQuickPhrase) => {
    setEditingId(phrase.id);
    setFormLabel(phrase.label);
    setFormText(phrase.phrase_text);
    setFormOrder(phrase.sort_order);
    setFormActive(phrase.is_active);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    const label = formLabel.trim();
    const text = formText.trim();
    if (!label || !text) {
      setError('Label and phrase text are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = { label, phrase_text: text, sort_order: formOrder, is_active: formActive };
      if (editingId) {
        await patchJson(`/settings/quotation-quick-phrases/${editingId}`, payload, token);
      } else {
        await postJson('/settings/quotation-quick-phrases', payload, token);
      }
      resetForm();
      await fetchPhrases();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save phrase');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!token) return;
    if (!confirm('Delete this quick phrase?')) return;
    try {
      await deleteRequest(`/settings/quotation-quick-phrases/${id}`, token);
      if (editingId === id) resetForm();
      await fetchPhrases();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete phrase');
    }
  };

  const toggleActive = async (phrase: QuotationQuickPhrase) => {
    if (!token) return;
    try {
      await patchJson(`/settings/quotation-quick-phrases/${phrase.id}`, { is_active: !phrase.is_active }, token);
      await fetchPhrases();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update phrase');
    }
  };

  const inputClass = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30';

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="mb-1 text-lg font-bold text-slate-900">Quick Phrases</h3>
      <p className="mb-4 text-sm text-slate-500">
        One-click phrases that appear below the project description when creating or editing a quotation.
      </p>

      <form onSubmit={handleSubmit} className="mb-6 rounded-lg border border-slate-100 bg-slate-50/60 p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700">Button label *</label>
            <input
              type="text"
              value={formLabel}
              onChange={(e) => setFormLabel(e.target.value)}
              placeholder="e.g. Fire Risk Assessment"
              className={inputClass}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Sort order</label>
            <input
              type="number"
              value={formOrder}
              onChange={(e) => setFormOrder(parseInt(e.target.value, 10) || 0)}
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700">Phrase text *</label>
            <textarea
              rows={3}
              value={formText}
              onChange={(e) => setFormText(e.target.value)}
              placeholder="Text inserted into the description when the button is clicked..."
              className={inputClass}
              required
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={formActive}
              onChange={(e) => setFormActive(e.target.checked)}
              className="size-4 rounded text-[#14B8A6] focus:ring-[#14B8A6]"
            />
            Active
          </label>
          <div className="ml-auto flex items-center gap-2">
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <X className="size-3.5" /> Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-lg bg-[#14B8A6] px-3 py-2 text-xs font-semibold text-white hover:bg-[#119f8e] disabled:opacity-50"
            >
              <Check className="size-3.5" />
              {saving ? 'Saving…' : editingId ? 'Update phrase' : 'Add phrase'}
            </button>
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </form>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="border-b border-slate-200">
            <tr>
              <th className="py-2 pr-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Order</th>
              <th className="py-2 pr-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Label</th>
              <th className="py-2 pr-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Phrase</th>
              <th className="py-2 pr-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
              <th className="py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={5} className="py-4 text-center text-slate-500">Loading...</td>
              </tr>
            ) : phrases.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-4 text-center text-slate-500">No quick phrases defined yet.</td>
              </tr>
            ) : (
              phrases.map((phrase) => (
                <tr key={phrase.id} className="group hover:bg-slate-50">
                  <td className="py-3 pr-4 text-slate-500">{phrase.sort_order}</td>
                  <td className="py-3 pr-4 font-medium text-slate-900">{phrase.label}</td>
                  <td className="max-w-xs py-3 pr-4">
                    <p className="truncate text-slate-600" title={phrase.phrase_text}>
                      {phrase.phrase_text}
                    </p>
                  </td>
                  <td className="py-3 pr-4">
                    <button
                      type="button"
                      onClick={() => toggleActive(phrase)}
                      className={`rounded px-2 py-0.5 text-[11px] font-bold ${phrase.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}
                    >
                      {phrase.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="py-3 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => startEdit(phrase)}
                        className="inline-flex items-center gap-1 rounded p-1.5 text-[#14B8A6] hover:bg-[#14B8A6]/10"
                        title="Edit"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(phrase.id)}
                        className="inline-flex items-center gap-1 rounded p-1.5 text-rose-600 hover:bg-rose-50"
                        title="Delete"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
