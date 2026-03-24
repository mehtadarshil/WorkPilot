'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getJson, postJson, patchJson, deleteRequest } from '../../../../apiClient';
import { ArrowLeft, Save, Plus } from 'lucide-react';

interface PriceBookItem {
  id: number;
  item_name: string;
  unit_price: number;
  price: number;
}

interface LabourRate {
  id: number;
  name: string;
  description: string | null;
  basic_rate_per_hr: number;
  nominal_code: string | null;
  rounding_rule: string | null;
}

interface PriceBookDetails {
  id: number;
  name: string;
  description: string | null;
  items: PriceBookItem[];
  labour_rates: LabourRate[];
}

export default function PriceBookConfigPage() {
  const router = useRouter();
  const params = useParams();
  const pbId = params?.id as string;
  
  const [data, setData] = useState<PriceBookDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'items' | 'labour'>('items');

  // Form states for Items
  const [addingItem, setAddingItem] = useState(false);
  const [itemName, setItemName] = useState('');
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [price, setPrice] = useState<number>(0);

  // Form states for Labour
  const [addingLabour, setAddingLabour] = useState(false);
  const [lName, setLName] = useState('');
  const [lDesc, setLDesc] = useState('');
  const [lBasicRate, setLBasicRate] = useState<number>(0);
  const [lNominal, setLNominal] = useState('Sales');
  const [lRounding, setLRounding] = useState('Rounded up to nearest 15 min');

  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  const fetchDetails = useCallback(async () => {
    if (!token || !pbId) return;
    setLoading(true);
    try {
      const res = await getJson<PriceBookDetails>(`/settings/price-books/${pbId}/details`, token);
      setData(res);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Failed to fetch details');
    } finally {
      setLoading(false);
    }
  }, [pbId, token]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  // Items Handlers
  const handleAddItem = async () => {
    if (!token || !itemName.trim()) return;
    try {
      await postJson(`/settings/price-books/${pbId}/items`, { 
        item_name: itemName.trim(), 
        unit_price: unitPrice, 
        price 
      }, token);
      setAddingItem(false);
      setItemName('');
      setUnitPrice(0);
      setPrice(0);
      fetchDetails();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteItem = async (itemId: number) => {
    if (!token || !confirm('Are you sure you want to delete this item?')) return;
    try {
      await deleteRequest(`/settings/price-books/${pbId}/items/${itemId}`, token);
      fetchDetails();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Labour Rates Handlers
  const handleAddLabour = async () => {
    if (!token || !lName.trim()) return;
    try {
      await postJson(`/settings/price-books/${pbId}/labour-rates`, {
        name: lName.trim(),
        description: lDesc.trim() || null,
        basic_rate_per_hr: lBasicRate,
        nominal_code: lNominal,
        rounding_rule: lRounding
      }, token);
      setAddingLabour(false);
      setLName('');
      setLDesc('');
      setLBasicRate(0);
      setLNominal('Sales');
      setLRounding('Rounded up to nearest 15 min');
      fetchDetails();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteLabour = async (rateId: number) => {
    if (!token || !confirm('Are you sure you want to delete this labour rate?')) return;
    try {
      await deleteRequest(`/settings/price-books/${pbId}/labour-rates/${rateId}`, token);
      fetchDetails();
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) return <div className="p-8 text-slate-500 font-medium">Loading price book...</div>;
  if (!data) return (
    <div className="p-8 text-rose-500 flex flex-col gap-4">
      <span>{error || 'Price book not found'}</span> 
      <button onClick={() => router.push('/dashboard/settings')} className="text-slate-600 underline font-medium self-start">Go back to Settings</button>
    </div>
  );

  const inputClass = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/20 bg-white";

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/dashboard/settings')} className="rounded-md p-2 hover:bg-slate-100 transition-colors">
            <ArrowLeft className="size-5 text-slate-500" />
          </button>
          <div className="flex flex-col">
             <h2 className="text-lg font-bold text-slate-900">{data.name}</h2>
             <p className="text-xs text-slate-500 font-medium">Price Book Configuration</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-8 relative">
        <div className="mx-auto max-w-6xl">
            {/* Tabs */}
            <div className="flex gap-2 border-b border-slate-200 mb-6">
             <button
                type="button"
                onClick={() => setActiveTab('items')}
                className={`px-4 py-3 text-sm font-semibold transition bg-transparent border-b-2 ${
                  activeTab === 'items' ? 'border-[#14B8A6] text-[#14B8A6]' : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                Pricing Items
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('labour')}
                className={`px-4 py-3 text-sm font-semibold transition bg-transparent border-b-2 ${
                  activeTab === 'labour' ? 'border-[#14B8A6] text-[#14B8A6]' : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                Labour Rates
              </button>
            </div>

            {/* Content pane */}
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden min-h-[500px]">
              {activeTab === 'items' ? (
                <div>
                  <div className="border-b border-slate-200 px-6 py-4 flex justify-between items-center bg-slate-50">
                    <div>
                        <h2 className="text-[15px] font-bold text-slate-800">Add Pricing Items</h2>
                        <p className="text-xs text-slate-500 mt-1">Add new or edit your existing pricing items using the table below.</p>
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
                        {data.items.map((item, idx) => (
                          <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                            <td className="px-6 py-4 text-center font-medium text-slate-400">{idx + 1}</td>
                            <td className="px-6 py-4 font-medium text-slate-900">{item.item_name}</td>
                            <td className="px-6 py-4 text-slate-600">{Number(item.unit_price).toFixed(2)}</td>
                            <td className="px-6 py-4 text-slate-600">{Number(item.price).toFixed(2)}</td>
                            <td className="px-6 py-4 text-right">
                              <button onClick={() => handleDeleteItem(item.id)} className="text-sm font-semibold text-rose-500 hover:underline opacity-0 group-hover:opacity-100 transition-opacity">Delete</button>
                            </td>
                          </tr>
                        ))}
                        {addingItem && (
                          <tr className="bg-emerald-50/20">
                             <td className="px-6 py-3 text-center text-slate-400 font-medium">{data.items.length + 1}</td>
                             <td className="px-6 py-3">
                               <input type="text" autoFocus value={itemName} onChange={e => setItemName(e.target.value)} className={inputClass} placeholder="e.g. Gas Boiler Service" />
                             </td>
                             <td className="px-6 py-3">
                               <input type="number" step="0.01" value={unitPrice} onChange={e => setUnitPrice(Number(e.target.value))} className={inputClass} />
                             </td>
                             <td className="px-6 py-3">
                               <input type="number" step="0.01" value={price} onChange={e => setPrice(Number(e.target.value))} className={inputClass} />
                             </td>
                             <td className="px-6 py-3 flex items-center justify-end gap-3 mt-1.5">
                               <button onClick={() => setAddingItem(false)} className="text-sm font-semibold text-slate-500 hover:text-slate-700">Cancel</button>
                               <button onClick={handleAddItem} className="text-sm font-semibold text-[#14B8A6] hover:underline">Save</button>
                             </td>
                          </tr>
                        )}
                        {data.items.length === 0 && !addingItem && (
                           <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-400">No pricing items added yet. Click "Add item" to create one.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="border-b border-slate-200 px-6 py-4 flex justify-between items-center bg-slate-50">
                    <div>
                        <h2 className="text-[15px] font-bold text-slate-800">Add Labour Rates</h2>
                        <p className="text-xs text-slate-500 mt-1">Configure individual labour rates for this price book.</p>
                    </div>
                    {!addingLabour && (
                      <button onClick={() => setAddingLabour(true)} className="flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-lg text-sm font-semibold shadow-sm transition">
                        <Plus className="size-4" /> Add labour rate
                      </button>
                    )}
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead className="bg-white border-b border-slate-200">
                        <tr>
                          <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Labour rate name</th>
                          <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Description</th>
                          <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Basic rate / hr</th>
                          <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Nominal code</th>
                          <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Rounding rule</th>
                          <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.labour_rates.map((rate) => (
                          <tr key={rate.id} className="hover:bg-slate-50 transition-colors group">
                            <td className="px-6 py-4 font-medium text-slate-900">{rate.name}</td>
                            <td className="px-6 py-4 text-slate-500">{rate.description || '—'}</td>
                            <td className="px-6 py-4 text-slate-900 font-medium">£ {Number(rate.basic_rate_per_hr).toFixed(2)}</td>
                            <td className="px-6 py-4 text-slate-500">{rate.nominal_code || '—'}</td>
                            <td className="px-6 py-4 text-slate-500">{rate.rounding_rule || '—'}</td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button className="text-sm font-semibold text-slate-400 hover:text-slate-600">Edit</button>
                                <button onClick={() => handleDeleteLabour(rate.id)} className="text-sm font-semibold text-rose-500 hover:underline">Delete</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {addingLabour && (
                          <tr className="bg-emerald-50/20">
                             <td className="px-6 py-3">
                               <input type="text" autoFocus value={lName} onChange={e => setLName(e.target.value)} className={inputClass} placeholder="e.g. Regular Rate" />
                             </td>
                             <td className="px-6 py-3">
                               <input type="text" value={lDesc} onChange={e => setLDesc(e.target.value)} className={inputClass} placeholder="Hourly Charge" />
                             </td>
                             <td className="px-6 py-3 min-w-[120px]">
                               <input type="number" step="0.01" value={lBasicRate} onChange={e => setLBasicRate(Number(e.target.value))} className={inputClass} />
                             </td>
                             <td className="px-6 py-3 min-w-[160px]">
                               <select value={lNominal} onChange={e => setLNominal(e.target.value)} className={inputClass}>
                                  <option>Sales</option>
                                  <option>Cost of Sales</option>
                                  <option>Overhead</option>
                               </select>
                             </td>
                             <td className="px-6 py-3 min-w-[200px]">
                               <select value={lRounding} onChange={e => setLRounding(e.target.value)} className={inputClass}>
                                  <option>Rounded up to nearest 15 min</option>
                                  <option>Rounded up to nearest 30 min</option>
                                  <option>Rounded up to nearest 60 min</option>
                                  <option>Exact minute</option>
                               </select>
                             </td>
                             <td className="px-6 py-3 flex items-center justify-end gap-3 mt-1.5">
                               <button onClick={() => setAddingLabour(false)} className="text-sm font-semibold text-slate-500 hover:text-slate-700">Cancel</button>
                               <button onClick={handleAddLabour} className="text-sm font-semibold text-[#14B8A6] hover:underline">Save</button>
                             </td>
                          </tr>
                        )}
                        {data.labour_rates.length === 0 && !addingLabour && (
                           <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-400">No labour rates added yet.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

        </div>
      </div>
    </div>
  );
}
