'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  LayoutGrid,
  Search,
  Plus,
  Building2,
} from 'lucide-react';
import { getJson, postJson, patchJson } from '../../apiClient';

type ClientStatus = 'ACTIVE' | 'PENDING_SETUP' | 'SUSPENDED';

interface ServicePlanOption {
  id: number;
  name: string;
  description: string | null;
  sort_order: number;
}

interface Client {
  id: number;
  email: string;
  role: string;
  created_at: string;
  full_name: string | null;
  company_name: string | null;
  phone: string | null;
  service_plan: string;
  status: string;
  address: string | null;
  notes: string | null;
}

interface ClientsResponse {
  clients: Client[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  totalActive: number;
  totalPending: number;
}

const PAGE_SIZE = 8;
const STATUS_OPTIONS: { value: ClientStatus; label: string }[] = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'PENDING_SETUP', label: 'Pending Setup' },
  { value: 'SUSPENDED', label: 'Suspended' },
];

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [total, setTotal] = useState(0);
  const [totalActive, setTotalActive] = useState(0);
  const [totalPending, setTotalPending] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [servicePlans, setServicePlans] = useState<ServicePlanOption[]>([]);
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formFullName, setFormFullName] = useState('');
  const [formCompanyName, setFormCompanyName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formServicePlan, setFormServicePlan] = useState('');
  const [formStatus, setFormStatus] = useState<ClientStatus>('PENDING_SETUP');
  const [formAddress, setFormAddress] = useState('');
  const [formNotes, setFormNotes] = useState('');

  const token =
    typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  const fetchClients = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));
      if (searchDebounced) params.set('search', searchDebounced);
      const data = await getJson<ClientsResponse>(`/clients?${params.toString()}`, token);
      setClients(data.clients ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
      setTotalActive(data.totalActive ?? 0);
      setTotalPending(data.totalPending ?? 0);
    } catch {
      setClients([]);
      setTotal(0);
      setTotalPages(1);
      setTotalActive(0);
      setTotalPending(0);
    } finally {
      setLoading(false);
    }
  }, [token, page, searchDebounced]);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const fetchServicePlans = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getJson<{ plans: ServicePlanOption[] }>('/service-plans', token);
      setServicePlans(data.plans ?? []);
    } catch {
      setServicePlans([]);
    }
  }, [token]);

  useEffect(() => {
    fetchServicePlans();
  }, [fetchServicePlans]);

  const start = (page - 1) * PAGE_SIZE;

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    if (!formEmail.trim() || !formPassword) {
      setAddError('Email and initial password are required.');
      return;
    }
    if (!token) {
      setAddError('Session expired. Please sign in again.');
      return;
    }
    try {
      await postJson<{ client: Client }>(
        '/clients',
        {
          email: formEmail.trim(),
          password: formPassword,
          full_name: formFullName.trim() || undefined,
          company_name: formCompanyName.trim() || undefined,
          phone: formPhone.trim() || undefined,
          service_plan: formServicePlan.trim() || (servicePlans[0]?.name ?? undefined),
          status: formStatus,
          address: formAddress.trim() || undefined,
          notes: formNotes.trim() || undefined,
        },
        token,
      );
      resetForm();
      setAddModalOpen(false);
      fetchClients();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add client.');
    }
  };

  function resetForm() {
    setFormEmail('');
    setFormPassword('');
    setFormFullName('');
    setFormCompanyName('');
    setFormPhone('');
    setFormServicePlan(servicePlans[0]?.name ?? '');
    setFormStatus('PENDING_SETUP');
    setFormAddress('');
    setFormNotes('');
  }

  const openModal = () => {
    setAddError(null);
    setFormEmail('');
    setFormPassword('');
    setFormFullName('');
    setFormCompanyName('');
    setFormPhone('');
    setFormServicePlan(servicePlans[0]?.name ?? '');
    setFormStatus('PENDING_SETUP');
    setFormAddress('');
    setFormNotes('');
    setAddModalOpen(true);
  };

  const openEditModal = (client: Client) => {
    setAddError(null);
    setEditingClient(client);
    setFormFullName(client.full_name ?? '');
    setFormCompanyName(client.company_name ?? '');
    setFormPhone(client.phone ?? '');
    setFormServicePlan((client.service_plan || servicePlans[0]?.name) ?? '');
    setFormStatus((client.status as ClientStatus) || 'ACTIVE');
    setFormAddress(client.address ?? '');
    setFormNotes(client.notes ?? '');
    setEditModalOpen(true);
  };

  const handleEditClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    if (!editingClient || !token) return;
    try {
      await patchJson<{ client: Client }>(
        `/clients/${editingClient.id}`,
        {
          full_name: formFullName.trim() || null,
          company_name: formCompanyName.trim() || null,
          phone: formPhone.trim() || null,
          service_plan: formServicePlan.trim() || null,
          status: formStatus,
          address: formAddress.trim() || null,
          notes: formNotes.trim() || null,
        },
        token,
      );
      setEditModalOpen(false);
      setEditingClient(null);
      fetchClients();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to update client.');
    }
  };

  function statusBadge(status: string) {
    if (status === 'ACTIVE') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-600">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          Active
        </span>
      );
    }
    if (status === 'PENDING_SETUP') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-600">
          <span className="size-1.5 rounded-full bg-amber-500" />
          Pending Setup
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-600">
        <span className="size-1.5 rounded-full bg-red-500" />
        Suspended
      </span>
    );
  }

  return (
    <>
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
        <div className="flex items-center gap-2 text-slate-600">
          <LayoutGrid className="size-5" />
          <h2 className="font-semibold text-slate-900">Client Management</h2>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative flex items-center">
            <Search className="absolute left-3 size-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search clients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64 rounded-lg border-0 bg-slate-100 py-2 pl-9 pr-4 text-sm outline-none ring-1 ring-transparent transition focus:ring-2 focus:ring-[#14B8A6]/50"
            />
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-6xl space-y-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-3xl font-black tracking-tight text-slate-900">
                Client Portfolio
              </h1>
              <p className="max-w-lg text-slate-500">
                Manage and monitor all platform accounts, oversee subscription
                tiers, and control account statuses across the WorkPilot network.
              </p>
            </div>
            <button
              type="button"
              onClick={openModal}
              className="flex items-center gap-2 rounded-lg bg-[#14B8A6] px-6 py-2.5 text-sm font-bold text-white shadow-sm shadow-[#14B8A6]/20 transition hover:bg-[#13a89a]"
            >
              <Plus className="size-5" />
              Add New Client
            </button>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-start justify-between">
                <p className="text-sm font-medium text-slate-500">Total Clients</p>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-600">
                  {total}
                </span>
              </div>
              <p className="text-3xl font-black text-slate-900">{total}</p>
              <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-[#14B8A6]"
                  style={{ width: `${total ? Math.min((total / 1500) * 100, 100) : 0}%` }}
                />
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-start justify-between">
                <p className="text-sm font-medium text-slate-500">Active Licenses</p>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-600">
                  {totalActive}
                </span>
              </div>
              <p className="text-3xl font-black text-slate-900">{totalActive}</p>
              <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-[#14B8A6]"
                  style={{ width: `${totalActive ? Math.min((totalActive / 1200) * 100, 100) : 0}%` }}
                />
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-start justify-between">
                <p className="text-sm font-medium text-slate-500">Pending Setup</p>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-600">
                  {totalPending ? 'Action Req' : '0'}
                </span>
              </div>
              <p className="text-3xl font-black text-slate-900">{totalPending}</p>
              <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-amber-500"
                  style={{ width: `${totalPending ? Math.min((totalPending / 50) * 100, 100) : 0}%` }}
                />
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                      Company / Email
                    </th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                      Primary Contact
                    </th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                      Service Plan
                    </th>
                    <th className="px-6 py-4 text-center text-xs font-bold uppercase tracking-wider text-slate-500">
                      Status
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wider text-slate-500">
                      Operations
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                        Loading…
                      </td>
                    </tr>
                  ) : clients.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                        {total === 0
                          ? 'No clients yet. Add one with “Add New Client”.'
                          : 'No clients match your search.'}
                      </td>
                    </tr>
                  ) : (
                    clients.map((client) => (
                      <tr key={client.id} className="transition-colors hover:bg-slate-50">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex size-8 items-center justify-center rounded bg-slate-100 text-slate-400">
                              <Building2 className="size-4" />
                            </div>
                            <div>
                              <span className="font-semibold text-slate-900">
                                {client.company_name || client.email.replace(/@.*/, '')}
                              </span>
                              <span className="block text-xs text-slate-500">{client.email}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-medium text-slate-900">
                            {client.full_name || client.email}
                          </span>
                          <span className="block text-sm text-slate-500">{client.email}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="rounded bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                            {client.service_plan || '—'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          {statusBadge(client.status)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => openEditModal(client)}
                            className="font-bold text-sm text-[#14B8A6] transition hover:text-[#13a89a]"
                          >
                            Edit Profile
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4">
              <p className="text-xs font-medium text-slate-500">
                Showing {total === 0 ? 0 : start + 1}–{Math.min(start + PAGE_SIZE, total)} of {total} clients
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="rounded border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {addModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => setAddModalOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-slate-900">Add New Client</h3>
            <p className="mt-1 text-sm text-slate-500">
              These credentials will be used by the client (Admin) to sign in. Fill in as many details as you have.
            </p>
            <form onSubmit={handleAddClient} className="mt-6 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="client-email" className="block text-sm font-medium text-slate-700">Email *</label>
                  <input
                    id="client-email"
                    type="email"
                    required
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="admin@company.com"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="client-password" className="block text-sm font-medium text-slate-700">Initial password *</label>
                  <input
                    id="client-password"
                    type="password"
                    required
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder="••••••••"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
                  />
                </div>
                <div>
                  <label htmlFor="client-fullname" className="block text-sm font-medium text-slate-700">Full name</label>
                  <input
                    id="client-fullname"
                    type="text"
                    value={formFullName}
                    onChange={(e) => setFormFullName(e.target.value)}
                    placeholder="John Doe"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
                  />
                </div>
                <div>
                  <label htmlFor="client-company" className="block text-sm font-medium text-slate-700">Company name</label>
                  <input
                    id="client-company"
                    type="text"
                    value={formCompanyName}
                    onChange={(e) => setFormCompanyName(e.target.value)}
                    placeholder="Acme Inc."
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
                  />
                </div>
                <div>
                  <label htmlFor="client-phone" className="block text-sm font-medium text-slate-700">Phone</label>
                  <input
                    id="client-phone"
                    type="tel"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="+1 234 567 8900"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
                  />
                </div>
                <div>
                  <label htmlFor="client-plan" className="block text-sm font-medium text-slate-700">Service plan</label>
                  <select
                    id="client-plan"
                    value={formServicePlan}
                    onChange={(e) => setFormServicePlan(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
                  >
                    {servicePlans.length === 0 ? (
                      <option value="">No plans — add plans in Service Plans</option>
                    ) : (
                      servicePlans.map((p) => (
                        <option key={p.id} value={p.name}>{p.name}</option>
                      ))
                    )}
                  </select>
                </div>
                <div>
                  <label htmlFor="client-status" className="block text-sm font-medium text-slate-700">Status</label>
                  <select
                    id="client-status"
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as ClientStatus)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="client-address" className="block text-sm font-medium text-slate-700">Address</label>
                  <textarea
                    id="client-address"
                    rows={2}
                    value={formAddress}
                    onChange={(e) => setFormAddress(e.target.value)}
                    placeholder="Street, City, Country"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="client-notes" className="block text-sm font-medium text-slate-700">Notes</label>
                  <textarea
                    id="client-notes"
                    rows={2}
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="Internal notes about this client"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
                  />
                </div>
              </div>
              {addError && <p className="text-sm text-red-600">{addError}</p>}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#13a89a]"
                >
                  Add Client
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editModalOpen && editingClient && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => { setEditModalOpen(false); setEditingClient(null); }}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-slate-900">Edit Client Profile</h3>
            <p className="mt-1 text-sm text-slate-500">
              Update client details. Email cannot be changed.
            </p>
            <form onSubmit={handleEditClient} className="mt-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Email</label>
                <p className="mt-1 text-sm text-slate-600">{editingClient.email}</p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="edit-fullname" className="block text-sm font-medium text-slate-700">Full name</label>
                  <input
                    id="edit-fullname"
                    type="text"
                    value={formFullName}
                    onChange={(e) => setFormFullName(e.target.value)}
                    placeholder="John Doe"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
                  />
                </div>
                <div>
                  <label htmlFor="edit-company" className="block text-sm font-medium text-slate-700">Company name</label>
                  <input
                    id="edit-company"
                    type="text"
                    value={formCompanyName}
                    onChange={(e) => setFormCompanyName(e.target.value)}
                    placeholder="Acme Inc."
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
                  />
                </div>
                <div>
                  <label htmlFor="edit-phone" className="block text-sm font-medium text-slate-700">Phone</label>
                  <input
                    id="edit-phone"
                    type="tel"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="+1 234 567 8900"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
                  />
                </div>
                <div>
                  <label htmlFor="edit-plan" className="block text-sm font-medium text-slate-700">Service plan</label>
                  <select
                    id="edit-plan"
                    value={formServicePlan}
                    onChange={(e) => setFormServicePlan(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
                  >
                    {servicePlans.map((p) => (
                      <option key={p.id} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="edit-status" className="block text-sm font-medium text-slate-700">Status</label>
                  <select
                    id="edit-status"
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as ClientStatus)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="edit-address" className="block text-sm font-medium text-slate-700">Address</label>
                  <textarea
                    id="edit-address"
                    rows={2}
                    value={formAddress}
                    onChange={(e) => setFormAddress(e.target.value)}
                    placeholder="Street, City, Country"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="edit-notes" className="block text-sm font-medium text-slate-700">Notes</label>
                  <textarea
                    id="edit-notes"
                    rows={2}
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="Internal notes about this client"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
                  />
                </div>
              </div>
              {addError && <p className="text-sm text-red-600">{addError}</p>}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setEditModalOpen(false); setEditingClient(null); }}
                  className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#13a89a]"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
