'use client';

import { useState, useEffect, useCallback } from 'react';
import { getJson, postJson } from '../../../apiClient';
import { Plus, FileText, Search, Filter, Loader2, MoreVertical, Eye, Download, Pencil, Trash2, ChevronRight } from 'lucide-react';
import dayjs from 'dayjs';
import { useRouter } from 'next/navigation';

interface Invoice {
  id: number;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  total_paid: number;
  state: string;
  job_title: string | null;
  work_address_name?: string | null;
}

interface CustomerInvoicesTabProps {
  customerId: string;
  workAddressId?: string;
}

export default function CustomerInvoicesTab({ customerId, workAddressId }: CustomerInvoicesTabProps) {
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [creating, setCreating] = useState(false);

  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  const fetchInvoices = useCallback(async () => {
    if (!token || !customerId) return;
    setLoading(true);
    try {
      const qp = new URLSearchParams({ customer_id: customerId, limit: '1000' });
      if (workAddressId) qp.set('invoice_work_address_id', workAddressId);
      
      const res = await getJson<{ invoices: Invoice[] }>(`/invoices?${qp.toString()}`, token);
      setInvoices(res.invoices || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  }, [customerId, workAddressId, token]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const handleCreateInvoice = async () => {
    if (!customerId) return;
    const qp = new URLSearchParams({ customerId: customerId });
    if (workAddressId) qp.set('workAddressId', workAddressId);
    router.push(`/dashboard/invoices/new?${qp.toString()}`);
  };

  const filteredInvoices = invoices.filter(inv => 
    inv.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (inv.job_title?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  if (loading && invoices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-slate-200 shadow-sm">
        <Loader2 className="size-8 text-[#14B8A6] animate-spin mb-3" />
        <p className="text-slate-500 font-medium">Loading invoices...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-full mx-auto">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search by invoice # or job..." 
            className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button 
          onClick={handleCreateInvoice}
          disabled={creating}
          className="bg-[#14B8A6] hover:bg-[#119f8e] text-white text-sm font-bold px-4 py-2 rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Add new invoice
        </button>
      </div>

      {/* Invoices List */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 uppercase text-xs font-bold text-slate-500 tracking-wider">
              <tr>
                <th className="px-5 py-3 border-b border-slate-200">Invoice No</th>
                <th className="px-5 py-3 border-b border-slate-200">Date</th>
                <th className="px-5 py-3 border-b border-slate-200">Description / Job</th>
                {!workAddressId && <th className="px-5 py-3 border-b border-slate-200">Work Address</th>}
                <th className="px-5 py-3 border-b border-slate-200">Total</th>
                <th className="px-5 py-3 border-b border-slate-200 text-center">Status</th>
                <th className="px-5 py-3 border-b border-slate-200 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={workAddressId ? 6 : 7} className="px-5 py-12 text-center">
                    <div className="flex flex-col items-center justify-center text-slate-400">
                      <FileText className="size-12 stroke-1 mb-2 opacity-20" />
                      <p className="font-medium">No invoices found</p>
                      <p className="text-xs">Try adjusting your search or add a new invoice</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-5 py-4 font-bold text-slate-900">{inv.invoice_number}</td>
                    <td className="px-5 py-4 text-slate-500">{dayjs(inv.invoice_date).format('DD/MM/YYYY')}</td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-800">{inv.job_title || 'Direct Invoice'}</span>
                      </div>
                    </td>
                    {!workAddressId && (
                      <td className="px-5 py-4 text-slate-500 max-w-[200px] truncate">
                        {inv.work_address_name || '--'}
                      </td>
                    )}
                    <td className="px-5 py-4 font-bold text-slate-900">
                      £{Number(inv.total_amount).toFixed(2)}
                      {inv.total_paid > 0 && inv.total_paid < inv.total_amount && (
                        <div className="text-[10px] text-amber-600">Paid £{Number(inv.total_paid).toFixed(2)}</div>
                      )}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                        inv.state === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                        inv.state === 'cancelled' ? 'bg-slate-100 text-slate-500' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {inv.state.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => router.push(`/dashboard/invoices/${inv.id}`)}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-slate-500 transition hover:bg-slate-200 hover:text-slate-900"
                        title="View Invoice"
                      >
                        <span className="text-xs font-semibold">View</span>
                        <ChevronRight className="size-4" />
                      </button>
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
