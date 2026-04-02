'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  MoreVertical,
  TrendingUp,
  TrendingDown,
  UserPlus,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getJson, postJson, patchJson, deleteRequest } from '../../apiClient';
import { useRouter } from 'next/navigation';
import { Pagination } from '../Pagination';

interface Customer {
  id: number;
  full_name: string;
  email: string;
  phone: string | null;
  company: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  status: string;
  last_contact: string | null;
  notes: string | null;
  customer_type_id: number | null;
  created_at: string;
  updated_at: string;
}

interface CustomerType {
  id: number;
  name: string;
  description: string | null;
  company_name_required: boolean;
  allow_branches: boolean;
  work_address_name: string;
}

interface CustomersResponse {
  customers: Customer[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  totalActive: number;
  totalLeads: number;
  totalInactive: number;
  newThisMonth?: number;
  pctChangeTotal?: number | null;
  pctChangeLeads?: number | null;
  pctChangeRetention?: number | null;
  pctChangeNewThisMonth?: number | null;
}

const PAGE_SIZE = 10;
const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active', color: 'bg-emerald-100 text-emerald-800' },
  { value: 'LEAD', label: 'Lead', color: 'bg-amber-100 text-amber-800' },
  { value: 'INACTIVE', label: 'Inactive', color: 'bg-slate-100 text-slate-400' },
];

function formatLastContact(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 60) return `${diffMins} minutes ago`;
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function locationStr(c: Customer): string {
  const parts = [c.city, c.region, c.country].filter(Boolean);
  return parts.length ? parts.join(', ') : (c.address || '—');
}

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [totalActive, setTotalActive] = useState(0);
  const [totalLeads, setTotalLeads] = useState(0);
  const [totalInactive, setTotalInactive] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [newThisMonth, setNewThisMonth] = useState(0);
  const [pctChangeTotal, setPctChangeTotal] = useState<number | null>(null);
  const [pctChangeLeads, setPctChangeLeads] = useState<number | null>(null);
  const [pctChangeRetention, setPctChangeRetention] = useState<number | null>(null);
  const [pctChangeNewThisMonth, setPctChangeNewThisMonth] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [actionMenu, setActionMenu] = useState<number | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  const [formFullName, setFormFullName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formCompany, setFormCompany] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formCity, setFormCity] = useState('');
  const [formRegion, setFormRegion] = useState('');
  const [formCountry, setFormCountry] = useState('');
  const [formStatus, setFormStatus] = useState('LEAD');
  const [formNotes, setFormNotes] = useState('');
  const [formCustomerTypeId, setFormCustomerTypeId] = useState<number | ''>('');
  const [customerTypes, setCustomerTypes] = useState<CustomerType[]>([]);

  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  const fetchCustomers = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));
      if (searchDebounced) params.set('search', searchDebounced);
      if (statusFilter) params.set('status', statusFilter);
      const data = await getJson<CustomersResponse>(`/customers?${params.toString()}`, token);
      setCustomers(data.customers ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
      setTotalActive(data.totalActive ?? 0);
      setTotalLeads(data.totalLeads ?? 0);
      setTotalInactive(data.totalInactive ?? 0);
      setNewThisMonth(data.newThisMonth ?? 0);
      setPctChangeTotal(data.pctChangeTotal ?? null);
      setPctChangeLeads(data.pctChangeLeads ?? null);
      setPctChangeRetention(data.pctChangeRetention ?? null);
      setPctChangeNewThisMonth(data.pctChangeNewThisMonth ?? null);
    } catch {
      setCustomers([]);
      setTotal(0);
      setTotalPages(1);
      setTotalActive(0);
      setTotalLeads(0);
      setTotalInactive(0);
      setNewThisMonth(0);
      setPctChangeTotal(null);
      setPctChangeLeads(null);
      setPctChangeRetention(null);
      setPctChangeNewThisMonth(null);
    } finally {
      setLoading(false);
    }
  }, [token, page, searchDebounced, statusFilter]);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearchDebounced(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  useEffect(() => {
    if (!token) return;
    getJson<{ customerTypes: CustomerType[] }>('/settings/customer-types', token)
      .then(d => setCustomerTypes(d.customerTypes ?? []))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (actionMenu === null) return;
    const close = () => setActionMenu(null);
    const t = setTimeout(() => document.addEventListener('click', close), 100);
    return () => {
      clearTimeout(t);
      document.removeEventListener('click', close);
    };
  }, [actionMenu]);

  const start = (page - 1) * PAGE_SIZE;
  const retentionRate = total > 0 ? ((totalActive / total) * 100).toFixed(1) : '0';

  const resetForm = () => {
    setFormFullName('');
    setFormEmail('');
    setFormPhone('');
    setFormCompany('');
    setFormAddress('');
    setFormCity('');
    setFormRegion('');
    setFormCountry('');
    setFormStatus('LEAD');
    setFormNotes('');
    setFormCustomerTypeId('');
  };

  const openAdd = () => {
    router.push('/dashboard/customers/new');
  };

  const openEdit = (c: Customer) => {
    setAddError(null);
    setEditingCustomer(c);
    setFormFullName(c.full_name);
    setFormEmail(c.email);
    setFormPhone(c.phone ?? '');
    setFormCompany(c.company ?? '');
    setFormAddress(c.address ?? '');
    setFormCity(c.city ?? '');
    setFormRegion(c.region ?? '');
    setFormCountry(c.country ?? '');
    setFormStatus(c.status);
    setFormNotes(c.notes ?? '');
    setFormCustomerTypeId(c.customer_type_id ?? '');
    setActionMenu(null);
    setEditModalOpen(true);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    if (!formFullName.trim() || !formEmail.trim()) {
      setAddError('Full name and email are required.');
      return;
    }
    if (!token) return;
    try {
      await postJson<{ customer: Customer }>(
        '/customers',
        {
          full_name: formFullName.trim(),
          email: formEmail.trim(),
          phone: formPhone.trim() || undefined,
          company: formCompany.trim() || undefined,
          address: formAddress.trim() || undefined,
          city: formCity.trim() || undefined,
          region: formRegion.trim() || undefined,
          country: formCountry.trim() || undefined,
          status: formStatus,
          notes: formNotes.trim() || undefined,
          customer_type_id: formCustomerTypeId === '' ? null : Number(formCustomerTypeId),
        },
        token,
      );
      setAddModalOpen(false);
      resetForm();
      fetchCustomers();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to create customer.');
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    if (!editingCustomer || !token) return;
    try {
      await patchJson<{ customer: Customer }>(
        `/customers/${editingCustomer.id}`,
        {
          full_name: formFullName.trim(),
          email: formEmail.trim(),
          phone: formPhone.trim() || null,
          company: formCompany.trim() || null,
          address: formAddress.trim() || null,
          city: formCity.trim() || null,
          region: formRegion.trim() || null,
          country: formCountry.trim() || null,
          status: formStatus,
          notes: formNotes.trim() || null,
          customer_type_id: formCustomerTypeId === '' ? null : Number(formCustomerTypeId),
        },
        token,
      );
      setEditModalOpen(false);
      setEditingCustomer(null);
      fetchCustomers();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to update customer.');
    }
  };

  const handleDelete = async (id: number) => {
    if (!token) return;
    try {
      await deleteRequest(`/customers/${id}`, token);
      setActionMenu(null);
      fetchCustomers();
    } catch {
      setAddError('Failed to delete customer.');
    }
  };

  const statusBadge = (status: string) => {
    const opt = STATUS_OPTIONS.find((s) => s.value === status) ?? STATUS_OPTIONS[2];
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${opt.color}`}>
        {opt.label}
      </span>
    );
  };

  const initials = (name: string) =>
    name
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

  return (
    <>
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
        <div className="flex items-center gap-6">
          <h2 className="text-lg font-bold text-slate-900">Customer Management</h2>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Quick search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border-0 bg-slate-100 py-1.5 pl-10 pr-4 text-sm outline-none ring-1 ring-transparent focus:ring-2 focus:ring-[#14B8A6]"
            />
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-6xl space-y-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-tight text-slate-900">Customer Management</h1>
              <p className="mt-1 text-slate-500">Manage your client relationships and contact data.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <motion.button
                type="button"
                onClick={openAdd}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#14B8A6] px-5 py-2.5 font-bold text-white shadow-sm transition hover:brightness-110"
              >
                <UserPlus className="size-5" />
                Create New Customer
              </motion.button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Total Customers', value: total, change: pctChangeTotal, up: (pctChangeTotal ?? 0) >= 0 },
              { label: 'Active Leads', value: totalLeads, change: pctChangeLeads, up: (pctChangeLeads ?? 0) >= 0 },
              { label: 'Retention Rate', value: `${retentionRate}%`, change: pctChangeRetention, up: (pctChangeRetention ?? 0) >= 0 },
              { label: 'New This Month', value: newThisMonth, change: pctChangeNewThisMonth, up: (pctChangeNewThisMonth ?? 0) >= 0 },
            ].map((card, i) => (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <p className="mb-1 text-sm font-medium text-slate-500">{card.label}</p>
                <div className="flex items-end gap-3">
                  <h3 className="text-3xl font-bold text-slate-900">{card.value}</h3>
                  {card.change !== null && card.change !== undefined ? (
                    <span
                      className={`mb-1 flex items-center text-sm font-semibold ${card.up ? 'text-emerald-500' : 'text-rose-500'}`}
                    >
                      {card.up ? <TrendingUp className="mr-0.5 size-4" /> : <TrendingDown className="mr-0.5 size-4" />}
                      {card.change >= 0 ? '+' : ''}{card.change}%
                    </span>
                  ) : (
                    <span className="mb-1 text-sm text-slate-400">—</span>
                  )}
                </div>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
          >
            <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-bold text-slate-900">Customer Directory</h2>
              <div className="flex items-center gap-3">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search customers..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-4 text-sm outline-none transition focus:ring-2 focus:ring-[#14B8A6] focus:border-transparent"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium transition hover:bg-slate-50"
                >
                  <option value="">All statuses</option>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Customer Name</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Company</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Email</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Last Contact</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-500">Loading…</td>
                    </tr>
                  ) : customers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                        No customers yet. Create one to get started.
                      </td>
                    </tr>
                  ) : (
                    <AnimatePresence>
                      {customers.map((c, i) => (
                        <motion.tr
                          key={c.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: i * 0.02 }}
                          onClick={() => router.push(`/dashboard/customers/${c.id}`)}
                          className="group bg-white hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#14B8A6]/20 font-bold text-xs text-[#14B8A6]">
                                {initials(c.full_name)}
                              </div>
                              <div>
                                <span className="text-sm font-semibold text-slate-900">{c.full_name}</span>
                                <span className="block text-xs text-slate-500">{locationStr(c)}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">{statusBadge(c.status)}</td>
                          <td className="px-6 py-4 text-sm text-slate-900">{c.company || '—'}</td>
                          <td className="px-6 py-4 text-sm text-slate-500">{c.email}</td>
                          <td className="px-6 py-4 text-sm text-slate-500">{formatLastContact(c.last_contact)}</td>
                          <td
                            className="relative px-6 py-4 text-right"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (actionMenu === c.id) {
                                  setActionMenu(null);
                                } else {
                                  const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                  setMenuPosition({ top: rect.bottom + 4, left: rect.right - 120 });
                                  setActionMenu(c.id);
                                }
                              }}
                              className="rounded p-1 transition hover:bg-slate-200"
                            >
                              <MoreVertical className="size-5 text-slate-500" />
                            </button>
                            {actionMenu === c.id && typeof document !== 'undefined' && createPortal(
                              <div
                                className="fixed z-[100] w-28 rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
                                style={{ top: menuPosition.top, left: menuPosition.left }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={() => { setActionMenu(null); router.push(`/dashboard/customers/${c.id}/edit`); }}
                                  className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/customers/${c.id}`); }}
                                  className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                                >
                                  View detail
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(c.id)}
                                  className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                                >
                                  Delete
                                </button>
                              </div>,
                              document.body,
                            )}
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  )}
                </tbody>
              </table>
            </div>

            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              itemName="customers"
            />
          </motion.div>
        </div>
      </div>

      {editModalOpen && editingCustomer && (
        <CustomerModal
          title="Edit Customer"
          onSubmit={handleEdit}
          onClose={() => { setEditModalOpen(false); setEditingCustomer(null); }}
          error={addError}
          formFullName={formFullName}
          setFormFullName={setFormFullName}
          formEmail={formEmail}
          setFormEmail={setFormEmail}
          formPhone={formPhone}
          setFormPhone={setFormPhone}
          formCompany={formCompany}
          setFormCompany={setFormCompany}
          formAddress={formAddress}
          setFormAddress={setFormAddress}
          formCity={formCity}
          setFormCity={setFormCity}
          formRegion={formRegion}
          setFormRegion={setFormRegion}
          formCountry={formCountry}
          setFormCountry={setFormCountry}
          formStatus={formStatus}
          setFormStatus={setFormStatus}
          formNotes={formNotes}
          setFormNotes={setFormNotes}
          formCustomerTypeId={formCustomerTypeId}
          setFormCustomerTypeId={setFormCustomerTypeId}
          customerTypes={customerTypes}
          submitLabel="Save Changes"
        />
      )}
    </>
  );
}

function CustomerModal({
  title,
  onSubmit,
  onClose,
  error,
  formFullName,
  setFormFullName,
  formEmail,
  setFormEmail,
  formPhone,
  setFormPhone,
  formCompany,
  setFormCompany,
  formAddress,
  setFormAddress,
  formCity,
  setFormCity,
  formRegion,
  setFormRegion,
  formCountry,
  setFormCountry,
  formStatus,
  setFormStatus,
  formNotes,
  setFormNotes,
  formCustomerTypeId,
  setFormCustomerTypeId,
  customerTypes,
  submitLabel,
}: any) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-slate-900">{title}</h3>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">Full Name *</label>
              <input type="text" required value={formFullName} onChange={(e) => setFormFullName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Email *</label>
              <input type="email" required value={formEmail} onChange={(e) => setFormEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">Phone</label>
              <input type="tel" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Company</label>
              <input type="text" value={formCompany} onChange={(e) => setFormCompany(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">Customer Type</label>
              <select value={formCustomerTypeId} onChange={(e) => setFormCustomerTypeId(e.target.value ? Number(e.target.value) : '')} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30">
                <option value="">Default</option>
                {customerTypes.map((t: any) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Status</label>
              <select value={formStatus} onChange={(e) => setFormStatus(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30">
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Address</label>
            <input type="text" value={formAddress} onChange={(e) => setFormAddress(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-slate-700">City</label>
              <input type="text" value={formCity} onChange={(e) => setFormCity(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Region</label>
              <input type="text" value={formRegion} onChange={(e) => setFormRegion(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Country</label>
              <input type="text" value={formCountry} onChange={(e) => setFormCountry(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Notes</label>
            <textarea rows={3} value={formNotes} onChange={(e) => setFormNotes(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
            <button type="submit" className="flex-1 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#13a89a]">{submitLabel}</button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
