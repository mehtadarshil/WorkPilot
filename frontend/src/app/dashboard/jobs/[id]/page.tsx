'use client';

import { useCallback, useEffect, useMemo, useState, useRef, type ReactNode } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { deleteRequest, getBlob, getJson, patchJson, postJson } from '../../../apiClient';
import JobOfficeTasksTab from './JobOfficeTasksTab';
import JobReportTab from './JobReportTab';
import { JobReportAnswerValue } from './JobReportAnswerValue';
import { hasJobReportSignatureAnswer } from './jobReportAnswerMedia';
import JobClientPanelTab from './JobClientPanelTab';
import JobFilesTab from './JobFilesTab';
import JobNotesTab from './JobNotesTab';
import JobCostsTab from './JobCostsTab';
import JobExpensesTab from './JobExpensesTab';
import JobPartsTab from './JobPartsTab';
import JobDynamicReportsTab from './JobDynamicReportsTab';
import { POST_REPORT_JOB_STAGES, type PostReportJobState } from '../postReportJobStages';
import { ArrowLeft, Calendar, Clock, User, Clipboard, Info, Receipt, Plus, Trash2, Key, ChevronDown, Download, CalendarClock, AlertTriangle, Wrench, X } from 'lucide-react';
import Link from 'next/link';
import dayjs from 'dayjs';
import { formatCompletedServicesForJobDetail } from '../serviceJobCompletedItems';
import { pickJobScheduledDateIso } from '../jobScheduledDate';
import { VisitJobSheetTimeline } from './VisitJobSheetTimeline';
import PpmSlaCountdown from './PpmSlaCountdown';
import type { VisitStatusLog } from './visitStatusLabels';

interface JobContact {
  id: number;
  title: string | null;
  first_name: string | null;
  surname: string;
  email: string | null;
  mobile: string | null;
  landline: string | null;
}

interface JobWorkAddress {
  id: number;
  name: string;
  branch_name: string | null;
  address_line_1: string | null;
  town: string | null;
  postcode: string | null;
  key_info?: string | null;
  site_notes?: string | null;
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
  completed_service_items?: unknown;
  /** Set when the job is scoped to a customer work / site address. */
  work_address?: JobWorkAddress | null;
  pricing_items?: { id: number; item_name: string; quantity: number; unit_price: number; total: number; vat_rate: number }[];
  officers?: { id: number; full_name: string; is_primary?: boolean }[];
  is_quotation_visit?: boolean;
  charge_type?: string;
  ppm?: {
    contract_id: number;
    contract_title: string;
    contract_reference?: string | null;
    task_id?: number | null;
    task_name?: string | null;
    task_next_due?: string | null;
    sla_due_at?: string | null;
    sla_breached?: boolean;
  } | null;
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
  /** Set when the visit was aborted (matches Settings → Visit abort reasons). */
  abort_reason?: string | null;
  created_by_name: string;
  created_at: string;
  customer_confirmation_sent_at?: string | null;
  address_reminder_sent_at?: string | null;
  engineer_job_sheet_sent_at?: string | null;
  site_contact_name?: string | null;
  site_contact_email?: string | null;
  site_contact_phone?: string | null;
  charge_type?: string;
  is_free_job?: boolean;
  job_report_submitted?: boolean;
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
  completed_by_name?: string | null;
  completion_source?: 'web' | 'mobile' | string | null;
  reminder_at?: string | null;
  reminder_sent_at?: string | null;
  created_at: string;
}

interface OfficerOption {
  id: number;
  full_name: string;
}

function formatJobWorkAddressLine(wa: JobWorkAddress): string {
  return [wa.address_line_1, wa.town, wa.postcode].filter((p) => typeof p === 'string' && p.trim() !== '').join(', ');
}

function workSiteBreadcrumbTitle(wa: JobWorkAddress): string {
  const line = formatJobWorkAddressLine(wa);
  return line ? `${wa.name} (${line})` : wa.name;
}

function diaryEventStatusNorm(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase().replace(/\s+/g, '_');
}

function diaryVisitIsCompleted(s: string | null | undefined): boolean {
  return diaryEventStatusNorm(s) === 'completed';
}

function diaryVisitIsCancelled(s: string | null | undefined): boolean {
  const t = diaryEventStatusNorm(s);
  return t === 'cancelled' || t === 'aborted';
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

const DEFAULT_API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '/api';
function fileUrlFromApiPath(filePath: string) {
  const base = DEFAULT_API_BASE.replace(/\/$/, '');
  return `${base}${filePath.startsWith('/') ? filePath : `/${filePath}`}`;
}

/** File routes are authenticated; <img src> cannot send a Bearer token. */
function AuthenticatedDiaryFilePreview({
  filePath,
  contentType,
  kind,
  token,
}: {
  filePath: string;
  contentType: string;
  kind: string;
  token: string | null;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const lastBlobRef = useRef<string | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }
    let cancelled = false;
    setObjectUrl(null);
    setFailed(false);
    if (lastBlobRef.current) {
      URL.revokeObjectURL(lastBlobRef.current);
      lastBlobRef.current = null;
    }
    void (async () => {
      try {
        const r = await fetch(fileUrlFromApiPath(filePath), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!r.ok) throw new Error('fetch failed');
        const blob = await r.blob();
        if (cancelled) return;
        const u = URL.createObjectURL(blob);
        lastBlobRef.current = u;
        setObjectUrl(u);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (lastBlobRef.current) {
        URL.revokeObjectURL(lastBlobRef.current);
        lastBlobRef.current = null;
      }
    };
  }, [filePath, token]);

  if (failed) {
    return <span className="text-xs text-rose-600">Could not load</span>;
  }
  if (!objectUrl) {
    return <span className="text-xs text-slate-400">Loading…</span>;
  }
  if (kind === 'video' || (contentType && String(contentType).startsWith('video/'))) {
    return (
      <video
        src={objectUrl}
        controls
        className="max-h-64 w-full max-w-md rounded border border-slate-200 bg-black"
      />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={objectUrl} alt="" className="max-h-52 rounded-md border border-slate-200 object-contain bg-slate-50" />;
}

interface DiaryExtraSubmissionMedia {
  original_filename: string;
  content_type: string;
  kind: string;
  byte_size: number;
  file_path: string;
}
interface DiaryExtraSubmission {
  id: number;
  notes: string | null;
  created_at: string;
  created_by_name: string | null;
  /** Visit engineer when set; otherwise the account that uploaded (e.g. mobile). */
  display_name?: string | null;
  media: DiaryExtraSubmissionMedia[];
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
  const [visitStatusLogs, setVisitStatusLogs] = useState<VisitStatusLog[]>([]);
  const [visitTimesheetLoading, setVisitTimesheetLoading] = useState(false);
  const [visitTimesheetError, setVisitTimesheetError] = useState<string | null>(null);
  const [deletingDiaryEventId, setDeletingDiaryEventId] = useState<number | null>(null);
  const [diaryExtraSubmissions, setDiaryExtraSubmissions] = useState<DiaryExtraSubmission[]>([]);
  const [diaryExtraSubmissionsLoading, setDiaryExtraSubmissionsLoading] = useState(false);
  const [diaryAbortReasonList, setDiaryAbortReasonList] = useState<string[]>([]);
  const [diaryAbortReasonPick, setDiaryAbortReasonPick] = useState('');
  const [diaryAbortReasonLoad, setDiaryAbortReasonLoad] = useState(false);
  const [diaryAbortSubmitting, setDiaryAbortSubmitting] = useState(false);
  const [quickLinksOpen, setQuickLinksOpen] = useState(false);
  const [togglingChargeType, setTogglingChargeType] = useState(false);
  const [downloadingStatement, setDownloadingStatement] = useState(false);
  const quickLinksRef = useRef<HTMLDivElement>(null);

  // --- Job Tools States ---
  const [jobTools, setJobTools] = useState<any[]>([]);
  const [allTools, setAllTools] = useState<any[]>([]);
  const [showAssignToolModal, setShowAssignToolModal] = useState(false);
  const [selectedToolId, setSelectedToolId] = useState('');
  const [assignToolNotes, setAssignToolNotes] = useState('');
  const [assigningTool, setAssigningTool] = useState(false);

  const serviceTypeScheduledIso = useMemo(
    () => (job ? pickJobScheduledDateIso(job.expected_completion, diaryEvents) : null),
    [job, diaryEvents],
  );

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
  const [activeToken, setActiveToken] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setActiveToken(window.localStorage.getItem('wp_token'));
    }
  }, []);

  const fetchJobDetails = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    try {
      const resJob = await getJson<{ job: JobDetails }>(`/jobs/${id}`, token);
      if (resJob.job.is_quotation_visit) {
        router.replace(`/dashboard/quotation-visits/${id}`);
        return;
      }
      setJob(resJob.job);
      const resEvents = await getJson<{ events: DiaryEvent[] }>(`/jobs/${id}/diary-events`, token);
      setDiaryEvents(resEvents.events || []);
      const invRes = await getJson<{ invoices: Invoice[] }>(`/invoices?job_id=${id}`, token);
      setInvoices(invRes.invoices || []);
      const taskRes = await getJson<{ tasks: OfficeTask[] }>(`/jobs/${id}/office-tasks`, token);
      setOfficeTasks(taskRes.tasks || []);
      const officersRes = await getJson<{ officers: OfficerOption[] }>(`/officers?limit=100`, token);
      setOfficers(officersRes.officers || []);
      const toolsRes = await getJson<any[]>(`/jobs/${id}/tools`, token).catch(() => []);
      setJobTools(toolsRes || []);
      const allToolsRes = await getJson<any[]>('/tools', token).catch(() => []);
      setAllTools(allToolsRes || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch job details');
    } finally {
      setLoading(false);
    }
  }, [id, token, router]);

  const fetchJobTools = useCallback(async () => {
    if (!token || !id) return;
    try {
      const res = await getJson<any[]>(`/jobs/${id}/tools`, token);
      setJobTools(res || []);
    } catch (err) {
      console.error('Error fetching job tools:', err);
    }
  }, [token, id]);

  const handleAssignTool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !id || !selectedToolId) return;
    setAssigningTool(true);
    try {
      await postJson(`/jobs/${id}/tools`, {
        tool_id: parseInt(selectedToolId, 10),
        notes: assignToolNotes.trim(),
      }, token);
      setShowAssignToolModal(false);
      setSelectedToolId('');
      setAssignToolNotes('');
      await fetchJobTools();
    } catch (err: any) {
      alert(err.message || 'Error assigning tool');
    } finally {
      setAssigningTool(false);
    }
  };

  const handleRemoveTool = async (toolId: number) => {
    if (!token || !id) return;
    if (!confirm('Are you sure you want to remove this tool from the job?')) return;
    try {
      await deleteRequest(`/jobs/${id}/tools/${toolId}`, token);
      await fetchJobTools();
    } catch (err: any) {
      alert(err.message || 'Error removing tool');
    }
  };

  useEffect(() => {
    fetchJobDetails();
  }, [fetchJobDetails]);

  useEffect(() => {
    if (!quickLinksOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (quickLinksRef.current && !quickLinksRef.current.contains(e.target as Node)) {
        setQuickLinksOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [quickLinksOpen]);

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
      setVisitStatusLogs([]);
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

  useEffect(() => {
    if (!viewingEvent || !token) {
      setDiaryExtraSubmissions([]);
      setDiaryExtraSubmissionsLoading(false);
      return;
    }
    let cancelled = false;
    setDiaryExtraSubmissionsLoading(true);
    void (async () => {
      try {
        const res = await getJson<{
          event?: { abort_reason?: string | null };
          extra_submissions: DiaryExtraSubmission[];
          status_logs?: VisitStatusLog[];
        }>(`/diary-events/${viewingEvent.id}`, token);
        if (!cancelled) {
          setDiaryExtraSubmissions(res.extra_submissions ?? []);
          setVisitStatusLogs(res.status_logs ?? []);
          const ar =
            typeof res.event?.abort_reason === 'string' && res.event.abort_reason.trim()
              ? res.event.abort_reason.trim()
              : null;
          setViewingEvent((prev) =>
            prev && prev.id === viewingEvent.id ? { ...prev, abort_reason: ar } : prev,
          );
          setDiaryEvents((prev) =>
            prev.map((e) => (e.id === viewingEvent.id ? { ...e, abort_reason: ar } : e)),
          );
        }
      } catch {
        if (!cancelled) {
          setDiaryExtraSubmissions([]);
          setVisitStatusLogs([]);
        }
      } finally {
        if (!cancelled) setDiaryExtraSubmissionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewingEvent?.id, token]);

  useEffect(() => {
    if (!viewingEvent || !token || modalTab !== 'Feedback') return;
    if (diaryVisitIsCompleted(viewingEvent.status) || diaryVisitIsCancelled(viewingEvent.status)) return;
    let cancelled = false;
    setDiaryAbortReasonLoad(true);
    void (async () => {
      try {
        const res = await getJson<{ reasons: { label: string }[] }>('/diary-abort-reasons', token);
        if (cancelled) return;
        const labels = (res.reasons || []).map((r) => String(r.label ?? '').trim()).filter((s) => s.length > 0);
        setDiaryAbortReasonList(labels);
        setDiaryAbortReasonPick(labels[0] ?? '');
      } catch {
        if (!cancelled) {
          setDiaryAbortReasonList([]);
          setDiaryAbortReasonPick('');
        }
      } finally {
        if (!cancelled) setDiaryAbortReasonLoad(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewingEvent?.id, viewingEvent?.status, token, modalTab]);

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

  const handleToggleChargeType = async () => {
    if (!token || !job || togglingChargeType) return;
    const next = job.charge_type === 'free' ? 'chargeable' : 'free';
    setTogglingChargeType(true);
    try {
      await patchJson(`/jobs/${id}`, { charge_type: next }, token);
      setJob({ ...job, charge_type: next });
      setDiaryEvents((prev) =>
        prev.map((e) => ({
          ...e,
          charge_type: next,
          is_free_job: next === 'free',
        })),
      );
      setQuickLinksOpen(false);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to update job charge type');
    } finally {
      setTogglingChargeType(false);
    }
  };

  const handleDownloadStatement = async () => {
    if (!token || !job || downloadingStatement) return;
    setDownloadingStatement(true);
    try {
      const blob = await getBlob(`/jobs/${id}/statement.pdf`, token);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `job-${String(job.id).padStart(4, '0')}-statement.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setQuickLinksOpen(false);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to download statement');
    } finally {
      setDownloadingStatement(false);
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

  const openOfficeTasks = useMemo(() => {
    const open = officeTasks.filter((t) => !t.completed);
    return [...open].sort((a, b) => {
      const ra = a.reminder_at ? new Date(a.reminder_at).getTime() : Infinity;
      const rb = b.reminder_at ? new Date(b.reminder_at).getTime() : Infinity;
      if (ra !== rb) return ra - rb;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [officeTasks]);

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
  const workAddress = job.work_address ?? null;
  const workSiteAddressLine = workAddress ? formatJobWorkAddressLine(workAddress) : '';
  const hasJobAddressListed = Boolean(job.customer_address?.trim() || workSiteAddressLine);
  const showDiaryCustomerConfirmationEmail = Boolean(diaryRecipientEmail);
  const showDiaryAddressReminderEmail = !hasJobAddressListed;
  const showDiaryEngineerJobSheetEmail = Boolean(viewingEvent?.officer_full_name?.trim());

  const tabs = [
    'Details',
    'Parts',
    'Job report',
    'Reports',
    'Client panel',
    'Reminders',
    'Notes',
    'Files',
    'Invoices',
    'Costs',
    'Expenses',
    'Items to invoice',
  ];

  return (
    <div className="flex h-full flex-col bg-background-light">
      {/* Header bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 md:px-6 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 transition-colors">
            <ArrowLeft className="size-5" />
          </button>
          <nav
            className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-slate-600"
            aria-label="Breadcrumb"
          >
            <button
              type="button"
              className="shrink-0 cursor-pointer text-left hover:text-slate-900 hover:underline"
              onClick={() => router.push('/dashboard/customers')}
            >
              Customers
            </button>
            <span className="shrink-0 text-slate-300" aria-hidden>
              /
            </span>
            <button
              type="button"
              className="shrink-0 cursor-pointer text-left hover:text-slate-900 hover:underline"
              onClick={() => router.push('/dashboard/customers')}
            >
              Customers list
            </button>
            <span className="shrink-0 text-slate-300" aria-hidden>
              /
            </span>
            <button
              type="button"
              className="min-w-0 max-w-[36vw] cursor-pointer truncate text-left hover:text-slate-900 hover:underline md:max-w-[240px]"
              title={job.customer_full_name}
              onClick={() =>
                router.push(
                  `/dashboard/customers/${job.customer_id}${job.work_address ? `?work_address_id=${job.work_address.id}` : ''}`,
                )
              }
            >
              {job.customer_full_name}
            </button>
            {workAddress ? (
              <>
                <span className="shrink-0 text-slate-300" aria-hidden>
                  /
                </span>
                <button
                  type="button"
                  className="min-w-0 max-w-[42vw] cursor-pointer truncate text-left hover:text-slate-900 hover:underline md:max-w-[280px]"
                  title={workSiteBreadcrumbTitle(workAddress)}
                  onClick={() =>
                    router.push(`/dashboard/customers/${job.customer_id}?work_address_id=${workAddress.id}`)
                  }
                >
                  {workAddress.name}
                  {formatJobWorkAddressLine(workAddress) ? (
                    <span className="font-semibold text-slate-700">
                      {' '}
                      ({formatJobWorkAddressLine(workAddress)})
                    </span>
                  ) : null}
                </button>
              </>
            ) : null}
            <span className="shrink-0 text-slate-300" aria-hidden>
              /
            </span>
            <span className="min-w-0 truncate font-semibold text-slate-900" title={`Job ${job.id}`}>
              Job no. {job.id.toString().padStart(4, '0')}
            </span>
          </nav>
        </div>
      </header>

      {/* Tabs Menu */}
      <div className="bg-white border-b border-slate-200 px-6 pt-2 flex items-end justify-between gap-4">
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto no-scrollbar">
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
        <div className="relative shrink-0 pb-2" ref={quickLinksRef}>
          <button
            type="button"
            onClick={() => setQuickLinksOpen((open) => !open)}
            className="inline-flex items-center gap-1.5 border border-slate-200 text-xs rounded bg-white px-3 py-1.5 font-bold text-slate-600 outline-none hover:border-slate-300"
          >
            Quick links
            <ChevronDown className={`size-3.5 transition-transform ${quickLinksOpen ? 'rotate-180' : ''}`} />
          </button>
          {quickLinksOpen && (
            <div className="absolute right-0 top-full z-30 mt-1 min-w-[180px] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
              <button
                type="button"
                disabled={togglingChargeType}
                onClick={() => void handleToggleChargeType()}
                className="block w-full px-4 py-2 text-left text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {togglingChargeType
                  ? 'Updating…'
                  : job.charge_type === 'free'
                    ? 'Paid Job'
                    : 'Free of charge'}
              </button>
              <button
                type="button"
                disabled={downloadingStatement}
                onClick={() => void handleDownloadStatement()}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Download className="size-3.5 shrink-0 text-slate-500" />
                {downloadingStatement ? 'Downloading…' : 'Full Statement'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-white border-b border-slate-200 px-6 py-3.5 flex flex-wrap items-baseline gap-x-8 gap-y-2 text-[13px]">
        <span className="text-slate-500">Customer: <strong className="text-slate-800 font-bold ml-1">{job.customer_full_name}</strong></span>
        <span className="text-slate-500">Job number: <strong className="text-slate-800 font-bold ml-1">{job.id.toString().padStart(4, '0')}</strong></span>
        {job.is_quotation_visit && (
          <span className="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
            Quotation Visit
          </span>
        )}
        {job.charge_type === 'free' && (
          <span className="inline-flex items-center rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
            Free of charge
          </span>
        )}
        <span className="text-slate-500">Job description: <strong className="text-slate-800 font-bold ml-1 truncate max-w-[300px] inline-block align-bottom">{job.description_name || job.title}</strong></span>
        {job.work_address ? (
          <>
            <span className="text-slate-500">
              Work site:{' '}
              <strong className="text-slate-800 font-bold ml-1 truncate max-w-[400px] inline-block align-bottom">
                {job.work_address.name}
                {job.work_address.branch_name ? (
                  <span className="font-semibold text-slate-600"> — {job.work_address.branch_name}</span>
                ) : null}
                {formatJobWorkAddressLine(job.work_address) ? (
                  <span className="font-medium text-slate-600"> · {formatJobWorkAddressLine(job.work_address)}</span>
                ) : null}
              </strong>
            </span>
            <span className="text-slate-500">
              Billing address:{' '}
              <strong className="text-slate-800 font-bold ml-1 truncate max-w-[400px] inline-block align-bottom">{job.customer_address || 'N/A'}</strong>
            </span>
          </>
        ) : (
          <span className="text-slate-500">Address: <strong className="text-slate-800 font-bold ml-1 truncate max-w-[400px] inline-block align-bottom">{job.customer_address || 'N/A'}</strong></span>
        )}
      </div>

      {job.ppm && (
        <div className={`border-b px-6 py-3 flex flex-wrap items-center gap-4 text-sm ${
          job.ppm.sla_breached ? 'bg-rose-50 border-rose-200' : 'bg-teal-50 border-teal-200'
        }`}>
          <CalendarClock className={`size-5 shrink-0 ${job.ppm.sla_breached ? 'text-rose-600' : 'text-[#14B8A6]'}`} />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-900">
              PPM contract:{' '}
              <Link href={`/dashboard/ppm-contracts/${job.ppm.contract_id}`} className="text-[#14B8A6] hover:underline">
                {job.ppm.contract_title}
              </Link>
              {job.ppm.task_name ? ` — ${job.ppm.task_name}` : ''}
            </p>
            {job.ppm.task_next_due && (
              <p className="text-slate-600">Task due: {dayjs(job.ppm.task_next_due).format('D MMM YYYY')}</p>
            )}
          </div>
          {job.ppm.sla_due_at && (
            <div className={`flex flex-col gap-0.5 rounded-lg px-3 py-1.5 font-medium ${
              job.ppm.sla_breached ? 'bg-rose-100 text-rose-800' : 'bg-white text-slate-700 border border-teal-200'
            }`}>
              <div className="flex items-center gap-2">
                {job.ppm.sla_breached && <AlertTriangle className="size-4" />}
                <Clock className="size-4" />
                <span>SLA due {dayjs(job.ppm.sla_due_at).format('D MMM YYYY HH:mm')}</span>
              </div>
              <PpmSlaCountdown slaDueAt={job.ppm.sla_due_at} breached={job.ppm.sla_breached} />
            </div>
          )}
        </div>
      )}

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {job.work_address?.site_notes && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm flex items-start gap-3">
              <div className="p-1.5 rounded-lg bg-amber-100 text-amber-700 shrink-0">
                <Info className="size-5" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-amber-850 uppercase tracking-wider">Site Notes</h4>
                <p className="mt-1 text-sm text-amber-900 whitespace-pre-wrap font-medium">{job.work_address.site_notes}</p>
              </div>
            </div>
          )}
          {job.work_address?.key_info && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 shadow-sm flex items-start gap-3">
              <div className="p-1.5 rounded-lg bg-indigo-100 text-indigo-700 shrink-0">
                <Key className="size-5" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-indigo-850 uppercase tracking-wider">Key Info / Access Code</h4>
                <p className="mt-1 text-sm text-indigo-900 whitespace-pre-wrap font-medium">{job.work_address.key_info}</p>
              </div>
            </div>
          )}
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
           ) : activeTab === 'Parts' ? (
             <JobPartsTab jobId={id} />
          ) : activeTab === 'Job report' ? (
            token ? (
              <JobReportTab jobId={id} token={token} />
            ) : (
              <div className="p-8 text-slate-500 text-sm">Sign in to view submitted job reports.</div>
            )
          ) : activeTab === 'Reports' ? (
            token ? (
              <JobDynamicReportsTab jobId={id} token={token} />
            ) : (
              <div className="p-8 text-slate-500 text-sm">Sign in to view job reports.</div>
            )
          ) : activeTab === 'Client panel' ? (
            token ? (
              <JobClientPanelTab jobId={id} token={token} onJobRefresh={fetchJobDetails} />
            ) : (
              <div className="p-8 text-slate-500 text-sm">Sign in to manage the client panel.</div>
            )
          ) : activeTab === 'Reminders' ? (
            <JobOfficeTasksTab
              jobId={id}
              tasks={officeTasks}
              officers={officers}
              onRefresh={fetchJobDetails}
            />
          ) : activeTab === 'Notes' ? (
            token ? (
              <JobNotesTab jobId={id} token={token} jobNotes={job.job_notes} />
            ) : (
              <div className="p-8 text-slate-500 text-sm">Sign in to manage job notes.</div>
            )
          ) : activeTab === 'Files' ? (
            token ? (
              <JobFilesTab jobId={id} token={token} />
            ) : (
              <div className="p-8 text-slate-500 text-sm">Sign in to view job files.</div>
            )
          ) : activeTab === 'Costs' ? (
            token ? (
              <JobCostsTab jobId={id} token={token} />
            ) : (
              <div className="p-8 text-slate-500 text-sm">Sign in to manage job costs.</div>
            )
          ) : activeTab === 'Expenses' ? (
            token ? (
              <JobExpensesTab jobId={id} token={token} />
            ) : (
              <div className="p-8 text-slate-500 text-sm">Sign in to manage job expenses.</div>
            )
          ) : activeTab === 'Items to invoice' ? (
            token ? (
              <div className="space-y-6">
                <div className="bg-white rounded-xl border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h2 className="text-[17px] font-black tracking-tight text-slate-800 uppercase flex items-center gap-2">
                      <Clipboard className="size-5 text-[#14B8A6]" />
                      Items to invoice
                    </h2>
                    {job.pricing_items && job.pricing_items.length > 0 && (
                      <button
                        onClick={() => router.push(`/dashboard/invoices/new?jobId=${job.id}`)}
                        className="rounded bg-[#14B8A6] px-4 py-2 text-[13px] font-black uppercase text-white shadow-sm transition-colors hover:bg-[#13a89a]"
                      >
                        Create invoice from items
                      </button>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[13px]">
                      <thead className="bg-[#FBFCFD] border-b border-slate-100 uppercase text-[11px] font-black text-slate-500">
                        <tr>
                          <th className="px-6 py-4">Item</th>
                          <th className="px-6 py-4 text-right">Quantity</th>
                          <th className="px-6 py-4 text-right">Unit price</th>
                          <th className="px-6 py-4 text-right">VAT %</th>
                          <th className="px-6 py-4 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {!job.pricing_items || job.pricing_items.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-6 py-12 text-center text-slate-400 font-bold italic tracking-tight">
                              No pricing items found for this job.
                            </td>
                          </tr>
                        ) : (
                          job.pricing_items.map((pi) => (
                            <tr key={pi.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-5 font-bold text-slate-700">{pi.item_name}</td>
                              <td className="px-6 py-5 text-right font-medium text-slate-600">{pi.quantity}</td>
                              <td className="px-6 py-5 text-right font-medium text-slate-600">£{Number(pi.unit_price).toFixed(2)}</td>
                              <td className="px-6 py-5 text-right font-medium text-slate-600">{pi.vat_rate}%</td>
                              <td className="px-6 py-5 text-right font-black text-slate-800">£{Number(pi.total).toFixed(2)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  {job.pricing_items && job.pricing_items.length > 0 && (
                    <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
                      <div className="text-right">
                        <div className="text-[11px] font-black uppercase text-slate-500 tracking-wide">Total value</div>
                        <div className="text-[20px] font-black text-slate-800">
                          £{job.pricing_items.reduce((sum, pi) => sum + Number(pi.total), 0).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-8 text-slate-500 text-sm">Sign in to view items to invoice.</div>
            )
          ) : (
            <>

          {/* Job Overview Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-[17px] font-black tracking-tight text-slate-800">Job overview</h2>
              <button
                onClick={() =>
                  router.push(
                    `/dashboard/customers/${job.customer_id}/jobs/new?edit=${job.id}${job.work_address ? `&work_address_id=${job.work_address.id}` : ''}`,
                  )
                }
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
                       <span className="text-[13px] font-bold text-slate-500">Assigned officers</span>
                       <span className="text-[13px] text-slate-800 font-medium col-span-2">
                         {job.officers && job.officers.length > 0
                           ? job.officers.map((o) => `${o.full_name}${o.is_primary ? ' (Primary)' : ''}`).join(', ')
                           : '—'}
                       </span>
                    </div>
                    {job.work_address && (
                      <div className="grid grid-cols-3 gap-4 border-t border-slate-50 pt-4">
                        <span className="text-[13px] font-bold text-slate-500">Work site</span>
                        <span className="text-[13px] text-slate-800 font-medium col-span-2 leading-relaxed">
                          <span className="font-semibold text-slate-900">{job.work_address.name}</span>
                          {job.work_address.branch_name ? (
                            <span className="text-slate-600"> — {job.work_address.branch_name}</span>
                          ) : null}
                          {formatJobWorkAddressLine(job.work_address) ? (
                            <span className="block text-slate-700 mt-0.5">{formatJobWorkAddressLine(job.work_address)}</span>
                          ) : null}
                        </span>
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-4 border-t border-slate-50 pt-4">
                       <span className="text-[13px] font-bold text-slate-500">Job description</span>
                       <span className="text-[13px] text-slate-800 font-medium col-span-2 leading-relaxed">{job.description_name || job.title}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-4 border-t border-slate-50 pt-4">
                       <span className="text-[13px] font-bold text-slate-500">Service type</span>
                       <span className="text-[13px] text-slate-800 font-medium col-span-2">
                         {job.description_name || 'Standard'} ({serviceTypeScheduledIso ? dayjs(serviceTypeScheduledIso).format('dddd D MMMM YYYY') : 'Not scheduled'})
                       </span>
                    </div>
                    <div className="grid grid-cols-3 gap-4 border-t border-slate-50 pt-4">
                       <span className="text-[13px] font-bold text-slate-500">Completed services</span>
                       <span className="text-[13px] text-slate-800 font-medium col-span-2">
                        {formatCompletedServicesForJobDetail(job.completed_service_items)}
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
                       <div className="col-span-2"><select value={job.state} disabled={updatingState} onChange={(e) => updateStatus(e.target.value)} className={`text-[13px] font-black uppercase text-[#14B8A6] bg-emerald-50 border border-emerald-100 rounded px-3 py-1.5 outline-none cursor-pointer hover:bg-emerald-100 transition-colors ${updatingState ? "opacity-50 cursor-not-allowed" : ""}`}><option value="draft">Draft</option><option value="created">Created</option><option value="unscheduled">Unscheduled</option><option value="scheduled">Scheduled</option><option value="assigned">Assigned</option><option value="rescheduled">Rescheduled</option><option value="dispatched">Dispatched</option><option value="in_progress">In Progress</option><option value="paused">Paused</option><option value="completed">Completed</option><option value="need_to_be_rescheduled">Need to be rescheduling</option><option value="closed">Closed</option></select></div>
                    </div>
                 </div>
              </div>
            </div>
          </div>

          {/* Open job reminders card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[17px] font-black tracking-tight text-slate-800">Open reminders</h2>
                <button onClick={() => setActiveTab('Reminders')} className="text-sm font-bold text-[#14B8A6] hover:underline">Manage reminders</button>
              </div>
            </div>
            {openOfficeTasks.length === 0 ? (
              <div className="p-16 flex flex-col items-center justify-center text-center">
                 <div className="bg-slate-100 p-6 rounded-full border border-slate-200 mb-4">
                    <Info className="size-10 text-slate-400 stroke-[1.5]" />
                 </div>
                 <p className="text-[15px] font-bold text-slate-500">No open reminders saved</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead className="bg-[#FBFCFD] border-b border-slate-100">
                    <tr>
                      <th className="px-6 py-3 font-bold text-slate-600">Reminder date</th>
                      <th className="px-6 py-3 font-bold text-slate-600">Note</th>
                      <th className="px-6 py-3 font-bold text-slate-600">Created by</th>
                      <th className="px-6 py-3 font-bold text-slate-600">Assignee</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {openOfficeTasks.map((task) => (
                      <tr key={task.id} className="hover:bg-slate-50/40">
                        <td className="px-6 py-4 text-slate-600">
                          {task.reminder_at
                            ? dayjs(task.reminder_at).format('ddd D MMM YYYY')
                            : '—'}
                          {task.reminder_sent_at ? (
                            <span className="ml-1 block text-[11px] font-semibold uppercase text-emerald-600">Notified</span>
                          ) : null}
                        </td>
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
                                     <div className="flex flex-wrap items-center gap-2">
                                       <p className="font-bold text-slate-800">{evt.officer_full_name || 'Unassigned'}</p>
                                       {(evt.is_free_job || evt.charge_type === 'free' || job.charge_type === 'free') && (
                                         <span className="inline-flex items-center rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
                                           Free job
                                         </span>
                                       )}
                                     </div>
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
                                  {!evt.status || evt.status === 'No status'
                                    ? 'No feedback registered'
                                    : diaryVisitIsCancelled(evt.status) && evt.abort_reason?.trim()
                                      ? `${evt.status} — ${evt.abort_reason.trim()}`
                                      : evt.status}
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

          {/* Required Tools Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h2 className="text-[17px] font-black tracking-tight text-slate-800 uppercase flex items-center gap-2">
                <Wrench className="size-5 text-[#14B8A6]" />
                Required Tools
              </h2>
              <button
                onClick={() => setShowAssignToolModal(true)}
                className="rounded bg-[#14B8A6] px-4 py-2 text-[13px] font-bold uppercase text-white shadow-sm transition-colors hover:bg-[#13a89a]"
              >
                Assign Tool
              </button>
            </div>
            <div className="p-6">
              {jobTools.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <Wrench className="size-8 mx-auto mb-2 text-slate-300 stroke-1" />
                  <p className="text-sm font-semibold">No tools assigned to this job.</p>
                  <p className="text-xs mt-1">Assign tools required by engineers to complete this job.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {jobTools.map((t) => (
                    <div key={t.id} className="flex gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50 relative group">
                      <div className="size-16 rounded-lg overflow-hidden border border-slate-200 bg-white shrink-0 flex items-center justify-center text-slate-300">
                        {t.image_url && activeToken ? (
                           // eslint-disable-next-line @next/next/no-img-element
                           <img
                             src={t.image_url.startsWith('/api/') ? `${t.image_url}?token=${activeToken}` : `/api/stock-tools/files/tool-photos/${t.image_url}?token=${activeToken}`}
                             alt={t.name}
                             className="size-full object-cover"
                           />
                        ) : (
                          <Wrench className="size-6 text-slate-300" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 flex flex-col justify-between">
                        <div>
                          <span className="inline-block rounded-full bg-slate-200/60 px-2 py-0.5 text-[10px] font-bold text-slate-500 mb-0.5">
                            {t.category}
                          </span>
                          <h4 className="font-bold text-slate-800 text-sm truncate leading-snug">{t.name}</h4>
                          <p className="text-[11px] text-slate-500 truncate">Loc: {t.location} • Status: <strong className="text-slate-650">{t.status}</strong></p>
                          {t.notes && <p className="text-[11px] text-slate-400 italic truncate mt-1">"{t.notes}"</p>}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveTool(t.id)}
                        className="absolute top-2 right-2 text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition"
                        title="Remove tool assignment"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
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

                            {diaryVisitIsCancelled(viewingEvent.status) &&
                              viewingEvent.abort_reason != null &&
                              viewingEvent.abort_reason.trim() !== '' && (
                                <>
                                  <span className="font-bold text-slate-600">Abort reason</span>
                                  <span className="col-span-2 text-slate-800">{viewingEvent.abort_reason}</span>
                                </>
                              )}

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
                            <button
                              className="absolute right-4 top-4 text-[#14B8A6] font-bold text-[13px] hover:underline"
                              onClick={() =>
                                router.push(
                                  `/dashboard/customers/${job.customer_id}${job.work_address ? `?work_address_id=${job.work_address.id}` : ''}`,
                                )
                              }
                            >
                              View customer
                            </button>
                            <span className="font-bold text-slate-600">Job contact</span>
                            <span className="col-span-2 text-slate-800">{jobContactDisplayName || '—'}</span>

                            <span className="font-bold text-slate-600">Account name</span>
                            <span className="col-span-2 text-slate-800">{job.customer_full_name}</span>

                            {job.work_address && (
                              <>
                                <span className="font-bold text-slate-600">Work site</span>
                                <span className="col-span-2 text-slate-800">
                                  <span className="font-semibold text-slate-900">{job.work_address.name}</span>
                                  {job.work_address.branch_name ? (
                                    <span className="text-slate-600"> — {job.work_address.branch_name}</span>
                                  ) : null}
                                  {workSiteAddressLine ? (
                                    <span className="block mt-1 text-slate-700 whitespace-pre-line leading-relaxed">
                                      {workSiteAddressLine}
                                    </span>
                                  ) : (
                                    <span className="block mt-1 text-slate-400 italic">No site address lines stored</span>
                                  )}
                                </span>
                              </>
                            )}

                            <span className="font-bold text-slate-600">Contact telephone</span>
                            <span className="col-span-2 text-slate-800">
                              {diaryRecipientPhone || 'Not listed'}
                            </span>

                            <span className="font-bold text-slate-600">Contact email</span>
                            <span className="col-span-2 text-slate-800">
                              {diaryRecipientEmail || 'Not listed'}
                            </span>

                            <span className="font-bold text-slate-600 mt-1">
                              {job.work_address ? 'Billing address' : 'Address'}
                            </span>
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
                            visitTimesheetEntries.length === 0 &&
                            visitStatusLogs.length === 0 && (
                              <p className="text-sm text-slate-500">
                                No travel or status updates recorded yet. Timestamps and GPS appear when the engineer
                                marks travelling, on site, and completed from the mobile app.
                              </p>
                            )}
                          {(visitTimesheetEntries.length > 0 || visitStatusLogs.length > 0) && (
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
                          <VisitJobSheetTimeline
                            statusLogs={visitStatusLogs}
                            timesheetEntries={visitTimesheetEntries}
                          />
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
                            {!diaryVisitIsCompleted(viewingEvent.status) && !diaryVisitIsCancelled(viewingEvent.status) && (
                              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
                                <h4 className="font-bold text-slate-800 text-sm">Abort visit</h4>
                                <p className="text-xs text-slate-500">
                                  Stops linked timesheet segments and marks the visit as cancelled. Pick the reason
                                  (configured under Settings → Visit abort reasons).
                                </p>
                                {diaryAbortReasonLoad && (
                                  <p className="text-sm text-slate-500">Loading reasons…</p>
                                )}
                                {!diaryAbortReasonLoad && diaryAbortReasonList.length === 0 && (
                                  <p className="text-sm text-rose-600">
                                    No abort reasons configured. Add them under Settings → Visit abort reasons.
                                  </p>
                                )}
                                {!diaryAbortReasonLoad && diaryAbortReasonList.length > 0 && (
                                  <>
                                    <select
                                      className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                                      value={diaryAbortReasonPick}
                                      onChange={(e) => setDiaryAbortReasonPick(e.target.value)}
                                    >
                                      {diaryAbortReasonList.map((r) => (
                                        <option key={r} value={r}>
                                          {r}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      disabled={diaryAbortSubmitting}
                                      onClick={async () => {
                                        if (!token) return;
                                        if (!diaryAbortReasonPick.trim()) return;
                                        if (
                                          !window.confirm(
                                            'Abort this visit? This cannot be undone from the schedule.',
                                          )
                                        )
                                          return;
                                        setDiaryAbortSubmitting(true);
                                        try {
                                          await patchJson(
                                            `/diary-events/${viewingEvent.id}`,
                                            {
                                              status: 'cancelled',
                                              abort_reason: diaryAbortReasonPick.trim(),
                                            },
                                            token,
                                          );
                                          await fetchJobDetails();
                                          setViewingEvent((ev) =>
                                            ev
                                              ? {
                                                  ...ev,
                                                  status: 'cancelled',
                                                  abort_reason: diaryAbortReasonPick.trim(),
                                                }
                                              : ev,
                                          );
                                        } catch (err: unknown) {
                                          alert(err instanceof Error ? err.message : 'Abort failed');
                                        } finally {
                                          setDiaryAbortSubmitting(false);
                                        }
                                      }}
                                      className="rounded-md bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50"
                                    >
                                      {diaryAbortSubmitting ? 'Aborting…' : 'Abort visit'}
                                    </button>
                                  </>
                                )}
                              </div>
                            )}

                      <div className="border border-slate-200 rounded-lg overflow-hidden">
                         <div className="bg-white border-b border-slate-200 px-4 py-3">
                            <h4 className="font-bold text-slate-800">Engineer status</h4>
                         </div>
                         <div className="p-6 md:p-10 flex flex-col items-center text-center max-h-[70vh] overflow-y-auto">
                            <div
                              className={`w-16 h-16 rounded-full border-4 ${
                                diaryVisitIsCompleted(viewingEvent.status)
                                  ? 'border-[#14B8A6]'
                                  : diaryVisitIsCancelled(viewingEvent.status)
                                    ? 'border-rose-300'
                                    : 'border-slate-300'
                              } flex items-center justify-center mb-4 shrink-0`}
                            >
                               {diaryVisitIsCompleted(viewingEvent.status) ? (
                                 <Clipboard className="size-6 text-[#14B8A6] stroke-[3]" />
                               ) : diaryVisitIsCancelled(viewingEvent.status) ? (
                                 <Info className="size-6 text-rose-400 stroke-[3]" />
                               ) : (
                                 <Info className="size-6 text-slate-400 stroke-[3]" />
                               )}
                            </div>
                            <span
                              className={`font-bold uppercase text-[10px] tracking-wider mb-1 ${
                                diaryVisitIsCompleted(viewingEvent.status)
                                  ? 'text-[#14B8A6]'
                                  : diaryVisitIsCancelled(viewingEvent.status)
                                    ? 'text-rose-600'
                                    : 'text-slate-400'
                              }`}
                            >
                              {viewingEvent.status || 'No status'}
                            </span>
                            <span className="text-slate-500 font-medium text-[13px] max-w-md">
                              {diaryVisitIsCompleted(viewingEvent.status)
                                ? 'This visit has been marked as fully completed.'
                                : diaryVisitIsCancelled(viewingEvent.status)
                                  ? viewingEvent.abort_reason?.trim()
                                    ? `This visit was aborted: ${viewingEvent.abort_reason.trim()}`
                                    : 'This visit was aborted.'
                                  : "The engineer hasn't completed the property visit yet."}
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
                                      <JobReportAnswerValue
                                        questionType={q.question_type}
                                        raw={diaryJobReport.answers[String(q.id)]}
                                        token={token}
                                      />
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
                                            setViewingEvent({ ...viewingEvent, job_report_submitted: true });
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
                              (diaryJobReport.questions.length === 0 || viewingEvent.job_report_submitted) && (
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

                      {(diaryExtraSubmissionsLoading || diaryExtraSubmissions.length > 0) && (
                        <div className="border border-slate-200 rounded-lg overflow-hidden">
                          <div className="bg-white border-b border-slate-200 px-4 py-3">
                            <h4 className="font-bold text-slate-800">Extra visit submissions</h4>
                            <p className="text-xs text-slate-500 mt-0.5">
                              Additional photos, videos, and notes from the field app (separate from technical notes).
                            </p>
                          </div>
                          <div className="p-4 space-y-6 bg-slate-50/50">
                            {diaryExtraSubmissionsLoading && (
                              <p className="text-sm text-slate-500">Loading extra submissions…</p>
                            )}
                            {!diaryExtraSubmissionsLoading &&
                              diaryExtraSubmissions.map((sub) => (
                                <div
                                  key={sub.id}
                                  className="rounded-lg border border-slate-200 bg-white p-4 space-y-3"
                                >
                                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-[13px] text-slate-600">
                                    <span>
                                      {(() => {
                                        const who =
                                          sub.display_name?.trim() ||
                                          viewingEvent.officer_full_name?.trim() ||
                                          sub.created_by_name?.trim() ||
                                          '';
                                        return who.length > 0 ? (
                                          <span className="font-semibold text-slate-800">{who}</span>
                                        ) : (
                                          <span className="text-slate-500">Field officer</span>
                                        );
                                      })()}
                                    </span>
                                    <span className="text-slate-500">
                                      {dayjs(sub.created_at).format('D MMM YYYY, h:mm a')}
                                    </span>
                                  </div>
                                  {sub.notes != null && sub.notes.trim() !== '' && (
                                    <pre className="whitespace-pre-wrap rounded-md border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm text-slate-800">
                                      {sub.notes}
                                    </pre>
                                  )}
                                  {sub.media && sub.media.length > 0 && (
                                    <div className="flex flex-col gap-4">
                                      {sub.media.map((m) => (
                                        <div
                                          key={`${sub.id}-${m.file_path}`}
                                          className="space-y-1.5"
                                        >
                                          <p className="text-xs font-medium text-slate-500">
                                            {m.original_filename}
                                            {m.kind === 'video' || m.content_type?.startsWith('video/')
                                              ? ' · video'
                                              : ' · image'}
                                          </p>
                                          <AuthenticatedDiaryFilePreview
                                            filePath={m.file_path}
                                            contentType={m.content_type}
                                            kind={m.kind}
                                            token={token}
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {(!sub.media || sub.media.length === 0) &&
                                    (sub.notes == null || sub.notes.trim() === '') && (
                                      <p className="text-sm text-slate-400">Empty submission</p>
                                    )}
                                </div>
                              ))}
                          </div>
                        </div>
                      )}

                      <div className="border border-slate-200 rounded-lg overflow-hidden">
                         <div className="bg-white border-b border-slate-200 px-4 py-3">
                            <h4 className="font-bold text-slate-800">Signatures & photos</h4>
                         </div>
                         <div className="p-6 flex flex-col items-stretch text-center sm:text-left">
                            {diaryVisitIsCompleted(viewingEvent.status) &&
                            diaryJobReport &&
                            hasJobReportSignatureAnswer(diaryJobReport.questions, diaryJobReport.answers) ? (
                              <div className="space-y-4 w-full max-w-lg mx-auto sm:mx-0">
                                {diaryJobReport.questions.map((q) => {
                                  if (
                                    q.question_type !== 'customer_signature' &&
                                    q.question_type !== 'officer_signature'
                                  ) {
                                    return null;
                                  }
                                  const src = diaryJobReport.answers[String(q.id)];
                                  if (!src?.trim()) return null;
                                  return (
                                    <div key={q.id} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-left">
                                      <div className="text-xs font-bold text-slate-600 mb-2">{q.prompt}</div>
                                      <JobReportAnswerValue
                                        questionType={q.question_type}
                                        raw={src}
                                        token={token}
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

      {/* Assign Tool Modal */}
      {showAssignToolModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-100 flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-4">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Wrench className="size-5 text-[#14B8A6]" />
                Assign Tool to Job
              </h3>
              <button
                onClick={() => {
                  setShowAssignToolModal(false);
                  setSelectedToolId('');
                  setAssignToolNotes('');
                }}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-700 transition"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleAssignTool} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Select Tool *</label>
                <select
                  required
                  value={selectedToolId}
                  onChange={(e) => setSelectedToolId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#14B8A6]"
                >
                  <option value="">-- Choose Tool --</option>
                  {allTools
                    .filter(t => !jobTools.some(jt => jt.id === t.id))
                    .map(t => (
                      <option key={t.id} value={String(t.id)}>
                        {t.name} ({t.category} - {t.status})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Notes / Instructions</label>
                <textarea
                  value={assignToolNotes}
                  onChange={(e) => setAssignToolNotes(e.target.value)}
                  placeholder="e.g. Return after site visit, check calibration first..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] h-20 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4 mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAssignToolModal(false);
                    setSelectedToolId('');
                    setAssignToolNotes('');
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assigningTool || !selectedToolId}
                  className="rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0d9488] shadow-sm transition disabled:opacity-50"
                >
                  {assigningTool ? 'Assigning…' : 'Assign Tool'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
