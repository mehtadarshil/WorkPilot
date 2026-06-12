'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getJson, postJson, patchJson, deleteRequest } from '../../../apiClient';
import { ArrowLeft, Edit, MapPin, Phone, Mail, User, Plus, Search, Filter, ChevronRight, Trash2, X, Check, ImagePlus } from 'lucide-react';
import dayjs from 'dayjs';
import CustomerCommunicationsTab from './CustomerCommunicationsTab';
import CustomerContactsTab from './CustomerContactsTab';
import CustomerBranchesTab from './CustomerBranchesTab';
import CustomerWorkAddressTab from './CustomerWorkAddressTab';
import CustomerAssetsTab from './CustomerAssetsTab';
import CustomerInvoicesTab from './CustomerInvoicesTab';
import CustomerFilesTab from './CustomerFilesTab';
import CustomerSiteImagesTab from './CustomerSiteImagesTab';
import CustomerSiteReportTab from './CustomerSiteReportTab';
import CustomerOverviewMapTab from './CustomerOverviewMapTab';
import CustomerTechnicalNoteMedia, { type TechnicalNoteMediaItem } from './CustomerTechnicalNoteMedia';
import { IMAGE_MAX_BYTES, prepareImageFileForUpload, readFileAsBase64 } from './customerSiteReportShared';

interface SpecificNote {
  id: number;
  title: string;
  description: string;
  created_at: string;
  work_address_id?: number | null;
  media?: TechnicalNoteMediaItem[];
}

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
  /** May be absent on older API responses; always normalize to [] when setting state */
  specific_notes?: SpecificNote[];
  /** Default true when absent (older tenants). */
  invoice_reminders_enabled?: boolean;
  /** Default true when absent (older tenants). */
  service_reminders_enabled?: boolean;
  service_reminder_custom_email?: string | null;
  service_reminder_recipient_mode?: string | null;
}

function CustomerBehaviourNotesEditor({
  customerId,
  token,
  initialNotes,
  onSaved,
}: {
  customerId: string;
  token: string | null;
  initialNotes: string;
  onSaved: (notes: string | null) => void;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!token) return;
    setSaving(true);
    setError('');
    try {
      const nextNotes = notes.trim();
      await patchJson(`/customers/${customerId}`, { notes: nextNotes }, token);
      onSaved(nextNotes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save notes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-5 border-b border-slate-100">
      <div className="mb-3">
        <h3 className="font-bold text-slate-800 text-[15px]">Customer behaviour &amp; notes</h3>
        <p className="mt-1 text-xs text-slate-500">
          Record payment behaviour, access warnings, preferences, and anything the team should know before booking work.
        </p>
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={5}
        placeholder="Example: pays late, requires PO before visit, call accounts before booking, prefers email..."
        className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/20"
      />
      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[11px] text-slate-400">Visible to office and mobile users on this customer.</p>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-[#14B8A6] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#119f90] disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save notes'}
        </button>
      </div>
    </div>
  );
}

function WorkAddressKeyInfoEditor({
  customerId,
  workAddressId,
  token,
  initialKeyInfo,
  onSaved,
}: {
  customerId: string;
  workAddressId: string;
  token: string | null;
  initialKeyInfo: string;
  onSaved: (keyInfo: string | null) => void;
}) {
  const [keyInfo, setKeyInfo] = useState(initialKeyInfo);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!token) return;
    setSaving(true);
    setError('');
    try {
      const next = keyInfo.trim();
      await patchJson(`/customers/${customerId}/work-addresses/${workAddressId}`, { key_info: next }, token);
      onSaved(next || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save key info');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-amber-200 bg-white/70 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[11px] font-extrabold uppercase tracking-widest text-amber-700">Key info</p>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded bg-amber-500 px-2 py-1 text-[11px] font-bold text-white hover:bg-amber-600 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
      <textarea
        value={keyInfo}
        onChange={(e) => setKeyInfo(e.target.value)}
        rows={4}
        placeholder="Access notes, parking, alarm codes, hazards, preferred entrance..."
        className="w-full resize-none rounded border border-amber-100 bg-white px-2 py-1.5 text-xs leading-relaxed text-slate-700 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
      />
      {error ? <p className="mt-2 text-[11px] text-rose-600">{error}</p> : null}
    </div>
  );
}

function WorkAddressSiteNotesEditor({
  customerId,
  workAddressId,
  token,
  initialSiteNotes,
  onSaved,
}: {
  customerId: string;
  workAddressId: string;
  token: string | null;
  initialSiteNotes: string;
  onSaved: (siteNotes: string | null) => void;
}) {
  const [siteNotes, setSiteNotes] = useState(initialSiteNotes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!token) return;
    setSaving(true);
    setError('');
    try {
      const next = siteNotes.trim();
      await patchJson(`/customers/${customerId}/work-addresses/${workAddressId}`, { site_notes: next }, token);
      onSaved(next || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save site notes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-[#14B8A6]/30 bg-white/70 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[11px] font-extrabold uppercase tracking-widest text-[#14B8A6]">Site notes</p>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded bg-[#14B8A6] px-2 py-1 text-[11px] font-bold text-white hover:bg-[#119f90] disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
      <textarea
        value={siteNotes}
        onChange={(e) => setSiteNotes(e.target.value)}
        rows={4}
        placeholder="Access instructions, parking preferences, site-specific notes..."
        className="w-full resize-none rounded border border-[#14B8A6]/20 bg-white px-2 py-1.5 text-xs leading-relaxed text-slate-700 outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/20"
      />
      {error ? <p className="mt-2 text-[11px] text-rose-600">{error}</p> : null}
    </div>
  );
}

type ServiceReminderScheduleLine = {
  source?: 'service_job' | 'site_report' | 'certificate';
  job_id: number | null;
  job_title: string | null;
  job_state: string;
  report_id?: number | null;
  report_title?: string | null;
  certificate_number?: string | null;
  service_name: string;
  remind_email: boolean;
  checklist_matched: boolean;
  next_renewal_due_date: string | null;
  early_window_starts: string | null;
  active_phase: 'none' | 'early' | 'due';
  early_reminder_sent: boolean;
  due_reminder_sent: boolean;
  would_send_today: boolean;
  recipient_preview: string | null;
  block_reason: string | null;
};

type ServiceReminderScheduleResponse = {
  customer_id: number;
  customer_reminders_enabled: boolean;
  tenant_automated_enabled: boolean;
  tenant_recipient_mode: string;
  customer_recipient_mode: string | null;
  customer_custom_reminder_email: string | null;
  lines: ServiceReminderScheduleLine[];
  open_service_jobs: { id: number; title: string | null; state: string }[];
  hints: string[];
};

interface Job {
  id: number;
  title: string;
  description: string | null;
  priority: string;
  state: string;
  created_at: string;
  description_name: string | null;
  expected_completion: string | null;
  site_contact_name?: string | null;
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

interface WorkAddressDetails {
  id: number;
  name: string;
  address_line_1: string;
  address_line_2?: string | null;
  address_line_3?: string | null;
  town: string | null;
  county?: string | null;
  postcode: string | null;
  key_info?: string | null;
  site_notes?: string | null;
}

/** Central London — used when geocoding fails or no address is stored. */
const DEFAULT_MAP_CENTER = { lat: 51.5074, lon: -0.1278 };

function buildOsmEmbedUrl(lat: number, lon: number): string {
  const pad = 0.018;
  const minLon = lon - pad;
  const minLat = lat - pad;
  const maxLon = lon + pad;
  const maxLat = lat + pad;
  const bbox = `${minLon},${minLat},${maxLon},${maxLat}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${lat},${lon}`)}`;
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
  const [workAddressDetails, setWorkAddressDetails] = useState<WorkAddressDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState(() => {
    const tab = searchParams.get('tab');
    const allowed = ['Overview', 'Communications', 'Contacts', 'Invoices', 'Branches', 'Work address', 'Assets', 'Site images', 'Files', 'Site Reports'];
    let initial = tab && allowed.includes(tab) ? tab : 'Overview';
    if (workAddressId && initial === 'Work address') initial = 'Overview';
    return initial;
  });

  // Dynamic Notes Management
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteDescription, setNoteDescription] = useState('');
  const [noteFiles, setNoteFiles] = useState<File[]>([]);
  const [noteUploadError, setNoteUploadError] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyType, setHistoryType] = useState<'' | 'jobs' | 'invoices' | 'credit_notes'>('');
  const [mapEmbedSrc, setMapEmbedSrc] = useState<string>(() => buildOsmEmbedUrl(DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lon));
  const [mapGeocoding, setMapGeocoding] = useState(false);
  const [invoiceReminderPrefSaving, setInvoiceReminderPrefSaving] = useState(false);
  const [serviceReminderPrefSaving, setServiceReminderPrefSaving] = useState(false);
  const [svcSchedule, setSvcSchedule] = useState<ServiceReminderScheduleResponse | null>(null);
  const [svcScheduleLoading, setSvcScheduleLoading] = useState(false);
  const [svcScheduleError, setSvcScheduleError] = useState<string | null>(null);
  const [svcScheduleOpen, setSvcScheduleOpen] = useState(false);
  const [svcRecipientMode, setSvcRecipientMode] = useState<string>('');
  const [svcCustomEmail, setSvcCustomEmail] = useState('');
  const [svcDeliverySaving, setSvcDeliverySaving] = useState(false);

  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  // Sync tab from URL when the query changes. Do not depend on [activeTab]: including it caused
  // any in-app tab click to be overwritten whenever `?tab=` was present in the URL.
  useEffect(() => {
    const tab = searchParams.get('tab');
    const allowed = ['Overview', 'Communications', 'Contacts', 'Invoices', 'Branches', 'Work address', 'Assets', 'Site images', 'Files', 'Site Reports'];
    if (tab && allowed.includes(tab)) {
      if (workAddressId && tab === 'Work address') {
        setActiveTab('Overview');
      } else {
        setActiveTab(tab);
      }
    } else if (workAddressId) {
      setActiveTab((prev) => (prev === 'Work address' ? 'Overview' : prev));
    }
  }, [searchParams, workAddressId]);

  const fetchDetails = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    try {
      const res = await getJson<CustomerDetails>(`/customers/${id}`, token);
      setData({ ...res, specific_notes: res.specific_notes ?? [] });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch customer details');
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
      else qp.set('include_work_address_invoices', 'true');
      const res = await getJson<{ invoices: CustomerInvoice[] }>(`/invoices?${qp.toString()}`, token);
      setInvoices(res.invoices || []);
    } catch (err) {
      console.error('Failed to fetch invoices', err);
      setInvoices([]);
    }
  }, [id, token, workAddressId]);

  const fetchServiceReminderSchedule = useCallback(async () => {
    if (!token || !id) return;
    setSvcScheduleLoading(true);
    setSvcScheduleError(null);
    try {
      const res = await getJson<ServiceReminderScheduleResponse>(`/customers/${id}/service-reminder-schedule`, token);
      setSvcSchedule(res);
    } catch (e: unknown) {
      setSvcSchedule(null);
      setSvcScheduleError(e instanceof Error ? e.message : 'Could not load service reminder schedule');
    } finally {
      setSvcScheduleLoading(false);
    }
  }, [id, token, workAddressId]);

  const fetchWorkAddressDetails = useCallback(async () => {
    if (!token || !id || !workAddressId) {
      setWorkAddressDetails(null);
      return;
    }
    try {
      const res = await getJson<{ work_address: WorkAddressDetails }>(`/customers/${id}/work-addresses/${workAddressId}`, token);
      setWorkAddressDetails(res.work_address || null);
    } catch (err) {
      console.error('Failed to fetch work address details', err);
      setWorkAddressDetails(null);
    }
  }, [id, token, workAddressId]);

  useEffect(() => {
    fetchDetails();
    fetchJobs();
    fetchInvoices();
    fetchWorkAddressDetails();
  }, [fetchDetails, fetchJobs, fetchInvoices, fetchWorkAddressDetails]);

  useEffect(() => {
    if (!data) return;
    setSvcRecipientMode(data.service_reminder_recipient_mode || '');
    setSvcCustomEmail((data.service_reminder_custom_email || '').trim());
  }, [data?.id, data?.service_reminder_recipient_mode, data?.service_reminder_custom_email]);

  useEffect(() => {
    if (!id || !token || workAddressId) return;
    void fetchServiceReminderSchedule();
  }, [id, token, fetchServiceReminderSchedule]);

  useEffect(() => {
    if (!data || String(data.id) !== id) return;
    let cancelled = false;
    setMapGeocoding(true);

    const query = workAddressDetails
      ? [workAddressDetails.address_line_1, workAddressDetails.town, workAddressDetails.postcode, 'United Kingdom']
          .filter(Boolean)
          .join(', ')
      : [data.address_line_1, data.address_line_2, data.town, data.postcode, data.county, 'United Kingdom']
          .filter(Boolean)
          .join(', ')
          .trim();

    const apply = (lat: number, lon: number) => {
      if (!cancelled) setMapEmbedSrc(buildOsmEmbedUrl(lat, lon));
    };

    void (async () => {
      let lat = DEFAULT_MAP_CENTER.lat;
      let lon = DEFAULT_MAP_CENTER.lon;
      if (query.length >= 4) {
        try {
          const res = await fetch(`/api/map-geocode?q=${encodeURIComponent(query)}`);
          const j = (await res.json()) as { lat?: number | null; lon?: number | null };
          if (!cancelled && j.lat != null && j.lon != null && Number.isFinite(j.lat) && Number.isFinite(j.lon)) {
            lat = j.lat;
            lon = j.lon;
          }
        } catch {
          /* keep default */
        }
      }
      apply(lat, lon);
      if (!cancelled) setMapGeocoding(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    id,
    data?.id,
    data?.address_line_1,
    data?.address_line_2,
    data?.town,
    data?.postcode,
    data?.county,
    workAddressDetails?.id,
    workAddressDetails?.address_line_1,
    workAddressDetails?.town,
    workAddressDetails?.postcode,
  ]);

  const historyRows = useMemo(() => {
    const jobRows = jobs
      .filter((j) => ['completed', 'closed'].includes(j.state))
      .map((j) => ({
        id: `job-${j.id}`,
        date: j.created_at,
        typeLabel: 'Job',
        recordNo: j.id.toString().padStart(4, '0'),
        description: j.description_name || j.title,
        contactName: j.site_contact_name ?? null,
        total: '-',
        balance: '-',
        viewPath: `/dashboard/jobs/${j.id}`,
        badgeClass: 'bg-slate-100 text-slate-600',
      }));

    const invoiceRows = invoices.map((inv) => ({
      id: `invoice-${inv.id}`,
      date: inv.invoice_date,
      typeLabel: 'Invoice',
      recordNo: inv.invoice_number,
      description: inv.job_title || 'Invoice',
      contactName: null,
      total: `£${Number(inv.total_amount).toFixed(2)}`,
      balance: `£${Math.max(0, Number(inv.total_amount) - Number(inv.total_paid)).toFixed(2)}`,
      viewPath: `/dashboard/invoices/${inv.id}`,
      badgeClass: inv.state === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700',
    }));

    const rows =
      historyType === 'jobs'
        ? jobRows
        : historyType === 'invoices'
          ? invoiceRows
          : historyType === 'credit_notes'
            ? []
            : [...jobRows, ...invoiceRows];

    return rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [historyType, jobs, invoices]).filter((row) => {
    if (!historySearch.trim()) return true;
    const text = `${row.recordNo} ${row.description} ${row.typeLabel}`.toLowerCase();
    return text.includes(historySearch.trim().toLowerCase());
  });

  const specificNotes = useMemo(() => {
    const all = data?.specific_notes ?? [];
    if (workAddressId) {
      const wid = Number(workAddressId);
      return all.filter((n) => n.work_address_id != null && Number(n.work_address_id) === wid);
    }
    return all.filter((n) => n.work_address_id == null);
  }, [data?.specific_notes, workAddressId]);

  const uploadNoteFiles = useCallback(async (noteId: number, files: File[]) => {
    if (!token || !id || files.length === 0) return [];
    let latestMedia: TechnicalNoteMediaItem[] = [];
    for (const original of files) {
      const file = await prepareImageFileForUpload(original);
      if (file.size > IMAGE_MAX_BYTES) {
        throw new Error(`"${original.name}" is too large (max ${Math.round(IMAGE_MAX_BYTES / (1024 * 1024))} MB).`);
      }
      const contentBase64 = await readFileAsBase64(file);
      const res = await postJson<{ media: TechnicalNoteMediaItem[] }>(
        `/customers/${id}/specific-notes/${noteId}/media`,
        {
          filename: file.name,
          content_type: file.type || 'image/jpeg',
          content_base64: contentBase64,
        },
        token,
      );
      latestMedia = res.media;
    }
    return latestMedia;
  }, [id, token]);

  const updateNoteMedia = useCallback((noteId: number, media: TechnicalNoteMediaItem[]) => {
    setData(prev => prev ? {
      ...prev,
      specific_notes: (prev.specific_notes ?? []).map(n => n.id === noteId ? { ...n, media } : n),
    } : null);
  }, []);

  if (loading) return <div className="p-8 text-slate-500 font-medium">Loading customer...</div>;
  if (!data) return (
    <div className="flex flex-col gap-4 p-8">
      <span className="text-rose-500 font-medium">{error || 'Customer not found'}</span>
      <button onClick={() => router.push('/dashboard/customers')} className="text-blue-500 hover:underline self-start">Back to customers</button>
    </div>
  );

  const addressString = [data.address_line_1, data.address_line_2, data.town, data.county, data.postcode].filter(Boolean).join(', ');
  const displayAddress = addressString || 'No address provided';

  const allowBranches = data.customer_type_allow_branches !== false;
  const workAddressLabel = (data.customer_type_work_address_name || 'Work address').trim() || 'Work address';
  const tabs: { key: string; label: string }[] = [
    { key: 'Overview', label: 'Overview' },
    { key: 'Communications', label: 'Communications' },
    { key: 'Contacts', label: 'Contacts' },
    ...(workAddressId ? [{ key: 'Invoices', label: 'Invoices' }] : []),
    ...(allowBranches ? [{ key: 'Branches', label: 'Branches' }] : []),
    ...(!workAddressId ? [{ key: 'Work address', label: workAddressLabel }] : []),
    { key: 'Assets', label: 'Assets' },
    { key: 'Site images', label: 'Site images' },
    { key: 'Files', label: 'Files' },
    { key: 'Site Reports', label: 'Site Reports' },
  ];

  return (
    <div className="flex h-full flex-col bg-slate-50">
      {/* Header bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 md:px-6 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard/customers')} className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 transition-colors">
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
            {workAddressId ? (
              <button
                type="button"
                className="min-w-0 max-w-[42vw] cursor-pointer truncate text-left hover:text-slate-900 hover:underline md:max-w-[280px]"
                title={data.full_name}
                onClick={() => router.push(`/dashboard/customers/${id}`)}
              >
                {data.full_name}
              </button>
            ) : (
              <span className="min-w-0 truncate font-semibold text-slate-900" title={data.full_name}>
                {data.full_name}
              </span>
            )}
            {workAddressId && (
              <>
                <span className="shrink-0 text-slate-300" aria-hidden>
                  /
                </span>
                <span
                  className="min-w-0 max-w-[48vw] truncate font-semibold text-slate-900 md:max-w-[360px]"
                  title={
                    workAddressDetails
                      ? `${workAddressDetails.name} (${[workAddressDetails.address_line_1, workAddressDetails.town, workAddressDetails.postcode].filter(Boolean).join(', ')})`
                      : undefined
                  }
                >
                  {workAddressDetails?.name || `Work address #${workAddressId}`}
                  {workAddressDetails && (
                    <span className="font-semibold text-slate-700">
                      {' '}
                      (
                      {[workAddressDetails.address_line_1, workAddressDetails.town, workAddressDetails.postcode]
                        .filter(Boolean)
                        .join(', ')}
                      )
                    </span>
                  )}
                </span>
              </>
            )}
          </nav>
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        <div className="flex flex-col lg:flex-row h-full">

          {/* LEFT SIDEBAR (Info Panel) */}
          <div className="w-full lg:w-[340px] shrink-0 border-r border-slate-200 bg-white shadow-[1px_0_5px_rgba(0,0,0,0.02)] flex flex-col">

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

            {!workAddressId && (
              <div className="border-b border-slate-100 p-5">
                <h3 className="mb-2 text-[15px] font-bold text-slate-800">Invoices</h3>
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 rounded border-slate-300 text-[#14B8A6] focus:ring-[#14B8A6]"
                    checked={data.invoice_reminders_enabled !== false}
                    disabled={invoiceReminderPrefSaving || !token}
                    onChange={async (e) => {
                      if (!token) return;
                      const next = e.target.checked;
                      setInvoiceReminderPrefSaving(true);
                      try {
                        await patchJson(`/customers/${id}`, { invoice_reminders_enabled: next }, token);
                        setData((prev) => (prev ? { ...prev, invoice_reminders_enabled: next } : null));
                      } catch (err) {
                        console.error('Failed to update invoice reminder preference', err);
                      } finally {
                        setInvoiceReminderPrefSaving(false);
                      }
                    }}
                  />
                  <span className="text-sm leading-snug text-slate-700">
                    <span className="font-semibold text-slate-800">Invoice reminders</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      Allow automated payment-chase emails for overdue invoices (when your organisation runs them).
                    </span>
                  </span>
                </label>
                <label className="mt-4 flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 rounded border-slate-300 text-[#14B8A6] focus:ring-[#14B8A6]"
                    checked={data.service_reminders_enabled !== false}
                    disabled={serviceReminderPrefSaving || !token}
                    onChange={async (e) => {
                      if (!token) return;
                      const next = e.target.checked;
                      setServiceReminderPrefSaving(true);
                      try {
                        await patchJson(`/customers/${id}`, { service_reminders_enabled: next }, token);
                        setData((prev) => (prev ? { ...prev, service_reminders_enabled: next } : null));
                      } catch (err) {
                        console.error('Failed to update service reminder preference', err);
                      } finally {
                        setServiceReminderPrefSaving(false);
                      }
                    }}
                  />
                  <span className="text-sm leading-snug text-slate-700">
                    <span className="font-semibold text-slate-800">Service renewal reminders</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      Allow automated renewal emails for completed service jobs. Organisation-wide send rules:{' '}
                      <Link href="/dashboard/settings?tab=service-reminders" className="font-semibold text-[#14B8A6] hover:underline">
                        Service renewal reminders
                      </Link>
                      . Per-service timing: Settings → Job descriptions. You can override recipient and custom email below.
                    </span>
                  </span>
                </label>
              </div>
            )}

            {workAddressDetails && (
              <div className="p-5 border-b border-amber-100 bg-amber-50/30">
                <p className="text-[11px] font-extrabold uppercase tracking-widest text-amber-600 mb-2">Work Site Address</p>
                <div className="space-y-2.5">
                  <div className="flex gap-3 items-start">
                    <MapPin className="size-4 text-amber-500 shrink-0 mt-0.5" />
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-800">{workAddressDetails.name}</span>
                      <span className="text-xs text-slate-600 leading-relaxed">
                        {[workAddressDetails.address_line_1, workAddressDetails.town, workAddressDetails.postcode].filter(Boolean).join(', ')}
                      </span>
                    </div>
                  </div>
                  <WorkAddressKeyInfoEditor
                    key={`key-${workAddressDetails.id}-${workAddressDetails.key_info ?? ''}`}
                    customerId={id}
                    workAddressId={String(workAddressDetails.id)}
                    token={token}
                    initialKeyInfo={workAddressDetails.key_info ?? ''}
                    onSaved={(keyInfo) => setWorkAddressDetails(prev => prev ? { ...prev, key_info: keyInfo } : prev)}
                  />
                  <WorkAddressSiteNotesEditor
                    key={`notes-${workAddressDetails.id}-${workAddressDetails.site_notes ?? ''}`}
                    customerId={id}
                    workAddressId={String(workAddressDetails.id)}
                    token={token}
                    initialSiteNotes={workAddressDetails.site_notes ?? ''}
                    onSaved={(siteNotes) => setWorkAddressDetails(prev => prev ? { ...prev, site_notes: siteNotes } : prev)}
                  />
                </div>
              </div>
            )}

            <div className="border-b border-slate-100 p-5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-[15px] font-bold text-slate-800">Site location map</h3>
                {mapGeocoding ? (
                  <span className="text-[11px] font-semibold text-[#14B8A6]">Locating...</span>
                ) : null}
              </div>
              <div className="relative h-44 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                <iframe
                  title="Customer site address map"
                  src={mapEmbedSrc}
                  className="absolute inset-0 size-full border-0"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
                {mapGeocoding && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-900/20 text-xs font-semibold text-white backdrop-blur-[1px]">
                    Locating...
                  </div>
                )}
              </div>
            </div>

            <div className="border-b border-slate-100 p-5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-[15px] font-bold text-slate-800">Service reminders</h3>
                <button
                  type="button"
                  onClick={() => setSvcScheduleOpen((v) => !v)}
                  className="shrink-0 text-sm font-semibold text-[#14B8A6] hover:underline"
                >
                  {svcScheduleOpen ? 'Hide' : 'View'}
                </button>
              </div>
              {svcScheduleLoading && <p className="text-sm text-slate-500">Loading schedule…</p>}
              {svcScheduleError && <p className="text-sm text-rose-600">{svcScheduleError}</p>}
              {!svcScheduleLoading && svcSchedule && (
                <>
                  <p className="text-sm text-slate-600">
                    {svcSchedule.lines.length === 0
                      ? 'No service or site-report renewal email tracks yet. Complete a service job with a next service date, or enable renewal reminders on a site report.'
                      : `${svcSchedule.lines.length} renewal track(s): ${svcSchedule.lines.filter((l) => (l.source ?? 'service_job') === 'service_job').length} service job, ${svcSchedule.lines.filter((l) => l.source === 'site_report').length} site report, ${svcSchedule.lines.filter((l) => l.source === 'certificate').length} certificate.`}{' '}
                    {svcSchedule.lines.some((l) => l.would_send_today) ? (
                      <span className="ml-1 font-semibold text-amber-800">
                        {svcSchedule.lines.filter((l) => l.would_send_today).length} would send on the next reminder run
                        (if mail is configured).
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    The server sends these when the reminder job runs, or when an admin uses{' '}
                    <strong>Run pending reminders now</strong> on{' '}
                    <Link href="/dashboard/settings?tab=service-reminders" className="font-semibold text-[#14B8A6] hover:underline">
                      Settings → Service renewal reminders
                    </Link>
                    .
                  </p>
                </>
              )}
              {svcScheduleOpen && svcSchedule && (
                <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
                  {svcSchedule.hints.length > 0 && (
                    <ul className="list-disc space-y-1 pl-5 text-xs text-slate-600">
                      {svcSchedule.hints.map((h) => (
                        <li key={h}>{h}</li>
                      ))}
                    </ul>
                  )}
                  <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-xs text-slate-700">
                    <p className="font-semibold text-slate-800">Delivery for this customer</p>
                    <p className="mt-1 text-slate-600">
                      Organisation default:{' '}
                      <span className="font-mono text-slate-800">{svcSchedule.tenant_recipient_mode}</span>
                      {svcSchedule.customer_custom_reminder_email ? (
                        <span>
                          . A <strong>custom address</strong> is set and is used first for this customer.
                        </span>
                      ) : svcSchedule.customer_recipient_mode ? (
                        <span>
                          . This customer overrides the rule to:{' '}
                          <span className="font-mono text-slate-800">{svcSchedule.customer_recipient_mode}</span>
                        </span>
                      ) : (
                        <span> (no per-customer override).</span>
                      )}
                    </p>
                    <label className="mt-2 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Override recipient rule
                    </label>
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
                      value={svcRecipientMode}
                      onChange={(e) => setSvcRecipientMode(e.target.value)}
                      disabled={svcDeliverySaving || !token}
                    >
                      <option value="">Use organisation default</option>
                      <option value="customer_account">Always this account&apos;s email</option>
                      <option value="job_contact">Always the job contact on each service job</option>
                      <option value="primary_contact">Always primary CRM contact (fallback account)</option>
                    </select>
                    <label className="mt-2 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Custom reminder email (optional)
                    </label>
                    <input
                      type="email"
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
                      placeholder="Leave blank to use rule above"
                      value={svcCustomEmail}
                      onChange={(e) => setSvcCustomEmail(e.target.value)}
                      disabled={svcDeliverySaving || !token}
                    />
                    <button
                      type="button"
                      disabled={svcDeliverySaving || !token}
                      onClick={async () => {
                        if (!token) return;
                        setSvcDeliverySaving(true);
                        try {
                          await patchJson(
                            `/customers/${id}`,
                            {
                              service_reminder_recipient_mode: svcRecipientMode || null,
                              service_reminder_custom_email: svcCustomEmail.trim() || null,
                            },
                            token,
                          );
                          await fetchDetails();
                          await fetchServiceReminderSchedule();
                        } catch (err) {
                          console.error(err);
                        } finally {
                          setSvcDeliverySaving(false);
                        }
                      }}
                      className="mt-2 rounded-lg bg-[#14B8A6] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#0d9488] disabled:opacity-50"
                    >
                      {svcDeliverySaving ? 'Saving…' : 'Save delivery settings'}
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500">
                          <th className="py-1 pr-2">Source</th>
                          <th className="py-1 pr-2">Reminder</th>
                          <th className="py-1 pr-2">Next due</th>
                          <th className="py-1 pr-2">Status</th>
                          <th className="py-1">To</th>
                        </tr>
                      </thead>
                      <tbody>
                        {svcSchedule.lines.map((row, idx) => (
                          <tr
                            key={`${row.source ?? 'service_job'}-${row.job_id ?? row.report_id ?? 'na'}-${row.service_name}-${row.next_renewal_due_date ?? 'na'}-${idx}`}
                            className="border-b border-slate-100 align-top"
                          >
                            <td className="py-1.5 pr-2">
                              {(row.source ?? 'service_job') === 'site_report' || row.source === 'certificate' ? (
                                <span>
                                  <span className="font-semibold text-slate-800">
                                    {row.source === 'certificate' ? 'Certificate' : 'Site report'}
                                  </span>
                                  <span className="mt-0.5 block text-[10px] text-slate-500">
                                    {row.certificate_number || (row.report_id ? `Report #${row.report_id}` : 'Renewal report')}
                                  </span>
                                  {row.job_id ? (
                                    <Link href={`/dashboard/jobs/${row.job_id}`} className="mt-0.5 block text-[#14B8A6] hover:underline">
                                      Linked job #{row.job_id}
                                    </Link>
                                  ) : null}
                                </span>
                              ) : row.job_id ? (
                                <>
                                  <Link href={`/dashboard/jobs/${row.job_id}`} className="text-[#14B8A6] hover:underline">
                                    #{row.job_id}
                                  </Link>{' '}
                                  <span className="text-slate-700">{row.job_title || ''}</span>
                                </>
                              ) : (
                                <span className="text-slate-500">—</span>
                              )}
                            </td>
                            <td className="py-1.5 pr-2 text-slate-800">{row.service_name}</td>
                            <td className="py-1.5 pr-2 text-slate-700">
                              {row.next_renewal_due_date || '—'}
                              {row.early_window_starts ? (
                                <span className="mt-0.5 block text-[10px] text-slate-500">
                                  Early window from {row.early_window_starts}
                                </span>
                              ) : null}
                            </td>
                            <td className="py-1.5 pr-2 text-slate-700">
                              {row.would_send_today ? (
                                <span className="font-semibold text-amber-800">Pending send</span>
                              ) : (
                                row.block_reason || '—'
                              )}
                            </td>
                            <td className="py-1.5 text-slate-600">{row.recipient_preview || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {svcSchedule.open_service_jobs.length > 0 && (
                    <p className="text-xs text-slate-500">
                      Open service jobs (complete with next service date to start renewals):{' '}
                      {svcSchedule.open_service_jobs.map((j) => (
                        <Link
                          key={j.id}
                          href={`/dashboard/jobs/${j.id}`}
                          className="mr-2 font-medium text-[#14B8A6] hover:underline"
                        >
                          #{j.id}
                        </Link>
                      ))}
                    </p>
                  )}
                </div>
              )}
            </div>

            <CustomerBehaviourNotesEditor
              key={`${data.id}-${data.notes ?? ''}`}
              customerId={id}
              token={token}
              initialNotes={data.notes ?? ''}
              onSaved={(notes) => setData(prev => prev ? { ...prev, notes } : prev)}
            />

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

            {/* Technical Notes section */}
            <div className="p-5 pb-10">
               <div className="flex justify-between items-center mb-4">
                 <h3 className="font-bold text-slate-800 text-[15px]">Technical notes</h3>
                 <button 
                  onClick={() => {
                    setIsAddingNote(true);
                    setEditingNoteId(null);
                    setNoteTitle('');
                    setNoteDescription('');
                    setNoteFiles([]);
                    setNoteUploadError('');
                  }}
                  className="inline-flex items-center gap-1 text-xs font-bold text-[#14B8A6] hover:bg-emerald-50 px-2 py-1 rounded transition-colors"
                >
                   <Plus className="size-3" />
                   Add note
                 </button>
               </div>
               
               <div className="space-y-4">
                 {isAddingNote && (
                   <div className="p-3 bg-emerald-50/50 rounded-lg border border-emerald-100 space-y-3">
                      <input 
                        autoFocus
                        type="text" 
                        placeholder="Title" 
                        value={noteTitle}
                        onChange={(e) => setNoteTitle(e.target.value)}
                        className="w-full text-xs font-bold bg-white border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-[#14B8A6]"
                      />
                      <textarea 
                        placeholder="Description" 
                        rows={3}
                        value={noteDescription}
                        onChange={(e) => setNoteDescription(e.target.value)}
                        className="w-full text-xs bg-white border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-[#14B8A6] resize-none"
                      />
                      <div className="space-y-2">
                        <label className="inline-flex cursor-pointer items-center gap-1 rounded border border-dashed border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-500 hover:border-[#14B8A6] hover:text-[#14B8A6]">
                          <ImagePlus className="size-3" />
                          Add pictures
                          <input
                            type="file"
                            accept="image/*,.heic,.heif"
                            multiple
                            className="hidden"
                            onChange={(e) => {
                              const files = Array.from(e.target.files ?? []);
                              setNoteFiles(prev => [...prev, ...files]);
                              setNoteUploadError('');
                              e.currentTarget.value = '';
                            }}
                          />
                        </label>
                        {noteFiles.length > 0 ? (
                          <div className="space-y-1">
                            {noteFiles.map((file, index) => (
                              <div key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center justify-between rounded bg-white px-2 py-1 text-[11px] text-slate-600">
                                <span className="truncate">{file.name}</span>
                                <button
                                  type="button"
                                  onClick={() => setNoteFiles(prev => prev.filter((_, i) => i !== index))}
                                  className="ml-2 text-slate-400 hover:text-rose-500"
                                >
                                  <X className="size-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {noteUploadError ? <p className="text-[11px] text-rose-600">{noteUploadError}</p> : null}
                      </div>
                      <div className="flex justify-end gap-2 pt-1">
                        <button 
                          onClick={() => {
                            setIsAddingNote(false);
                            setNoteFiles([]);
                            setNoteUploadError('');
                          }}
                          className="p-1 text-slate-400 hover:text-slate-600"
                        >
                          <X className="size-4" />
                        </button>
                        <button 
                          disabled={noteSaving || !noteTitle.trim() || !noteDescription.trim()}
                          onClick={async () => {
                            setNoteSaving(true);
                            let createdNote: SpecificNote | null = null;
                            try {
                              const res = await postJson<SpecificNote>(
                                `/customers/${id}/specific-notes`,
                                {
                                  title: noteTitle,
                                  description: noteDescription,
                                  ...(workAddressId ? { work_address_id: Number(workAddressId) } : {}),
                                },
                                token,
                              );
                              createdNote = res;
                              setData(prev => prev ? { ...prev, specific_notes: [...(prev.specific_notes ?? []), res] } : null);
                              if (noteFiles.length > 0) {
                                const uploadedMedia = await uploadNoteFiles(res.id, noteFiles);
                                updateNoteMedia(res.id, uploadedMedia);
                              }
                              setIsAddingNote(false);
                              setNoteFiles([]);
                              setNoteUploadError('');
                            } catch (err) {
                              console.error('Failed to add note', err);
                              setNoteUploadError(err instanceof Error ? err.message : 'Failed to add note');
                              if (createdNote) {
                                setIsAddingNote(false);
                                setNoteFiles([]);
                              }
                            } finally {
                              setNoteSaving(false);
                            }
                          }}
                          className="p-1 text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
                        >
                          <Check className="size-4" />
                        </button>
                      </div>
                   </div>
                 )}

                 {specificNotes.length === 0 && !isAddingNote && (
                   <p className="text-xs text-slate-400 text-center py-4 bg-slate-50 border border-dashed border-slate-200 rounded-lg">No notes found.</p>
                 )}

                 {specificNotes.map((note) => (
                   <div key={note.id} className="group/note relative p-3 border border-slate-100 rounded-lg hover:border-slate-300 hover:bg-white transition-all">
                      {editingNoteId === note.id ? (
                        <div className="space-y-2">
                          <input 
                            autoFocus
                            type="text" 
                            value={noteTitle}
                            onChange={(e) => setNoteTitle(e.target.value)}
                            className="w-full text-xs font-bold bg-white border border-slate-200 rounded px-2 py-1 outline-none focus:border-[#14B8A6]"
                          />
                          <textarea 
                            rows={3}
                            value={noteDescription}
                            onChange={(e) => setNoteDescription(e.target.value)}
                            className="w-full text-xs bg-white border border-slate-200 rounded px-2 py-1 outline-none focus:border-[#14B8A6] resize-none"
                          />
                          <div className="flex justify-end gap-2 pt-1">
                            <button 
                              onClick={() => setEditingNoteId(null)}
                              className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded"
                            >
                              <X className="size-4" />
                            </button>
                            <button 
                              disabled={noteSaving}
                              onClick={async () => {
                                setNoteSaving(true);
                                try {
                                  const res = await patchJson<SpecificNote>(`/customers/${id}/specific-notes/${note.id}`, { title: noteTitle, description: noteDescription }, token);
                                  setData(prev => prev ? { 
                                    ...prev, 
                                    specific_notes: (prev.specific_notes ?? []).map(n => n.id === note.id ? res : n) 
                                  } : null);
                                  setEditingNoteId(null);
                                } catch (err) {
                                  console.error('Failed to update note', err);
                                } finally {
                                  setNoteSaving(false);
                                }
                              }}
                              className="p-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded"
                            >
                              <Check className="size-4" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex justify-between items-start mb-1">
                            <h4 className="text-xs font-bold text-slate-700">{note.title}</h4>
                            <div className="flex gap-1 opacity-0 group-hover/note:opacity-100 transition-opacity">
                              <button 
                                onClick={() => {
                                  setEditingNoteId(note.id);
                                  setNoteTitle(note.title);
                                  setNoteDescription(note.description);
                                }}
                                className="p-1 rounded text-slate-400 hover:text-[#14B8A6] hover:bg-slate-100"
                              >
                                <Edit className="size-3" />
                              </button>
                              <button 
                                onClick={async () => {
                                  if (!confirm('Are you sure you want to delete this note?')) return;
                                  try {
                                    await deleteRequest(`/customers/${id}/specific-notes/${note.id}`, token);
                                    setData(prev => prev ? { 
                                      ...prev, 
                                      specific_notes: (prev.specific_notes ?? []).filter(n => n.id !== note.id) 
                                    } : null);
                                  } catch (err) {
                                    console.error('Failed to delete note', err);
                                  }
                                }}
                                className="p-1 rounded text-slate-400 hover:text-rose-500 hover:bg-slate-100"
                              >
                                <Trash2 className="size-3" />
                              </button>
                            </div>
                          </div>
                          <p className="text-[13px] text-slate-600 leading-relaxed whitespace-pre-wrap">{note.description}</p>
                          <CustomerTechnicalNoteMedia
                            customerId={Number(id)}
                            noteId={note.id}
                            media={note.media ?? []}
                            token={token}
                            onMediaChange={updateNoteMedia}
                          />
                        </>
                      )}
                   </div>
                 ))}
               </div>
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
                      onClick={() => {
                        setActiveTab(tab.key);
                        const next = new URLSearchParams(searchParams.toString());
                        next.set('tab', tab.key);
                        router.replace(`/dashboard/customers/${id}?${next.toString()}`, { scroll: false });
                      }}
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
               
               {activeTab === 'Overview' && (
                 <div className="space-y-6 max-w-6xl mx-auto">
                   <CustomerOverviewMapTab
                     customerId={id}
                     workAddressId={workAddressId}
                     customerDetails={data}
                     invoices={invoices}
                   />
                    
                    {/* Ongoing works block */}
                    <div className="bg-white border border-slate-200 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden">
                       <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                         <h2 className="text-[15px] font-bold text-slate-800">On going works</h2>
                         <button
                           onClick={() =>
                             router.push(
                               workAddressId
                                 ? `/dashboard/customers/${id}/jobs/new?work_address_id=${encodeURIComponent(workAddressId)}`
                                 : `/dashboard/customers/${id}/jobs/new`,
                             )
                           }
                           className="bg-[#14B8A6] hover:bg-[#119f8e] text-white text-sm font-bold px-4 py-1.5 rounded-lg shadow-sm transition-colors"
                         >
                           Add new job
                         </button>
                       </div>
                       
                       <div className="overflow-x-auto">
                         <table className="w-full text-left text-sm whitespace-nowrap">
                           <thead className="bg-slate-50 uppercase text-xs font-semibold text-slate-500 tracking-wider">
                             <tr>
                               <th className="px-5 py-3 border-b border-slate-200">Date</th>
                               <th className="px-5 py-3 border-b border-slate-200">Type</th>
                               <th className="px-5 py-3 border-b border-slate-200">Record no</th>
                               <th className="px-5 py-3 border-b border-slate-200">Description</th>
                              <th className="px-5 py-3 border-b border-slate-200">Contact</th>
                              <th className="px-5 py-3 border-b border-slate-200">Next visit booked</th>
                               <th className="px-5 py-3 border-b border-slate-200 text-right">Actions</th>
                             </tr>
                           </thead>
                           <tbody className="divide-y divide-slate-100 text-slate-700">
                             {jobs.filter(j => !['completed', 'closed'].includes(j.state)).length === 0 ? (
                               <tr>
                                 <td colSpan={7} className="px-5 py-8 text-center text-slate-400">No ongoing works found.</td>
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
                                   <td className="px-5 py-4 text-slate-600">{j.site_contact_name || '—'}</td>
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
                          <button onClick={() => setHistoryType(historyType === 'jobs' ? '' : 'jobs')} className={`${historyType === 'jobs' ? 'bg-white text-[#14B8A6] shadow-sm border border-slate-200' : 'text-slate-600 hover:text-slate-900'} text-sm font-semibold rounded-md px-3 py-1`}>Jobs</button>
                          <button onClick={() => setHistoryType(historyType === 'invoices' ? '' : 'invoices')} className={`${historyType === 'invoices' ? 'bg-white text-[#14B8A6] shadow-sm border border-slate-200' : 'text-slate-600 hover:text-slate-900'} text-sm font-semibold rounded-md px-3 py-1`}>Invoices</button>
                          <button onClick={() => setHistoryType(historyType === 'credit_notes' ? '' : 'credit_notes')} className={`${historyType === 'credit_notes' ? 'bg-white text-[#14B8A6] shadow-sm border border-slate-200' : 'text-slate-600 hover:text-slate-900'} text-sm font-semibold rounded-md px-3 py-1`}>Credit notes</button>
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
                               <th className="px-5 py-3 border-b border-slate-200">Contact</th>
                               <th className="px-5 py-3 border-b border-slate-200">Total</th>
                               <th className="px-5 py-3 border-b border-slate-200">Balance</th>
                               <th className="px-5 py-3 border-b border-slate-200 text-right">Actions</th>
                             </tr>
                           </thead>
                           <tbody className="divide-y divide-slate-100 text-slate-700">
                             {historyType === 'credit_notes' ? (
                               <tr>
                                 <td colSpan={8} className="px-5 py-8 text-center text-slate-400">Credit notes are not available yet.</td>
                               </tr>
                             ) : historyRows.length === 0 ? (
                               <tr>
                                 <td colSpan={8} className="px-5 py-8 text-center text-slate-400">No history found.</td>
                               </tr>
                             ) : (
                               historyRows.map((r) => (
                                 <tr key={r.id} className="hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0">
                                   <td className="px-5 py-4">{dayjs(r.date).format('ddd D MMM YYYY')}</td>
                                   <td className="px-5 py-4 font-medium uppercase text-[11px] text-slate-400 tracking-wide">
                                      <span className={`px-2 py-1 rounded ${r.badgeClass}`}>{r.typeLabel}</span>
                                   </td>
                                   <td className="px-5 py-4 text-slate-500">{r.recordNo}</td>
                                   <td className="px-5 py-4 w-64 max-w-[300px] truncate">{r.description}</td>
                                   <td className="px-5 py-4 text-slate-600">{r.contactName || '—'}</td>
                                   <td className="px-5 py-4 font-semibold text-slate-800">{r.total}</td>
                                   <td className="px-5 py-4 font-semibold text-slate-800">{r.balance}</td>
                                   <td className="px-5 py-4 text-right">
                                     <button 
                                       onClick={() => router.push(r.viewPath)} 
                                       className="inline-flex items-center gap-1 rounded px-2 py-1 text-slate-500 transition hover:bg-slate-200 hover:text-slate-900"
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

              {activeTab === 'Invoices' && (
                <CustomerInvoicesTab customerId={id} workAddressId={workAddressId || undefined} />
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

              {activeTab === 'Site images' && (
                <CustomerSiteImagesTab customerId={id} workAddressId={workAddressId || undefined} />
              )}

              {activeTab === 'Files' && (
                <CustomerFilesTab customerId={id} workAddressId={workAddressId || undefined} />
              )}

              {activeTab === 'Site Reports' && (
                <CustomerSiteReportTab
                  customerId={id}
                  workAddressId={workAddressId || undefined}
                  clientDisplayName={data.full_name}
                  siteAddressLabel={displayAddress}
                />
              )}

              {activeTab !== 'Overview' && activeTab !== 'Communications' && activeTab !== 'Contacts' && activeTab !== 'Invoices' && activeTab !== 'Branches' && activeTab !== 'Work address' && activeTab !== 'Assets' && activeTab !== 'Site images' && activeTab !== 'Files' && activeTab !== 'Site Reports' && (
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
