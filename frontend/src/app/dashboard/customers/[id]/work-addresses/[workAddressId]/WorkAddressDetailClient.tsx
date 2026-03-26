'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft, FileText, Plus } from 'lucide-react';
import { getJson, postJson } from '../../../../../apiClient';

interface WorkAddress {
  id: number;
  customer_id: number;
  name: string;
  branch_name: string | null;
  landlord: string | null;
  title: string | null;
  first_name: string | null;
  surname: string | null;
  company_name: string | null;
  address_line_1: string;
  address_line_2: string | null;
  address_line_3: string | null;
  town: string | null;
  county: string | null;
  postcode: string | null;
  landline: string | null;
  mobile: string | null;
  email: string | null;
  prefers_phone: boolean;
  prefers_sms: boolean;
  prefers_email: boolean;
  prefers_letter: boolean;
  uprn: string | null;
  is_active: boolean;
}

interface CustomerBrief {
  id: number;
  full_name: string;
}

interface JobOption {
  id: number;
  title: string;
  state: string;
}

interface InvoiceSettings {
  default_currency: string;
  default_due_days: number;
  default_tax_percentage: number;
}

interface InvoiceRow {
  id: number;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  total_amount: number;
  total_paid: number;
  currency: string;
  state: string;
}

interface InvoicesResponse {
  invoices: InvoiceRow[];
  total: number;
}

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

export default function WorkAddressDetailClient() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const customerId = typeof params?.id === 'string' ? params.id : '';
  const workAddressId = typeof params?.workAddressId === 'string' ? params.workAddressId : '';

  const [activeTab, setActiveTab] = useState<'details' | 'invoices'>(() =>
    searchParams.get('tab') === 'invoices' ? 'invoices' : 'details',
  );

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t === 'invoices') setActiveTab('invoices');
    if (t === 'details') setActiveTab('details');
  }, [searchParams]);

  const setTab = (t: 'details' | 'invoices') => {
    setActiveTab(t);
    const q = new URLSearchParams(searchParams.toString());
    q.set('tab', t);
    router.replace(`/dashboard/customers/${customerId}/work-addresses/${workAddressId}?${q.toString()}`, {
      scroll: false,
    });
  };

  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  const [customer, setCustomer] = useState<CustomerBrief | null>(null);
  const [work, setWork] = useState<WorkAddress | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);

  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSaving, setCreateSaving] = useState(false);
  const [invJobId, setInvJobId] = useState('');
  const [invDate, setInvDate] = useState('');
  const [invDue, setInvDue] = useState('');
  const [invCurrency, setInvCurrency] = useState('USD');
  const [invNotes, setInvNotes] = useState('');
  const [invCustRef, setInvCustRef] = useState('');
  const [invTax, setInvTax] = useState(0);
  const [invLines, setInvLines] = useState<{ description: string; quantity: number; unit_price: number }[]>([
    { description: '', quantity: 1, unit_price: 0 },
  ]);
  const [jobsForCustomer, setJobsForCustomer] = useState<JobOption[]>([]);

  const loadCore = useCallback(async () => {
    if (!customerId || !workAddressId) {
      setPageLoading(false);
      return;
    }
    if (!token) {
      setPageLoading(false);
      setLoadError('Not signed in');
      return;
    }
    setLoadError(null);
    setPageLoading(true);
    try {
      const [cRes, wRes] = await Promise.all([
        getJson<CustomerBrief>(`/customers/${customerId}`, token),
        getJson<{ work_address: WorkAddress }>(`/customers/${customerId}/work-addresses/${workAddressId}`, token),
      ]);
      setCustomer({ id: cRes.id, full_name: cRes.full_name });
      setWork(wRes.work_address ?? null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load');
      setCustomer(null);
      setWork(null);
    } finally {
      setPageLoading(false);
    }
  }, [token, customerId, workAddressId]);

  const loadInvoices = useCallback(async () => {
    if (!token || !customerId || !workAddressId) return;
    setInvoicesLoading(true);
    try {
      const q = new URLSearchParams({
        customer_id: customerId,
        invoice_work_address_id: workAddressId,
        limit: '50',
        page: '1',
      });
      const res = await getJson<InvoicesResponse>(`/invoices?${q.toString()}`, token);
      setInvoices(res.invoices ?? []);
    } catch {
      setInvoices([]);
    } finally {
      setInvoicesLoading(false);
    }
  }, [token, customerId, workAddressId]);

  useEffect(() => {
    loadCore();
  }, [loadCore]);

  useEffect(() => {
    if (activeTab === 'invoices') loadInvoices();
  }, [activeTab, loadInvoices]);

  const openCreate = async () => {
    setCreateError(null);
    const today = new Date().toISOString().slice(0, 10);
    setInvDate(today);
    setInvNotes('');
    setInvCustRef('');
    setInvLines([{ description: '', quantity: 1, unit_price: 0 }]);
    setInvJobId('');
    try {
      if (token) {
        const [settingsRes, jobsRes] = await Promise.all([
          getJson<{ settings: InvoiceSettings }>('/settings/invoice', token),
          getJson<{ jobs: JobOption[] }>(`/jobs?customer_id=${customerId}&limit=100&page=1`, token),
        ]);
        const s = settingsRes.settings;
        if (s) {
          setInvCurrency(s.default_currency ?? 'USD');
          setInvTax(s.default_tax_percentage ?? 0);
          const dueDays = s.default_due_days ?? 30;
          setInvDue(new Date(Date.now() + dueDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
        } else {
          setInvDue(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
        }
        setJobsForCustomer((jobsRes.jobs ?? []).filter((j) => j.state === 'completed' || j.state === 'closed'));
      } else {
        setInvDue(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
        setJobsForCustomer([]);
      }
    } catch {
      setInvDue(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
      setJobsForCustomer([]);
    }
    setCreateOpen(true);
  };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    const valid = invLines.filter((l) => l.description.trim());
    if (valid.length === 0) {
      setCreateError('Add at least one line item with a description.');
      return;
    }
    setCreateSaving(true);
    setCreateError(null);
    try {
      const res = await postJson<{ invoice: { id: number } }>(
        `/customers/${customerId}/work-addresses/${workAddressId}/invoices`,
        {
          job_id: invJobId ? parseInt(invJobId, 10) : undefined,
          invoice_date: invDate,
          due_date: invDue,
          currency: invCurrency,
          notes: invNotes.trim() || undefined,
          customer_reference: invCustRef.trim() || undefined,
          tax_percentage: invTax,
          line_items: valid.map((l) => ({
            description: l.description.trim(),
            quantity: l.quantity,
            unit_price: l.unit_price,
          })),
        },
        token,
      );
      setCreateOpen(false);
      loadInvoices();
      if (res.invoice?.id) router.push(`/dashboard/invoices/${res.invoice.id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create invoice');
    } finally {
      setCreateSaving(false);
    }
  };

  const addressLines = useMemo(() => {
    if (!work) return [];
    return [
      work.name,
      [work.address_line_1, work.address_line_2, work.address_line_3].filter(Boolean).join(', '),
      [work.town, work.county, work.postcode].filter(Boolean).join(', '),
    ].filter(Boolean);
  }, [work]);

  if (!customerId || !workAddressId) {
    return <div className="p-8 text-slate-500">Invalid route.</div>;
  }

  if (pageLoading) {
    return (
      <div className="flex min-h-[40vh] flex-1 items-center justify-center bg-[#f8fafc] p-6 text-slate-500">
        Loading work address…
      </div>
    );
  }

  if (loadError || !work) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-[#f8fafc] p-6">
        <button
          type="button"
          onClick={() => router.push(`/dashboard/customers/${customerId}?tab=${encodeURIComponent('Work address')}`)}
          className="mb-4 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-[#14B8A6]"
        >
          <ArrowLeft className="size-4" />
          Back to customer
        </button>
        <p className="text-rose-600">{loadError || 'Work address not found.'}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#f8fafc]">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 md:px-6">
        <button
          type="button"
          onClick={() => router.push(`/dashboard/customers/${customerId}?tab=${encodeURIComponent('Work address')}`)}
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
          aria-label="Back"
        >
          <ArrowLeft className="size-5" />
        </button>
        <nav className="min-w-0 text-sm text-slate-600">
          <Link href="/dashboard/customers" className="hover:text-[#14B8A6] hover:underline">
            Customers
          </Link>
          <span className="mx-2 text-slate-300">/</span>
          <Link href={`/dashboard/customers/${customerId}`} className="hover:text-[#14B8A6] hover:underline">
            {customer?.full_name ?? 'Customer'}
          </Link>
          <span className="mx-2 text-slate-300">/</span>
          <span className="font-semibold text-slate-900">Work address</span>
        </nav>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="mx-auto max-w-4xl">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900">{work.name}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {work.is_active ? (
                <span className="text-emerald-700">Active</span>
              ) : (
                <span className="text-slate-500">Dormant</span>
              )}
            </p>
          </div>

          <div className="mb-6 flex gap-2 border-b border-slate-200">
            <button
              type="button"
              onClick={() => setTab('details')}
              className={`border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
                activeTab === 'details'
                  ? 'border-[#14B8A6] text-[#14B8A6]'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Details
            </button>
            <button
              type="button"
              onClick={() => setTab('invoices')}
              className={`border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
                activeTab === 'invoices'
                  ? 'border-[#14B8A6] text-[#14B8A6]'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Invoices
            </button>
          </div>

          {activeTab === 'details' && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-800">Address</h2>
              <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{addressLines.join('\n')}</p>
              <dl className="mt-6 grid gap-3 sm:grid-cols-2">
                {work.branch_name ? (
                  <div>
                    <dt className="text-xs font-medium text-slate-500">Branch</dt>
                    <dd className="text-sm text-slate-800">{work.branch_name}</dd>
                  </div>
                ) : null}
                {work.landlord ? (
                  <div>
                    <dt className="text-xs font-medium text-slate-500">Landlord</dt>
                    <dd className="text-sm text-slate-800">{work.landlord}</dd>
                  </div>
                ) : null}
                {work.landline ? (
                  <div>
                    <dt className="text-xs font-medium text-slate-500">Landline</dt>
                    <dd className="text-sm text-slate-800">{work.landline}</dd>
                  </div>
                ) : null}
                {work.mobile ? (
                  <div>
                    <dt className="text-xs font-medium text-slate-500">Mobile</dt>
                    <dd className="text-sm text-slate-800">{work.mobile}</dd>
                  </div>
                ) : null}
                {work.email ? (
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-medium text-slate-500">Email</dt>
                    <dd className="text-sm text-slate-800">{work.email}</dd>
                  </div>
                ) : null}
                {work.uprn ? (
                  <div>
                    <dt className="text-xs font-medium text-slate-500">UPRN</dt>
                    <dd className="text-sm text-slate-800">{work.uprn}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          )}

          {activeTab === 'invoices' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-600">
                  Invoices created for this site show this work address on the document. Create them only from this tab.
                </p>
                <button
                  type="button"
                  onClick={openCreate}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#14B8A6] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#119f90]"
                >
                  <FileText className="size-4" />
                  Create invoice
                </button>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 text-xs font-semibold uppercase">Invoice</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase">Date</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase">Total</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase">State</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase"> </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {invoicesLoading ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                          Loading…
                        </td>
                      </tr>
                    ) : invoices.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                          No invoices for this site yet.
                        </td>
                      </tr>
                    ) : (
                      invoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-medium text-slate-900">{inv.invoice_number}</td>
                          <td className="px-4 py-3 text-slate-600">{inv.invoice_date}</td>
                          <td className="px-4 py-3">{formatMoney(inv.total_amount, inv.currency)}</td>
                          <td className="px-4 py-3 capitalize text-slate-600">{inv.state.replace(/_/g, ' ')}</td>
                          <td className="px-4 py-3 text-right">
                            <Link
                              href={`/dashboard/invoices/${inv.id}`}
                              className="font-semibold text-[#14B8A6] hover:underline"
                            >
                              View
                            </Link>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => !createSaving && setCreateOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <form onSubmit={submitCreate} className="p-6">
              <h3 className="text-lg font-semibold text-slate-900">Create invoice for this site</h3>
              <p className="mt-1 text-xs text-slate-500">
                This invoice will be linked to this work address for billing display.
              </p>
              <div className="mt-4 space-y-3">
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Related job (optional)</span>
                  <select
                    value={invJobId}
                    onChange={(e) => setInvJobId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
                  >
                    <option value="">None</option>
                    {jobsForCustomer.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.title}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm">
                    <span className="font-medium text-slate-700">Invoice date</span>
                    <input
                      type="date"
                      required
                      value={invDate}
                      onChange={(e) => setInvDate(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="font-medium text-slate-700">Due date</span>
                    <input
                      type="date"
                      required
                      value={invDue}
                      onChange={(e) => setInvDue(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                  </label>
                </div>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Currency</span>
                  <select
                    value={invCurrency}
                    onChange={(e) => setInvCurrency(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Tax %</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={invTax}
                    onChange={(e) => setInvTax(parseFloat(e.target.value) || 0)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Customer reference (optional)</span>
                  <input
                    value={invCustRef}
                    onChange={(e) => setInvCustRef(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700">Line items</span>
                    <button
                      type="button"
                      onClick={() => setInvLines((p) => [...p, { description: '', quantity: 1, unit_price: 0 }])}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#14B8A6] hover:underline"
                    >
                      <Plus className="size-3" /> Add row
                    </button>
                  </div>
                  <div className="space-y-2">
                    {invLines.map((line, i) => (
                      <div key={i} className="flex flex-wrap gap-2">
                        <input
                          value={line.description}
                          onChange={(e) =>
                            setInvLines((prev) => {
                              const n = [...prev];
                              n[i] = { ...n[i], description: e.target.value };
                              return n;
                            })
                          }
                          placeholder="Description"
                          className="min-w-[120px] flex-1 rounded border border-slate-200 px-2 py-1.5 text-sm"
                        />
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={line.quantity}
                          onChange={(e) =>
                            setInvLines((prev) => {
                              const n = [...prev];
                              n[i] = { ...n[i], quantity: parseFloat(e.target.value) || 0 };
                              return n;
                            })
                          }
                          className="w-16 rounded border border-slate-200 px-2 py-1.5 text-sm"
                        />
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={line.unit_price}
                          onChange={(e) =>
                            setInvLines((prev) => {
                              const n = [...prev];
                              n[i] = { ...n[i], unit_price: parseFloat(e.target.value) || 0 };
                              return n;
                            })
                          }
                          className="w-20 rounded border border-slate-200 px-2 py-1.5 text-sm"
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Notes</span>
                  <textarea
                    rows={2}
                    value={invNotes}
                    onChange={(e) => setInvNotes(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>
              </div>
              {createError && <p className="mt-3 text-sm text-rose-600">{createError}</p>}
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSaving}
                  className="flex-1 rounded-lg bg-[#14B8A6] py-2 text-sm font-semibold text-white hover:bg-[#119f90] disabled:opacity-50"
                >
                  {createSaving ? 'Creating…' : 'Create invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
