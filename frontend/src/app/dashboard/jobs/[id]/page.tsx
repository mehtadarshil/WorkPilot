'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { deleteRequest, getJson, patchJson, postJson } from '../../../apiClient';
import JobOfficeTasksTab from './JobOfficeTasksTab';
import JobPartsTab from './JobPartsTab';
import JobReportTab from './JobReportTab';
import { POST_REPORT_JOB_STAGES, type PostReportJobState } from '../postReportJobStages';
import { ArrowLeft, Edit, Calendar, Clock, User, Clipboard, FileText, Info, Wrench, Package, ScrollText, Bell, Paperclip, Receipt, PoundSterling, Plus, Trash2 } from 'lucide-react';
import dayjs from 'dayjs';

interface JobContact {
  id: number;
  title: string | null;
  first_name: string | null;
  surname: string;
  email: string | null;
  mobile: string | null;
  landline: string | null;
}

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
  customer_email?: string | null;
  customer_phone?: string | null;
  contact_name: string | null;
  job_contact_id?: number | null;
  job_contact?: JobContact | null;
  site_contact_name?: string | null;
  site_contact_email?: string | null;
  site_contact_phone?: string | null;
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
  customer_confirmation_sent_at?: string | null;
  address_reminder_sent_at?: string | null;
  engineer_job_sheet_sent_at?: string | null;
  site_contact_name?: string | null;
  site_contact_email?: string | null;
  site_contact_phone?: string | null;
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

function diaryEventStatusNorm(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase().replace(/\s+/g, '_');
}

function diaryVisitIsCompleted(s: string | null | undefined): boolean {
  return diaryEventStatusNorm(s) === 'completed';
}

function diaryVisitIsPositiveProgress(s: string | null | undefined): boolean {
  const t = diaryEventStatusNorm(s);
  return (
    t === 'completed' ||
    t === 'arrived_at_site' ||
    t === 'arrived' ||
    t === 'travelling_to_site' ||
    t === 'travelling' ||
    t === 'traveling'
  );
}

/** Matches server: delete only before travel / on-site / completion; cancelled visits may be removed. */
function diaryVisitAllowsDelete(s: string | null | undefined): boolean {
  const t = diaryEventStatusNorm(s);
  if (t === 'completed') return false;
  if (t === 'cancelled' || t === 'aborted') return true;
  if (
    t === 'travelling_to_site' ||
    t === 'travelling' ||
    t === 'traveling_to_site' ||
    t === 'traveling' ||
    t === 'arrived_at_site' ||
    t === 'arrived' ||
    t === 'on_site'
  ) {
    return false;
  }
  return true;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

type DiaryJobReportQuestion = {
  id: number;
  question_type: string;
  prompt: string;
  helper_text: string | null;
  required: boolean;
};

/** When the API returns answers but no template rows, still render submitted values. */
function normalizeDiaryJobReportPayload(data: {
  questions?: DiaryJobReportQuestion[] | null;
  answers?: Record<string, string> | null;
}): { questions: DiaryJobReportQuestion[]; answers: Record<string, string> } {
  const answers: Record<string, string> = { ...(data.answers ?? {}) };
  let questions = Array.isArray(data.questions) ? [...data.questions] : [];
  if (questions.length === 0 && Object.keys(answers).length > 0) {
    questions = Object.keys(answers)
      .map((k) => parseInt(k, 10))
      .filter((id) => Number.isFinite(id))
      .sort((a, b) => a - b)
      .map((id) => {
        const v = answers[String(id)] ?? '';
        const looksImage = v.startsWith('data:image');
        return {
          id,
          question_type: looksImage ? 'before_photo' : 'text',
          prompt: `Submitted field (question #${id})`,
          helper_text: null,
          required: false,
        };
      });
  }
  return { questions, answers };
}

function renderSubmittedJobReportAnswer(
  q: { question_type: string; prompt: string },
  raw: string | undefined,
): ReactNode {
  const v = raw?.trim() ?? '';
  if (!v) return <span className="text-slate-400 italic text-sm">No answer</span>;
  const isImageAnswer =
    q.question_type === 'customer_signature' ||
    q.question_type === 'officer_signature' ||
    q.question_type === 'before_photo' ||
    q.question_type === 'after_photo' ||
    v.startsWith('data:image');
  if (isImageAnswer) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={v} alt="" className="max-h-52 rounded-md border border-slate-200 bg-white object-contain" />
    );
  }
  if (q.question_type === 'textarea') {
    return (
      <pre className="whitespace-pre-wrap rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-800">
        {v}
      </pre>
    );
  }
  return <p className="text-sm text-slate-800">{v}</p>;
}

interface VisitTimesheetEntry {
  id: number;
  officer_id: number;
  officer_full_name: string | null;
  clock_in: string;
  clock_out: string | null;
  notes: string | null;
  segment_type: string | null;
  diary_event_id: number | null;
  duration_seconds: number;
}

function visitFormatDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
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
  const [diaryJobReport, setDiaryJobReport] = useState<{
    questions: DiaryJobReportQuestion[];
    answers: Record<string, string>;
  } | null>(null);
  const [diaryJobReportLoadError, setDiaryJobReportLoadError] = useState<string | null>(null);
  const [diaryJobReportLoading, setDiaryJobReportLoading] = useState(false);
  const [diaryJobReportSubmitting, setDiaryJobReportSubmitting] = useState(false);
  const [diaryAnswerDraft, setDiaryAnswerDraft] = useState<Record<number, string>>({});
  const [diaryReportWizardStep, setDiaryReportWizardStep] = useState<0 | 1>(0);
  const [diaryPostReportJobState, setDiaryPostReportJobState] = useState<PostReportJobState>('completed');
  const [diaryReminderSending, setDiaryReminderSending] = useState<
    null | 'customer_confirmation' | 'address_reminder' | 'engineer_job_sheet'
  >(null);
  const [visitTimesheetEntries, setVisitTimesheetEntries] = useState<VisitTimesheetEntry[]>([]);
  const [visitTimesheetLoading, setVisitTimesheetLoading] = useState(false);
  const [visitTimesheetError, setVisitTimesheetError] = useState<string | null>(null);
  const [deletingDiaryEventId, setDeletingDiaryEventId] = useState<number | null>(null);

  const visitTimesheetTravelSeconds = useMemo(
    () =>
      visitTimesheetEntries
        .filter((e) => e.segment_type === 'travelling')
        .reduce((acc, e) => acc + Math.max(0, Number.isFinite(e.duration_seconds) ? e.duration_seconds : 0), 0),
    [visitTimesheetEntries],
  );
  const visitTimesheetOnSiteSeconds = useMemo(
    () =>
      visitTimesheetEntries
        .filter((e) => e.segment_type === 'on_site')
        .reduce((acc, e) => acc + Math.max(0, Number.isFinite(e.duration_seconds) ? e.duration_seconds : 0), 0),
    [visitTimesheetEntries],
  );

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

  useEffect(() => {
    if (!viewingEvent || !token) {
      setDiaryJobReport(null);
      setDiaryJobReportLoadError(null);
      setDiaryAnswerDraft({});
      setDiaryReportWizardStep(0);
      setDiaryPostReportJobState('completed');
      return;
    }
    setDiaryReportWizardStep(0);
    setDiaryPostReportJobState('completed');
    let cancelled = false;
    setDiaryJobReportLoading(true);
    setDiaryJobReportLoadError(null);
    void (async () => {
      try {
        const data = await getJson<{
          questions: DiaryJobReportQuestion[];
          answers: Record<string, string>;
        }>(`/diary-events/${viewingEvent.id}/job-report`, token);
        if (cancelled) return;
        const merged = normalizeDiaryJobReportPayload(data);
        setDiaryJobReport(merged);
        const draft: Record<number, string> = {};
        for (const q of merged.questions) {
          const v = merged.answers[String(q.id)];
          if (v) draft[q.id] = v;
        }
        setDiaryAnswerDraft(draft);
      } catch (err: unknown) {
        if (!cancelled) {
          setDiaryJobReportLoadError(err instanceof Error ? err.message : 'Could not load job report');
          setDiaryJobReport({ questions: [], answers: {} });
          setDiaryAnswerDraft({});
        }
      } finally {
        if (!cancelled) setDiaryJobReportLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewingEvent?.id, token]);

  useEffect(() => {
    if (!viewingEvent || !token) {
      setVisitTimesheetEntries([]);
      setVisitTimesheetError(null);
      setVisitTimesheetLoading(false);
      return;
    }
    let cancelled = false;
    setVisitTimesheetLoading(true);
    setVisitTimesheetError(null);
    void (async () => {
      try {
        const res = await getJson<{ entries: VisitTimesheetEntry[] }>(
          `/diary-events/${viewingEvent.id}/timesheet`,
          token,
        );
        if (!cancelled) setVisitTimesheetEntries(res.entries || []);
      } catch (err: unknown) {
        if (!cancelled) {
          setVisitTimesheetEntries([]);
          setVisitTimesheetError(err instanceof Error ? err.message : 'Could not load timesheet');
        }
      } finally {
        if (!cancelled) setVisitTimesheetLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewingEvent?.id, token]);

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

  const handleDeleteDiaryEvent = useCallback(
    async (evt: DiaryEvent) => {
      if (!token || !diaryVisitAllowsDelete(evt.status)) return;
      if (!window.confirm('Remove this diary visit from the schedule? This cannot be undone.')) return;
      setDeletingDiaryEventId(evt.id);
      try {
        await deleteRequest(`/diary-events/${evt.id}`, token);
        setDiaryEvents((prev) => prev.filter((e) => e.id !== evt.id));
        setViewingEvent((cur) => (cur?.id === evt.id ? null : cur));
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : 'Could not delete diary event');
      } finally {
        setDeletingDiaryEventId(null);
      }
    },
    [token],
  );

  const sendDiaryReminder = useCallback(
    async (kind: 'customer_confirmation' | 'address_reminder' | 'engineer_job_sheet') => {
      if (!token || !viewingEvent) return;
      setDiaryReminderSending(kind);
      try {
        const res = await postJson<{
          success: boolean;
          customer_confirmation_sent_at: string | null;
          address_reminder_sent_at: string | null;
          engineer_job_sheet_sent_at: string | null;
        }>(`/diary-events/${viewingEvent.id}/send-reminder`, { kind }, token);
        const patch = {
          customer_confirmation_sent_at: res.customer_confirmation_sent_at,
          address_reminder_sent_at: res.address_reminder_sent_at,
          engineer_job_sheet_sent_at: res.engineer_job_sheet_sent_at,
        };
        setViewingEvent((ev) => (ev && ev.id === viewingEvent.id ? { ...ev, ...patch } : ev));
        setDiaryEvents((prev) => prev.map((e) => (e.id === viewingEvent.id ? { ...e, ...patch } : e)));
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : 'Could not send email');
      } finally {
        setDiaryReminderSending(null);
      }
    },
    [token, viewingEvent],
  );

  if (loading) return <div className="p-8 text-slate-500 font-medium">Loading job details...</div>;
  if (!job) return (
    <div className="p-8">
      <div className="rounded-lg bg-rose-50 p-4 text-sm font-medium text-rose-800 border border-rose-200 mb-4">{error || 'Job not found'}</div>
      <button onClick={() => router.back()} className="text-[#14B8A6] hover:underline flex items-center gap-1">
        <ArrowLeft className="size-4" /> Go back
      </button>
    </div>
  );

  const diaryRecipientEmail = (job.site_contact_email || job.customer_email || '').trim();
  const diaryRecipientPhone = (job.site_contact_phone || job.customer_phone || '').trim();
  const jobContactDisplayName = (job.site_contact_name || job.contact_name || job.customer_full_name || '').trim();
  const hasJobAddressListed = Boolean(job.customer_address?.trim());
  const showDiaryCustomerConfirmationEmail = Boolean(diaryRecipientEmail);
  const showDiaryAddressReminderEmail = !hasJobAddressListed;
  const showDiaryEngineerJobSheetEmail = Boolean(viewingEvent?.officer_full_name?.trim());

  const tabs = [
    'Details',
    'Job report',
    'Office Task',
    'Parts',
    'Certificates',
    'Notes',
    'Reminders',
    'Files',
    'Invoices',
    'Costs',
    'Items to invoice',
  ];
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
          ) : activeTab === 'Job report' ? (
            token ? (
              <JobReportTab jobId={id} token={token} />
            ) : (
              <div className="p-8 text-slate-500 text-sm">Sign in to edit the job report template.</div>
            )
          ) : activeTab === 'Office Task' ? (
            <JobOfficeTasksTab
              jobId={id}
              tasks={officeTasks}
              officers={officers}
              onRefresh={fetchJobDetails}
            />
          ) : activeTab === 'Parts' ? (
            <JobPartsTab jobId={id} />
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
                       <span className="text-[13px] text-slate-800 font-medium col-span-2">
                         {job.site_contact_name || job.contact_name || job.customer_full_name}
                       </span>
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
                                <span className={diaryVisitIsPositiveProgress(evt.status) ? "text-emerald-600 font-semibold" : "text-slate-400 italic"}>
                                  {!evt.status || evt.status === 'No status' ? 'No feedback registered' : evt.status}
                                </span>
                             </td>
                             <td className="px-6 py-5 text-right">
                                <div className="flex justify-end items-center gap-3">
                                  {diaryVisitAllowsDelete(evt.status) && (
                                    <button
                                      type="button"
                                      disabled={deletingDiaryEventId === evt.id}
                                      onClick={() => void handleDeleteDiaryEvent(evt)}
                                      className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-[12px] font-bold text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50"
                                      title="Remove visit from schedule"
                                    >
                                      <Trash2 className="size-3.5 shrink-0" />
                                      {deletingDiaryEventId === evt.id ? 'Deleting…' : 'Delete'}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setViewingEvent(evt)}
                                    className="font-bold text-[#14B8A6] hover:underline text-[13px]"
                                  >
                                    View
                                  </button>
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
                         <div className="bg-white border-b border-slate-200 px-4 py-3">
                            <h4 className="font-bold text-slate-800">Event details</h4>
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
                            <span className="font-bold text-slate-600">Job contact</span>
                            <span className="col-span-2 text-slate-800">{jobContactDisplayName || '—'}</span>

                            <span className="font-bold text-slate-600">Account name</span>
                            <span className="col-span-2 text-slate-800">{job.customer_full_name}</span>

                            <span className="font-bold text-slate-600">Contact telephone</span>
                            <span className="col-span-2 text-slate-800">
                              {diaryRecipientPhone || 'Not listed'}
                            </span>

                            <span className="font-bold text-slate-600">Contact email</span>
                            <span className="col-span-2 text-slate-800">
                              {diaryRecipientEmail || 'Not listed'}
                            </span>

                            <span className="font-bold text-slate-600 mt-1">Address</span>
                            <span className="col-span-2 text-slate-800 whitespace-pre-line leading-relaxed mt-1">
                               {job.customer_address || 'Address not listed'}
                            </span>
                         </div>
                      </div>

                      <div className="border border-slate-200 rounded-lg overflow-hidden">
                        {(showDiaryCustomerConfirmationEmail || showDiaryAddressReminderEmail) && (
                          <>
                            <div className="bg-white border-b border-slate-200 px-4 py-3">
                              <h4 className="font-bold text-slate-800">Confirmations and reminders</h4>
                              <p className="text-xs text-slate-500 mt-1">
                                Sends from your Settings → Email configuration.
                                {showDiaryCustomerConfirmationEmail &&
                                  ' Customer confirmation uses the job contact email when set, otherwise the account email.'}
                                {showDiaryAddressReminderEmail &&
                                  ' Address reminder is offered when no job address is saved on the account.'}
                              </p>
                            </div>
                            <div className="divide-y divide-slate-100">
                              {showDiaryCustomerConfirmationEmail && (
                                <div className="p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between bg-white hover:bg-slate-50">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div
                                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${viewingEvent.customer_confirmation_sent_at ? 'bg-[#15803d]' : 'bg-rose-500'}`}
                                    />
                                    <span className="font-bold text-slate-800 text-[13px]">Customer confirmation</span>
                                  </div>
                                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 sm:text-right">
                                    <span className="text-slate-500 text-[13px]">
                                      {viewingEvent.customer_confirmation_sent_at
                                        ? `Email sent ${dayjs(viewingEvent.customer_confirmation_sent_at).format('ddd D MMM YYYY [at] HH:mm')}`
                                        : 'Not sent yet'}
                                    </span>
                                    <button
                                      type="button"
                                      disabled={diaryReminderSending !== null || !diaryRecipientEmail}
                                      onClick={() => void sendDiaryReminder('customer_confirmation')}
                                      className="text-[#14B8A6] font-bold text-[13px] hover:underline disabled:opacity-40 disabled:no-underline text-left sm:text-right"
                                    >
                                      {diaryReminderSending === 'customer_confirmation'
                                        ? 'Sending…'
                                        : viewingEvent.customer_confirmation_sent_at
                                          ? 'Resend'
                                          : 'Send'}
                                    </button>
                                  </div>
                                </div>
                              )}
                              {showDiaryAddressReminderEmail && (
                                <div className="p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between bg-white hover:bg-slate-50">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div
                                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${viewingEvent.address_reminder_sent_at ? 'bg-[#15803d]' : 'bg-rose-500'}`}
                                    />
                                    <span className="font-bold text-slate-800 text-[13px]">Job address reminder</span>
                                  </div>
                                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 sm:text-right">
                                    <span className="text-slate-500 text-[13px]">
                                      {viewingEvent.address_reminder_sent_at
                                        ? `Email sent ${dayjs(viewingEvent.address_reminder_sent_at).format('ddd D MMM YYYY [at] HH:mm')}`
                                        : diaryRecipientEmail
                                          ? 'Not sent yet'
                                          : 'Add job contact or customer email to send'}
                                    </span>
                                    <button
                                      type="button"
                                      disabled={diaryReminderSending !== null || !diaryRecipientEmail}
                                      onClick={() => void sendDiaryReminder('address_reminder')}
                                      className="text-[#14B8A6] font-bold text-[13px] hover:underline disabled:opacity-40 disabled:no-underline text-left sm:text-right"
                                    >
                                      {diaryReminderSending === 'address_reminder' ? 'Sending…' : 'Send'}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </>
                        )}
                        <div
                          className={`bg-white px-4 py-3 ${showDiaryCustomerConfirmationEmail || showDiaryAddressReminderEmail ? 'border-t border-slate-200' : 'border-b border-slate-200'}`}
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                            <div className="min-w-0">
                              <h4 className="font-bold text-slate-800">Engineer job sheet</h4>
                              <p className="mt-0.5 text-xs text-slate-500">
                                Visit times from the mobile app for{' '}
                                <span className="font-semibold text-slate-600">
                                  {viewingEvent.officer_full_name ?? 'the assigned engineer'}
                                </span>
                                .
                              </p>
                            </div>
                            <button
                              type="button"
                              className="text-[#14B8A6] font-bold text-[13px] hover:underline shrink-0 self-start sm:self-center"
                              onClick={() => {
                                if (typeof window !== 'undefined') {
                                  window.open(
                                    `${window.location.origin}/dashboard/jobs/${job.id}`,
                                    '_blank',
                                    'noopener,noreferrer',
                                  );
                                }
                              }}
                            >
                              Open full job
                            </button>
                          </div>
                        </div>
                        <div className="border-b border-slate-200 bg-slate-50/50 px-4 py-3">
                          {visitTimesheetLoading && (
                            <p className="text-sm text-slate-500">Loading visit timesheet…</p>
                          )}
                          {visitTimesheetError && (
                            <p className="text-sm text-rose-600">{visitTimesheetError}</p>
                          )}
                          {!visitTimesheetLoading &&
                            !visitTimesheetError &&
                            visitTimesheetEntries.length === 0 && (
                              <p className="text-sm text-slate-500">
                                No timesheet segments are linked to this visit yet. Totals appear when the officer records
                                travelling or on-site time from the mobile app.
                              </p>
                            )}
                          {!visitTimesheetLoading && !visitTimesheetError && visitTimesheetEntries.length > 0 && (
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="rounded-md border border-slate-200 bg-white px-4 py-3">
                                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                                  Total travelling
                                </p>
                                <p className="mt-1 font-mono text-lg font-semibold text-slate-800">
                                  {visitFormatDuration(visitTimesheetTravelSeconds)}
                                </p>
                              </div>
                              <div className="rounded-md border border-slate-200 bg-white px-4 py-3">
                                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                                  Total on site
                                </p>
                                <p className="mt-1 font-mono text-lg font-semibold text-slate-800">
                                  {visitFormatDuration(visitTimesheetOnSiteSeconds)}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                        {showDiaryEngineerJobSheetEmail && (
                          <div className="p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between bg-white hover:bg-slate-50">
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className={`w-2.5 h-2.5 rounded-full shrink-0 ${viewingEvent.engineer_job_sheet_sent_at ? 'bg-[#15803d]' : 'bg-rose-500'}`}
                              />
                              <span className="font-bold text-slate-800 text-[13px]">Email job sheet to engineer</span>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 sm:text-right">
                              <span className="text-slate-500 text-[13px]">
                                {viewingEvent.engineer_job_sheet_sent_at
                                  ? `Email sent ${dayjs(viewingEvent.engineer_job_sheet_sent_at).format('ddd D MMM YYYY [at] HH:mm')}`
                                  : 'Not sent yet'}
                              </span>
                              <button
                                type="button"
                                disabled={diaryReminderSending !== null}
                                onClick={() => void sendDiaryReminder('engineer_job_sheet')}
                                className="text-[#14B8A6] font-bold text-[13px] hover:underline disabled:opacity-40 disabled:no-underline text-left sm:text-right"
                              >
                                {diaryReminderSending === 'engineer_job_sheet' ? 'Sending…' : 'Send'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                   </div>
                ) : (
                   <div className="space-y-6">
                      <div className="border border-slate-200 rounded-lg overflow-hidden">
                         <div className="bg-white border-b border-slate-200 px-4 py-3">
                            <h4 className="font-bold text-slate-800">Engineer status</h4>
                         </div>
                         <div className="p-6 md:p-10 flex flex-col items-center text-center max-h-[70vh] overflow-y-auto">
                            <div className={`w-16 h-16 rounded-full border-4 ${diaryVisitIsCompleted(viewingEvent.status) ? 'border-[#14B8A6]' : 'border-slate-300'} flex items-center justify-center mb-4 shrink-0`}>
                               {diaryVisitIsCompleted(viewingEvent.status) ? (
                                 <Clipboard className="size-6 text-[#14B8A6] stroke-[3]" />
                               ) : (
                                 <Info className="size-6 text-slate-400 stroke-[3]" />
                               )}
                            </div>
                            <span className={`font-bold uppercase text-[10px] tracking-wider mb-1 ${diaryVisitIsCompleted(viewingEvent.status) ? 'text-[#14B8A6]' : 'text-slate-400'}`}>
                              {viewingEvent.status || 'No status'}
                            </span>
                            <span className="text-slate-500 font-medium text-[13px] max-w-md">
                               {diaryVisitIsCompleted(viewingEvent.status) ? 'This visit has been marked as fully completed.' : 'The engineer hasn\'t completed the property visit yet.'}
                            </span>

                            {diaryJobReportLoading && (
                              <p className="mt-6 text-sm text-slate-500">Loading job report…</p>
                            )}

                            {diaryJobReportLoadError && !diaryJobReportLoading && (
                              <p className="mt-4 text-sm text-rose-600 text-center max-w-md">{diaryJobReportLoadError}</p>
                            )}

                            {diaryVisitIsCompleted(viewingEvent.status) &&
                              !diaryJobReportLoading &&
                              diaryJobReport &&
                              diaryJobReport.questions.length > 0 && (
                                <div className="mt-8 w-full max-w-2xl text-left space-y-4 self-stretch">
                                  <h4 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-2">
                                    Submitted job report
                                  </h4>
                                  {diaryJobReport.questions.map((q) => (
                                    <div
                                      key={q.id}
                                      className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 space-y-2"
                                    >
                                      <div className="text-sm font-bold text-slate-900">{q.prompt}</div>
                                      {q.helper_text && (
                                        <p className="text-xs text-slate-500">{q.helper_text}</p>
                                      )}
                                      {renderSubmittedJobReportAnswer(
                                        q,
                                        diaryJobReport.answers[String(q.id)],
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}

                            {diaryVisitIsCompleted(viewingEvent.status) &&
                              !diaryJobReportLoading &&
                              !diaryJobReportLoadError &&
                              diaryJobReport &&
                              diaryJobReport.questions.length === 0 && (
                                <p className="mt-6 text-sm text-slate-500 text-center max-w-md">
                                  No job report answers are stored for this visit. If the officer submitted a report,
                                  confirm the backend is updated and the visit id matches; otherwise the checklist may
                                  have been replaced before answers were snapshotted.
                                </p>
                              )}

                            {!diaryVisitIsCompleted(viewingEvent.status) &&
                              !diaryJobReportLoading &&
                              diaryJobReport &&
                              diaryJobReport.questions.length > 0 && (
                                <div className="mt-8 w-full max-w-lg text-left space-y-5">
                                  {diaryReportWizardStep === 0 ? (
                                    <>
                                      <p className="text-sm font-bold text-slate-700">
                                        This job requires a job report before completion. Upload images or capture signatures as needed.
                                      </p>
                                      {diaryJobReport.questions.map((q) => (
                                        <div key={q.id} className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 space-y-2">
                                          <div className="text-sm font-bold text-slate-900">
                                            {q.prompt}
                                            {q.required && <span className="text-rose-600"> *</span>}
                                          </div>
                                          {q.helper_text && (
                                            <p className="text-xs text-slate-500">{q.helper_text}</p>
                                          )}
                                          {q.question_type === 'textarea' ? (
                                            <textarea
                                              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                                              rows={4}
                                              value={diaryAnswerDraft[q.id] ?? ''}
                                              onChange={(e) =>
                                                setDiaryAnswerDraft((prev) => ({ ...prev, [q.id]: e.target.value }))
                                              }
                                            />
                                          ) : q.question_type === 'text' ? (
                                            <input
                                              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                                              value={diaryAnswerDraft[q.id] ?? ''}
                                              onChange={(e) =>
                                                setDiaryAnswerDraft((prev) => ({ ...prev, [q.id]: e.target.value }))
                                              }
                                            />
                                          ) : (
                                            <div className="space-y-2">
                                              <input
                                                type="file"
                                                accept="image/*"
                                                className="text-xs text-slate-600"
                                                onChange={async (e) => {
                                                  const f = e.target.files?.[0];
                                                  if (!f) return;
                                                  try {
                                                    const url = await fileToDataUrl(f);
                                                    setDiaryAnswerDraft((prev) => ({ ...prev, [q.id]: url }));
                                                  } catch {
                                                    alert('Could not read image');
                                                  }
                                                }}
                                              />
                                              {diaryAnswerDraft[q.id]?.startsWith('data:image') && (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img
                                                  src={diaryAnswerDraft[q.id]}
                                                  alt=""
                                                  className="max-h-40 rounded border border-slate-200"
                                                />
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                      <button
                                        type="button"
                                        disabled={diaryJobReportSubmitting}
                                        onClick={() => {
                                          const missing = diaryJobReport.questions.filter(
                                            (q) => q.required && !(diaryAnswerDraft[q.id]?.trim()),
                                          );
                                          if (missing.length) {
                                            alert('Please answer all required questions before continuing.');
                                            return;
                                          }
                                          setDiaryReportWizardStep(1);
                                        }}
                                        className="w-full mt-2 bg-[#14B8A6] text-white px-6 py-3 rounded-lg font-bold text-sm shadow-sm hover:bg-[#119f8e] transition-colors disabled:opacity-50"
                                      >
                                        Continue
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          className="text-sm font-bold text-[#14B8A6] hover:underline"
                                          onClick={() => setDiaryReportWizardStep(0)}
                                        >
                                          ← Back
                                        </button>
                                        <h4 className="text-sm font-bold text-slate-900">Change job stage</h4>
                                      </div>
                                      <p className="text-xs text-slate-500">
                                        Choose what happens to the job after this visit report is submitted.
                                      </p>
                                      <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 space-y-1">
                                        {POST_REPORT_JOB_STAGES.map((opt) => (
                                          <label
                                            key={opt.state}
                                            className="flex cursor-pointer gap-3 rounded-lg p-3 hover:bg-white/80"
                                          >
                                            <input
                                              type="radio"
                                              name="diaryPostReportJobState"
                                              className="mt-1 accent-[#14B8A6]"
                                              checked={diaryPostReportJobState === opt.state}
                                              onChange={() => setDiaryPostReportJobState(opt.state)}
                                            />
                                            <div>
                                              <div className="text-sm font-bold text-slate-900">{opt.label}</div>
                                              <div className="text-xs text-slate-500">{opt.description}</div>
                                            </div>
                                          </label>
                                        ))}
                                      </div>
                                      <button
                                        type="button"
                                        disabled={diaryJobReportSubmitting}
                                        onClick={async () => {
                                          if (!token) return;
                                          setDiaryJobReportSubmitting(true);
                                          try {
                                            await postJson(
                                              `/diary-events/${viewingEvent.id}/job-report/submit`,
                                              {
                                                answers: diaryJobReport.questions.map((q) => ({
                                                  question_id: q.id,
                                                  value: diaryAnswerDraft[q.id] ?? '',
                                                })),
                                                next_job_state: diaryPostReportJobState,
                                              },
                                              token,
                                            );
                                            const doneMsg =
                                              diaryPostReportJobState === 'completed'
                                                ? 'Job report saved, job updated to ready for invoicing. A draft invoice may have been created when applicable.'
                                                : 'Job report saved and the job stage was updated.';
                                            alert(doneMsg);
                                            setDiaryReportWizardStep(0);
                                            setDiaryPostReportJobState('completed');
                                            fetchJobDetails();
                                            setViewingEvent({ ...viewingEvent, status: 'completed' });
                                          } catch (err: unknown) {
                                            alert(err instanceof Error ? err.message : 'Submit failed');
                                          } finally {
                                            setDiaryJobReportSubmitting(false);
                                          }
                                        }}
                                        className="w-full mt-2 bg-[#14B8A6] text-white px-6 py-3 rounded-lg font-bold text-sm shadow-sm hover:bg-[#119f8e] transition-colors disabled:opacity-50"
                                      >
                                        {diaryJobReportSubmitting ? 'Submitting…' : 'Confirm'}
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}

                            {!diaryVisitIsCompleted(viewingEvent.status) &&
                              !diaryJobReportLoading &&
                              diaryJobReport &&
                              diaryJobReport.questions.length === 0 && (
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
                            <h4 className="font-bold text-slate-800">Signatures & photos</h4>
                         </div>
                         <div className="p-6 flex flex-col items-stretch text-center sm:text-left">
                            {diaryVisitIsCompleted(viewingEvent.status) &&
                            diaryJobReport &&
                            diaryJobReport.questions.some(
                              (q) =>
                                (q.question_type === 'customer_signature' ||
                                  q.question_type === 'officer_signature') &&
                                diaryJobReport.answers[String(q.id)]?.startsWith('data:image'),
                            ) ? (
                              <div className="space-y-4 w-full max-w-lg mx-auto sm:mx-0">
                                {diaryJobReport.questions.map((q) => {
                                  if (
                                    q.question_type !== 'customer_signature' &&
                                    q.question_type !== 'officer_signature'
                                  ) {
                                    return null;
                                  }
                                  const src = diaryJobReport.answers[String(q.id)];
                                  if (!src?.startsWith('data:image')) return null;
                                  return (
                                    <div key={q.id} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-left">
                                      <div className="text-xs font-bold text-slate-600 mb-2">{q.prompt}</div>
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={src}
                                        alt=""
                                        className="max-h-40 rounded border border-slate-200 bg-white object-contain"
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <>
                                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3 mx-auto sm:mx-0">
                                  <Info className="size-5 text-slate-400 stroke-[2.5]" />
                                </div>
                                <span className="text-slate-500 font-medium text-[13px]">
                                  {diaryVisitIsCompleted(viewingEvent.status)
                                    ? 'No signature images were captured on this report.'
                                    : 'Complete the job report above to capture signatures or photos.'}
                                </span>
                              </>
                            )}
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
