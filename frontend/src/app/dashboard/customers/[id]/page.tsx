'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { getJson } from '../../../apiClient';
import { ArrowLeft, Edit, MapPin, Phone, Mail, User, Plus, Search, Filter } from 'lucide-react';
import dayjs from 'dayjs';
import CustomerCommunicationsTab from './CustomerCommunicationsTab';
import CustomerContactsTab from './CustomerContactsTab';
import CustomerBranchesTab from './CustomerBranchesTab';
import CustomerWorkAddressTab from './CustomerWorkAddressTab';
import CustomerAssetsTab from './CustomerAssetsTab';

interface CustomerDetails {
  id: number;
  full_name: string;
  email: string;
  phone: string | null;
  company: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  address_line_3: string | null;
  town: string | null;
  county: string | null;
  postcode: string | null;
  landline: string | null;
  status: string;
  last_contact: string | null;
  notes: string | null;
  customer_type_name: string | null;
  customer_type_allow_branches?: boolean | null;
  customer_type_company_name_required?: boolean | null;
  customer_type_work_address_name?: string | null;
  price_book_name: string | null;
  created_by_name: string | null;
  created_at: string;
  credit_days: number | null;
  lead_source: string | null;
  // Contact details
  contact_title: string | null;
  contact_first_name: string | null;
  contact_surname: string | null;
  contact_email: string | null;
  contact_mobile: string | null;
  contact_landline: string | null;
}

interface Job {
  id: number;
  title: string;
  description: string | null;
  priority: string;
  state: string;
  created_at: string;
  description_name: string | null;
  expected_completion: string | null;
}

interface CustomerInvoice {
  id: number;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  total_paid: number;
  state: string;
  job_title: string | null;
}

export default function CustomerDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params?.id as string;
  const workAddressId = searchParams.get('work_address_id') || null;
  
  const [data, setData] = useState<CustomerDetails | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState(() => {
    const tab = searchParams.get('tab');
    const allowed = ['All works', 'Communications', 'Contacts', 'Branches', 'Work address', 'Assets', 'Files'];
    return tab && allowed.includes(tab) ? tab : 'All works';
  });
  const [historySearch, setHistorySearch] = useState('');
  const [historyType, setHistoryType] = useState<'jobs' | 'invoices' | 'credit_notes'>('jobs');

  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  useEffect(() => {
    const tab = searchParams.get('tab');
    const allowed = ['All works', 'Communications', 'Contacts', 'Branches', 'Work address', 'Assets', 'Files'];
    if (tab && allowed.includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const fetchDetails = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    try {
      const res = await getJson<CustomerDetails>(`/customers/${id}`, token);
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch customer details');
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  const fetchJobs = useCallback(async () => {
    if (!token || !id) return;
    try {
      const q = workAddressId ? `?work_address_id=${workAddressId}` : '';
      const res = await getJson<Job[]>(`/customers/${id}/jobs${q}`, token);
      setJobs(res || []);
    } catch (err) {
      console.error('Failed to fetch jobs', err);
    }
  }, [id, token, workAddressId]);

  const fetchInvoices = useCallback(async () => {
    if (!token || !id) return;
    try {
      const qp = new URLSearchParams({ customer_id: id, limit: '100' });
      if (workAddressId) qp.set('invoice_work_address_id', workAddressId);
      const res = await getJson<{ invoices: CustomerInvoice[] }>(`/invoices?${qp.toString()}`, token);
      setInvoices(res.invoices || []);
    } catch (err) {
      console.error('Failed to fetch invoices', err);
      setInvoices([]);
    }
  }, [id, token, workAddressId]);

  useEffect(() => {
    fetchDetails();
    fetchJobs();
    fetchInvoices();
  }, [fetchDetails, fetchJobs, fetchInvoices]);

  const historyRows = useMemo(() => {
    const q = historySearch.trim().toLowerCase();

    if (historyType === 'jobs') {
      return jobs
        .filter((j) => ['completed', 'closed'].includes(j.state))
        .map((j) => ({
          id: `job-${j.id}`,
          date: j.created_at,
          typeLabel: 'Job',
          recordNo: j.id.toString().padStart(4, '0'),
          description: j.description_name || j.title,
          total: '-',
          balance: '-',
          viewPath: `/dashboard/jobs/${j.id}`,
          badgeClass: 'bg-slate-100 text-slate-600',
        }));
    }

    if (historyType === 'invoices') {
      return invoices.map((inv) => ({
        id: `invoice-${inv.id}`,
        date: inv.invoice_date,
        typeLabel: 'Invoice',
        recordNo: inv.invoice_number,
        description: inv.job_title || 'Invoice',
        total: `£${Number(inv.total_amount).toFixed(2)}`,
        balance: `£${Math.max(0, Number(inv.total_amount) - Number(inv.total_paid)).toFixed(2)}`,
        viewPath: `/dashboard/invoices/${inv.id}`,
        badgeClass: inv.state === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700',
      }));
    }

    return [];
  }, [historySearch, historyType, jobs, invoices]).filter((row) => {
    if (!historySearch.trim()) return true;
    const text = `${row.recordNo} ${row.description} ${row.typeLabel}`.toLowerCase();
    return text.includes(historySearch.trim().toLowerCase());
  });

  if (loading) return <div className="p-8 text-slate-500 font-medium">Loading customer...</div>;
  if (!data) return (
    <div className="flex flex-col gap-4 p-8">
      <span className="text-rose-500 font-medium">{error || 'Customer not found'}</span>
      <button onClick={() => router.push('/dashboard/customers')} className="text-blue-500 hover:underline self-start">Back to customers</button>
    </div>
  );

  const addressString = [data.address_line_1, data.address_line_2, data.town, data.county, data.postcode].filter(Boolean).join(', ');
  const displayAddress = addressString || 'No address provided';

  const fullContactName = [data.contact_title, data.contact_first_name, data.contact_surname].filter(Boolean).join(' ');

  const allowBranches = data.customer_type_allow_branches !== false;
  const workAddressLabel = (data.customer_type_work_address_name || 'Work address').trim() || 'Work address';
  const tabs: { key: string; label: string }[] = [
    { key: 'All works', label: 'All works' },
    { key: 'Communications', label: 'Communications' },
    { key: 'Contacts', label: 'Contacts' },
    ...(allowBranches ? [{ key: 'Branches', label: 'Branches' }] : []),
    { key: 'Work address', label: workAddressLabel },
    { key: 'Assets', label: 'Assets' },
    { key: 'Files', label: 'Files' },
  ];

  return (
    <div className="flex h-full flex-col bg-slate-50">
      {/* Header bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 md:px-6 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard/customers')} className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 transition-colors">
            <ArrowLeft className="size-5" />
          </button>
          <div className="flex items-center text-sm font-medium text-slate-600">
             <span className="cursor-pointer hover:underline hover:text-slate-900" onClick={() => router.push('/dashboard/customers')}>Customers</span>
             <span className="mx-2 text-slate-300">/</span>
             <span className="cursor-pointer hover:underline hover:text-slate-900" onClick={() => router.push('/dashboard/customers')}>Customers list</span>
             <span className="mx-2 text-slate-300">/</span>
             <span className="text-slate-900 font-semibold">{data.full_name}</span>
          </div>
        </div>
      </header>

      {workAddressId && (
        <div className="flex items-center justify-between bg-amber-50 border-b border-amber-200 px-4 py-2 md:px-6">
          <p className="text-sm font-medium text-amber-800">
            🏠 Viewing data scoped to work address #{workAddressId}
          </p>
          <button
            onClick={() => router.push(`/dashboard/customers/${id}`)}
            className="text-sm font-semibold text-amber-700 hover:underline"
          >
            ← Back to full customer view
          </button>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <div className="flex flex-col lg:flex-row h-full">

          {/* LEFT SIDEBAR (Info Panel) */}
          <div className="w-full lg:w-[340px] shrink-0 border-r border-slate-200 bg-white shadow-[1px_0_5px_rgba(0,0,0,0.02)] flex flex-col">
            
            {/* Map Placeholder */}
            <div className="h-40 bg-slate-200 relative overflow-hidden flex items-center justify-center">
              <img src="https://i.imgur.com/gO2kPj7.png" alt="Map background" className="absolute inset-0 w-full h-full object-cover opacity-60" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-rose-500 drop-shadow-md">
                 <MapPin className="size-8" fill="currentColor" />
              </div>
              <div className="absolute bottom-3 left-3 flex gap-2">
                 <span className={`px-2 py-0.5 rounded text-xs font-bold text-white shadow-sm ${data.status === 'ACTIVE' ? 'bg-[#14B8A6]' : data.status === 'LEAD' ? 'bg-amber-500' : 'bg-slate-500'}`}>
                   {data.status}
                 </span>
              </div>
            </div>

            {/* Primary Details Card */}
            <div className="p-5 border-b border-slate-100 relative group">
              <button onClick={() => router.push(`/dashboard/customers/${id}/edit`)} className="absolute top-5 right-5 text-sm font-semibold text-[#14B8A6] hover:underline opacity-0 group-hover:opacity-100 transition-opacity">Edit</button>
              
              <div className="space-y-3.5 mt-1">
                 <div className="flex gap-3 items-start">
                   <User className="size-5 text-slate-400 shrink-0 mt-0.5" />
                   <span className="text-[15px] font-semibold text-slate-800">{data.full_name}</span>
                 </div>
                 <div className="flex gap-3 items-start">
                   <MapPin className="size-5 text-slate-400 shrink-0 mt-0.5" />
                   <span className="text-sm text-slate-600 leading-relaxed">{displayAddress}</span>
                 </div>
                 <div className="flex gap-3 items-center">
                   <Phone className="size-5 text-slate-400 shrink-0" />
                   <span className="text-sm font-medium text-[#14B8A6]">{data.contact_mobile || data.phone || data.landline || 'No phone'}</span>
                 </div>
                 <div className="flex gap-3 items-center">
                   <Mail className="size-5 text-slate-400 shrink-0" />
                   <span className="text-sm font-medium text-[#14B8A6] hover:underline cursor-pointer truncate">{data.contact_email || data.email || 'No email'}</span>
                 </div>
              </div>
            </div>

            {/* Service Reminders (Mocked) */}
            <div className="p-5 border-b border-slate-100">
               <div className="flex justify-between items-center mb-2">
                 <h3 className="font-bold text-slate-800 text-[15px]">Service reminders</h3>
                 <button className="text-sm font-semibold text-[#14B8A6] hover:underline">View</button>
               </div>
               <p className="text-sm text-slate-600">No active service reminders.</p>
            </div>

            {/* Other details */}
            <div className="p-5 border-b border-slate-100 relative group">
               <div className="flex justify-between items-center mb-3">
                 <h3 className="font-bold text-slate-800 text-[15px]">Other details</h3>
                 <button onClick={() => router.push(`/dashboard/customers/${id}/edit`)} className="text-sm font-semibold text-[#14B8A6] hover:underline opacity-0 group-hover:opacity-100 transition-opacity">Edit</button>
               </div>
               
               <div className="space-y-4">
                 <div>
                   <label className="text-xs font-semibold text-slate-700 block mb-0.5">Account no</label>
                   <span className="text-sm text-slate-600">ACC-{data.id.toString().padStart(4, '0')}</span>
                 </div>
                 <div>
                   <label className="text-xs font-semibold text-slate-700 block mb-0.5">Customer type</label>
                   <span className="text-sm text-slate-600">{data.customer_type_name || '-'}</span>
                 </div>
                 <div>
                   <label className="text-xs font-semibold text-slate-700 block mb-0.5">Lead source</label>
                   <span className="text-sm text-slate-600">{data.lead_source || '-'}</span>
                 </div>
                 <div>
                   <label className="text-xs font-semibold text-slate-700 block mb-0.5">Price books</label>
                   <span className="text-sm text-slate-600">{data.price_book_name || '-'}</span>
                 </div>
                 <div>
                   <label className="text-xs font-semibold text-slate-700 block mb-0.5">Credit days</label>
                   <span className="text-sm text-slate-600">{data.credit_days !== null ? data.credit_days : '0'}</span>
                 </div>
                 <div>
                   <label className="text-xs font-semibold text-slate-700 block mb-0.5">Created by</label>
                   <div className="flex items-center gap-2 mt-1">
                      <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600">
                        {data.created_by_name?.charAt(0) || 'U'}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm text-slate-700">{data.created_by_name || 'System User'}</span>
                        <span className="text-[11px] text-slate-400">{dayjs(data.created_at).format('DD/MM/YY (hh:mm a)')}</span>
                      </div>
                   </div>
                 </div>
               </div>
            </div>

            {/* Technical References */}
            <div className="p-5 pb-10 relative group">
               <div className="flex justify-between items-center mb-3">
                 <h3 className="font-bold text-slate-800 text-[15px]">Technical references</h3>
                 <button onClick={() => router.push(`/dashboard/customers/${id}/edit`)} className="text-sm font-semibold text-[#14B8A6] hover:underline opacity-0 group-hover:opacity-100 transition-opacity">Edit</button>
               </div>
               <div className="space-y-4">
                 <div>
                   <label className="text-xs font-semibold text-slate-700 block mb-0.5">W3W</label>
                   <span className="text-sm text-slate-600">-</span>
                 </div>
                 <div>
                   <label className="text-xs font-semibold text-slate-700 block mb-0.5">Water supply</label>
                   <span className="text-sm text-slate-600">-</span>
                 </div>
                 <div>
                   <label className="text-xs font-semibold text-slate-700 block mb-0.5">Power supply</label>
                   <span className="text-sm text-slate-600">-</span>
                 </div>
               </div>
               <button className="text-[13px] font-medium text-[#3E8ED0] hover:underline mt-4 block">Click here to view more technical references</button>
            </div>
          </div>

          {/* MAIN CONTENT AREA */}
          <div className="flex-1 bg-slate-50/50 flex flex-col min-w-0">
             
             {/* Tabs Header */}
             <div className="pt-4 px-6 border-b border-slate-200 bg-white flex items-end justify-between overflow-x-auto no-scrollbar">
                <div className="flex gap-2">
                  {tabs.map((tab) => (
                    <button 
                      key={tab.key} 
                      onClick={() => setActiveTab(tab.key)}
                      className={`whitespace-nowrap px-4 py-2.5 text-sm font-semibold transition border-b-2 ${
                        activeTab === tab.key ? 'border-[#14B8A6] text-[#14B8A6]' : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <div className="pb-2 hidden sm:block">
                  <select className="border border-slate-200 text-sm rounded bg-white px-3 py-1.5 font-medium text-slate-600 outline-none hover:border-slate-300">
                     <option>Quick links</option>
                  </select>
                </div>
             </div>

             {/* Tab Content */}
             <div className="p-4 md:p-6 lg:p-8 overflow-y-auto">
               
               {activeTab === 'All works' && (
                 <div className="space-y-6 max-w-6xl mx-auto">
                    
                    {/* Ongoing works block */}
                    <div className="bg-white border border-slate-200 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden">
                       <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                         <h2 className="text-[15px] font-bold text-slate-800">On going works</h2>
                         <button onClick={() => router.push(`/dashboard/customers/${id}/jobs/new`)} className="bg-[#14B8A6] hover:bg-[#119f8e] text-white text-sm font-bold px-4 py-1.5 rounded-lg shadow-sm transition-colors">Add new job</button>
                       </div>
                       
                       <div className="overflow-x-auto">
                         <table className="w-full text-left text-sm whitespace-nowrap">
                           <thead className="bg-slate-50 uppercase text-xs font-semibold text-slate-500 tracking-wider">
                             <tr>
                               <th className="px-5 py-3 border-b border-slate-200">Date</th>
                               <th className="px-5 py-3 border-b border-slate-200">Type</th>
                               <th className="px-5 py-3 border-b border-slate-200">Record no</th>
                               <th className="px-5 py-3 border-b border-slate-200">Description</th>
                               <th className="px-5 py-3 border-b border-slate-200">Next visit booked</th>
                               <th className="px-5 py-3 border-b border-slate-200 text-right">Actions</th>
                             </tr>
                           </thead>
                           <tbody className="divide-y divide-slate-100 text-slate-700">
                             {jobs.filter(j => !['completed', 'closed'].includes(j.state)).length === 0 ? (
                               <tr>
                                 <td colSpan={6} className="px-5 py-8 text-center text-slate-400">No ongoing works found.</td>
                               </tr>
                             ) : (
                               jobs.filter(j => !['completed', 'closed'].includes(j.state)).map(j => (
                                 <tr key={j.id} className="hover:bg-slate-50 transition-colors">
                                   <td className="px-5 py-4">{dayjs(j.created_at).format('ddd D MMM YYYY')}</td>
                                   <td className="px-5 py-4 font-medium uppercase text-[11px] text-[#14B8A6] tracking-wide">
                                      <span className="bg-emerald-50 px-2 py-1 rounded">Job</span>
                                   </td>
                                   <td className="px-5 py-4 text-slate-500">{j.id.toString().padStart(4, '0')}</td>
                                   <td className="px-5 py-4 w-64 max-w-[300px] truncate font-medium">{j.description_name || j.title}</td>
                                   <td className="px-5 py-4 text-slate-500">
                                      {j.expected_completion ? dayjs(j.expected_completion).format('DD/MM/YYYY HH:mm') : 'No date set'}
                                   </td>
                                   <td className="px-5 py-4 text-right">
                                     <button onClick={() => router.push(`/dashboard/jobs/${j.id}`)} className="text-[#14B8A6] font-semibold hover:underline">View</button>
                                   </td>
                                 </tr>
                               ))
                             )}
                           </tbody>
                         </table>
                       </div>
                       
                       <div className="px-5 py-3 flex items-center justify-between text-[13px] text-slate-500 bg-slate-50/50 border-t border-slate-100">
                         <span>Showing 1 to 1 of 1 entries</span>
                         <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              Show <select className="border border-slate-200 rounded px-1.5 py-0.5 bg-white"><option>5</option></select> entries
                            </div>
                            <div className="flex divide-x border border-slate-200 rounded text-slate-600 overflow-hidden bg-white">
                              <button className="px-2.5 py-1 hover:bg-slate-50 opacity-50 cursor-not-allowed">First</button>
                              <button className="px-2.5 py-1 hover:bg-slate-50 opacity-50 cursor-not-allowed">Previous</button>
                              <button className="px-2.5 py-1 bg-slate-100 font-medium">1</button>
                              <button className="px-2.5 py-1 hover:bg-slate-50 opacity-50 cursor-not-allowed">Next</button>
                              <button className="px-2.5 py-1 hover:bg-slate-50 opacity-50 cursor-not-allowed">Last</button>
                           </div>
                         </div>
                       </div>
                    </div>

                    {/* Filters bar */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                       <div className="relative flex-1 max-w-xs">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                          <input value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} type="text" placeholder="Search" className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-1.5 text-sm outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]" />
                       </div>
                       <label className="flex items-center gap-2 text-sm text-slate-600 font-medium cursor-pointer pl-2 border-l border-slate-200">
                          <input type="checkbox" className="rounded text-[#14B8A6] focus:ring-[#14B8A6]" /> Show parent properties only
                       </label>
                       
                       <div className="flex-1"></div>
                       
                       <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg p-0.5">
                          <span className="text-xs font-medium text-slate-500 px-3 uppercase tracking-wide">Filter by type:</span>
                          <button onClick={() => setHistoryType('jobs')} className={`${historyType === 'jobs' ? 'bg-white text-[#14B8A6] shadow-sm border border-slate-200' : 'text-slate-600 hover:text-slate-900'} text-sm font-semibold rounded-md px-3 py-1`}>Jobs</button>
                          <button onClick={() => setHistoryType('invoices')} className={`${historyType === 'invoices' ? 'bg-white text-[#14B8A6] shadow-sm border border-slate-200' : 'text-slate-600 hover:text-slate-900'} text-sm font-semibold rounded-md px-3 py-1`}>Invoices</button>
                          <button onClick={() => setHistoryType('credit_notes')} className={`${historyType === 'credit_notes' ? 'bg-white text-[#14B8A6] shadow-sm border border-slate-200' : 'text-slate-600 hover:text-slate-900'} text-sm font-semibold rounded-md px-3 py-1`}>Credit notes</button>
                       </div>
                    </div>

                    {/* History block */}
                    <div className="bg-white border border-slate-200 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden mb-12">
                       <div className="px-5 py-3.5 border-b border-slate-100">
                         <h2 className="text-[15px] font-bold text-slate-800">History</h2>
                       </div>
                       
                       <div className="overflow-x-auto">
                         <table className="w-full text-left text-sm whitespace-nowrap">
                           <thead className="bg-slate-50 uppercase text-xs font-semibold text-slate-500 tracking-wider">
                             <tr>
                               <th className="px-5 py-3 border-b border-slate-200">Date</th>
                               <th className="px-5 py-3 border-b border-slate-200">Type</th>
                               <th className="px-5 py-3 border-b border-slate-200">Record no</th>
                               <th className="px-5 py-3 border-b border-slate-200">Description</th>
                               <th className="px-5 py-3 border-b border-slate-200">Total</th>
                               <th className="px-5 py-3 border-b border-slate-200">Balance</th>
                               <th className="px-5 py-3 border-b border-slate-200 text-right">Actions</th>
                             </tr>
                           </thead>
                           <tbody className="divide-y divide-slate-100 text-slate-700">
                             {historyType === 'credit_notes' ? (
                               <tr>
                                 <td colSpan={7} className="px-5 py-8 text-center text-slate-400">Credit notes are not available yet.</td>
                               </tr>
                             ) : historyRows.length === 0 ? (
                               <tr>
                                 <td colSpan={7} className="px-5 py-8 text-center text-slate-400">No history found.</td>
                               </tr>
                             ) : (
                               historyRows.map((r) => (
                                 <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                                   <td className="px-5 py-4">{dayjs(r.date).format('ddd D MMM YYYY')}</td>
                                   <td className="px-5 py-4 font-medium uppercase text-[11px] text-slate-400 tracking-wide">
                                      <span className={`px-2 py-1 rounded ${r.badgeClass}`}>{r.typeLabel}</span>
                                   </td>
                                   <td className="px-5 py-4 text-slate-500">{r.recordNo}</td>
                                   <td className="px-5 py-4 w-64 max-w-[300px] truncate">{r.description}</td>
                                   <td className="px-5 py-4 font-semibold text-slate-800">{r.total}</td>
                                   <td className="px-5 py-4 font-semibold text-slate-800">{r.balance}</td>
                                   <td className="px-5 py-4 text-right">
                                     <button onClick={() => router.push(r.viewPath)} className="text-[#14B8A6] font-semibold hover:underline">View</button>
                                   </td>
                                 </tr>
                               ))
                             )}
                           </tbody>
                         </table>
                       </div>
                       
                       <div className="px-5 py-3 flex items-center justify-between text-[13px] text-slate-500 bg-slate-50/50 border-t border-slate-100">
                         <span>Showing {historyRows.length} {historyRows.length === 1 ? 'entry' : 'entries'}</span>
                         <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              Show <select className="border border-slate-200 rounded px-1.5 py-0.5 bg-white"><option>5</option></select> entries
                            </div>
                            <div className="flex divide-x border border-slate-200 rounded text-slate-600 overflow-hidden bg-white">
                              <button className="px-2.5 py-1 hover:bg-slate-50 opacity-50 cursor-not-allowed">First</button>
                              <button className="px-2.5 py-1 hover:bg-slate-50 opacity-50 cursor-not-allowed">Previous</button>
                              <button className="px-2.5 py-1 bg-slate-100 font-medium">1</button>
                              <button className="px-2.5 py-1 hover:bg-slate-50 opacity-50 cursor-not-allowed">Next</button>
                              <button className="px-2.5 py-1 hover:bg-slate-50 opacity-50 cursor-not-allowed">Last</button>
                           </div>
                         </div>
                       </div>
                    </div>
                 </div>
               )}

              {activeTab === 'Communications' && (
                <CustomerCommunicationsTab
                  customerId={id}
                  customer={{
                    full_name: data.full_name,
                    email: data.email,
                    phone: data.phone,
                    contact_email: data.contact_email,
                    contact_mobile: data.contact_mobile,
                  }}
                  workAddressId={workAddressId || undefined}
                />
              )}

              {activeTab === 'Contacts' && (
                <CustomerContactsTab customerId={id} workAddressId={workAddressId || undefined} />
              )}

              {activeTab === 'Branches' && (data.customer_type_allow_branches !== false) && (
                <CustomerBranchesTab customerId={id} />
              )}

              {activeTab === 'Work address' && (
                <CustomerWorkAddressTab customerId={id} />
              )}

              {activeTab === 'Assets' && (
                <CustomerAssetsTab customerId={id} workAddressId={workAddressId || undefined} />
              )}

              {activeTab !== 'All works' && activeTab !== 'Communications' && activeTab !== 'Contacts' && activeTab !== 'Branches' && activeTab !== 'Work address' && activeTab !== 'Assets' && (
                 <div className="flex flex-col items-center justify-center p-12 text-center text-slate-500 bg-white rounded-xl border border-slate-200">
                   <Filter className="size-12 stroke-1 mb-4 text-slate-300" />
                   <h3 className="text-lg font-bold text-slate-700 mb-1">No data available in this tab</h3>
                   <p className="text-sm">This section is currently under construction.</p>
                 </div>
               )}

             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
