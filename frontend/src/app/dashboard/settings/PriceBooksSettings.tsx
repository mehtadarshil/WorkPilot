'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getJson, postJson, patchJson, deleteRequest } from '../../apiClient';

export interface PriceBook {
  id: number;
  name: string;
}

export default function PriceBooksSettings() {
  const router = useRouter();
  const [books, setBooks] = useState<PriceBook[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formName, setFormName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  const fetchBooks = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await getJson<PriceBook[]>('/settings/price-books', token);
      setBooks(data || []);
    } catch {
      setBooks([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchBooks();
  }, [fetchBooks]);

  const resetForm = () => {
    setEditingId(null);
    setFormName('');
    setError(null);
  };

  const handleEdit = (b: PriceBook) => {
    setEditingId(b.id);
    setFormName(b.name);
    setError(null);
  };

  const handleClone = async (b: PriceBook) => {
    if (!token || !confirm('Are you sure you want to clone this price book?')) return;
    try {
      await postJson('/settings/price-books', { name: `${b.name} (Copy)` }, token);
      fetchBooks();
    } catch (err: any) {
      alert(err instanceof Error ? err.message : (err?.message || 'Failed to clone'));
    }
  };

  const handleDelete = async (id: number) => {
    if (!token || !confirm('Are you sure you want to delete this price book?')) return;
    try {
      await deleteRequest(`/settings/price-books/${id}`, token);
      fetchBooks();
      if (editingId === id) resetForm();
    } catch (err: any) {
      alert(err instanceof Error ? err.message : (err?.message || 'Failed to delete'));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError(null);
    try {
      const payload = {
        name: formName.trim(),
      };

      if (editingId) {
        await patchJson(`/settings/price-books/${editingId}`, payload, token);
      } else {
        await postJson('/settings/price-books', payload, token);
      }
      resetForm();
      fetchBooks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  const inputClass = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
      {/* Form Side */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm h-fit">
        <h3 className="text-lg font-bold text-slate-900 mb-4">{editingId ? 'Edit price book' : 'Add a new price book'}</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Price Book Name *</label>
            <input 
              type="text" 
              required 
              value={formName} 
              onChange={e => setFormName(e.target.value)} 
              className={inputClass} 
              placeholder="e.g. Standard Pricing"
            />
          </div>

          {error && <p className="text-sm text-red-600 font-medium pt-2">{error}</p>}

          <div className="pt-4 flex gap-3">
            {editingId && (
              <button 
                type="button" 
                onClick={resetForm}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            )}
            <button 
              type="submit" 
              className="flex-1 rounded-lg bg-[#14B8A6] px-4 py-2 font-semibold text-white shadow-sm hover:bg-[#119f8e] transition-colors"
            >
              {editingId ? 'Save price book' : 'Add price book'}
            </button>
          </div>
        </form>
      </div>

      {/* List Side */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col h-fit">
        <div className="p-6 border-b border-slate-200">
          <h3 className="text-lg font-bold text-slate-900">Existing price books</h3>
          <p className="text-sm text-slate-500 mt-1">Manage all your created price books below.</p>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td className="p-4 text-center text-slate-500 text-sm">Loading...</td></tr>
              ) : books.length === 0 ? (
                <tr><td className="p-4 text-center text-slate-500 text-sm">No price books defined</td></tr>
              ) : (
                books.map(b => (
                  <tr key={b.id} className="hover:bg-slate-50 group transition-colors">
                    <td className="p-4 text-sm font-medium text-slate-900">{b.name}</td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => router.push(`/dashboard/settings/price-books/${b.id}`)} className="text-[#14B8A6] text-sm font-semibold hover:underline">Configure</button>
                        <button onClick={() => handleClone(b)} className="text-[#14B8A6] text-sm font-semibold hover:underline">Clone</button>
                        <button onClick={() => handleEdit(b)} className="text-[#14B8A6] text-sm font-semibold hover:underline">Edit</button>
                        <button onClick={() => handleDelete(b.id)} className="text-[#14B8A6] text-sm font-semibold hover:underline">Delete</button>
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
  );
}
