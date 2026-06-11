'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, ImagePlus, Plus, Trash2, X } from 'lucide-react';
import { getJson, patchJson } from '../../../../apiClient';
import ImportCustomerSelect, { type ImportCustomerOption } from '../../../ImportCustomerSelect';
import WorkAddressSelect from '../../../WorkAddressSelect';
import QuotationInternalCostingCard from '../../QuotationInternalCostingCard';
import QuotationInternalNotesCard, { type QuotationInternalNote } from '../QuotationInternalNotesCard';

type LineItemImage = {
  stored_filename?: string;
  original_filename: string;
  content_type: string;
  byte_size: number;
  data_url?: string | null;
  content_base64?: string;
  filename?: string;
};

type LineItemForm = { description: string; quantity: number; unit_price: number; images: LineItemImage[] };

interface QuotationDetail {
  id: number;
  quotation_number: string;
  customer_id: number;
  job_id: number | null;
  quotation_date: string;
  valid_until: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  currency: string;
  notes: string | null;
  description: string | null;
  billing_address: string | null;
  quotation_work_address_id?: number | null;
  state: string;
  line_items: { description: string; quantity: number; unit_price: number; images?: LineItemImage[] }[];
  internal_notes?: QuotationInternalNote[];
}

type CustomerRow = ImportCustomerOption & { email?: string };

function formatCustomerAddress(c: ImportCustomerOption): string {
  return [c.address_line_1, c.town, c.postcode]
    .filter((p): p is string => typeof p === 'string' && p.trim() !== '')
    .join(', ');
}

const QUOTATION_STATES = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'expired', label: 'Expired' },
] as const;

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = r.result as string;
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

export default function EditQuotationPage() {
  const router = useRouter();
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [internalNotes, setInternalNotes] = useState<QuotationInternalNote[]>([]);

  const [quotationNumber, setQuotationNumber] = useState('');
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [quotationDate, setQuotationDate] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [currency, setCurrency] = useState('GBP');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [addressKind, setAddressKind] = useState<'customer' | 'custom'>('customer');
  const [workAddressId, setWorkAddressId] = useState<number | null>(null);
  const [workAddressOptions, setWorkAddressOptions] = useState<{ id: number; label: string }[]>([]);
  const [state, setState] = useState('draft');
  const skipNextWorkFetchReset = useRef(false);
  const [lineItems, setLineItems] = useState<LineItemForm[]>([{ description: '', quantity: 1, unit_price: 0, images: [] }]);
  const [taxPercentage, setTaxPercentage] = useState(0);

  const load = useCallback(async () => {
    const token = window.localStorage.getItem('wp_token');
    if (!token || !id) return;
    setLoading(true);
    setError(null);
    try {
      const [qRes, custRes] = await Promise.all([
        getJson<{ quotation: QuotationDetail }>(`/quotations/${id}`, token),
        getJson<{ customers: CustomerRow[] }>('/customers?limit=5000&page=1', token),
      ]);
      const q = qRes.quotation;
      setQuotationNumber(q.quotation_number);
      setCustomerId(q.customer_id);
      setQuotationDate(q.quotation_date.split('T')[0]);
      setValidUntil(q.valid_until.split('T')[0]);
      setCurrency(q.currency);
      setDescription(q.description ?? '');
      setNotes(q.notes ?? '');
      setWorkAddressId(q.quotation_work_address_id ?? null);
      if (q.quotation_work_address_id) {
        setBillingAddress(q.billing_address ?? '');
        setAddressKind('customer');
      } else if (q.billing_address?.trim()) {
        setAddressKind('custom');
        setBillingAddress(q.billing_address);
      } else {
        setAddressKind('customer');
        setBillingAddress('');
      }
      skipNextWorkFetchReset.current = true;
      setState(q.state);
      setInternalNotes(q.internal_notes ?? []);
      const items =
        q.line_items.length > 0
          ? q.line_items.map((li) => ({
              description: li.description,
              quantity: li.quantity,
              unit_price: li.unit_price,
              images: li.images ?? [],
            }))
          : [{ description: '', quantity: 1, unit_price: 0, images: [] }];
      setLineItems(items);
      const tp =
        q.subtotal > 0 ? Math.round((q.tax_amount / q.subtotal) * 10000) / 100 : 0;
      setTaxPercentage(tp);
      setCustomers(custRes.customers ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load quotation');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchWorkAddresses = useCallback(async (cid: number) => {
    const token = window.localStorage.getItem('wp_token');
    if (!token) {
      setWorkAddressOptions([]);
      return;
    }
    try {
      const waRes = await getJson<{
        work_addresses: {
          id: number;
          name: string;
          address_line_1?: string | null;
          town?: string | null;
          postcode?: string | null;
        }[];
      }>(`/customers/${cid}/work-addresses?status=active`, token);
      const rows = waRes.work_addresses ?? [];
      setWorkAddressOptions(
        rows.map((w) => {
          const addr = [w.address_line_1, w.town, w.postcode].filter((x): x is string => Boolean(x && String(x).trim())).join(', ');
          const label = [w.name?.trim() || `Site #${w.id}`, addr].filter(Boolean).join(' — ');
          return { id: w.id, label: label || `Work #${w.id}` };
        }),
      );
    } catch {
      setWorkAddressOptions([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (customerId == null) {
      setWorkAddressOptions([]);
      return;
    }
    fetchWorkAddresses(customerId);
    if (skipNextWorkFetchReset.current) {
      skipNextWorkFetchReset.current = false;
      return;
    }
    setWorkAddressId(null);
  }, [customerId, fetchWorkAddresses]);

  useEffect(() => {
    if (workAddressId == null) return;
    if (workAddressOptions.length === 0) return;
    if (!workAddressOptions.some((w) => w.id === workAddressId)) {
      setWorkAddressId(null);
    }
  }, [workAddressOptions, workAddressId]);

  const subtotal = lineItems.reduce((s, li) => s + li.quantity * li.unit_price, 0);
  const taxAmount = Math.round(subtotal * (taxPercentage / 100) * 100) / 100;
  const totalAmount = subtotal + taxAmount;

  const updateLine = (i: number, field: keyof LineItemForm, value: string | number) => {
    setLineItems((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value } as LineItemForm;
      return next;
    });
  };

  const addLine = () => setLineItems((p) => [...p, { description: '', quantity: 1, unit_price: 0, images: [] }]);
  const removeLine = (i: number) => {
    if (lineItems.length <= 1) return;
    setLineItems((p) => p.filter((_, idx) => idx !== i));
  };

  const appendInternalNote = (note: QuotationInternalNote) => {
    setInternalNotes((prev) => [note, ...prev]);
  };

  const removeInternalNote = (noteId: number) => {
    setInternalNotes((prev) => prev.filter((note) => note.id !== noteId));
  };

  const updateInternalNote = (noteId: number, newBody: string) => {
    setInternalNotes((prev) => prev.map((note) => (note.id === noteId ? { ...note, body: newBody } : note)));
  };

  const addLineImages = async (lineIndex: number, files: FileList | null) => {
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
    setLineItems((prev) => {
      const next = [...prev];
      const current = next[lineIndex];
      if (!current) return prev;
      next[lineIndex] = { ...current, images: [...(current.images ?? []), ...images].slice(0, 8) };
      return next;
    });
  };

  const removeLineImage = (lineIndex: number, imageIndex: number) => {
    setLineItems((prev) => {
      const next = [...prev];
      const current = next[lineIndex];
      if (!current) return prev;
      next[lineIndex] = { ...current, images: current.images.filter((_, idx) => idx !== imageIndex) };
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = window.localStorage.getItem('wp_token');
    if (!token || !id) return;
    const validItems = lineItems.filter((li) => li.description.trim());
    if (validItems.length === 0) {
      setError('At least one line item with a description is required.');
      return;
    }
    if (customerId == null) {
      setError('Customer is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const useWorkSite = workAddressId != null;
      const payload: Record<string, unknown> = {
        quotation_number: quotationNumber.trim(),
        customer_id: customerId,
        quotation_date: quotationDate,
        valid_until: validUntil,
        currency: currency.trim(),
        description: description.trim() || null,
        notes: notes.trim() || null,
        state,
        line_items: validItems.map((li) => ({
          description: li.description.trim(),
          quantity: li.quantity,
          unit_price: li.unit_price,
          images: (li.images ?? []).map((image) => ({
            stored_filename: image.stored_filename,
            original_filename: image.original_filename,
            content_type: image.content_type,
            byte_size: image.byte_size,
            filename: image.filename,
            content_base64: image.content_base64,
          })),
        })),
        tax_percentage: taxPercentage,
      };
      if (useWorkSite) {
        payload.quotation_work_address_id = workAddressId;
      } else {
        payload.quotation_work_address_id = null;
        payload.billing_address = addressKind === 'custom' ? billingAddress.trim() || null : null;
      }
      await patchJson(`/quotations/${id}`, payload, token);
      router.push(`/dashboard/quotations/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-slate-500">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#14B8A6] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#f8fafc]">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 md:px-6">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
          aria-label="Back"
        >
          <ArrowLeft className="size-5" />
        </button>
        <nav className="min-w-0 text-sm text-slate-600">
          <Link href="/dashboard/quotations" className="hover:text-[#14B8A6] hover:underline">
            Quotations
          </Link>
          <span className="mx-2 text-slate-300">/</span>
          <Link href={`/dashboard/quotations/${id}`} className="hover:text-[#14B8A6] hover:underline">
            {quotationNumber || 'Quotation'}
          </Link>
          <span className="mx-2 text-slate-300">/</span>
          <span className="font-semibold text-slate-900">Edit</span>
        </nav>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="mx-auto max-w-7xl">
          <h1 className="text-2xl font-bold text-slate-900">Edit quotation</h1>
          <p className="mt-1 text-sm text-slate-500">Update line items, dates, and status for this quotation.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>}

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(420px,560px)]">
              <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Quotation number</span>
                <input
                  required
                  value={quotationNumber}
                  onChange={(e) => setQuotationNumber(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Status</span>
                <select
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
                >
                  {QUOTATION_STATES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="block text-sm sm:col-span-2">
                <span className="font-medium text-slate-700">Customer *</span>
                <div className="mt-1 flex gap-2">
                  <div className="flex-1 min-w-0">
                    <ImportCustomerSelect
                      customers={customers}
                      value={customerId}
                      onChange={(nextId) => {
                        setCustomerId(nextId);
                        setAddressKind('customer');
                        setBillingAddress('');
                      }}
                      className="w-full"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => window.open('/dashboard/customers/new', '_blank')}
                    className="shrink-0 flex items-center justify-center size-[38px] rounded-lg border border-slate-200 text-[#14B8A6] hover:bg-[#14B8A6] hover:text-white transition-colors"
                    title="Add new customer"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
                {customerId != null && (
                  <div className="mt-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                    {(() => {
                      const c = customers.find((x) => x.id === customerId);
                      if (!c) return null;
                      const addr = formatCustomerAddress(c);
                      return (
                        <div className="flex flex-col gap-1">
                          <p className="font-semibold text-slate-800">{c.full_name}</p>
                          {c.email != null && String(c.email).trim() !== '' && <p>{c.email}</p>}
                          {addr ? <p className="mt-1 border-t border-slate-200 pt-1 text-slate-500">{addr}</p> : null}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Quotation date</span>
                <input
                  type="date"
                  required
                  value={quotationDate}
                  onChange={(e) => setQuotationDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Valid until</span>
                <input
                  type="date"
                  required
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Currency</span>
                <input
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm uppercase outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
                  maxLength={10}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Tax %</span>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  value={taxPercentage}
                  onChange={(e) => setTaxPercentage(parseFloat(e.target.value) || 0)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
                />
              </label>
              <div className="sm:col-span-2 space-y-3 rounded-lg border border-slate-100 bg-slate-50/60 p-4">
                <p className="text-sm font-medium text-slate-800">Address on quotation</p>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Work / site address (optional)</span>
                  <div className="mt-1 flex gap-2">
                    <div className="min-w-0 flex-1">
                      <WorkAddressSelect
                        options={workAddressOptions}
                        value={workAddressId}
                        onChange={setWorkAddressId}
                        disabled={customerId == null}
                        emptyButtonLabel="None — use customer or custom address below"
                        emptyMenuLabel="None — use customer or custom address below"
                        className="w-full"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={customerId == null}
                      onClick={() => {
                        if (customerId == null) return;
                        window.open(
                          `/dashboard/customers/${customerId}?tab=${encodeURIComponent('Work address')}`,
                          '_blank',
                        );
                      }}
                      className="flex size-[38px] shrink-0 items-center justify-center rounded-lg border border-slate-200 text-[#14B8A6] transition-colors hover:bg-[#14B8A6] hover:text-white disabled:pointer-events-none disabled:opacity-40"
                      title="Add work / site address"
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
                </label>
                {workAddressOptions.length === 0 && customerId != null ? (
                  <p className="text-xs text-slate-500">This customer has no active work addresses.</p>
                ) : null}
                {workAddressId != null ? (
                  <p className="text-xs text-slate-600">
                    Billing and work/site lines on the printed quotation follow this work address. To use only the customer home address or custom text, clear the dropdown above.
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-4">
                      <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                        <input
                          type="radio"
                          name="qAddrEdit"
                          className="text-[#14B8A6] focus:ring-[#14B8A6]"
                          checked={addressKind === 'customer'}
                          onChange={() => setAddressKind('customer')}
                        />
                        Customer address
                      </label>
                      <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                        <input
                          type="radio"
                          name="qAddrEdit"
                          className="text-[#14B8A6] focus:ring-[#14B8A6]"
                          checked={addressKind === 'custom'}
                          onChange={() => setAddressKind('custom')}
                        />
                        Custom address
                      </label>
                    </div>
                    {addressKind === 'custom' && (
                      <label className="block text-sm">
                        <span className="font-medium text-slate-700">Custom text</span>
                        <textarea
                          value={billingAddress}
                          onChange={(e) => setBillingAddress(e.target.value)}
                          rows={3}
                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
                          placeholder="Shown on quotation"
                        />
                      </label>
                    )}
                  </>
                )}
              </div>
              <label className="block text-sm sm:col-span-2">
                <span className="font-medium text-slate-700">Description (Project overview)</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
                  placeholder="Summarize the project scope or works involved..."
                />
              </label>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <span className="text-sm font-semibold text-slate-800">Line items</span>
                  <p className="text-xs text-slate-500">Each row shows its pricing total while you fill out the quote.</p>
                </div>
                <button
                  type="button"
                  onClick={addLine}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-[#14B8A6] hover:bg-slate-50"
                >
                  <Plus className="size-4" /> Add row
                </button>
              </div>
              <div className="space-y-3 rounded-lg border border-slate-200 p-3">
                {lineItems.map((li, i) => (
                  <div key={i} className="grid gap-2 sm:grid-cols-[1fr_80px_100px_110px_auto] sm:items-end">
                    <label className="text-xs">
                      <span className="text-slate-500">Description</span>
                      <input
                        value={li.description}
                        onChange={(e) => updateLine(i, 'description', e.target.value)}
                        className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                      />
                    </label>
                    <label className="text-xs">
                      <span className="text-slate-500">Qty</span>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={li.quantity === 0 ? '' : li.quantity}
                        onChange={(e) => {
                          const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                          updateLine(i, 'quantity', isNaN(val) ? 0 : val);
                        }}
                        className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                      />
                    </label>
                    <label className="text-xs">
                      <span className="text-slate-500">Unit price</span>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={li.unit_price === 0 ? '' : li.unit_price}
                        onChange={(e) => {
                          const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                          updateLine(i, 'unit_price', isNaN(val) ? 0 : val);
                        }}
                        className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                      />
                    </label>
                    <div className="rounded border border-slate-100 bg-slate-50 px-2 py-1.5 text-xs">
                      <span className="block text-slate-500">Line total</span>
                      <span className="text-sm font-semibold text-slate-900">
                        {(li.quantity * li.unit_price).toFixed(2)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLine(i)}
                      disabled={lineItems.length <= 1}
                      className="flex justify-end rounded p-2 text-rose-600 hover:bg-rose-50 disabled:opacity-30"
                      aria-label="Remove line"
                    >
                      <Trash2 className="size-4" />
                    </button>
                    <div className="sm:col-span-5">
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {(li.images ?? []).map((image, imageIndex) => (
                          <div key={`${image.stored_filename ?? image.original_filename}-${imageIndex}`} className="group relative h-20 w-24 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                            {image.data_url ? (
                              <Image src={image.data_url} alt={image.original_filename} fill unoptimized className="object-cover" />
                            ) : (
                              <div className="flex h-full items-center justify-center px-2 text-center text-[10px] text-slate-400">
                                {image.original_filename}
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => removeLineImage(i, imageIndex)}
                              className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-rose-600 opacity-0 shadow-sm transition group-hover:opacity-100"
                              aria-label="Remove image"
                            >
                              <X className="size-3" />
                            </button>
                          </div>
                        ))}
                        <label className="inline-flex h-20 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-[11px] font-semibold text-slate-500 hover:border-[#14B8A6] hover:text-[#14B8A6]">
                          <ImagePlus className="size-4" />
                          Add photos
                          <input
                            type="file"
                            accept="image/*,.heic,.heif"
                            multiple
                            className="hidden"
                            onChange={(event) => {
                              void addLineImages(i, event.target.files);
                              event.currentTarget.value = '';
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-col items-end gap-1.5 text-sm font-medium">
                <div className="flex w-48 justify-between">
                  <span className="text-slate-500">Subtotal</span>
                  <span className="text-slate-900">{subtotal.toFixed(2)}</span>
                </div>
                <div className="flex w-48 justify-between">
                  <span className="text-slate-500">Tax</span>
                  <span className="text-slate-900">{taxAmount.toFixed(2)}</span>
                </div>
                <div className="flex w-48 justify-between border-t border-slate-100 pt-1.5 font-bold">
                  <span className="text-slate-900">Total</span>
                  <span className="text-[#14B8A6]">{totalAmount.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-4">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-[#14B8A6] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#119f90] disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              <button
                type="button"
                onClick={() => router.push(`/dashboard/quotations/${id}`)}
                className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
              </div>

              <aside className="space-y-6 lg:sticky lg:top-4 lg:self-start">
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Office use only</p>
                  <h2 className="mt-1 text-lg font-bold text-slate-900">Internal costing and notes</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Private to your team. Not shown on the quotation PDF or customer link.
                  </p>
                </div>

                {token ? (
                  <>
                    <QuotationInternalCostingCard quotationId={id} authToken={token} currency={currency} />

                    <QuotationInternalNotesCard
                      quotationId={id}
                      authToken={token}
                      notes={internalNotes}
                      onAppendNote={appendInternalNote}
                      onRemoveNote={removeInternalNote}
                      onUpdateNote={updateInternalNote}
                    />
                  </>
                ) : null}
              </aside>
            </div>
          </form>

        </div>
      </div>
    </div>
  );
}
