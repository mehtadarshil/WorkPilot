'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Search, Quote, Plus, ChevronDown, ChevronRight, ChevronUp, ImagePlus, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getJson, postJson } from '../../apiClient';
import { Pagination } from '../Pagination';
import ImportCustomerSelect from '../ImportCustomerSelect';
import WorkAddressSelect from '../WorkAddressSelect';

interface Quotation {
  id: number;
  quotation_number: string;
  customer_id: number;
  customer_full_name: string | null;
  job_id: number | null;
  job_title: string | null;
  quotation_date: string;
  valid_until: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  currency: string;
  state: string;
  created_at: string;
}

interface QuotationsResponse {
  quotations: Quotation[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  stateCounts: Record<string, number>;
}

interface Customer {
  id: number;
  full_name: string;
  email: string;
  address_line_1?: string;
  address_line_2?: string;
  town?: string;
  county?: string;
  postcode?: string;
}

interface QuotationSettings {
  default_currency: string;
  default_valid_days: number;
  default_tax_percentage: number;
}

type LineItemImage = {
  original_filename: string;
  content_type: string;
  byte_size: number;
  data_url?: string | null;
  content_base64?: string;
  filename?: string;
};

type LineItemForm = { description: string; quantity: number; unit_price: number; images: LineItemImage[] };

const PAGE_SIZE = 10;
const QUOTATION_STATES = [
  { value: 'draft', label: 'Draft', color: 'bg-slate-100 text-slate-600' },
  { value: 'sent', label: 'Sent', color: 'bg-blue-100 text-blue-800' },
  { value: 'accepted', label: 'Accepted', color: 'bg-emerald-100 text-emerald-800' },
  { value: 'rejected', label: 'Rejected', color: 'bg-rose-100 text-rose-800' },
  { value: 'expired', label: 'Expired', color: 'bg-slate-200 text-slate-500' },
] as const;

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

function formatCustomerAddress(c: Customer): string {
  return [c.address_line_1, c.address_line_2, c.town, c.county, c.postcode]
    .filter((p) => typeof p === 'string' && p.trim() !== '')
    .join(', ');
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || '');
      const i = s.indexOf(',');
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.onerror = () => reject(new Error('Could not read file'));
    r.readAsDataURL(file);
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(new Error('Could not preview file'));
    r.readAsDataURL(file);
  });
}

function resizeLineDescriptionTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.max(el.scrollHeight, 40)}px`;
}

export default function QuotationsPage() {
  const router = useRouter();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [stateCounts, setStateCounts] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [page, setPage] = useState(1);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [visitModalOpen, setVisitModalOpen] = useState(false);
  const [visitError, setVisitError] = useState<string | null>(null);
  const [visitCustomerId, setVisitCustomerId] = useState<number | null>(null);
  const [visitOfficerId, setVisitOfficerId] = useState<number | null>(null);
  const [visitDate, setVisitDate] = useState('');
  const [visitTime, setVisitTime] = useState('09:00');
  const [visitDuration, setVisitDuration] = useState(60);
  const [visitNotes, setVisitNotes] = useState('');
  const [visitWorkAddressId, setVisitWorkAddressId] = useState<number | null>(null);
  const [visitWorkAddressOptions, setVisitWorkAddressOptions] = useState<{ id: number; label: string }[]>([]);
  const [officers, setOfficers] = useState<{ id: number; full_name: string; state: string }[]>([]);

  const [formCustomerId, setFormCustomerId] = useState<number | null>(null);
  const [formQuotationDate, setFormQuotationDate] = useState('');
  const [formValidUntil, setFormValidUntil] = useState('');
  const [formCurrency, setFormCurrency] = useState('USD');
  const [formNotes, setFormNotes] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formLineItems, setFormLineItems] = useState<LineItemForm[]>([
    { description: '', quantity: 1, unit_price: 0, images: [] },
  ]);
  const lineDescriptionRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const [formTaxPercentage, setFormTaxPercentage] = useState(0);

  useLayoutEffect(() => {
    if (!addModalOpen) return;
    lineDescriptionRefs.current.forEach((el) => resizeLineDescriptionTextarea(el));
  }, [formLineItems, addModalOpen]);
  const [formWorkAddressId, setFormWorkAddressId] = useState<number | null>(null);
  const [workAddressOptions, setWorkAddressOptions] = useState<{ id: number; label: string }[]>([]);

  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  const fetchWorkAddressesForCustomer = useCallback(
    async (customerId: number, setter: (options: { id: number; label: string }[]) => void = setWorkAddressOptions) => {
      if (!token) {
        setter([]);
        return;
      }
      try {
        const res = await getJson<{
          work_addresses: {
            id: number;
            name: string;
            address_line_1?: string | null;
            town?: string | null;
            postcode?: string | null;
          }[];
        }>(`/customers/${customerId}/work-addresses?status=active`, token);
        const rows = res.work_addresses ?? [];
        setter(
          rows.map((w) => {
            const addr = [w.address_line_1, w.town, w.postcode].filter((x): x is string => Boolean(x && String(x).trim())).join(', ');
            const label = [w.name?.trim() || `Site #${w.id}`, addr].filter(Boolean).join(' — ');
            return { id: w.id, label: label || `Work #${w.id}` };
          }),
        );
      } catch {
        setter([]);
      }
    },
    [token],
  );

  const fetchQuotations = useCallback(async () => {
    if (!token) return;
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));
      if (searchDebounced) params.set('search', searchDebounced);
      if (stateFilter) params.set('state', stateFilter);
      const data = await getJson<QuotationsResponse>(`/quotations?${params.toString()}`, token);
      setQuotations(data.quotations ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
      setStateCounts(data.stateCounts ?? {});
    } catch {
      setQuotations([]);
      setTotal(0);
      setTotalPages(1);
      setStateCounts({});
    }
  }, [token, page, searchDebounced, stateFilter]);

  const fetchCustomers = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getJson<{ customers: Customer[] }>('/customers?limit=5000&page=1', token);
      setCustomers(data.customers ?? []);
    } catch {
      setCustomers([]);
    }
  }, [token]);

  const fetchQuotationSettings = useCallback(async () => {
    if (!token) return null;
    try {
      const data = await getJson<{ settings: QuotationSettings }>('/settings/quotation', token);
      return data.settings ?? null;
    } catch {
      return null;
    }
  }, [token]);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearchDebounced(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const t = setTimeout(() => {
      void fetchQuotations();
    }, 0);
    return () => clearTimeout(t);
  }, [fetchQuotations]);

  useEffect(() => {
    if (addModalOpen || visitModalOpen) {
      const t = setTimeout(() => {
        void fetchCustomers();
      }, 0);
      return () => clearTimeout(t);
    }
  }, [addModalOpen, visitModalOpen, fetchCustomers]);

  const resetForm = (settings: QuotationSettings | null) => {
    setFormCustomerId(null);
    setFormWorkAddressId(null);
    setWorkAddressOptions([]);
    const today = new Date().toISOString().slice(0, 10);
    const validDays = settings?.default_valid_days ?? 30;
    const valid = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    setFormQuotationDate(today);
    setFormValidUntil(valid);
    setFormCurrency(settings?.default_currency ?? 'USD');
    setFormNotes('');
    setFormDescription('');
    setFormLineItems([{ description: '', quantity: 1, unit_price: 0, images: [] }]);
    setFormTaxPercentage(settings?.default_tax_percentage ?? 0);
  };

  const openAdd = async () => {
    setAddError(null);
    const settings = await fetchQuotationSettings();
    resetForm(settings);
    setAddModalOpen(true);
  };

  const handleFormCustomerChange = (customerId: number | null) => {
    setFormCustomerId(customerId);
    setFormWorkAddressId(null);
    setWorkAddressOptions([]);
    if (customerId) {
      void fetchWorkAddressesForCustomer(customerId);
    }
  };

  const addLineItem = () => {
    setFormLineItems((prev) => [...prev, { description: '', quantity: 1, unit_price: 0, images: [] }]);
  };

  const updateLineItem = (i: number, field: 'description' | 'quantity' | 'unit_price', value: string | number) => {
    setFormLineItems((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      return next;
    });
  };

  const removeLineItem = (i: number) => {
    if (formLineItems.length <= 1) return;
    setFormLineItems((prev) => prev.filter((_, idx) => idx !== i));
  };

  const moveLineItem = (from: number, to: number) => {
    if (to < 0 || to >= formLineItems.length) return;
    setFormLineItems((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      if (!item) return prev;
      next.splice(to, 0, item);
      return next;
    });
  };

  const addLineItemImages = async (lineIndex: number, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const selected = Array.from(files).filter((f) => f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|gif|webp)$/i.test(f.name));
    if (selected.length === 0) return;
    const images = await Promise.all(
      selected.map(async (file) => ({
        original_filename: file.name || 'image',
        filename: file.name || 'image',
        content_type: file.type || 'image/jpeg',
        byte_size: file.size,
        content_base64: await readFileAsBase64(file),
        data_url: await readFileAsDataUrl(file),
      })),
    );
    setFormLineItems((prev) => {
      const next = [...prev];
      const current = next[lineIndex];
      if (!current) return prev;
      next[lineIndex] = { ...current, images: [...current.images, ...images].slice(0, 8) };
      return next;
    });
  };

  const removeLineItemImage = (lineIndex: number, imageIndex: number) => {
    setFormLineItems((prev) => {
      const next = [...prev];
      const current = next[lineIndex];
      if (!current) return prev;
      next[lineIndex] = { ...current, images: current.images.filter((_, idx) => idx !== imageIndex) };
      return next;
    });
  };

  const subtotal = formLineItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const taxAmount = Math.round(subtotal * (formTaxPercentage / 100) * 100) / 100;
  const totalAmount = subtotal + taxAmount;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    if (formCustomerId === null) {
      setAddError('Customer is required.');
      return;
    }
    const validItems = formLineItems.filter((item) => item.description.trim());
    if (validItems.length === 0) {
      setAddError('At least one line item with description is required.');
      return;
    }
    if (!token) return;
    try {
      const res = await postJson<{ quotation: Quotation }>(
        '/quotations',
        {
          customer_id: formCustomerId,
          quotation_date: formQuotationDate,
          valid_until: formValidUntil,
          currency: formCurrency,
          notes: formNotes.trim() || undefined,
          description: formDescription.trim() || undefined,
          ...(formWorkAddressId != null ? { quotation_work_address_id: formWorkAddressId } : {}),
          line_items: validItems.map((item) => ({
            description: item.description.trim(),
            quantity: item.quantity,
            unit_price: item.unit_price,
            images: item.images.map((image) => ({
              original_filename: image.original_filename,
              content_type: image.content_type,
              byte_size: image.byte_size,
              filename: image.filename,
              content_base64: image.content_base64,
            })),
          })),
          tax_percentage: formTaxPercentage,
        },
        token,
      );
      setAddModalOpen(false);
      resetForm(null);
      fetchQuotations();
      if (res.quotation?.id) router.push(`/dashboard/quotations/${res.quotation.id}`);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to create quotation.');
    }
  };

  const stateBadge = (state: string) => {
    const opt = QUOTATION_STATES.find((s) => s.value === state) ?? QUOTATION_STATES[0];
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${opt.color}`}>
        {opt.label}
      </span>
    );
  };

  const resetVisitForm = () => {
    setVisitCustomerId(null);
    setVisitOfficerId(null);
    setVisitWorkAddressId(null);
    setVisitWorkAddressOptions([]);
    setVisitDate('');
    setVisitTime('09:00');
    setVisitDuration(60);
    setVisitNotes('');
    setVisitError(null);
  };

  const handleVisitCustomerChange = (customerId: number | null) => {
    setVisitCustomerId(customerId);
    setVisitWorkAddressId(null);
    setVisitWorkAddressOptions([]);
    if (customerId) {
      void fetchWorkAddressesForCustomer(customerId, setVisitWorkAddressOptions);
    }
  };

  const openVisitModal = async () => {
    setVisitError(null);
    resetVisitForm();
    if (token) {
      try {
        const data = await getJson<{ officers: { id: number; full_name: string; state: string }[] }>('/officers/list', token);
        setOfficers(data.officers?.filter((o) => o.state === 'active') ?? []);
      } catch {
        setOfficers([]);
      }
    }
    setVisitModalOpen(true);
  };

  const handleCreateVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    setVisitError(null);
    if (!visitCustomerId) {
      setVisitError('Customer is required.');
      return;
    }
    if (!visitOfficerId) {
      setVisitError('Officer is required.');
      return;
    }
    if (!visitDate || !visitTime) {
      setVisitError('Date and time are required.');
      return;
    }
    if (!token) return;
    try {
      const startTime = `${visitDate}T${visitTime}:00`;
      const res = await postJson<{
        job: { id: number };
        diary_event: { id: number };
      }>(
        '/quotation-visits',
        {
          customer_id: visitCustomerId,
          officer_id: visitOfficerId,
          ...(visitWorkAddressId != null ? { work_address_id: visitWorkAddressId } : {}),
          start_time: startTime,
          duration_minutes: visitDuration,
          notes: visitNotes.trim() || undefined,
        },
        token,
      );
      setVisitModalOpen(false);
      resetVisitForm();
      const jobId = res.job?.id;
      if (jobId) {
        router.push(`/dashboard/quotation-visits/${jobId}`);
      }
    } catch (err) {
      setVisitError(err instanceof Error ? err.message : 'Failed to create quotation visit.');
    }
  };

  return (
    <>
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
        <div className="flex items-center gap-6">
          <h2 className="text-lg font-bold text-slate-900">Quotation Management</h2>
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
              <h1 className="text-3xl font-black tracking-tight text-slate-900">Quotation Management</h1>
              <p className="mt-1 text-slate-500">Create, send, and track quotations for your services.</p>
            </div>
            <div className="flex items-center gap-3">
              <motion.button
                type="button"
                onClick={openVisitModal}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-5 py-2.5 font-bold text-amber-900 shadow-sm transition hover:bg-amber-100"
              >
                <Plus className="size-5" />
                Create Quotation Visit
              </motion.button>
              <motion.button
                type="button"
                onClick={openAdd}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#14B8A6] px-5 py-2.5 font-bold text-white shadow-sm transition hover:brightness-110"
              >
                <Plus className="size-5" />
                Create Quotation
              </motion.button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {QUOTATION_STATES.map((s) => (
              <motion.div
                key={s.value}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <p className="mb-1 text-xs font-medium text-slate-500">{s.label}</p>
                <h3 className="text-2xl font-bold text-slate-900">{stateCounts[s.value] ?? 0}</h3>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
          >
            <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-bold text-slate-900">Quotations</h2>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search quotations..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-4 text-sm outline-none transition focus:ring-2 focus:ring-[#14B8A6] focus:border-transparent"
                  />
                </div>
                <select
                  value={stateFilter}
                  onChange={(e) => {
                    setStateFilter(e.target.value);
                    setPage(1);
                  }}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium transition hover:bg-slate-50"
                >
                  <option value="">All states</option>
                  {QUOTATION_STATES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Quotation</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Customer</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Date</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Valid until</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Amount</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {quotations.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                        No quotations yet. Create one to get started.
                      </td>
                    </tr>
                  ) : (
                    <AnimatePresence>
                      {quotations.map((q, i) => (
                        <motion.tr
                          key={q.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: i * 0.02 }}
                          className="group transition-colors hover:bg-slate-50"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#14B8A6]/20">
                                <Quote className="size-5 text-[#14B8A6]" />
                              </div>
                              <span className="text-sm font-semibold text-slate-900">{q.quotation_number}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-700">{q.customer_full_name || '—'}</td>
                          <td className="px-6 py-4 text-sm text-slate-500">{formatDate(q.quotation_date)}</td>
                          <td className="px-6 py-4 text-sm text-slate-500">{formatDate(q.valid_until)}</td>
                          <td className="px-6 py-4 text-sm font-medium text-slate-900">{formatCurrency(q.total_amount, q.currency)}</td>
                          <td className="px-6 py-4">{stateBadge(q.state)}</td>
                          <td className="px-6 py-4">
                            <Link
                              href={`/dashboard/quotations/${q.id}`}
                              className="inline-flex items-center gap-1 rounded p-1 text-slate-500 transition hover:bg-slate-200 hover:text-slate-900"
                            >
                              View <ChevronRight className="size-4" />
                            </Link>
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
              itemName="quotations"
            />
          </motion.div>
        </div>
      </div>

      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setAddModalOpen(false)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-slate-900">Create Quotation</h3>
            <form onSubmit={handleAdd} className="mt-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Customer *</label>
                <div className="mt-1 flex gap-2">
                  <div className="flex-1">
                    <ImportCustomerSelect
                      customers={customers}
                      value={formCustomerId}
                      onChange={handleFormCustomerChange}
                      className="w-full"
                    />
                  </div>
                  <button type="button" onClick={() => window.open('/dashboard/customers/new', '_blank')} className="shrink-0 flex items-center justify-center size-[38px] rounded-lg border border-slate-200 text-[#14B8A6] hover:bg-[#14B8A6] hover:text-white transition-colors" title="Add new customer">
                    <Plus className="size-4" />
                  </button>
                </div>
                {formCustomerId && (
                  <div className="mt-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                    {(() => {
                      const c = customers.find(x => x.id === formCustomerId);
                      if (!c) return null;
                      const addr = formatCustomerAddress(c);
                      return (
                        <div className="flex flex-col gap-1">
                          <p className="font-semibold text-slate-800">{c.full_name}</p>
                          <p>{c.email}</p>
                          {addr && <p className="mt-1 border-t border-slate-200 pt-1 text-slate-500">{addr}</p>}
                        </div>
                      );
                    })()}
                  </div>
                )}
                {formCustomerId && (
                  <div className="mt-3">
                    <label className="block text-sm font-medium text-slate-700">Work / site address (optional)</label>
                    <div className="mt-1 flex gap-2">
                      <div className="min-w-0 flex-1">
                        <WorkAddressSelect
                          options={workAddressOptions}
                          value={formWorkAddressId}
                          onChange={setFormWorkAddressId}
                          className="w-full"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          window.open(
                            `/dashboard/customers/${formCustomerId}?tab=${encodeURIComponent('Work address')}`,
                            '_blank',
                          )
                        }
                        className="flex size-[38px] shrink-0 items-center justify-center rounded-lg border border-slate-200 text-[#14B8A6] transition-colors hover:bg-[#14B8A6] hover:text-white"
                        title="Add work / site address"
                      >
                        <Plus className="size-4" />
                      </button>
                    </div>
                    {workAddressOptions.length === 0 && (
                      <p className="mt-1 text-xs text-slate-500">This customer has no active work addresses yet.</p>
                    )}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Quotation date</label>
                  <input type="date" required value={formQuotationDate} onChange={(e) => setFormQuotationDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Valid until</label>
                  <input type="date" required value={formValidUntil} onChange={(e) => setFormValidUntil(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Currency</label>
                  <select value={formCurrency} onChange={(e) => setFormCurrency(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30">
                    {['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR', 'JPY'].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="block text-sm font-medium text-slate-700">Line items</label>
                  <button type="button" onClick={addLineItem} className="text-sm font-medium text-[#14B8A6] hover:underline">+ Add item</button>
                </div>
                <div className="space-y-2">
                  {formLineItems.map((item, i) => (
                    <div key={i} className="space-y-2 rounded-lg border border-slate-100 bg-slate-50/40 p-2">
                      <label className="block text-xs font-medium text-slate-700">
                        Description
                        <textarea
                          ref={(el) => {
                            lineDescriptionRefs.current[i] = el;
                            resizeLineDescriptionTextarea(el);
                          }}
                          rows={1}
                          value={item.description}
                          onChange={(e) => {
                            updateLineItem(i, 'description', e.target.value);
                            resizeLineDescriptionTextarea(e.target);
                          }}
                          placeholder="Describe this line item"
                          className="mt-1 w-full resize-none overflow-hidden rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/20"
                        />
                      </label>
                      <div className="flex flex-wrap items-end gap-2">
                        <label className="text-xs text-slate-600">
                          Qty
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={item.quantity === 0 ? '' : item.quantity}
                            onChange={(e) => {
                              const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                              updateLineItem(i, 'quantity', isNaN(val) ? 0 : val);
                            }}
                            className="mt-1 block w-20 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
                          />
                        </label>
                        <label className="text-xs text-slate-600">
                          Unit price
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={item.unit_price === 0 ? '' : item.unit_price}
                            onChange={(e) => {
                              const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                              updateLineItem(i, 'unit_price', isNaN(val) ? 0 : val);
                            }}
                            placeholder="Price"
                            className="mt-1 block w-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
                          />
                        </label>
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                          <span className="block text-slate-500">Line total</span>
                          <span className="text-sm font-semibold text-slate-900">
                            {(item.quantity * item.unit_price).toFixed(2)}
                          </span>
                        </div>
                        <div className="ml-auto flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => moveLineItem(i, i - 1)}
                            disabled={i === 0}
                            className="rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                            aria-label="Move item up"
                          >
                            <ChevronUp className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveLineItem(i, i + 1)}
                            disabled={i === formLineItems.length - 1}
                            className="rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                            aria-label="Move item down"
                          >
                            <ChevronDown className="size-4" />
                          </button>
                          <button type="button" onClick={() => removeLineItem(i)} className="rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-red-600">×</button>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {item.images.map((image, imageIndex) => (
                          <div key={`${image.original_filename}-${imageIndex}`} className="group relative h-16 w-20 overflow-hidden rounded border border-slate-200 bg-white">
                            {image.data_url ? (
                              <Image src={image.data_url} alt={image.original_filename} fill unoptimized className="object-cover" />
                            ) : null}
                            <button
                              type="button"
                              onClick={() => removeLineItemImage(i, imageIndex)}
                              className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-rose-600 opacity-0 shadow-sm transition group-hover:opacity-100"
                              aria-label="Remove image"
                            >
                              <X className="size-3" />
                            </button>
                          </div>
                        ))}
                        <label className="inline-flex h-16 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded border border-dashed border-slate-300 bg-white text-[10px] font-semibold text-slate-500 hover:border-[#14B8A6] hover:text-[#14B8A6]">
                          <ImagePlus className="size-4" />
                          Photos
                          <input
                            type="file"
                            accept="image/*,.heic,.heif"
                            multiple
                            className="hidden"
                            onChange={(event) => {
                              void addLineItemImages(i, event.target.files);
                              event.currentTarget.value = '';
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Tax (%)</label>
                  <input type="number" min={0} max={100} step={0.01} value={formTaxPercentage} onChange={(e) => setFormTaxPercentage(parseFloat(e.target.value) || 0)} className="mt-1 w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30" placeholder="0" />
                </div>
                <div className="flex flex-col justify-end gap-0.5">
                  {formTaxPercentage > 0 && (
                    <p className="text-xs text-slate-500">Tax: {formatCurrency(taxAmount, formCurrency)}</p>
                  )}
                  <p className="text-sm font-semibold text-slate-700">Total: {formatCurrency(totalAmount, formCurrency)}</p>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Project Description</label>
                <textarea rows={3} value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Overview of the project scope..." className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Internal Notes</label>
                <textarea rows={2} value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Internal reference notes..." className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30" />
              </div>
              {addError && <p className="text-sm text-red-600">{addError}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setAddModalOpen(false)} className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="submit" className="flex-1 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#13a89a]">Create Quotation</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {visitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setVisitModalOpen(false)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-slate-900">Create Quotation Visit</h3>
            <p className="mt-1 text-sm text-slate-500">Book a site survey so an officer can visit and create a quotation.</p>
            <form onSubmit={handleCreateVisit} className="mt-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Customer *</label>
                <div className="mt-1">
                  <ImportCustomerSelect
                    customers={customers}
                    value={visitCustomerId}
                    onChange={handleVisitCustomerChange}
                    className="w-full"
                  />
                </div>
              </div>
              {visitCustomerId && (
                <div>
                  <label className="block text-sm font-medium text-slate-700">Work / site address (optional)</label>
                  <div className="mt-1 flex gap-2">
                    <div className="min-w-0 flex-1">
                      <WorkAddressSelect
                        options={visitWorkAddressOptions}
                        value={visitWorkAddressId}
                        onChange={setVisitWorkAddressId}
                        emptyButtonLabel="None — use customer main address"
                        emptyMenuLabel="None — customer main address"
                        className="w-full"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        window.open(
                          `/dashboard/customers/${visitCustomerId}?tab=${encodeURIComponent('Work address')}`,
                          '_blank',
                        )
                      }
                      className="flex size-[38px] shrink-0 items-center justify-center rounded-lg border border-slate-200 text-[#14B8A6] transition-colors hover:bg-[#14B8A6] hover:text-white"
                      title="Add work / site address"
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
                  {visitWorkAddressOptions.length === 0 && (
                    <p className="mt-1 text-xs text-slate-500">This customer has no active work addresses yet.</p>
                  )}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700">Officer *</label>
                <select
                  value={visitOfficerId ?? ''}
                  onChange={(e) => setVisitOfficerId(e.target.value ? Number(e.target.value) : null)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
                >
                  <option value="">-- Select officer --</option>
                  {officers.map((o) => (
                    <option key={o.id} value={o.id}>{o.full_name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Date *</label>
                  <input type="date" required value={visitDate} onChange={(e) => setVisitDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Time *</label>
                  <input type="time" required value={visitTime} onChange={(e) => setVisitTime(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Duration (minutes)</label>
                <input type="number" min={15} step={15} value={visitDuration} onChange={(e) => setVisitDuration(Number(e.target.value) || 60)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Notes</label>
                <textarea rows={3} value={visitNotes} onChange={(e) => setVisitNotes(e.target.value)} placeholder="Any special instructions for the officer..." className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30" />
              </div>
              {visitError && <p className="text-sm text-red-600">{visitError}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setVisitModalOpen(false)} className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="submit" className="flex-1 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600">Create Visit</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </>
  );
}
