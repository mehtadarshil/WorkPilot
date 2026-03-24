'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getJson, postJson, patchJson, deleteRequest } from '../../apiClient';

export interface CustomerType {
  id: number;
  name: string;
  description: string | null;
  company_name_required: boolean;
  allow_branches: boolean;
  work_address_name: string;
}

export default function CustomerTypesSettings() {
  const [types, setTypes] = useState<CustomerType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formCompanyReq, setFormCompanyReq] = useState(false);
  const [formBranches, setFormBranches] = useState(false);
  const [formWorkAddressName, setFormWorkAddressName] = useState('Work address');
  
  const [editingId, setEditingId] = useState<number | null>(null);

  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  const fetchTypes = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await getJson<{ customerTypes: CustomerType[] }>('/settings/customer-types', token);
      setTypes(data.customerTypes ?? []);
    } catch {
      setTypes([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchTypes();
  }, [fetchTypes]);

  const resetForm = () => {
    setEditingId(null);
    setFormName('');
    setFormDesc('');
    setFormCompanyReq(false);
    setFormBranches(false);
    setFormWorkAddressName('Work address');
    setError(null);
  };

  const handleEdit = (t: CustomerType) => {
    setEditingId(t.id);
    setFormName(t.name);
    setFormDesc(t.description ?? '');
    setFormCompanyReq(t.company_name_required);
    setFormBranches(t.allow_branches);
    setFormWorkAddressName(t.work_address_name);
    setError(null);
  };

  const handleDelete = async (id: number) => {
    if (!token || !confirm('Are you sure you want to delete this customer type?')) return;
    try {
      await deleteRequest(`/settings/customer-types/${id}`, token);
      fetchTypes();
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
      const payload = {
        name: formName.trim(),
        description: formDesc.trim() || undefined,
        company_name_required: formCompanyReq,
        allow_branches: formBranches,
        work_address_name: formWorkAddressName.trim() || 'Work address',
      };

      if (editingId) {
        await patchJson(`/settings/customer-types/${editingId}`, payload, token);
      } else {
        await postJson('/settings/customer-types', payload, token);
      }
      resetForm();
      fetchTypes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  const inputClass = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
      {/* Form Side */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm h-fit">
        <h3 className="text-lg font-bold text-slate-900 mb-4">{editingId ? 'Edit customer type' : 'Add a customer types'}</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Customer type *</label>
            <input 
              type="text" 
              required 
              value={formName} 
              onChange={e => setFormName(e.target.value)} 
              className={inputClass} 
              placeholder="e.g. Private customer"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Customer Description</label>
            <textarea 
              rows={3} 
              value={formDesc} 
              onChange={e => setFormDesc(e.target.value)} 
              className={inputClass}
              placeholder="Description..."
            />
          </div>
          <div className="flex items-start gap-3 mt-4">
            <div className="flex h-5 items-center">
              <input
                type="checkbox"
                id="companyReq"
                checked={formCompanyReq}
                onChange={e => setFormCompanyReq(e.target.checked)}
                className="size-4 rounded border-slate-300 text-[#14B8A6] focus:ring-[#14B8A6]"
              />
            </div>
            <div>
              <label htmlFor="companyReq" className="text-sm font-medium text-slate-700">Company name required</label>
              <p className="text-xs text-emerald-600 mt-1">If this customer type must always have a company name, tick this box. For example, a letting agent.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 mt-4">
            <div className="flex h-5 items-center">
              <input
                type="checkbox"
                id="allowBranches"
                checked={formBranches}
                onChange={e => setFormBranches(e.target.checked)}
                className="size-4 rounded border-slate-300 text-[#14B8A6] focus:ring-[#14B8A6]"
              />
            </div>
            <div>
              <label htmlFor="allowBranches" className="text-sm font-medium text-slate-700">Allow for branches</label>
              <p className="text-xs text-emerald-600 mt-1">Select this option if the customer type can be split into branches. i.e. an estate agent has multiple branches, while a private customer doesn't.</p>
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-slate-700">Name of work address *</label>
            <input 
              type="text" 
              required 
              value={formWorkAddressName} 
              onChange={e => setFormWorkAddressName(e.target.value)} 
              className={inputClass} 
              placeholder="e.g. tenant"
            />
            <p className="text-xs text-emerald-600 mt-1">The name given to the associated work address. eg. tenant</p>
          </div>

          {error && <p className="text-sm text-red-600 font-medium pt-2">{error}</p>}

          <div className="pt-4 flex gap-3">
            {editingId && (
              <button 
                type="button" 
                onClick={resetForm}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            )}
            <button 
              type="submit" 
              className="flex-1 rounded-lg bg-[#a29bfe] px-4 py-2 font-semibold text-white shadow-sm hover:bg-[#8e85eb] transition-colors bg-[#14B8A6]"
            >
              {editingId ? 'Save customer type' : 'Add customer type'}
            </button>
          </div>
        </form>
      </div>

      {/* List Side */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col h-fit">
        <div className="p-6 border-b border-slate-200">
          <h3 className="text-lg font-bold text-slate-900">Existing customer types</h3>
          <p className="text-sm text-slate-500 mt-1">Click, hold and drag an item in this list to reorder.</p>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td className="p-4 text-center text-slate-500 text-sm">Loading...</td></tr>
              ) : types.length === 0 ? (
                <tr><td className="p-4 text-center text-slate-500 text-sm">No customer types defined</td></tr>
              ) : (
                types.map(t => (
                  <tr key={t.id} className="hover:bg-slate-50 group">
                    <td className="p-4 text-sm font-medium text-slate-900">{t.name}</td>
                    <td className="p-4 text-sm text-slate-500">{t.work_address_name}</td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleEdit(t)} className="text-[#14B8A6] text-sm font-semibold hover:underline">Edit</button>
                        <button onClick={() => handleDelete(t.id)} className="text-[#14B8A6] text-sm font-semibold hover:underline">Delete</button>
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
