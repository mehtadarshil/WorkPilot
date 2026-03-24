'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Download, Mail, Phone, Plus, Printer, Search, X, Paperclip } from 'lucide-react';
import dayjs from 'dayjs';
import { getJson, postJson } from '../../../apiClient';

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

interface Props {
  customerId: string;
  customer: CustomerBasics;
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

export default function CustomerCommunicationsTab({ customerId, customer }: Props) {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

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

  const fetchCommunications = useCallback(async () => {
    if (!token || !customerId) return;
    const params = new URLSearchParams();
    if (query.trim()) params.set('search', query.trim());
    if (fromDate) params.set('from_date', fromDate);
    if (toDate) params.set('to_date', toDate);
    if (typeFilter) params.set('type', typeFilter);
    if (createdByFilter) params.set('created_by', createdByFilter);
    if (objectFilter) params.set('object_type', objectFilter);

    const url = `/customers/${customerId}/communications${params.toString() ? `?${params.toString()}` : ''}`;
    try {
      const res = await getJson<CommunicationsResponse>(url, token);
      setRecords(res.communications || []);
      setCreatedByOptions(res.created_by_options || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load communications');
    }
  }, [token, customerId, query, fromDate, toDate, typeFilter, createdByFilter, objectFilter]);

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
  };

  const openComposer = (type: RecordType) => {
    resetComposer();
    setComposerType(type);
    if (type === 'email') {
      setToValue(customer.contact_email || customer.email || '');
      setSubject(`Regarding ${customer.full_name}`);
      setMessage(`Hi ${customer.full_name},\n\n`);
      setStatus('sent');
      setFromValue('noreply@workpilotcrm.com');
    }
    if (type === 'schedule') {
      setStatus('scheduled');
    }
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
          attachment_name: attachmentName || null,
          scheduled_for: scheduledFor || null,
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
              <div className="mb-3 inline-block rounded bg-slate-700 px-3 py-1 text-xs font-semibold text-white">{dayjs(day).format('dddd Do MMMM YYYY')}</div>
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
                        <p className="text-xs text-slate-500">{dayjs(item.created_at).format('ddd D MMM YYYY (h:mm a)')}</p>
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
                <div className="mb-2 flex items-center gap-2">
                  <Paperclip className="size-4 text-slate-400" />
                  <input value={attachmentName} onChange={(e) => setAttachmentName(e.target.value)} placeholder="Attachment name (optional)" className="w-full rounded border border-slate-200 px-2 py-1 text-xs outline-none focus:border-[#14B8A6]" />
                </div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input type="checkbox" checked={scheduleAfterSend} onChange={(e) => setScheduleAfterSend(e.target.checked)} className="rounded border-slate-300 text-[#14B8A6] focus:ring-[#14B8A6]" />
                    Schedule new activity after send
                  </label>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setComposerType(null)} className="rounded border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Discard</button>
                    <button onClick={submitRecord} disabled={submitting} className="rounded bg-[#14B8A6] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#119f90] disabled:opacity-50">
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
