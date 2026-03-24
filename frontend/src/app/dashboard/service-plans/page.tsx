'use client';

import { useCallback, useEffect, useState } from 'react';
import { LayoutGrid, Package, Plus, Pencil, Trash2 } from 'lucide-react';
import { getJson, postJson, patchJson, deleteRequest } from '../../apiClient';

interface ServicePlanRecord {
  id: number;
  name: string;
  description: string | null;
  sort_order: number;
  created_at: string;
}

export default function ServicePlansPage() {
  const [plans, setPlans] = useState<ServicePlanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState<'add' | 'edit' | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sortOrder, setSortOrder] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const token =
    typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  const fetchPlans = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await getJson<{ plans: ServicePlanRecord[] }>('/service-plans', token);
      setPlans(data.plans ?? []);
    } catch {
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const openAdd = () => {
    setError(null);
    setName('');
    setDescription('');
    setSortOrder(plans.length);
    setEditingId(null);
    setModalOpen('add');
  };

  const openEdit = (plan: ServicePlanRecord) => {
    setError(null);
    setEditingId(plan.id);
    setName(plan.name);
    setDescription(plan.description ?? '');
    setSortOrder(plan.sort_order);
    setModalOpen('edit');
  };

  const closeModal = () => {
    setModalOpen(null);
    setEditingId(null);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Plan name is required.');
      return;
    }
    if (!token) {
      setError('Session expired. Please sign in again.');
      return;
    }
    try {
      if (modalOpen === 'add') {
        await postJson<{ plan: ServicePlanRecord }>(
          '/service-plans',
          { name: name.trim(), description: description.trim() || undefined, sort_order: sortOrder },
          token,
        );
      } else if (editingId !== null) {
        await patchJson<{ plan: ServicePlanRecord }>(
          `/service-plans/${editingId}`,
          { name: name.trim(), description: description.trim() || null, sort_order: sortOrder },
          token,
        );
      }
      closeModal();
      fetchPlans();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  };

  const handleDelete = async (id: number) => {
    if (!token) return;
    try {
      await deleteRequest(`/service-plans/${id}`, token);
      setDeleteConfirm(null);
      fetchPlans();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete plan.');
    }
  };

  return (
    <>
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
        <div className="flex items-center gap-2 text-slate-600">
          <LayoutGrid className="size-5" />
          <h2 className="font-semibold text-slate-900">Service Plans</h2>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-4xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black tracking-tight text-slate-900">
                Customize Service Plans
              </h1>
              <p className="mt-1 text-slate-500">
                Add or edit plans that you can assign to clients. Clients will see their assigned plan in the dashboard.
              </p>
            </div>
            <button
              type="button"
              onClick={openAdd}
              className="flex items-center gap-2 rounded-lg bg-[#14B8A6] px-6 py-2.5 text-sm font-bold text-white shadow-sm shadow-[#14B8A6]/20 transition hover:bg-[#13a89a]"
            >
              <Plus className="size-5" />
              Add Plan
            </button>
          </div>

          <div className="mt-8 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {loading ? (
              <div className="px-6 py-12 text-center text-slate-500">Loading…</div>
            ) : plans.length === 0 ? (
              <div className="px-6 py-12 text-center text-slate-500">
                No service plans yet. Add one to get started.
              </div>
            ) : (
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                      Name
                    </th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                      Description
                    </th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                      Order
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wider text-slate-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {plans.map((plan) => (
                    <tr key={plan.id} className="transition-colors hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <span className="font-semibold text-slate-900">{plan.name}</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {plan.description || '—'}
                      </td>
                      <td className="px-6 py-4 text-slate-600">{plan.sort_order}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(plan)}
                            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-[#14B8A6]"
                            aria-label="Edit"
                          >
                            <Pencil className="size-4" />
                          </button>
                          {deleteConfirm === plan.id ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-500">Delete?</span>
                              <button
                                type="button"
                                onClick={() => handleDelete(plan.id)}
                                className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
                              >
                                Yes
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteConfirm(null)}
                                className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setDeleteConfirm(plan.id)}
                              className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600"
                              aria-label="Delete"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {error && !modalOpen && (
            <p className="mt-4 text-sm text-red-600">{error}</p>
          )}
        </div>
      </div>

      {(modalOpen === 'add' || modalOpen === 'edit') && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-slate-900">
              {modalOpen === 'add' ? 'Add Service Plan' : 'Edit Service Plan'}
            </h3>
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label htmlFor="plan-name" className="block text-sm font-medium text-slate-700">
                  Name *
                </label>
                <input
                  id="plan-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Professional"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
                />
              </div>
              <div>
                <label htmlFor="plan-desc" className="block text-sm font-medium text-slate-700">
                  Description
                </label>
                <textarea
                  id="plan-desc"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Short description of this plan"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
                />
              </div>
              <div>
                <label htmlFor="plan-order" className="block text-sm font-medium text-slate-700">
                  Sort order
                </label>
                <input
                  id="plan-order"
                  type="number"
                  min={0}
                  value={sortOrder}
                  onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#13a89a]"
                >
                  {modalOpen === 'add' ? 'Add Plan' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
