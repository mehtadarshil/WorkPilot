'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getJson, patchJson } from '../../../apiClient';
import JobOfficeTasksTab from './JobOfficeTasksTab';
import { ArrowLeft, Edit, Calendar, Clock, User, Clipboard, FileText, Info, Wrench, Package, ScrollText, Bell, Paperclip, Receipt, PoundSterling, Plus } from 'lucide-react';
import dayjs from 'dayjs';

interface JobDetails {
  id: number;
  title: string;
  description: string | null;
  priority: string;
  state: string;
  created_at: string;
  description_name: string | null;
  expected_completion: string | null;
  customer_id: number;
  customer_full_name: string;
  customer_address: string | null;
  contact_name: string | null;
  business_unit: string | null;
  user_group: string | null;
  skills: string | null;
  job_notes: string | null;
  quoted_amount: number | null;
  customer_reference: string | null;
  completed_service_items?: string[] | null;
}

interface DiaryEvent {
  id: number;
  job_id: number;
  officer_id: number | null;
  officer_full_name: string | null;
  start_time: string;
  duration_minutes: number;
  status: string;
  notes: string | null;
  created_by_name: string;
  created_at: string;
}

interface Invoice {
  id: number;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  total_paid: number;
  currency: string;
  state: string;
  job_title: string;
}

interface OfficeTask {
  id: number;
  job_id: number;
  description: string;
  assignee_officer_id: number | null;
  assignee_name: string | null;
  created_by_name: string;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
}

interface OfficerOption {
  id: number;
  full_name: string;
}

export default function JobDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  
  const [job, setJob] = useState<JobDetails | null>(null);
  const [diaryEvents, setDiaryEvents] = useState<DiaryEvent[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [officeTasks, setOfficeTasks] = useState<OfficeTask[]>([]);
  const [officers, setOfficers] = useState<OfficerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('Details');
  const [viewingEvent, setViewingEvent] = useState<DiaryEvent | null>(null);
  const [modalTab, setModalTab] = useState('Details');
  const [updatingState, setUpdatingState] = useState(false);

  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  const fetchJobDetails = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    try {
      const resJob = await getJson<{ job: JobDetails }>(`/jobs/${id}`, token);
      setJob(resJob.job);
      const resEvents = await getJson<{ events: DiaryEvent[] }>(`/jobs/${id}/diary-events`, token);
      setDiaryEvents(resEvents.events || []);
      const invRes = await getJson<{ invoices: Invoice[] }>(`/invoices?job_id=${id}`, token);
      setInvoices(invRes.invoices || []);
      const taskRes = await getJson<{ tasks: OfficeTask[] }>(`/jobs/${id}/office-tasks`, token);
      setOfficeTasks(taskRes.tasks || []);
      const officersRes = await getJson<{ officers: OfficerOption[] }>(`/officers?limit=100`, token);
      setOfficers(officersRes.officers || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch job details');
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    fetchJobDetails();
  }, [fetchJobDetails]);

  const updateStatus = async (newState: string) => {
    if (!token || !job || newState === job.state) return;
    setUpdatingState(true);
    try {
      await patchJson(`/jobs/${id}`, { state: newState }, token);
      setJob({ ...job, state: newState });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to update job status');
    } finally {
      setUpdatingState(false);
    }
  };

  if (loading) return <div className="p-8 text-slate-500 font-medium">Loading job details...</div>;
  if (!job) return (
    <div className="p-8">
      <div className="rounded-lg bg-rose-50 p-4 text-sm font-medium text-rose-800 border border-rose-200 mb-4">{error || 'Job not found'}</div>
      <button onClick={() => router.back()} className="text-[#14B8A6] hover:underline flex items-center gap-1">
        <ArrowLeft className="size-4" /> Go back
      </button>
    </div>
  );

  const tabs = ['Details', 'Office Task', 'Parts', 'Certificates', 'Notes', 'Reminders', 'Files', 'Invoices', 'Costs', 'Items to invoice'];
  const openOfficeTasks = officeTasks.filter((t) => !t.completed);

  return (
    <div className="flex h-full flex-col bg-background-light">
      {/* Header bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 md:px-6 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 transition-colors">
            <ArrowLeft className="size-5" />
          </button>
          <div className="flex items-center text-sm font-medium text-slate-600">
             <span className="cursor-pointer hover:underline hover:text-slate-900" onClick={() => router.push('/dashboard/customers')}>Customers</span>
             <span className="mx-2 text-slate-300">/</span>
             <span className="cursor-pointer hover:underline hover:text-slate-900" onClick={() => router.push(`/dashboard/customers/${job.customer_id}`)}>{job.customer_full_name}</span>
             <span className="mx-2 text-slate-300">/</span>
             <span className="text-slate-900 font-semibold">Job no. {job.id.toString().padStart(4, '0')} / Details</span>
          </div>
        </div>
      </header>

      {/* Tabs Menu */}
      <div className="bg-white border-b border-slate-200 px-6 pt-2 flex items-end justify-between overflow-x-auto no-scrollbar">
        <div className="flex gap-1">
          {tabs.map(tab => (
            <button 
              key={tab} 
              onClick={() => setActiveTab(tab)}
              className={`whitespace-nowrap px-4 py-3 text-[13px] font-bold transition-all border-b-2 rounded-t-md ${
                activeTab === tab 
                ? 'border-[#14B8A6] text-[#14B8A6] bg-emerald-50/30' 
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              {tab}
              {tab === 'Invoices' && invoices.length > 0 && (
                <span className="ml-2 bg-emerald-600 text-white px-1.5 py-0.5 rounded-full text-[10px]">
                  {invoices.length}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="pb-2">
           <select className="border border-slate-200 text-xs rounded bg-white px-3 py-1.5 font-bold text-slate-600 outline-none hover:border-slate-300">
             <option>Quick links</option>
           </select>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-white border-b border-slate-200 px-6 py-3.5 flex flex-wrap items-baseline gap-x-8 gap-y-2 text-[13px]">
        <span className="text-slate-500">Customer: <strong className="text-slate-800 font-bold ml-1">{job.customer_full_name}</strong></span>
        <span className="text-slate-500">Job number: <strong className="text-slate-800 font-bold ml-1">{job.id.toString().padStart(4, '0')}</strong></span>
        <span className="text-slate-500">Job description: <strong className="text-slate-800 font-bold ml-1 truncate max-w-[300px] inline-block align-bottom">{job.description_name || job.title}</strong></span>
        <span className="text-slate-500">Address: <strong className="text-slate-800 font-bold ml-1 truncate max-w-[400px] inline-block align-bottom">{job.customer_address || 'N/A'}</strong></span>
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {activeTab === 'Invoices' ? (
             <div className="space-y-6">
                {/* Main Invoices Card */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden">
                   <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                      <h2 className="text-[17px] font-black tracking-tight text-slate-800 uppercase flex items-center gap-2">
                        <Receipt className="size-5 text-[#14B8A6]" />
                        Invoices
                      </h2>
                      <button 
                        onClick={() => router.push(`/dashboard/invoices/new?jobId=${job.id}`)}
                        className="rounded bg-[#14B8A6] px-4 py-2 text-[13px] font-black uppercase text-white shadow-sm transition-colors hover:bg-[#13a89a]"
                      >
                         Add new invoice
                      </button>
                   </div>
                   <div className="overflow-x-auto">
                      <table className="w-full text-left text-[13px]">
                         <thead className="bg-[#FBFCFD] border-b border-slate-100 uppercase text-[11px] font-black text-slate-500">
                            <tr>
                               <th className="px-6 py-4">Type</th>
                               <th className="px-6 py-4">Date</th>
                               <th className="px-6 py-4">Description</th>
                               <th className="px-6 py-4">Invoice/Credit no</th>
                               <th className="px-6 py-4 text-right">Total (exc VAT)</th>
                               <th className="px-6 py-4 text-right">VAT</th>
                               <th className="px-6 py-4 text-right">Total</th>
                               <th className="px-6 py-4 text-right">Payment</th>
                               <th className="px-6 py-4 text-right">Balance</th>
                               <th className="px-6 py-4 text-center">Actions</th>
                            </tr>
                         </thead>
                         <tbody className="divide-y divide-slate-50">
                            {invoices.filter(i => i.state !== 'draft').length === 0 ? (
                               <tr>
                                  <td colSpan={10} className="px-6 py-12 text-center text-slate-400 font-bold italic tracking-tight">No finalized invoices found.</td>
                               </tr>
                            ) : (
                               invoices.filter(i => i.state !== 'draft').map(inv => (
                                  <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors">
                                     <td className="px-6 py-5 font-bold text-slate-600">Invoice</td>
                                     <td className="px-6 py-5 text-slate-600 font-bold">{dayjs(inv.invoice_date).format('DD/MM/YY')}</td>
                                     <td className="px-6 py-5 text-slate-600 font-medium truncate max-w-[150px]">{inv.job_title || job.title}</td>
                                     <td className="px-6 py-5 font-black text-[#14B8A6]">{inv.invoice_number}</td>
                                     <td className="px-6 py-5 text-right font-bold text-slate-700">£{Number(inv.subtotal).toFixed(2)}</td>
                                     <td className="px-6 py-5 text-right font-medium text-slate-400">£{Number(inv.tax_amount).toFixed(2)}</td>
                                     <td className="px-6 py-5 text-right font-black text-slate-800">£{Number(inv.total_amount).toFixed(2)}</td>
                                     <td className="px-6 py-5 text-right text-emerald-600 font-black">£{Number(inv.total_paid).toFixed(2)}</td>
                                     <td className="px-6 py-5 text-right font-black text-rose-500">£{(Number(inv.total_amount) - Number(inv.total_paid)).toFixed(2)}</td>
                                     <td className="px-6 py-5 text-center">
                                        <button 
                                           onClick={() => router.push(`/dashboard/invoices/${inv.id}`)}
                                           className="bg-slate-50 border border-slate-200 text-slate-700 hover:text-[#14B8A6] hover:border-[#14B8A6] font-black px-3 py-1.5 rounded transition-all text-[11px] uppercase"
                                        >
                                           View
                                        </button>
                                     </td>
                                  </tr>
                               ))
                            )}
                         </tbody>
                      </table>
                   </div>
                   {/* Table Footer / Pagination Placeholder */}
                   <div className="px-6 py-3 border-t border-slate-50 bg-[#FBFCFD] flex justify-end gap-1">
                      <button className="px-3 py-1.5 text-xs font-bold text-slate-400 border border-slate-200 rounded cursor-not-allowed">Prev</button>
                      <button className="px-3 py-1.5 text-xs font-black text-white bg-[#14B8A6] rounded">1</button>
                      <button className="px-3 py-1.5 text-xs font-bold text-slate-400 border border-slate-200 rounded cursor-not-allowed">Next</button>
                   </div>
                </div>

                {/* Summary Section */}
                <div className="flex justify-end pt-2">
                   <div className="w-full md:w-[450px] bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                      <table className="w-full text-[13px]">
                         <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-100 font-black text-slate-500 text-[11px] uppercase tracking-wider">
                               <th className="px-6 py-3 text-left">Overview</th>
                               <th className="px-6 py-3 text-right">Exc VAT</th>
                               <th className="px-6 py-3 text-right">Inc VAT</th>
                            </tr>
                         </thead>
                         <tbody className="divide-y divide-slate-50">
                            <tr>
                               <td className="px-6 py-4 font-bold text-slate-600">Total invoiced</td>
                               <td className="px-6 py-4 text-right font-bold text-slate-700">£{invoices.filter(i => i.state !== 'draft').reduce((acc, current) => acc + Number(current.subtotal), 0).toFixed(2)}</td>
                               <td className="px-6 py-4 text-right font-black text-slate-900">£{invoices.filter(i => i.state !== 'draft').reduce((acc, current) => acc + Number(current.total_amount), 0).toFixed(2)}</td>
                            </tr>
                            <tr>
                               <td className="px-6 py-4 font-bold text-slate-600">Total paid</td>
                               <td className="px-6 py-4 text-right text-slate-300">—</td>
                               <td className="px-6 py-4 text-right font-black text-emerald-600">£{invoices.reduce((acc, current) => acc + Number(current.total_paid), 0).toFixed(2)}</td>
                            </tr>
                            <tr className="bg-slate-50/20 font-black">
                               <td className="px-6 py-5 text-slate-800 uppercase text-[11px]">Remainder to collect</td>
                               <td className="px-6 py-5 text-right text-slate-300">—</td>
                               <td className="px-6 py-5 text-right text-rose-600 text-xl font-black">£{(invoices.filter(i => i.state !== 'draft').reduce((acc, current) => acc + Number(current.total_amount), 0) - invoices.reduce((acc, current) => acc + Number(current.total_paid), 0)).toFixed(2)}</td>
                            </tr>
                         </tbody>
                      </table>
                   </div>
                </div>

                {/* Draft Invoices Card */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                   <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/30">
                      <h2 className="text-[17px] font-bold tracking-tight text-slate-400 italic flex items-center gap-2">
                        <Clock className="size-5" />
                        Draft invoices
                      </h2>
                   </div>
                   <div className="p-12 flex flex-col items-center justify-center text-center">
                      {invoices.filter(i => i.state === 'draft').length === 0 ? (
                         <>
                            <div className="bg-slate-50 p-6 rounded-full border border-slate-100 mb-4 ring-8 ring-slate-50/50">
                               <Info className="size-10 text-slate-300 stroke-[1.5]" />
                            </div>
                            <p className="text-[15px] font-black text-slate-400 italic tracking-tight uppercase">There are no draft invoices for this job</p>
                         </>
                      ) : (
                         <div className="w-full text-left overflow-x-auto">
                            <table className="w-full text-[13px]">
                               <thead className="bg-[#FBFCFD] border-b border-slate-100 uppercase text-[11px] font-black text-slate-400">
                                  <tr>
                                     <th className="px-6 py-4">Draft Number</th>
                                     <th className="px-6 py-4">Draft Date</th>
                                     <th className="px-6 py-4 text-right">Draft Amount</th>
                                     <th className="px-6 py-4 text-center">Actions</th>
                                  </tr>
                               </thead>
                               <tbody className="divide-y divide-slate-50">
                                  {invoices.filter(i => i.state === 'draft').map(inv => (
                                     <tr key={inv.id} className="hover:bg-slate-50/30 transition-colors italic text-slate-500">
                                        <td className="px-6 py-5 font-black text-[#14B8A6]/60">{inv.invoice_number} (Draft)</td>
                                        <td className="px-6 py-5">{dayjs(inv.invoice_date).format('DD/MM/YY')}</td>
                                        <td className="px-6 py-5 text-right font-bold">£{Number(inv.total_amount).toFixed(2)}</td>
                                        <td className="px-6 py-5 text-center">
                                           <button 
                                              onClick={() => router.push(`/dashboard/invoices/${inv.id}`)}
                                              className="border border-[#14B8A6]/20 text-[#14B8A6]/70 hover:bg-[#14B8A6]/5 font-black px-4 py-2 rounded transition-all text-[11px] uppercase"
                                           >
                                              Edit Draft
                                           </button>
                                        </td>
                                     </tr>
                                  ))}
                               </tbody>
                            </table>
                         </div>
                      )}
                   </div>
                </div>
             </div>
          ) : activeTab === 'Office Task' ? (
            <JobOfficeTasksTab
              jobId={id}
              tasks={officeTasks}
              officers={officers}
              onRefresh={fetchJobDetails}
            />
          ) : (
            <>

          {/* Job Overview Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-[17px] font-black tracking-tight text-slate-800">Job overview</h2>
              <button 
                onClick={() => router.push(`/dashboard/customers/${job.customer_id}/jobs/new?edit=${job.id}`)}
                className="text-sm font-bold text-[#14B8A6] hover:underline"
              >
                Edit
              </button>
            </div>
            <div className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-6">
                 {/* Left Column */}
                 <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                       <span className="text-[13px] font-bold text-slate-500">Job number</span>
                       <span className="text-[13px] text-slate-800 font-medium col-span-2">{job.id.toString().padStart(4, '0')}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-4 border-t border-slate-50 pt-4">
                       <span className="text-[13px] font-bold text-slate-500">Job contact</span>
                       <span className="text-[13px] text-slate-800 font-medium col-span-2">{job.contact_name || job.customer_full_name}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-4 border-t border-slate-50 pt-4">
                       <span className="text-[13px] font-bold text-slate-500">Job description</span>
                       <span className="text-[13px] text-slate-800 font-medium col-span-2 leading-relaxed">{job.description_name || job.title}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-4 border-t border-slate-50 pt-4">
                       <span className="text-[13px] font-bold text-slate-500">Service type</span>
                       <span className="text-[13px] text-slate-800 font-medium col-span-2">
                         {job.description_name || 'Standard'} ({job.expected_completion ? dayjs(job.expected_completion).format('dddd D MMMM YYYY') : 'Not scheduled'})
                       </span>
                    </div>
                    <div className="grid grid-cols-3 gap-4 border-t border-slate-50 pt-4">
                       <span className="text-[13px] font-bold text-slate-500">Completed services</span>
                       <span className="text-[13px] text-slate-800 font-medium col-span-2">
                        {Array.isArray(job.completed_service_items) && job.completed_service_items.length > 0
                          ? job.completed_service_items.join(', ')
                          : 'None selected'}
                       </span>
                    </div>
                 </div>
                 {/* Right Column */}
                 <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                       <span className="text-[13px] font-bold text-slate-500">User group</span>
                       <span className="text-[13px] text-slate-800 font-medium col-span-2">{job.user_group || 'Not assigned'}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-4 border-t border-slate-50 pt-4">
                       <span className="text-[13px] font-bold text-slate-500">Business Unit</span>
                       <span className="text-[13px] text-slate-800 font-medium col-span-2">{job.business_unit || 'N/A'}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-4 border-t border-slate-100 pt-4">
                       <span className="text-[13px] font-bold text-slate-500">Status</span>
                       <div className="col-span-2"><select value={job.state} disabled={updatingState} onChange={(e) => updateStatus(e.target.value)} className={`text-[13px] font-black uppercase text-[#14B8A6] bg-emerald-50 border border-emerald-100 rounded px-3 py-1.5 outline-none cursor-pointer hover:bg-emerald-100 transition-colors ${updatingState ? "opacity-50 cursor-not-allowed" : ""}`}><option value="draft">Draft</option><option value="created">Created</option><option value="unscheduled">Unscheduled</option><option value="scheduled">Scheduled</option><option value="assigned">Assigned</option><option value="rescheduled">Rescheduled</option><option value="dispatched">Dispatched</option><option value="in_progress">In Progress</option><option value="paused">Paused</option><option value="completed">Completed</option><option value="closed">Closed</option></select></div>
                    </div>
                 </div>
              </div>
            </div>
          </div>

          {/* Open Office Tasks Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[17px] font-black tracking-tight text-slate-800">Open office tasks</h2>
                <button onClick={() => setActiveTab('Office Task')} className="text-sm font-bold text-[#14B8A6] hover:underline">Manage tasks</button>
              </div>
            </div>
            {openOfficeTasks.length === 0 ? (
              <div className="p-16 flex flex-col items-center justify-center text-center">
                 <div className="bg-slate-100 p-6 rounded-full border border-slate-200 mb-4">
                    <Info className="size-10 text-slate-400 stroke-[1.5]" />
                 </div>
                 <p className="text-[15px] font-bold text-slate-500">No open office tasks saved</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead className="bg-[#FBFCFD] border-b border-slate-100">
                    <tr>
                      <th className="px-6 py-3 font-bold text-slate-600">Date</th>
                      <th className="px-6 py-3 font-bold text-slate-600">Description</th>
                      <th className="px-6 py-3 font-bold text-slate-600">Created by</th>
                      <th className="px-6 py-3 font-bold text-slate-600">Assignee</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {openOfficeTasks.map((task) => (
                      <tr key={task.id} className="hover:bg-slate-50/40">
                        <td className="px-6 py-4 text-slate-600">{dayjs(task.created_at).format('ddd D MMM YYYY [at] h:mm a')}</td>
                        <td className="px-6 py-4 text-slate-800">{task.description}</td>
                        <td className="px-6 py-4 text-slate-700">{task.created_by_name}</td>
                        <td className="px-6 py-4 text-slate-700">{task.assignee_name || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Diary Events Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h2 className="text-[17px] font-black tracking-tight text-slate-800">Diary events</h2>
              <div className="flex items-center gap-3">
                 <button 
                   onClick={() => router.push(`/dashboard/diary?jobId=${job.id}`)}
                   className="rounded bg-[#14B8A6] px-4 py-2 text-[13px] font-bold uppercase text-white shadow-sm transition-colors hover:bg-[#13a89a]"
                 >
                   Add new diary event
                 </button>
                 <div className="flex gap-2 text-slate-400 border-l border-slate-200 pl-3 ml-1">
                    <button className="p-1 hover:text-slate-600"><Plus className="size-4" /></button>
                    <button className="p-1 hover:text-slate-600"><Calendar className="size-4" /></button>
                 </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-[#FBFCFD] border-b border-slate-100">
                  <tr>
                    <th className="px-6 py-3 font-bold text-slate-600">Event</th>
                    <th className="px-6 py-3 font-bold text-slate-600">Event description</th>
                    <th className="px-6 py-3 font-bold text-slate-600">Feedback</th>
                    <th className="px-6 py-3 font-bold text-slate-600 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {diaryEvents.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-slate-400">No diary events scheduled yet.</td>
                    </tr>
                  ) : (
                    diaryEvents.map(evt => {
                       const start = new Date(evt.start_time);
                       const end = new Date(start.getTime() + evt.duration_minutes * 60000);
                       return (
                          <tr key={evt.id} className="hover:bg-slate-50/50 transition-colors">
                             <td className="px-6 py-5">
                                <div className="flex items-start gap-3">
                                   <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                                      <User className="size-4" />
                                   </div>
                                   <div>
                                     <p className="font-bold text-slate-800">{evt.officer_full_name || 'Unassigned'}</p>
                                     <p className="text-slate-500 text-[12px]">{dayjs(start).format('dddd D MMMM YYYY')}</p>
                                     <p className="text-slate-500 text-[12px]">{evt.duration_minutes} mins ({dayjs(start).format('h:mm a')} to {dayjs(end).format('h:mm a')})</p>
                                   </div>
                                </div>
                             </td>
                             <td className="px-6 py-5">
                                <p className="text-slate-800 font-medium">{job.description_name || job.title}</p>
                             </td>
                             <td className="px-6 py-5">
                                <span className={evt.status === 'Completed' || evt.status === 'Arrived' ? "text-emerald-600 font-semibold" : "text-slate-400 italic"}>
                                  {evt.status === 'No status' ? 'No feedback registered' : evt.status}
                                </span>
                             </td>
                             <td className="px-6 py-5 text-right">
                                <div className="flex justify-end gap-3 font-bold text-[#14B8A6]">
                                   <button className="hover:underline">Edit</button>
                                   <button onClick={() => setViewingEvent(evt)} className="hover:underline text-[#14B8A6]">View</button>
                                </div>
                             </td>
                          </tr>
                       );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  </div>

      {viewingEvent && (
        <div className="fixed inset-0 z-[100] flex justify-end bg-black/40 transition-opacity p-4 sm:p-0">
          <div className="w-[600px] max-w-full bg-white shadow-2xl h-full flex flex-col border-l border-slate-300 transform transition-transform rounded-xl sm:rounded-none overflow-hidden">
             
             {/* Header */}
             <div className="flex justify-between items-center py-3 px-5 border-b border-slate-200">
               <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                 View diary event 
                 <span className="text-[#15803d] font-medium text-[13px]">
                   {dayjs(viewingEvent.start_time).format('dddd D MMMM YYYY (h:mm a')} to {dayjs(new Date(viewingEvent.start_time).getTime() + viewingEvent.duration_minutes*60000).format('h:mm a)')}
                 </span>
               </h3>
               <button onClick={() => setViewingEvent(null)} className="text-slate-500 hover:text-slate-700 font-bold text-sm">Close</button>
             </div>

             {/* Tabs */}
             <div className="flex bg-slate-50 border-b border-slate-200">
               <button onClick={() => setModalTab('Details')} className={`flex-1 py-3 text-sm font-bold border-r border-slate-200 transition-colors ${modalTab === 'Details' ? 'bg-white text-slate-800 border-t-2 border-t-[#14B8A6]' : 'text-slate-500 hover:bg-white/50'}`}>Details</button>
               <button onClick={() => setModalTab('Feedback')} className={`flex-1 py-3 text-sm font-bold transition-colors ${modalTab === 'Feedback' ? 'bg-white text-slate-800 border-t-2 border-t-[#14B8A6]' : 'text-slate-500 hover:bg-white/50'}`}>Feedback</button>
             </div>

             {/* Content */}
             <div className="flex-1 overflow-y-auto bg-white p-6">
                {modalTab === 'Details' ? (
                   <div className="space-y-6">
                      <div className="border border-slate-200 rounded-lg overflow-hidden">
                         <div className="bg-white border-b border-slate-200 px-4 py-3 flex justify-between items-center">
                            <h4 className="font-bold text-slate-800">Event details</h4>
                            <button className="text-[#14B8A6] font-bold text-[13px] hover:underline">Edit</button>
                         </div>
                         <div className="p-4 grid grid-cols-3 gap-y-3 gap-x-4 text-[13px]">
                            <span className="font-bold text-slate-600">Status</span>
                            <span className="col-span-2 text-slate-800">{viewingEvent.status}</span>

                            <span className="font-bold text-slate-600">Engineer</span>
                            <span className="col-span-2 text-slate-800 flex items-center gap-2">
                               <div className="w-5 h-5 rounded bg-slate-200 flex items-center justify-center"><User className="size-3 text-slate-500"/></div>
                               {viewingEvent.officer_full_name || 'Unassigned'}
                            </span>

                            <span className="font-bold text-slate-600">Date</span>
                            <span className="col-span-2 text-slate-800">{dayjs(viewingEvent.start_time).format('dddd D MMMM YYYY')}</span>

                            <span className="font-bold text-slate-600">Time</span>
                            <span className="col-span-2 text-slate-800">({dayjs(viewingEvent.start_time).format('h:mm a')} to {dayjs(new Date(viewingEvent.start_time).getTime() + viewingEvent.duration_minutes*60000).format('h:mm a')})</span>

                            <span className="font-bold text-slate-600">Duration</span>
                            <span className="col-span-2 text-slate-800">{viewingEvent.duration_minutes} mins</span>

                            <span className="font-bold text-slate-600">Created by</span>
                            <span className="col-span-2 text-slate-800">{viewingEvent.created_by_name}</span>

                            <span className="font-bold text-slate-600">Created on</span>
                            <span className="col-span-2 text-slate-800">{dayjs(viewingEvent.created_at).format('dddd D MMMM YYYY h:mm a')}</span>

                            <span className="font-bold text-slate-600">Event description</span>
                            <span className="col-span-2 text-slate-800">{job.description_name || job.title} - {viewingEvent.duration_minutes} minutes</span>

                            <span className="font-bold text-slate-600">Job report workflow</span>
                            <span className="col-span-2 text-slate-800">{job.description_name || 'Standard Service'}</span>
                         </div>
                      </div>

                      <div className="border border-slate-200 rounded-lg overflow-hidden">
                         <div className="bg-white border-b border-slate-200 px-4 py-3">
                            <h4 className="font-bold text-slate-800">Property details</h4>
                         </div>
                         <div className="p-4 grid grid-cols-3 gap-y-3 gap-x-4 text-[13px] relative">
                            <button className="absolute right-4 top-4 text-[#14B8A6] font-bold text-[13px] hover:underline" onClick={() => router.push(`/dashboard/customers/${job.customer_id}`)}>View customer</button>
                            <span className="font-bold text-slate-600">Customer name</span>
                            <span className="col-span-2 text-slate-800">{job.customer_full_name}</span>

                            <span className="font-bold text-slate-600">Customer telephone</span>
                            <span className="col-span-2 text-slate-800">+44 07....</span>

                            <span className="font-bold text-slate-600 mt-1">Address</span>
                            <span className="col-span-2 text-slate-800 whitespace-pre-line leading-relaxed mt-1">
                               {job.customer_address || 'Address not listed'}
                            </span>
                         </div>
                      </div>

                      <div className="border border-slate-200 rounded-lg overflow-hidden">
                         <div className="bg-white border-b border-slate-200 px-4 py-3">
                            <h4 className="font-bold text-slate-800">Confirmations and reminders</h4>
                         </div>
                         <div className="divide-y divide-slate-100">
                             <div className="p-4 flex items-center justify-between bg-white hover:bg-slate-50">
                                 <div className="flex items-center gap-3">
                                     <div className="w-2.5 h-2.5 rounded-full bg-[#15803d]"></div>
                                     <span className="font-bold text-slate-800 text-[13px]">Customer Confirmation</span>
                                 </div>
                                 <div className="flex items-center gap-6">
                                     <span className="text-slate-500 text-[13px]">Email sent on {dayjs(viewingEvent.created_at).format('ddd D MMMM YYYY [at] HH:mm')}</span>
                                     <button className="text-[#14B8A6] font-bold text-[13px] hover:underline">Resend</button>
                                 </div>
                             </div>
                             <div className="p-4 flex items-center justify-between bg-white hover:bg-slate-50">
                                 <div className="flex items-center gap-3">
                                     <div className="w-2.5 h-2.5 rounded-full bg-rose-500"></div>
                                     <span className="font-bold text-slate-800 text-[13px]">Job Address Reminder</span>
                                 </div>
                                 <div className="flex items-center gap-6">
                                     <span className="text-slate-500 text-[13px]">Not sent</span>
                                     <button className="text-[#14B8A6] font-bold text-[13px] hover:underline">Send</button>
                                 </div>
                             </div>
                         </div>
                         <div className="bg-white border-y border-slate-200 px-4 py-3 flex justify-between items-center mt-2">
                            <h4 className="font-bold text-slate-800">Engineer job sheet</h4>
                            <button className="text-[#14B8A6] font-bold text-[13px] hover:underline">View job sheet</button>
                         </div>
                         <div className="p-4 flex items-center justify-between bg-white hover:bg-slate-50">
                             <div className="flex items-center gap-3">
                                 <div className="w-2.5 h-2.5 rounded-full bg-rose-500"></div>
                                 <span className="font-bold text-slate-800 text-[13px]">Engineer job sheet</span>
                             </div>
                             <div className="flex items-center gap-6">
                                 <span className="text-slate-500 text-[13px]">Not sent</span>
                                 <button className="text-[#14B8A6] font-bold text-[13px] hover:underline">Send</button>
                             </div>
                         </div>
                      </div>

                   </div>
                ) : (
                   <div className="space-y-6">
                      <div className="border border-slate-200 rounded-lg overflow-hidden">
                         <div className="bg-white border-b border-slate-200 px-4 py-3">
                            <h4 className="font-bold text-slate-800">Engineer status</h4>
                         </div>
                         <div className="p-12 flex flex-col items-center justify-center text-center">
                            <div className={`w-16 h-16 rounded-full border-4 ${viewingEvent.status === 'completed' ? 'border-[#14B8A6]' : 'border-slate-300'} flex items-center justify-center mb-4`}>
                               {viewingEvent.status === 'completed' ? (
                                 <Clipboard className="size-6 text-[#14B8A6] stroke-[3]" />
                               ) : (
                                 <Info className="size-6 text-slate-400 stroke-[3]" />
                               )}
                            </div>
                            <span className={`font-bold uppercase text-[10px] tracking-wider mb-1 ${viewingEvent.status === 'completed' ? 'text-[#14B8A6]' : 'text-slate-400'}`}>
                              {viewingEvent.status || 'No status'}
                            </span>
                            <span className="text-slate-500 font-medium text-[13px]">
                               {viewingEvent.status === 'completed' ? 'This visit has been marked as fully completed.' : 'The engineer hasn\'t completed the property visit yet.'}
                            </span>
                            
                            {viewingEvent.status !== 'completed' && (
                              <button
                                onClick={async () => {
                                  if (!token) return;
                                  try {
                                    await patchJson(`/diary-events/${viewingEvent.id}`, { status: 'completed' }, token);
                                    alert('Event completed! An invoice has been automatically generated as a draft.');
                                    fetchJobDetails();
                                    setViewingEvent({ ...viewingEvent, status: 'completed' });
                                  } catch (err: unknown) {
                                    alert(err instanceof Error ? err.message : 'Failed to complete visit');
                                  }
                                }}
                                className="mt-6 bg-[#14B8A6] text-white px-6 py-2 rounded-lg font-bold text-sm shadow-sm hover:bg-[#119f8e] transition-colors"
                              >
                                Mark as Completed
                              </button>
                            )}
                         </div>
                      </div>

                      <div className="border border-slate-200 rounded-lg overflow-hidden">
                         <div className="bg-white border-b border-slate-200 px-4 py-3">
                            <h4 className="font-bold text-slate-800">Engineer signature</h4>
                         </div>
                         <div className="p-12 flex flex-col items-center justify-center text-center">
                            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                               <Info className="size-5 text-slate-400 stroke-[2.5]" />
                            </div>
                            <span className="text-slate-500 font-medium text-[13px]">Signature not available</span>
                         </div>
                      </div>
                   </div>
                )}
             </div>
             
             {/* Footer */}
             <div className="flex justify-end p-4 border-t border-slate-200 bg-white">
                <button onClick={() => setViewingEvent(null)} className="text-slate-500 hover:text-slate-700 font-bold text-sm">Close</button>
             </div>
          </div>
        </div>
      )}

    </div>
  );
}
