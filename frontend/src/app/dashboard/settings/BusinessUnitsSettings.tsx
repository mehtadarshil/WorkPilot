'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getJson, postJson, deleteRequest } from '../../apiClient';

interface BusinessUnit {
  id: number;
  name: string;
}

export default function BusinessUnitsSettings() {
  const [units, setUnits] = useState<BusinessUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formName, setFormName] = useState('');

  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  const fetchUnits = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await getJson<{ units: BusinessUnit[] }>('/settings/business-units', token);
      setUnits(data.units ?? []);
    } catch {
      setUnits([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchUnits();
  }, [fetchUnits]);

  const resetForm = () => {
    setFormName('');
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !formName.trim()) return;

    try {
      await postJson<{ unit: BusinessUnit }>('/settings/business-units', { name: formName }, token);
      resetForm();
      fetchUnits();
    } catch (err: any) {
      setError(err?.message || 'Failed to create business unit');
    }
  };

  const handleDelete = async (id: number) => {
    if (!token || !confirm('Are you sure you want to delete this business unit?')) return;
    try {
      await deleteRequest(`/settings/business-units/${id}`, token);
      fetchUnits();
    } catch (err: any) {
       alert(err?.message || 'Failed to delete');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center pb-4 border-b border-slate-200">
        <div>
           <h2 className="text-xl font-bold text-slate-800 tracking-tight">Business units</h2>
           <p className="text-sm text-slate-500 mt-1 font-medium">Configure the branches or business units for your company.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-1 space-y-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
            <h3 className="font-bold text-slate-800 mb-4 tracking-tight">Add new unit</h3>
            {error && <div className="text-xs text-rose-600 bg-rose-50 p-2 rounded mb-3 border border-rose-100">{error}</div>}
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Unit name <span className="text-rose-500">*</span></label>
                <input required type="text" value={formName} onChange={e => setFormName(e.target.value)} className="w-full text-sm border border-slate-200 rounded px-3 py-2 outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]" placeholder="e.g. Service & Maintenance" />
              </div>

              <div className="pt-2 flex gap-2">
                <button type="submit" className="flex-1 bg-[#14B8A6] hover:bg-[#119f8e] text-white px-4 py-2 font-bold text-sm rounded transition-colors flex items-center justify-center gap-1 shadow-sm">
                  <Plus className="size-4" /> Add
                </button>
                <button type="button" onClick={resetForm} className="px-4 py-2 font-bold text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-50 rounded transition-colors border border-transparent hover:border-slate-200">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="md:col-span-2">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden text-sm">
             <table className="w-full text-left">
               <thead className="bg-[#FBFCFD] border-b border-slate-100">
                 <tr>
                   <th className="px-5 py-3 font-bold text-slate-600 text-xs w-[60%]">Business Unit Name</th>
                   <th className="px-5 py-3 font-bold text-slate-600 text-xs text-right">Actions</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr><td colSpan={2} className="px-5 py-8 text-center text-slate-500 font-medium">Loading units...</td></tr>
                  ) : units.length === 0 ? (
                    <tr><td colSpan={2} className="px-5 py-8 text-center text-slate-500 italic">No business units created yet.</td></tr>
                  ) : (
                    <AnimatePresence>
                      {units.map((unit) => (
                        <motion.tr 
                          key={unit.id}
                          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                          className="hover:bg-slate-50/50 transition-colors group"
                        >
                          <td className="px-5 py-3.5 align-middle">
                             <span className="font-bold text-slate-800">{unit.name}</span>
                          </td>
                          <td className="px-5 py-3.5 align-middle text-right">
                            <button onClick={() => handleDelete(unit.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors opacity-0 group-hover:opacity-100">
                              <Trash2 className="size-4" />
                            </button>
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  )}
               </tbody>
             </table>
          </div>
        </div>
      </div>
    </div>
  );
}
