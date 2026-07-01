'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { deleteRequest, getJson, postJson, putJson } from '../../../../apiClient';
import { ArrowLeft, Plus } from 'lucide-react';

interface PriceBookItem {
  id: number;
  item_name: string;
  unit_price: number;
  price: number;
}

interface PriceBookDetails {
  id: number;
  name: string;
  description: string | null;
  items: PriceBookItem[];
}

export default function PriceBookConfigPage() {
  const router = useRouter();
  const params = useParams();
  const pbId = params?.id as string;

  const [data, setData] = useState<PriceBookDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [addingItem, setAddingItem] = useState(false);
  const [itemName, setItemName] = useState('');
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [price, setPrice] = useState<number>(0);

  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editItemName, setEditItemName] = useState('');
  const [editUnitPrice, setEditUnitPrice] = useState<number>(0);
  const [editPrice, setEditPrice] = useState<number>(0);

  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  const fetchDetails = useCallback(async () => {
    if (!token || !pbId) return;
    setLoading(true);
    try {
      const res = await getJson<PriceBookDetails>(`/settings/price-books/${pbId}/details`, token);
      setData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch details');
    } finally {
      setLoading(false);
    }
  }, [pbId, token]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  const handleAddItem = async () => {
    if (!token || !itemName.trim()) return;
    try {
      await postJson(`/settings/price-books/${pbId}/items`, {
        item_name: itemName.trim(),
        unit_price: unitPrice,
        price,
      }, token);
      setAddingItem(false);
      setItemName('');
      setUnitPrice(0);
      setPrice(0);
      fetchDetails();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to add item');
    }
  };

  const handleStartEdit = (item: PriceBookItem) => {
    setEditingItemId(item.id);
    setEditItemName(item.item_name);
    setEditUnitPrice(item.unit_price);
    setEditPrice(item.price);
  };

  const handleSaveEdit = async (itemId: number) => {
    if (!token || !editItemName.trim()) return;
    try {
      await putJson(`/settings/price-books/${pbId}/items/${itemId}`, {
        item_name: editItemName.trim(),
        unit_price: editUnitPrice,
        price: editPrice,
      }, token);
      setEditingItemId(null);
      fetchDetails();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to update item');
    }
  };

  const handleDeleteItem = async (itemId: number) => {
    if (!token || !confirm('Are you sure you want to delete this item?')) return;
    try {
      await deleteRequest(`/settings/price-books/${pbId}/items/${itemId}`, token);
      fetchDetails();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to delete item');
    }
  };

  if (loading) return <div className="p-8 text-slate-500 font-medium">Loading price book...</div>;
  if (!data) {
    return (
      <div className="p-8 text-rose-500 flex flex-col gap-4">
        <span>{error || 'Price book not found'}</span>
        <button onClick={() => router.push('/dashboard/settings')} className="text-slate-600 underline font-medium self-start">Go back to Settings</button>
      </div>
    );
  }

  const inputClass = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/20 bg-white';

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/dashboard/settings')} className="rounded-md p-2 hover:bg-slate-100 transition-colors">
            <ArrowLeft className="size-5 text-slate-500" />
          </button>
          <div className="flex flex-col">
            <h2 className="text-lg font-bold text-slate-900">{data.name}</h2>
            <p className="text-xs text-slate-500 font-medium">Service line prices — inherited by new jobs unless overridden per job</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-8 relative">
        <div className="mx-auto max-w-6xl">
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden min-h-[500px]">
            <div className="border-b border-slate-200 px-6 py-4 flex justify-between items-center bg-slate-50">
              <div>
                <h2 className="text-[15px] font-bold text-slate-800">Pricing items</h2>
                <p className="text-xs text-slate-500 mt-1">Add or edit standard service line prices for this price book.</p>
              </div>
              {!addingItem && (
                <button onClick={() => setAddingItem(true)} className="flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-lg text-sm font-semibold shadow-sm transition">
                  <Plus className="size-4" /> Add item
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="bg-white border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500 w-16 text-center">#</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Pricing item *</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500 w-32">Unit price *</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500 w-32">Price *</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500 w-32 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                   {data.items.map((item, idx) => {
                     if (editingItemId === item.id) {
                       return (
                         <tr key={item.id} className="bg-emerald-50/10">
                           <td className="px-6 py-3 text-center text-slate-400 font-medium">{idx + 1}</td>
                           <td className="px-6 py-3">
                             <input type="text" autoFocus value={editItemName} onChange={(e) => setEditItemName(e.target.value)} className={inputClass} />
                           </td>
                           <td className="px-6 py-3">
                             <input type="number" step="0.01" value={editUnitPrice} onChange={(e) => setEditUnitPrice(Number(e.target.value))} className={inputClass} />
                           </td>
                           <td className="px-6 py-3">
                             <input type="number" step="0.01" value={editPrice} onChange={(e) => setEditPrice(Number(e.target.value))} className={inputClass} />
                           </td>
                           <td className="px-6 py-3 flex items-center justify-end gap-3 mt-1.5">
                             <button onClick={() => setEditingItemId(null)} className="text-sm font-semibold text-slate-500 hover:text-slate-700">Cancel</button>
                             <button onClick={() => handleSaveEdit(item.id)} className="text-sm font-semibold text-[#14B8A6] hover:underline">Save</button>
                           </td>
                         </tr>
                       );
                     }
                     return (
                       <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                         <td className="px-6 py-4 text-center font-medium text-slate-400">{idx + 1}</td>
                         <td className="px-6 py-4 font-medium text-slate-900">{item.item_name}</td>
                         <td className="px-6 py-4 text-slate-600">{Number(item.unit_price).toFixed(2)}</td>
                         <td className="px-6 py-4 text-slate-600">{Number(item.price).toFixed(2)}</td>
                         <td className="px-6 py-4 text-right">
                           <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                             <button onClick={() => handleStartEdit(item)} className="text-xs font-semibold text-[#14B8A6] hover:underline">Edit</button>
                             <button onClick={() => handleDeleteItem(item.id)} className="text-xs font-semibold text-rose-500 hover:underline">Delete</button>
                           </div>
                         </td>
                       </tr>
                     );
                   })}
                  {addingItem && (
                    <tr className="bg-emerald-50/20">
                      <td className="px-6 py-3 text-center text-slate-400 font-medium">{data.items.length + 1}</td>
                      <td className="px-6 py-3">
                        <input type="text" autoFocus value={itemName} onChange={(e) => setItemName(e.target.value)} className={inputClass} placeholder="e.g. Gas Boiler Service" />
                      </td>
                      <td className="px-6 py-3">
                        <input type="number" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(Number(e.target.value))} className={inputClass} />
                      </td>
                      <td className="px-6 py-3">
                        <input type="number" step="0.01" value={price} onChange={(e) => setPrice(Number(e.target.value))} className={inputClass} />
                      </td>
                      <td className="px-6 py-3 flex items-center justify-end gap-3 mt-1.5">
                        <button onClick={() => setAddingItem(false)} className="text-sm font-semibold text-slate-500 hover:text-slate-700">Cancel</button>
                        <button onClick={handleAddItem} className="text-sm font-semibold text-[#14B8A6] hover:underline">Save</button>
                      </td>
                    </tr>
                  )}
                  {data.items.length === 0 && !addingItem && (
                    <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-400">No pricing items added yet. Use Add item to create one.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
