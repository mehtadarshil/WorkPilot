'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Download, Mail, Phone, Plus, Printer, Search, X, Paperclip, Trash2 } from 'lucide-react';
import dayjs from 'dayjs';
import { deleteRequest, getBlob, getJson, postJson } from '../../../apiClient';

type RecordType = 'note' | 'email' | 'sms' | 'phone' | 'schedule';
type ObjectType = 'customer' | 'job' | 'invoice' | 'property' | 'branch' | 'asset';

interface Communication {
  id: number;
  customer_id: number;
  record_type: RecordType;
  subject: string | null;
  message: string | null;
  status: string | null;
  to_value: string | null;
  cc_value?: string | null;
  bcc_value?: string | null;
  from_value: string | null;
  object_type: ObjectType;
  object_id: number | null;
  attachment_name: string | null;
  scheduled_for: string | null;
  created_at: string;
  created_by: number | null;
  created_by_name: string;
}

interface CreatedByOption {
  id: number;
  label: string;
}

interface CommunicationsResponse {
  communications: Communication[];
  created_by_options: CreatedByOption[];
}

interface CustomerBasics {
  full_name: string;
  email: string;
  phone: string | null;
  contact_email: string | null;
  contact_mobile: string | null;
}

interface EmailComposeDraft {
  signature_html: string | null;
  from_display: string;
  from_email: string;
  smtp_ready: boolean;
  default_to: string;
  subject: string;
  body_html: string;
}

interface CustomerFileOption {
  id: number | string;
  original_filename: string;
  content_type: string | null;
  byte_size: number | null;
  kind?: 'uploaded' | 'electrical_certificate' | 'site_report';
  href?: string;
}

type EmailAttachment = {
  key: string;
  filename: string;
  content_base64: string;
  content_type: string;
  byte_size: number;
};

interface Props {
  customerId: string;
  customer: CustomerBasics;
  workAddressId?: string;
}

const TYPE_FILTERS: { key: RecordType; label: string; dot: string }[] = [
  { key: 'note', label: 'Notes', dot: 'bg-sky-500' },
  { key: 'email', label: 'Email', dot: 'bg-teal-600' },
  { key: 'phone', label: 'Phone call', dot: 'bg-lime-500' },
  { key: 'schedule', label: 'Schedule', dot: 'bg-violet-500' },
];

function getTypeIcon(type: RecordType) {
  if (type === 'email') return Mail;
  if (type === 'phone') return Phone;
  return CalendarDays;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.includes(',') ? result.slice(result.indexOf(',') + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.includes(',') ? result.slice(result.indexOf(',') + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
    reader.readAsDataURL(blob);
  });
}

function formatBytes(bytes: number | null): string {
  if (bytes == null || !Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function customerFileContentPath(customerId: string, file: CustomerFileOption): string {
  return (file.kind === 'electrical_certificate' || file.kind === 'site_report') && file.href
    ? file.href
    : `/customers/${customerId}/files/${file.id}/content`;
}

export default function CustomerCommunicationsTab({ customerId, customer, workAddressId }: Props) {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [records, setRecords] = useState<Communication[]>([]);
  const [createdByOptions, setCreatedByOptions] = useState<CreatedByOption[]>([]);
  const [query, setQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [typeFilter, setTypeFilter] = useState<RecordType | ''>('');
  const [createdByFilter, setCreatedByFilter] = useState('');
  const [objectFilter, setObjectFilter] = useState<ObjectType | ''>('');
  const [showMenu, setShowMenu] = useState(false);
  const [composerType, setComposerType] = useState<RecordType | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('');
  const [toValue, setToValue] = useState('');
  const [ccValue, setCcValue] = useState('');
  const [bccValue, setBccValue] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [scheduleAfterSend, setScheduleAfterSend] = useState(false);
  const [fromValue, setFromValue] = useState('Office');
  const [objectType, setObjectType] = useState<ObjectType>('customer');
  const [objectId, setObjectId] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [emailDraft, setEmailDraft] = useState<EmailComposeDraft | null>(null);
  const [includeSignature, setIncludeSignature] = useState(true);
  const [attachments, setAttachments] = useState<EmailAttachment[]>([]);
  const [customerFiles, setCustomerFiles] = useState<CustomerFileOption[]>([]);
  const [selectedFileId, setSelectedFileId] = useState('');
  const [attachmentBusy, setAttachmentBusy] = useState(false);

  const fetchCommunications = useCallback(async () => {
    if (!token || !customerId) return;
    const params = new URLSearchParams();
    if (query.trim()) params.set('search', query.trim());
    if (fromDate) params.set('from_date', fromDate);
    if (toDate) params.set('to_date', toDate);
    if (typeFilter) params.set('type', typeFilter);
    if (createdByFilter) params.set('created_by', createdByFilter);
    if (objectFilter) params.set('object_type', objectFilter);
    if (workAddressId) params.set('work_address_id', workAddressId);

    const url = `/customers/${customerId}/communications${params.toString() ? `?${params.toString()}` : ''}`;
    try {
      const res = await getJson<CommunicationsResponse>(url, token);
      setRecords(res.communications || []);
      setCreatedByOptions(res.created_by_options || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load communications');
    }
  }, [token, customerId, query, fromDate, toDate, typeFilter, createdByFilter, objectFilter, workAddressId]);

  useEffect(() => {
    fetchCommunications();
  }, [fetchCommunications]);

  const grouped = useMemo(() => {
    const map = new Map<string, Communication[]>();
    for (const record of records) {
      const day = dayjs(record.created_at).format('YYYY-MM-DD');
      const arr = map.get(day) || [];
      arr.push(record);
      map.set(day, arr);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [records]);

  const resetComposer = () => {
    setSubject('');
    setMessage('');
    setStatus('');
    setToValue('');
    setCcValue('');
    setBccValue('');
    setShowCc(false);
    setShowBcc(false);
    setScheduleAfterSend(false);
    setFromValue('Office');
    setObjectType('customer');
    setObjectId('');
    setAttachmentName('');
    setScheduledFor('');
    setEmailDraft(null);
    setIncludeSignature(true);
    setAttachments([]);
    setCustomerFiles([]);
    setSelectedFileId('');
    setAttachmentBusy(false);
  };

  const loadEmailComposeData = async () => {
    if (!token) return;
    const params = new URLSearchParams();
    if (workAddressId) params.set('work_address_id', workAddressId);
    const [draft, filesRes] = await Promise.all([
      getJson<EmailComposeDraft>(`/customers/${customerId}/email-compose`, token),
      getJson<{ files: CustomerFileOption[] }>(`/customers/${customerId}/files${params.toString() ? `?${params.toString()}` : ''}`, token),
    ]);
    setEmailDraft(draft);
    setCustomerFiles(filesRes.files ?? []);
    setToValue(draft.default_to || customer.contact_email || customer.email || '');
    setSubject(draft.subject || `Regarding ${customer.full_name}`);
    setFromValue(draft.from_display || draft.from_email || '');
  };

  const openComposer = (type: RecordType) => {
    resetComposer();
    setComposerType(type);
    if (type === 'email') {
      setToValue(customer.contact_email || customer.email || '');
      setSubject(`Regarding ${customer.full_name}`);
      setMessage(`Hi ${customer.full_name},\n\n`);
      setStatus('sent');
      void loadEmailComposeData().catch((err) => {
        setError(err instanceof Error ? err.message : 'Could not load email settings');
      });
    }
    if (type === 'schedule') {
      setStatus('scheduled');
    }
  };

  const addManualFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setAttachmentBusy(true);
    setError(null);
    try {
      const next: EmailAttachment[] = [];
      for (const file of Array.from(list)) {
        next.push({
          key: `manual-${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name}`,
          filename: file.name,
          content_base64: await fileToBase64(file),
          content_type: file.type || 'application/octet-stream',
          byte_size: file.size,
        });
      }
      setAttachments((prev) => [...prev, ...next]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not attach file');
    } finally {
      setAttachmentBusy(false);
    }
  };

  const attachSelectedCustomerFile = async () => {
    if (!token || !selectedFileId) return;
    const file = customerFiles.find((item) => String(item.id) === selectedFileId);
    if (!file) return;
    setAttachmentBusy(true);
    setError(null);
    try {
      const blob = await getBlob(customerFileContentPath(customerId, file), token);
      const contentBase64 = await blobToBase64(blob);
      setAttachments((prev) => [
        ...prev,
        {
          key: `customer-${Date.now()}-${Math.random().toString(36).slice(2)}-${file.original_filename}`,
          filename: file.original_filename,
          content_base64: contentBase64,
          content_type: file.content_type || blob.type || 'application/octet-stream',
          byte_size: blob.size,
        },
      ]);
      setSelectedFileId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not attach selected file');
    } finally {
      setAttachmentBusy(false);
    }
  };

  const removeAttachment = (key: string) => {
    setAttachments((prev) => prev.filter((item) => item.key !== key));
  };

  const submitRecord = async () => {
    if (!token || !composerType) return;
    setSubmitting(true);
    setError(null);
    try {
      await postJson(
        `/customers/${customerId}/communications`,
        {
          record_type: composerType,
          subject: subject || null,
          message: message || null,
          status: status || null,
          to_value: toValue || null,
          cc_value: ccValue || null,
          bcc_value: bccValue || null,
          from_value: fromValue || null,
          object_type: objectType,
          object_id: objectId ? parseInt(objectId, 10) : null,
          attachment_name: attachmentName || attachments.map((a) => a.filename).join(', ') || null,
          append_signature: includeSignature,
          attachments: attachments.map(({ filename, content_base64, content_type }) => ({ filename, content_base64, content_type })),
          scheduled_for: scheduledFor || null,
          ...(workAddressId ? { work_address_id: Number(workAddressId) } : {}),
        },
        token,
      );
      if (composerType === 'email' && scheduleAfterSend) {
        await postJson(
          `/customers/${customerId}/communications`,
          {
            record_type: 'schedule',
            subject: subject || 'Follow-up on sent email',
            message: `Follow-up scheduled after email send.\nSubject: ${subject || '-'}`,
            status: 'scheduled',
            object_type: objectType,
            object_id: objectId ? parseInt(objectId, 10) : null,
            scheduled_for: dayjs().add(1, 'day').hour(9).minute(0).second(0).millisecond(0).toISOString(),
            ...(workAddressId ? { work_address_id: Number(workAddressId) } : {}),
          },
          token,
        );
      }
      setComposerType(null);
      resetComposer();
      fetchCommunications();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save communication');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteRecord = async (id: number) => {
    if (!token || !customerId) return;
    if (!window.confirm('Are you sure you want to delete this communication record?')) return;
    try {
      await deleteRequest(`/customers/${customerId}/communications/${id}`, token);
      fetchCommunications();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete communication record');
    }
  };

  const exportJson = () => {
    const data = JSON.stringify(records, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `customer-${customerId}-communications.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]"
            />
          </div>
          <div className="flex gap-2">
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-2 text-sm outline-none focus:border-[#14B8A6]" />
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-2 text-sm outline-none focus:border-[#14B8A6]" />
          </div>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as RecordType | '')} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]">
            <option value="">Type of record (all)</option>
            {TYPE_FILTERS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <select value={createdByFilter} onChange={(e) => setCreatedByFilter(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]">
            <option value="">Created by user (all)</option>
            {createdByOptions.map((u) => <option key={u.id} value={String(u.id)}>{u.label}</option>)}
          </select>
          <select value={objectFilter} onChange={(e) => setObjectFilter(e.target.value as ObjectType | '')} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]">
            <option value="">Filter by object</option>
            <option value="customer">Customer</option>
            <option value="job">Job</option>
            <option value="invoice">Invoice</option>
            <option value="property">Property</option>
            <option value="branch">Branch</option>
            <option value="asset">Asset</option>
          </select>
          <button onClick={fetchCommunications} className="rounded-lg bg-[#14B8A6] px-3 py-2 text-sm font-semibold text-white hover:bg-[#119f90]">Apply</button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Type:</span>
          {TYPE_FILTERS.map((t) => (
            <button key={t.key} onClick={() => setTypeFilter(typeFilter === t.key ? '' : t.key)} className={`rounded-full border px-3 py-1 text-xs font-medium ${typeFilter === t.key ? 'border-[#14B8A6] text-[#14B8A6] bg-[#14B8A6]/10' : 'border-slate-200 text-slate-600'}`}>
              <span className={`mr-1 inline-block size-2 rounded-full ${t.dot}`} />
              {t.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1">
            <div className="relative">
              <button onClick={() => setShowMenu((v) => !v)} className="inline-flex items-center gap-2 rounded-lg bg-[#14B8A6] px-3 py-2 text-sm font-semibold text-white hover:bg-[#119f90]">
                <Plus className="size-4" />
                Add record
              </button>
              {showMenu && (
                <div className="absolute right-0 top-11 z-20 w-52 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                  <button className="w-full rounded px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => { setShowMenu(false); openComposer('email'); }}>Send new email</button>
                  <button className="w-full rounded px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => { setShowMenu(false); openComposer('phone'); }}>Log new call</button>
                  <button className="w-full rounded px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => { setShowMenu(false); openComposer('note'); }}>Add new note</button>
                  <button className="w-full rounded px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => { setShowMenu(false); openComposer('schedule'); }}>Schedule activity</button>
                </div>
              )}
            </div>
            <button onClick={() => window.print()} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><Printer className="size-4" /></button>
            <button onClick={exportJson} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><Download className="size-4" /></button>
          </div>
        </div>
      </div>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div>}

      <div className="space-y-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {grouped.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">No communications found for this customer.</div>
        ) : (
          grouped.map(([day, items]) => (
            <div key={day}>
              <div className="mb-3 inline-block rounded bg-slate-700 px-3 py-1 text-xs font-semibold text-white">{dayjs(day).format('dddd D MMMM YYYY')}</div>
              <div className="space-y-3">
                {items.map((item) => {
                  const Icon = getTypeIcon(item.record_type);
                  return (
                    <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2">
                          <div className="mt-0.5 rounded-full bg-[#14B8A6]/10 p-1.5 text-[#14B8A6]"><Icon className="size-4" /></div>
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{item.subject || item.record_type.toUpperCase()}</p>
                            <p className="text-xs text-slate-500">
                              {item.record_type.toUpperCase()} · by {item.created_by_name} · object: {item.object_type}{item.object_id ? ` #${item.object_id}` : ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-slate-500">{dayjs(item.created_at).format('ddd D MMM YYYY (h:mm a)')}</p>
                          <button
                            onClick={() => deleteRecord(item.id)}
                            className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                            title="Delete record"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 space-y-1 text-sm text-slate-700">
                        {item.from_value && <p><span className="font-semibold text-slate-800">From:</span> {item.from_value}</p>}
                        {item.to_value && <p><span className="font-semibold text-slate-800">To:</span> {item.to_value}</p>}
                        {item.cc_value && <p><span className="font-semibold text-slate-800">CC:</span> {item.cc_value}</p>}
                        {item.bcc_value && <p><span className="font-semibold text-slate-800">BCC:</span> {item.bcc_value}</p>}
                        {item.status && <p><span className="font-semibold text-slate-800">Status:</span> <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">{item.status}</span></p>}
                        {item.message && <p className="whitespace-pre-wrap">{item.message}</p>}
                        {item.attachment_name && <p className="text-[#14B8A6]">Attachment: {item.attachment_name}</p>}
                        {item.scheduled_for && <p><span className="font-semibold text-slate-800">Scheduled:</span> {dayjs(item.scheduled_for).format('ddd D MMM YYYY h:mm a')}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {composerType && composerType !== 'email' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => !submitting && setComposerType(null)}>
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900">
              {composerType === 'phone' ? 'Log new call' : composerType === 'schedule' ? 'Schedule activity' : 'Add new note'}
            </h3>
            <div className="mt-4 space-y-3">
              {composerType === 'schedule' && (
                <div>
                  <label className="text-sm font-medium text-slate-700">Subject</label>
                  <input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                </div>
              )}
              {composerType === 'schedule' && (
                <div>
                  <label className="text-sm font-medium text-slate-700">Schedule at</label>
                  <input type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-slate-700">Message / notes</label>
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm font-medium text-slate-700">Object type</label>
                  <select value={objectType} onChange={(e) => setObjectType(e.target.value as ObjectType)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]">
                    <option value="customer">Customer</option>
                    <option value="job">Job</option>
                    <option value="invoice">Invoice</option>
                    <option value="property">Property</option>
                    <option value="branch">Branch</option>
                    <option value="asset">Asset</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Object id (optional)</label>
                  <input value={objectId} onChange={(e) => setObjectId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setComposerType(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Discard</button>
              <button onClick={submitRecord} disabled={submitting} className="rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#119f90] disabled:opacity-50">
                {submitting ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {composerType === 'email' && (
        <div className="fixed inset-0 z-50 bg-slate-900/35" onClick={() => !submitting && setComposerType(null)}>
          <div className="absolute bottom-0 right-0 top-0 w-full max-w-[820px] border-l border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between bg-slate-700 px-4 py-2 text-white">
              <div className="text-sm font-semibold">Send email from: {fromValue || 'noreply@workpilotcrm.com'}</div>
              <button onClick={() => setComposerType(null)} className="rounded p-1 hover:bg-white/10"><X className="size-4" /></button>
            </div>
            <div className="flex h-[calc(100%-40px)] flex-col">
              {emailDraft && !emailDraft.smtp_ready && (
                <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
                  Email connection is not configured. Open <strong>Settings → Email</strong> to connect your mailbox.
                </div>
              )}
              <div className="border-b border-slate-200 px-4 py-2">
                <div className="grid grid-cols-[70px_1fr_auto] items-center gap-2 border-b border-slate-100 py-1.5">
                  <label className="text-xs font-medium text-slate-500">To</label>
                  <input value={toValue} onChange={(e) => setToValue(e.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder={customer.contact_email || customer.email || 'recipient@email.com'} />
                  <button onClick={() => setShowCc((v) => !v)} className="text-xs font-semibold text-[#14B8A6] hover:underline">Add cc</button>
                </div>
                {showCc && (
                  <div className="grid grid-cols-[70px_1fr_auto] items-center gap-2 border-b border-slate-100 py-1.5">
                    <label className="text-xs font-medium text-slate-500">Cc</label>
                    <input value={ccValue} onChange={(e) => setCcValue(e.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="cc@email.com" />
                    <button onClick={() => setShowBcc((v) => !v)} className="text-xs font-semibold text-[#14B8A6] hover:underline">Add bcc</button>
                  </div>
                )}
                {showBcc && (
                  <div className="grid grid-cols-[70px_1fr] items-center gap-2 border-b border-slate-100 py-1.5">
                    <label className="text-xs font-medium text-slate-500">Bcc</label>
                    <input value={bccValue} onChange={(e) => setBccValue(e.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="bcc@email.com" />
                  </div>
                )}
                <div className="grid grid-cols-[70px_1fr] items-center gap-2 py-1.5">
                  <label className="text-xs font-medium text-slate-500">Subject</label>
                  <input value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="Email subject" />
                </div>
              </div>

              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="h-full flex-1 resize-none px-4 py-3 text-sm leading-relaxed outline-none"
                placeholder={`Hi ${customer.full_name},\n\n`}
              />

              <div className="border-t border-slate-200 px-4 py-2">
                {emailDraft?.signature_html ? (
                  <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={includeSignature}
                        onChange={(e) => setIncludeSignature(e.target.checked)}
                        className="rounded border-slate-300 text-[#14B8A6] focus:ring-[#14B8A6]"
                      />
                      Insert signature
                    </label>
                    {includeSignature && (
                      <div
                        className="mt-2 max-h-28 overflow-y-auto rounded border border-slate-200 bg-white p-2 text-xs text-slate-600"
                        dangerouslySetInnerHTML={{ __html: emailDraft.signature_html }}
                      />
                    )}
                  </div>
                ) : null}

                <div className="mb-2 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="sr-only"
                      onChange={(e) => {
                        void addManualFiles(e.target.files);
                        e.target.value = '';
                      }}
                    />
                    <button
                      type="button"
                      disabled={attachmentBusy}
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-2 rounded border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <Paperclip className="size-4 text-slate-400" />
                      Attach files
                    </button>
                    <select
                      value={selectedFileId}
                      onChange={(e) => setSelectedFileId(e.target.value)}
                      className="min-w-[220px] rounded border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-[#14B8A6]"
                    >
                      <option value="">Attach from customer/site files</option>
                      {customerFiles.map((file) => (
                        <option key={String(file.id)} value={String(file.id)}>
                          {file.original_filename}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!selectedFileId || attachmentBusy}
                      onClick={() => void attachSelectedCustomerFile()}
                      className="rounded bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      Add selected
                    </button>
                  </div>
                  {attachments.length > 0 && (
                    <ul className="space-y-1 text-xs text-slate-700">
                      {attachments.map((attachment) => (
                        <li key={attachment.key} className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-1">
                          <span className="truncate">{attachment.filename}</span>
                          <span className="shrink-0 text-slate-500">{formatBytes(attachment.byte_size)}</span>
                          <button
                            type="button"
                            onClick={() => removeAttachment(attachment.key)}
                            className="shrink-0 rounded p-0.5 text-rose-600 hover:bg-rose-50"
                            aria-label={`Remove ${attachment.filename}`}
                          >
                            <X className="size-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input type="checkbox" checked={scheduleAfterSend} onChange={(e) => setScheduleAfterSend(e.target.checked)} className="rounded border-slate-300 text-[#14B8A6] focus:ring-[#14B8A6]" />
                    Schedule new activity after send
                  </label>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setComposerType(null)} className="rounded border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Discard</button>
                    <button onClick={submitRecord} disabled={submitting || attachmentBusy || (emailDraft ? !emailDraft.smtp_ready : false)} className="rounded bg-[#14B8A6] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#119f90] disabled:opacity-50">
                      {submitting ? 'Sending...' : 'Send'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
