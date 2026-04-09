'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getJson, postJson } from '../../../apiClient';
import { ArrowLeft, ChevronDown, Search, X, Check, Plus, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import dayjs from 'dayjs';

interface InvoiceTarget {
  id: number;
  customer_id: number;
  customer_full_name: string;
  customer_address: string | null;
  customer_email: string | null;
  job_id: number | null;
  job_title: string | null;
  description_name: string | null;
  expected_completion: string | null;
  pricing_items: { id: number; item_name: string; quantity: number; total: string | number }[];
}

function AddInvoiceInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = searchParams?.get('jobId') || '';
  const customerIdParam = searchParams?.get('customerId') || '';
  const workAddressIdParam = searchParams?.get('workAddressId') || '';

  const [target, setTarget] = useState<InvoiceTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [invoiceType, setInvoiceType] = useState('Additional invoice');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [reference, setReference] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [dueDate, setDueDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [businessUnit, setBusinessUnit] = useState('Service & Maintenance');
  const [userGroup, setUserGroup] = useState('Installation');
  const [breakdown, setBreakdown] = useState('No breakdown');
  const [amountType, setAmountType] = useState('VAT Exclusive');
  
  const [lineItems, setLineItems] = useState<{ description: string; quantity: string; unit_price: string }[]>(
    [{ description: '', quantity: '1', unit_price: '' }]
  );
  const [cis, setCis] = useState('No');
  const [vatRate, setVatRate] = useState(20);
  const [nominalCode, setNominalCode] = useState('Sales');
  const [submitting, setSubmitting] = useState(false);
  const [sendEmail, setSendEmail] = useState(false);

  // Sidebar state
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedPIs, setSelectedPIs] = useState<number[]>([]);

  const [businessUnitsList, setBusinessUnitsList] = useState<{id: number, name: string}[]>([]);
  const [userGroupsList, setUserGroupsList] = useState<{id: number, name: string}[]>([]);

  useEffect(() => {
    const token = window.localStorage.getItem('wp_token');
    if (!token) return;

    getJson<{ units: {id: number, name: string}[] }>('/settings/business-units', token)
      .then(res => {
         if (res.units?.length > 0) {
           setBusinessUnitsList(res.units);
           setBusinessUnit(res.units[0].name);
         }
      }).catch(console.error);

    getJson<{ groups: {id: number, name: string}[] }>('/settings/user-groups', token)
      .then(res => {
         if (res.groups?.length > 0) {
           setUserGroupsList(res.groups);
           setUserGroup(res.groups[0].name);
         }
      }).catch(console.error);
  }, []);

  useEffect(() => {
    const token = window.localStorage.getItem('wp_token');
    if (!token) return;
    
    setLoading(true);
    const run = async () => {
      try {
        if (jobId) {
          const res = await getJson<{ job: any }>(`/jobs/${jobId}`, token);
          const job = res.job;
          setTarget({
            id: job.id,
            customer_id: job.customer_id,
            customer_full_name: job.customer_full_name,
            customer_address: job.customer_address,
            customer_email: job.customer_email,
            job_id: job.id,
            job_title: job.title,
            description_name: job.description_name,
            expected_completion: job.expected_completion,
            pricing_items: job.pricing_items || []
          });
          setDescription(job.description_name || job.title);
        } else if (customerIdParam) {
           const cust = await getJson<any>(`/customers/${customerIdParam}`, token);
           let siteAddress = cust.address;
           if (workAddressIdParam) {
              const site = await getJson<any>(`/customers/${customerIdParam}/work-addresses/${workAddressIdParam}`, token);
              if (site.work_address) {
                const s = site.work_address;
                siteAddress = [s.address_line_1, s.address_line_2, s.town, s.county, s.postcode].filter(Boolean).join(', ');
              }
           }
           setTarget({
             id: 0,
             customer_id: cust.id,
             customer_full_name: cust.full_name,
             customer_address: siteAddress,
             customer_email: cust.email,
             job_id: null,
             job_title: null,
             description_name: null,
             expected_completion: null,
             pricing_items: []
           });
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to load info');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [jobId, customerIdParam, workAddressIdParam]);

  if (loading) return <div className="p-8 font-medium text-slate-500">Loading form...</div>;
  if (!target) return <div className="p-8 text-rose-500">{error || 'Target not found'}</div>;

  const subTotalNum = lineItems.reduce((sum, item) => sum + ((parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0)), 0);
  const vatAmount = subTotalNum * (vatRate / 100);
  const total = subTotalNum + vatAmount;

  const addLineItem = () => {
    setLineItems(prev => [...prev, { description: '', quantity: '1', unit_price: '' }]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length <= 1) return;
    setLineItems(prev => prev.filter((_, i) => i !== index));
  };

  const updateLineItem = (index: number, field: 'description' | 'quantity' | 'unit_price', value: string) => {
    setLineItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleSubmit = async (targetState: 'draft' | 'issued') => {
    const token = window.localStorage.getItem('wp_token');
    if (!token) return;

    if (!description.trim()) {
      alert("Description is required");
      return;
    }

    setSubmitting(true);
    try {
      const validItems = lineItems.filter(item => item.description.trim() && (parseFloat(item.unit_price) || 0) > 0);
      if (validItems.length === 0) {
        alert('Please add at least one line item with a description and price.');
        setSubmitting(false);
        return;
      }
      const finalItems = validItems.map(item => ({
        description: item.description.trim(),
        quantity: parseFloat(item.quantity) || 1,
        unit_price: parseFloat(item.unit_price) || 0
      }));

      const res = await postJson<{ invoice: any }>('/invoices', {
        job_id: target.job_id,
        customer_id: target.customer_id,
        invoice_work_address_id: workAddressIdParam ? Number(workAddressIdParam) : undefined,
        invoice_date: new Date(invoiceDate).toISOString(),
        due_date: new Date(dueDate).toISOString(),
        notes: notes || undefined,
        tax_percentage: vatRate,
        state: targetState,
        line_items: finalItems
      }, token);
      
      if (res.invoice?.id) {
        router.push(`/dashboard/invoices/${res.invoice.id}`);
      } else if (target.job_id) {
        router.push(`/dashboard/jobs/${target.job_id}`);
      } else {
        router.push(`/dashboard/customers/${target.customer_id}${workAddressIdParam ? `?work_address_id=${workAddressIdParam}&tab=Invoices` : '?tab=Invoices'}`);
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to create invoice');
      setSubmitting(false);
    }
  };

  const copyFromJob = () => {
    setDescription(target.description_name || target.job_title || '');
  };

  return (
    <div className="flex h-full flex-col bg-[#F8FAFC]">
      {/* Header bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 md:px-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)] z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 transition-colors">
            <ArrowLeft className="size-5" />
          </button>
          <div className="flex items-center text-[13px] font-medium text-slate-600">
             <span className="cursor-pointer hover:underline hover:text-[#14B8A6]" onClick={() => router.push('/dashboard/customers')}>Customers</span>
             <span className="mx-2 text-slate-300">/</span>
             <span className="cursor-pointer hover:underline hover:text-[#14B8A6]" onClick={() => router.push(`/dashboard/customers/${target.customer_id}`)}>{target.customer_full_name}</span>
             <span className="mx-2 text-slate-300">/</span>
             <span className="cursor-pointer hover:underline hover:text-[#14B8A6]" onClick={() => router.push(`/dashboard/jobs/${target.id}`)}>Job no. {target.id.toString().padStart(4, '0')}</span>
             <span className="mx-2 text-slate-300">/</span>
             <span className="cursor-pointer hover:underline hover:text-[#14B8A6]" onClick={() => router.push(`/dashboard/jobs/${target.id}`)}>Invoices</span>
             <span className="mx-2 text-slate-300">/</span>
             <span className="text-slate-900 font-bold">additional</span>
          </div>
        </div>
      </header>

      {/* Info Banner */}
      <div className="bg-white border-b border-slate-200 px-6 py-3.5 flex flex-wrap items-baseline gap-x-8 gap-y-2 text-[12px] shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
        <span className="text-slate-500">Customer name: <strong className="text-slate-800 font-bold ml-1">{target.customer_full_name}</strong></span>
        <span className="text-slate-500">Job number: <strong className="text-slate-800 font-bold ml-1">{target.id.toString().padStart(4, '0')}</strong></span>
        <span className="text-slate-500">Job description: <strong className="text-slate-800 font-bold ml-1 truncate max-w-[300px] inline-block align-bottom">{target.description_name || target.job_title || '-'}</strong></span>
        <span className="text-slate-500">Address: <strong className="text-slate-800 font-bold ml-1 truncate max-w-[400px] inline-block align-bottom">{target.customer_address || 'N/A'}</strong></span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-8">
         <div className="max-w-[1000px] mx-auto space-y-6">
            
            {/* Top Box Form */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden text-[13px]">
               <div className="px-6 py-4 border-b border-slate-100">
                  <h2 className="text-[17px] font-bold text-slate-700">Add invoice</h2>
               </div>
               <div className="p-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                     
                     {/* Left Column */}
                     <div className="space-y-6">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 items-center">
                           <label className="text-right font-bold text-slate-600">Invoice type <span className="text-rose-500">*</span></label>
                           <div className="col-span-1 md:col-span-2">
                              <select value={invoiceType} onChange={e => setInvoiceType(e.target.value)} className="w-full border border-slate-200 rounded px-3 py-2 bg-white text-slate-700 outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]">
                                 <option>Additional invoice</option>
                                 <option>Contract invoice</option>
                                 <option>Pre-final invoice</option>
                                 <option>Final invoice</option>
                              </select>
                           </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                           <label className="text-right font-bold text-slate-600 pt-2">Description <span className="text-rose-500">*</span></label>
                           <div className="col-span-1 md:col-span-2 space-y-2">
                              <input type="text" value={description} onChange={e => setDescription(e.target.value)} className="w-full border border-slate-200 rounded px-3 py-2 text-slate-700 outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]" />
                              <button type="button" onClick={copyFromJob} className="text-[#14B8A6] font-bold hover:underline">Copy from job</button>
                           </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                           <label className="text-right font-bold text-slate-600 pt-2">Invoice notes</label>
                           <div className="col-span-1 md:col-span-2 space-y-2">
                              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} className="w-full border border-slate-200 rounded px-3 py-2 text-slate-700 outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6] resize-y" />
                              <button type="button" className="text-[#14B8A6] font-bold hover:underline">Copy from engineer feedback</button>
                           </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 items-center mt-2">
                           <label className="text-right font-bold text-slate-600">Customer reference</label>
                           <div className="col-span-1 md:col-span-2">
                              <input type="text" value={reference} onChange={e => setReference(e.target.value)} className="w-full border border-slate-200 rounded px-3 py-2 text-slate-700 outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]" />
                           </div>
                        </div>
                     </div>

                     {/* Right Column */}
                     <div className="space-y-6">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                           <label className="text-right font-bold text-slate-600">Invoice number <span className="text-rose-500">*</span></label>
                           <div className="col-span-1 md:col-span-2 text-[#15803d] font-medium pt-0.5">
                              The invoice number will be automatically generated when the invoice is saved
                           </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 items-center">
                           <label className="text-right font-bold text-slate-600">Invoice date <span className="text-rose-500">*</span></label>
                           <div className="col-span-1 md:col-span-2 relative">
                              <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className="w-full border border-slate-200 rounded px-3 py-2 text-slate-700 outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]" />
                           </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 items-center">
                           <label className="text-right font-bold text-slate-600">Payment due on <span className="text-rose-500">*</span></label>
                           <div className="col-span-1 md:col-span-2 relative">
                              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="w-full border border-slate-200 rounded px-3 py-2 text-slate-700 outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]" />
                           </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 items-center">
                           <label className="text-right font-bold text-slate-600">Business unit <span className="text-rose-500">*</span></label>
                           <div className="col-span-1 md:col-span-2">
                              <select value={businessUnit} onChange={e => setBusinessUnit(e.target.value)} className="w-full border border-slate-200 rounded px-3 py-2 bg-white text-slate-700 outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]">
                                 {businessUnitsList.length > 0 ? (
                                    businessUnitsList.map(u => (
                                      <option key={u.id} value={u.name}>{u.name}</option>
                                    ))
                                 ) : (
                                    <>
                                       <option>Service & Maintenance</option>
                                       <option>Installations</option>
                                    </>
                                 )}
                              </select>
                           </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 items-center">
                           <label className="text-right font-bold text-slate-600">User group</label>
                           <div className="col-span-1 md:col-span-2">
                              <select value={userGroup} onChange={e => setUserGroup(e.target.value)} className="w-full border border-slate-200 rounded px-3 py-2 bg-white text-slate-700 outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]">
                                 {userGroupsList.length > 0 ? (
                                    userGroupsList.map(u => (
                                      <option key={u.id} value={u.name}>{u.name}</option>
                                    ))
                                 ) : (
                                    <>
                                       <option>Installation</option>
                                       <option>Service</option>
                                    </>
                                 )}
                              </select>
                           </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                           <label className="text-right font-bold text-slate-600 pt-0.5">Invoice breakdown <span className="text-rose-500">*</span></label>
                           <div className="col-span-1 md:col-span-2 space-y-3 font-medium text-slate-600">
                              <label className="flex items-center gap-2 cursor-pointer">
                                 <input type="radio" value="No breakdown" checked={breakdown === 'No breakdown'} onChange={e => setBreakdown(e.target.value)} className="text-[#14B8A6] focus:ring-[#14B8A6] w-4 h-4 border-slate-300" />
                                 <span className={breakdown === 'No breakdown' ? 'font-bold text-slate-900' : ''}>No breakdown</span>
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer">
                                 <input type="radio" value="Breakdown by category" checked={breakdown === 'Breakdown by category'} onChange={e => setBreakdown(e.target.value)} className="text-[#14B8A6] focus:ring-[#14B8A6] w-4 h-4 border-slate-300" />
                                 <span className={breakdown === 'Breakdown by category' ? 'font-bold text-slate-900' : ''}>Breakdown by category</span>
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer">
                                 <input type="radio" value="Full breakdown" checked={breakdown === 'Full breakdown'} onChange={e => setBreakdown(e.target.value)} className="text-[#14B8A6] focus:ring-[#14B8A6] w-4 h-4 border-slate-300" />
                                 <span className={breakdown === 'Full breakdown' ? 'font-bold text-slate-900' : ''}>Full breakdown</span>
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer">
                                 <input type="radio" value="Full breakdown by category" checked={breakdown === 'Full breakdown by category'} onChange={e => setBreakdown(e.target.value)} className="text-[#14B8A6] focus:ring-[#14B8A6] w-4 h-4 border-slate-300" />
                                 <span className={breakdown === 'Full breakdown by category' ? 'font-bold text-slate-900' : ''}>Full breakdown by category</span>
                              </label>
                           </div>
                        </div>

                     </div>
                  </div>

                  <hr className="my-8 border-slate-100" />
                  
                  <div className="flex justify-end items-center gap-4">
                      <span className="font-bold text-slate-600">Amounts are:</span>
                      <select value={amountType} onChange={e => setAmountType(e.target.value)} className="border border-slate-200 rounded px-3 py-1.5 focus:border-[#14B8A6] w-[180px] bg-white outline-none">
                         <option>VAT Exclusive</option>
                         <option>VAT Inclusive</option>
                      </select>
                      <button onClick={() => setIsSidebarOpen(true)} className="text-[#14B8A6] font-bold hover:underline ml-4 cursor-pointer">Add line items to invoice</button>
                  </div>
               </div>
            </div>

            {/* Line Items + Settings Box */}
            <div className="mt-8 text-[13px]">
               <div className="bg-slate-50 border-x border-t border-slate-200 rounded-t-lg px-6 py-4 shadow-sm flex items-center justify-between">
                 <h3 className="font-bold text-slate-800 text-[15px]">Invoice Line Items</h3>
                 <button type="button" onClick={addLineItem} className="inline-flex items-center gap-1.5 text-[#14B8A6] font-bold hover:underline text-[13px]">
                    <Plus className="size-4" /> Add line item
                 </button>
               </div>
               <div className="border border-slate-200 rounded-b-lg bg-white shadow-sm overflow-hidden">
                  {/* Line items table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[13px]">
                      <thead className="bg-slate-50 text-slate-500 uppercase text-[11px] font-bold tracking-wider">
                        <tr>
                          <th className="px-5 py-3 border-b border-slate-200 w-[50%]">Description</th>
                          <th className="px-5 py-3 border-b border-slate-200 w-[15%]">Qty</th>
                          <th className="px-5 py-3 border-b border-slate-200 w-[15%]">Unit Price (£)</th>
                          <th className="px-5 py-3 border-b border-slate-200 w-[12%] text-right">Total</th>
                          <th className="px-3 py-3 border-b border-slate-200 w-[8%]"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {lineItems.map((item, i) => (
                          <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-5 py-2.5">
                              <input 
                                type="text" 
                                value={item.description} 
                                onChange={e => updateLineItem(i, 'description', e.target.value)} 
                                placeholder="Item description" 
                                className="w-full border border-slate-200 rounded px-3 py-2 text-slate-700 outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]" 
                              />
                            </td>
                            <td className="px-5 py-2.5">
                              <input 
                                type="number" 
                                min={0} 
                                step={0.01} 
                                value={item.quantity} 
                                onChange={e => updateLineItem(i, 'quantity', e.target.value)} 
                                className="w-full border border-slate-200 rounded px-3 py-2 text-slate-700 outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]" 
                              />
                            </td>
                            <td className="px-5 py-2.5">
                              <input 
                                type="number" 
                                min={0} 
                                step={0.01} 
                                value={item.unit_price} 
                                onChange={e => updateLineItem(i, 'unit_price', e.target.value)} 
                                placeholder="0" 
                                className="w-full border border-slate-200 rounded px-3 py-2 text-slate-700 outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]" 
                              />
                            </td>
                            <td className="px-5 py-2.5 text-right font-bold text-slate-800">
                              £{((parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0)).toFixed(2)}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <button 
                                type="button" 
                                onClick={() => removeLineItem(i)} 
                                disabled={lineItems.length <= 1}
                                className="p-1.5 rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Add another row link */}
                  <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50">
                    <button type="button" onClick={addLineItem} className="text-[#14B8A6] font-bold hover:underline text-[13px] inline-flex items-center gap-1.5">
                      <Plus className="size-3.5" /> Add another line item
                    </button>
                  </div>

                  <hr className="border-slate-100" />

                  {/* Settings + Summary */}
                  <div className="p-8 space-y-8">
                     <div className="text-[#15803d] font-medium bg-[#15803d]/5 py-3 px-4 rounded border border-[#15803d]/10">
                        Additional invoices can be raised against a job and will contribute towards the overall profitability of the job, but will not be considered when calculating the final invoice.
                     </div>

                     <div className="flex flex-col md:flex-row gap-12">
                        <div className="w-full md:w-1/2 space-y-4">
                           {/* CIS */}
                           <div className="grid grid-cols-3 gap-4 items-center">
                              <label className="text-right font-bold text-slate-600">CIS <span className="text-rose-500">*</span></label>
                              <div className="col-span-2">
                                 <select value={cis} onChange={e => setCis(e.target.value)} className="w-full border border-slate-200 rounded px-3 py-2 bg-white text-slate-700 outline-none focus:border-[#14B8A6]">
                                    <option>No</option>
                                    <option>Yes</option>
                                 </select>
                              </div>
                           </div>
                           {/* VAT */}
                           <div className="grid grid-cols-3 gap-4 items-center">
                              <label className="text-right font-bold text-slate-600">VAT <span className="text-rose-500">*</span></label>
                              <div className="col-span-2">
                                 <select value={vatRate} onChange={(e) => setVatRate(Number(e.target.value))} className="w-full border border-slate-200 rounded px-3 py-2 bg-white text-slate-700 outline-none focus:border-[#14B8A6]">
                                    <option value={20}>20.00</option>
                                    <option value={5}>5.00</option>
                                    <option value={0}>0.00</option>
                                 </select>
                              </div>
                           </div>
                           {/* Nominal code */}
                           <div className="grid grid-cols-3 gap-4 items-center">
                              <label className="text-right font-bold text-slate-600">Nominal code <span className="text-rose-500">*</span></label>
                              <div className="col-span-2">
                                 <select value={nominalCode} onChange={e => setNominalCode(e.target.value)} className="w-full border border-slate-200 rounded px-3 py-2 bg-white text-slate-700 outline-none focus:border-[#14B8A6]">
                                    <option>Sales</option>
                                    <option>Services</option>
                                 </select>
                              </div>
                           </div>
                        </div>

                        {/* Summary Table */}
                        <div className="w-full md:w-1/2 flex items-start justify-end">
                           <table className="w-full max-w-[320px] border border-slate-200">
                              <tbody className="divide-y divide-slate-100 bg-white shadow-sm">
                                 <tr>
                                   <td className="px-5 py-3.5 font-bold text-slate-600">Total price (exc VAT)</td>
                                   <td className="px-5 py-3.5 font-medium text-slate-700 text-right w-32 border-l border-slate-100 bg-slate-50/50">£{subTotalNum.toFixed(2)}</td>
                                 </tr>
                                 <tr>
                                   <td className="px-5 py-3.5 font-bold text-slate-600">VAT ({vatRate}%)</td>
                                   <td className="px-5 py-3.5 font-medium text-slate-700 text-right w-32 border-l border-slate-100 bg-slate-50/50">£{vatAmount.toFixed(2)}</td>
                                 </tr>
                                 <tr className="bg-slate-50/80">
                                   <td className="px-5 py-4 font-black text-slate-800">Grand total</td>
                                   <td className="px-5 py-4 font-black text-slate-800 text-right w-32 border-l border-slate-100 bg-white">£{total.toFixed(2)}</td>
                                 </tr>
                              </tbody>
                           </table>
                        </div>
                     </div>
                  </div>
               </div>
            </div>

            {/* Footer Wrapper with buttons */}
            <div className="mt-8 bg-slate-50 border border-slate-200 rounded-lg overflow-hidden shadow-sm">
               <div className="p-4 flex items-center justify-between border-b border-slate-200 bg-slate-100/50">
                  <button className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-2 rounded text-slate-600 text-[13px] font-bold hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm">
                      Advanced options 
                      <ChevronDown className="size-4" />
                  </button>
                  <button 
                     onClick={() => handleSubmit('draft')}
                     disabled={submitting}
                     className="text-[13px] font-bold text-slate-600 hover:text-slate-800 transition-colors mr-2"
                  >
                      Save as draft invoice
                  </button>
               </div>
               <div className="p-5 flex items-center justify-end gap-6 bg-slate-50">
                  <label className="flex items-center gap-2.5 text-slate-600 text-[13px] font-medium cursor-pointer select-none">
                      <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-[#14B8A6] focus:ring-[#14B8A6]" />
                      Send invoice to: <span className="text-[#14B8A6]">{target.customer_email || 'No email provided'}</span>
                  </label>
                  <button onClick={() => router.back()} disabled={submitting} className="text-[13px] font-bold text-slate-500 hover:text-slate-800 transition-colors ml-2">Cancel</button>
                  <button 
                     onClick={() => handleSubmit('issued')}
                     disabled={submitting} 
                     className="rounded bg-[#14B8A6] px-8 py-2.5 text-[14px] font-black text-white shadow-sm transition-colors hover:bg-[#13a89a] disabled:opacity-50"
                  >
                     {submitting ? 'Saving...' : 'Save invoice'}
                  </button>
               </div>
             </div>

          </div>
       </div>

      {/* Sidebar for Add Line items to invoice */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            {/* Backdrop */}
            <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               className="fixed inset-0 bg-black/20 z-40 transition-opacity" 
               onClick={() => setIsSidebarOpen(false)}
            />
            {/* Sliding Panel */}
            <motion.div
               initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: "spring", stiffness: 300, damping: 30 }}
               className="fixed top-0 right-0 h-full w-full max-w-[500px] bg-white shadow-2xl z-50 flex flex-col"
            >
               {/* Header */}
               <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
                  <h2 className="text-[17px] font-bold text-slate-700 tracking-tight">Add line items to invoice</h2>
                  <button onClick={() => setIsSidebarOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-md hover:bg-slate-200">
                     <X className="size-5" />
                  </button>
               </div>
               
               {/* Info box */}
               <div className="px-6 pt-6 pb-4 shrink-0">
                  <p className="text-[13px] text-[#15803d] leading-relaxed">
                     Below is a list of diary events associated with this target. You can add diary events to the invoice by clicking the checkbox on the left of the diary events you wish to add and clicking 'Save and add line items' at the bottom of the page.
                  </p>
               </div>

               {/* Search */}
               <div className="px-6 pb-6 border-b border-slate-100 flex flex-wrap sm:flex-nowrap gap-4 shrink-0">
                  <div className="relative flex-1 min-w-[200px]">
                     <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                     <input type="text" placeholder="Search by description" className="w-full border border-slate-200 rounded-full pl-9 pr-4 py-1.5 text-[13px] outline-none focus:border-[#14B8A6] text-slate-700" />
                  </div>
                  <select className="border border-slate-200 rounded px-3 py-1.5 text-[13px] text-slate-600 outline-none focus:border-[#14B8A6] bg-white w-[140px] shrink-0">
                     <option>Invoice status: All</option>
                  </select>
               </div>

               {/* Timeline Content */}
               <div className="flex-1 overflow-y-auto px-6 py-8 bg-white relative">
                  {/* Timeline Date */}
                  <div className="relative pl-[14px]">
                     {/* Verification Line */}
                     <div className="absolute left-0 top-3 bottom-0 w-px bg-slate-300"></div>
                     <div className="flex items-center gap-4 relative z-10 mb-6 -ml-[25px]">
                        <div className="bg-slate-500 text-white text-[11px] font-bold px-3 py-1 rounded shadow-sm">
                           {target.expected_completion ? dayjs(target.expected_completion).format('DD MMM YYYY') : dayjs().format('DD MMM YYYY')}
                        </div>
                        <div className="flex-1 border-t border-dashed border-slate-300 mt-[1px]"></div>
                     </div>

                     {/* Item Node */}
                     {(!target.pricing_items || target.pricing_items.length === 0) && (
                        <div className="text-sm text-slate-500 pl-4 py-2 italic -ml-6">No pricing items associated with this target.</div>
                     )}
                     
                     {target.pricing_items?.map((pi, i) => (
                        <div key={pi.id} className="relative flex items-center gap-4 mb-4 -ml-6 group">
                           {/* Circle Node overlaying line */}
                           <div className="relative z-10 bg-white border-2 border-slate-300 rounded-full w-8 h-8 flex items-center justify-center text-[10px] font-bold text-slate-500 shadow-sm shrink-0 mt-0.5">
                              PI
                           </div>
                           
                           {/* Card */}
                           <div className="flex-1 bg-white border border-slate-200 rounded shadow-sm flex items-center justify-between p-3 transition-colors hover:border-[#14B8A6] cursor-pointer" onClick={() => {
                              setSelectedPIs(prev => prev.includes(pi.id) ? prev.filter(x => x !== pi.id) : [...prev, pi.id]);
                           }}>
                              <div className="flex items-center gap-3">
                                 <div className={`size-4 rounded-sm border flex items-center justify-center transition-colors ${selectedPIs.includes(pi.id) ? 'bg-[#14B8A6] border-[#14B8A6]' : 'border-slate-300 group-hover:border-[#14B8A6]'}`}>
                                    {selectedPIs.includes(pi.id) && <Check className="size-3 text-white" strokeWidth={3} />}
                                 </div>
                                 <span className="text-[13px] font-bold text-slate-700 group-hover:text-[#14B8A6] transition-colors">{pi.item_name}</span>
                              </div>
                              <div className="text-[12px] font-medium text-slate-500 flex items-center gap-4 shrink-0">
                                 <span>Qty: {Number(pi.quantity).toFixed(2)}</span>
                                 <span className="w-[60px] text-right">£{Number(pi.total || 0).toFixed(2)}</span>
                              </div>
                           </div>
                        </div>
                     ))}
                  </div>
               </div>

               {/* Footer */}
               <div className="px-6 py-4 border-t border-slate-200 bg-white flex items-center justify-end gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.02)] shrink-0">
                  <button onClick={() => setIsSidebarOpen(false)} className="text-[14px] font-bold text-slate-500 hover:text-slate-800 transition-colors mr-3">Cancel</button>
                  <button 
                     onClick={() => {
                        // Build line items from selected pricing items
                        const selectedItems = (target.pricing_items || []).filter(p => selectedPIs.includes(p.id));
                        if (selectedItems.length > 0) {
                           const newItems = selectedItems.map(p => ({
                              description: p.item_name,
                              quantity: String(Number(p.quantity)),
                              unit_price: String(Number(p.total) / (Number(p.quantity) || 1))
                           }));
                           setLineItems(prev => {
                              // Remove empty placeholder rows, then append selected items
                              const existing = prev.filter(item => item.description.trim() || (parseFloat(item.unit_price) || 0) > 0);
                              return existing.length > 0 ? [...existing, ...newItems] : newItems;
                           });
                        }
                        setIsSidebarOpen(false);
                     }}
                     className="rounded bg-[#14B8A6] px-6 py-2.5 text-[14px] font-bold text-white shadow-sm transition-colors hover:bg-[#13a89a]"
                  >
                     Save and add line items
                  </button>
               </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}

export default function AddInvoicePage() {
  return (
    <Suspense fallback={<div className="p-8">Loading...</div>}>
      <AddInvoiceInner />
    </Suspense>
  );
}
