'use client';

import { useMemo, useState, useCallback } from 'react';
import {
  Search,
  CalendarDays,
  Clock,
  Mail,
  MessageSquare,
  Phone,
  Printer,
  Download,
  FileText,
  Send,
} from 'lucide-react';
import dayjs from 'dayjs';
import advancedFormat from 'dayjs/plugin/advancedFormat';

dayjs.extend(advancedFormat);
import { postJson } from '../../../apiClient';

export type QuotationActivity = {
  id: number;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
  created_by: number | null;
};

export type CommKind = 'note' | 'print' | 'phone' | 'sms' | 'email' | 'system';

export type TimelineEntry = {
  id: number;
  kind: CommKind;
  action: string;
  created_at: string;
  title: string;
  body: string;
  fromLabel?: string;
  toLabel?: string;
  statusBadge?: string;
  attachment?: string;
};

function normalizeActivities(activities: QuotationActivity[], quotationNumber: string): TimelineEntry[] {
  return activities.map((a) => {
    const d = a.details || {};
    const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '');
    const num = (k: string) => (typeof d[k] === 'number' ? (d[k] as number) : null);

    switch (a.action) {
      case 'comm_note':
        return {
          id: a.id,
          kind: 'note',
          action: a.action,
          created_at: a.created_at,
          title: 'Note',
          body: str('text'),
        };
      case 'comm_email':
        return {
          id: a.id,
          kind: 'email',
          action: a.action,
          created_at: a.created_at,
          title: str('subject') || 'Email',
          body: str('body'),
          fromLabel: str('from') || 'Office',
          toLabel: str('to_email') || str('to_name') || '',
          statusBadge: str('status') || 'sent',
          attachment: str('attachment_name') || undefined,
        };
      case 'sent_to_client':
        return {
          id: a.id,
          kind: 'email',
          action: a.action,
          created_at: a.created_at,
          title: `Quotation ${quotationNumber} sent to client`,
          body: 'Quotation was marked as sent to the client.',
          fromLabel: 'Office',
          toLabel: '',
          statusBadge: 'sent',
          attachment: `${quotationNumber}.pdf`,
        };
      case 'comm_sms':
        return {
          id: a.id,
          kind: 'sms',
          action: a.action,
          created_at: a.created_at,
          title: 'SMS',
          body: str('body'),
          toLabel: str('to_phone') || str('to_name') || '',
        };
      case 'comm_phone': {
        const dur = num('duration_minutes');
        const summary = str('summary');
        return {
          id: a.id,
          kind: 'phone',
          action: a.action,
          created_at: a.created_at,
          title: 'Phone call',
          body: dur != null ? `${summary}\nDuration: ${dur} minutes` : summary,
        };
      }
      case 'comm_print':
        return {
          id: a.id,
          kind: 'print',
          action: a.action,
          created_at: a.created_at,
          title: str('label') || 'Print',
          body: `Quotation ${str('quotation_number') || quotationNumber} printed or saved.`,
        };
      case 'created':
        return {
          id: a.id,
          kind: 'system',
          action: a.action,
          created_at: a.created_at,
          title: 'Quotation created',
          body: '',
        };
      case 'accepted':
        return {
          id: a.id,
          kind: 'system',
          action: a.action,
          created_at: a.created_at,
          title: 'Quotation accepted',
          body: '',
        };
      case 'rejected':
        return {
          id: a.id,
          kind: 'system',
          action: a.action,
          created_at: a.created_at,
          title: 'Quotation rejected',
          body: '',
        };
      case 'transferred_to_invoice':
        return {
          id: a.id,
          kind: 'system',
          action: a.action,
          created_at: a.created_at,
          title: 'Transferred to invoice',
          body: '',
        };
      case 'linked_job':
      case 'converted_to_job': {
        const jid = d.job_id != null ? String(d.job_id) : '';
        return {
          id: a.id,
          kind: 'system',
          action: a.action,
          created_at: a.created_at,
          title: a.action === 'linked_job' ? 'Linked to job' : 'Converted to job',
          body: jid ? `Job #${jid}` : '',
        };
      }
      default:
        return {
          id: a.id,
          kind: 'system',
          action: a.action,
          created_at: a.created_at,
          title: a.action.replace(/_/g, ' '),
          body: Object.keys(d).length ? JSON.stringify(d) : '',
        };
    }
  });
}

const FILTER_CONFIG: { key: CommKind; label: string; dotClass: string; activeRing: string }[] = [
  { key: 'note', label: 'Notes', dotClass: 'bg-blue-500', activeRing: 'ring-blue-500/30' },
  { key: 'print', label: 'Print', dotClass: 'bg-sky-400', activeRing: 'ring-sky-400/30' },
  { key: 'phone', label: 'Phone call', dotClass: 'bg-lime-500', activeRing: 'ring-lime-500/30' },
  { key: 'sms', label: 'SMS', dotClass: 'bg-emerald-500', activeRing: 'ring-emerald-500/30' },
  { key: 'email', label: 'Email', dotClass: 'bg-teal-700', activeRing: 'ring-teal-700/30' },
];

function kindIcon(kind: CommKind) {
  switch (kind) {
    case 'email':
      return Mail;
    case 'sms':
      return MessageSquare;
    case 'phone':
      return Phone;
    case 'print':
      return Printer;
    case 'note':
      return FileText;
    default:
      return FileText;
  }
}

type Props = {
  quotationId: string;
  quotationNumber: string;
  customerEmail: string | null;
  customerPhone: string | null;
  customerName: string | null;
  activities: QuotationActivity[];
  onRefresh: () => void;
  onPrintQuotation: () => void;
};

export default function QuotationNotesPanel({
  quotationId,
  quotationNumber,
  customerEmail,
  customerPhone,
  customerName,
  activities,
  onRefresh,
  onPrintQuotation,
}: Props) {
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [filters, setFilters] = useState<Record<CommKind, boolean>>({
    note: true,
    print: true,
    phone: true,
    sms: true,
    email: true,
    system: true,
  });
  const [timelineView, setTimelineView] = useState(true);
  const [modal, setModal] = useState<'none' | 'note' | 'email' | 'sms' | 'phone'>('none');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [noteText, setNoteText] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailTo, setEmailTo] = useState(customerEmail || '');
  const [emailAttachment, setEmailAttachment] = useState(`${quotationNumber}.pdf`);
  const [emailStatus, setEmailStatus] = useState('sent');
  const [smsBody, setSmsBody] = useState('');
  const [smsTo, setSmsTo] = useState(customerPhone || '');
  const [phoneSummary, setPhoneSummary] = useState('');
  const [phoneDuration, setPhoneDuration] = useState('');

  const entries = useMemo(() => normalizeActivities(activities, quotationNumber), [activities, quotationNumber]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      const typeOk = e.kind === 'system' ? filters.system : filters[e.kind];
      if (!typeOk) return false;
      if (dateFilter) {
        const day = dayjs(e.created_at).format('YYYY-MM-DD');
        if (day !== dateFilter) return false;
      }
      if (!q) return true;
      const hay = `${e.title} ${e.body} ${e.fromLabel ?? ''} ${e.toLabel ?? ''} ${e.attachment ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [entries, filters, search, dateFilter]);

  const groupedByDay = useMemo(() => {
    const map = new Map<string, TimelineEntry[]>();
    for (const e of filtered) {
      const key = dayjs(e.created_at).format('YYYY-MM-DD');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => dayjs(b.created_at).valueOf() - dayjs(a.created_at).valueOf());
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const postComm = useCallback(
    async (payload: Record<string, unknown>) => {
      const token = window.localStorage.getItem('wp_token');
      if (!token) return;
      setSubmitting(true);
      setFormError(null);
      try {
        await postJson(`/quotations/${quotationId}/communications`, payload, token);
        setModal('none');
        setNoteText('');
        setEmailBody('');
        setEmailSubject('');
        setSmsBody('');
        setPhoneSummary('');
        setPhoneDuration('');
        onRefresh();
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'Request failed');
      } finally {
        setSubmitting(false);
      }
    },
    [quotationId, onRefresh],
  );

  const handleDownload = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            quotation_number: quotationNumber,
            exported_at: new Date().toISOString(),
            items: filtered.map(({ id, kind, created_at, title, body, fromLabel, toLabel, statusBadge, attachment }) => ({
              id,
              kind,
              created_at,
              title,
              body,
              from: fromLabel,
              to: toLabel,
              status: statusBadge,
              attachment,
            })),
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `quotation-${quotationNumber}-communications.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const logPrintComm = async () => {
    const token = window.localStorage.getItem('wp_token');
    if (!token) return;
    try {
      await postJson(`/quotations/${quotationId}/communications`, { type: 'print' }, token);
      onRefresh();
    } catch {
      /* still allow print */
    }
    onPrintQuotation();
  };

  const toggleFilter = (key: CommKind) => {
    setFilters((f) => ({ ...f, [key]: !f[key] }));
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          .notes-no-print { display: none !important; }
        }
      `}} />

      <div id="quotation-notes-root" className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
        <div className="notes-no-print space-y-4 border-b border-slate-100 p-4 md:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search notes and communications"
                  className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-3 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/25"
                />
              </div>
              <div className="relative shrink-0">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-3 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/25 sm:w-auto"
                  aria-label="Filter by date"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTimelineView((v) => !v)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                timelineView
                  ? 'border-[#14B8A6] bg-[#14B8A6]/10 text-[#14B8A6]'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Clock className="size-4" />
              Timeline view
            </button>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Filter by type</p>
            <div className="flex flex-wrap gap-2">
              {FILTER_CONFIG.map(({ key, label, dotClass, activeRing }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleFilter(key)}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
                    filters[key]
                      ? `border-slate-200 bg-white text-slate-800 ring-2 ${activeRing}`
                      : 'border-slate-100 bg-slate-50 text-slate-400 opacity-70'
                  }`}
                >
                  <span className={`size-2.5 rounded-full ${dotClass}`} />
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => toggleFilter('system')}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
                  filters.system
                    ? 'border-slate-200 bg-white text-slate-800 ring-2 ring-slate-300/40'
                    : 'border-slate-100 bg-slate-50 text-slate-400 opacity-70'
                }`}
              >
                <span className="size-2.5 rounded-full bg-slate-400" />
                Activity
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setModal('note');
                setFormError(null);
              }}
              className="rounded-lg bg-[#14B8A6] px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#13a89a]"
            >
              Add new note
            </button>
            <button
              type="button"
              onClick={() => {
                setEmailTo(customerEmail || '');
                setEmailAttachment(`${quotationNumber}.pdf`);
                setModal('email');
                setFormError(null);
              }}
              className="rounded-lg bg-[#14B8A6] px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#13a89a]"
            >
              Send new email
            </button>
            <button
              type="button"
              onClick={() => {
                setSmsTo(customerPhone || '');
                setModal('sms');
                setFormError(null);
              }}
              className="rounded-lg bg-[#14B8A6] px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#13a89a]"
            >
              Send new SMS
            </button>
            <button
              type="button"
              onClick={() => {
                setModal('phone');
                setFormError(null);
              }}
              className="rounded-lg bg-[#14B8A6] px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#13a89a]"
            >
              Add phone call
            </button>
            <div className="ml-auto flex gap-1">
              <button
                type="button"
                onClick={logPrintComm}
                className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                title="Print quotation"
              >
                <Printer className="size-4" />
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                title="Download communications"
              >
                <Download className="size-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 md:p-6">
          {filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 py-16 text-center text-sm text-slate-500">
              No communications match your filters.
            </div>
          ) : timelineView ? (
            <div className="space-y-8">
              {groupedByDay.map(([dayKey, dayItems]) => (
                <div key={dayKey}>
                  <div className="mb-4 rounded-md bg-slate-700 px-4 py-2 text-center text-sm font-semibold text-white">
                    {dayjs(dayKey).format('dddd D MMMM YYYY')}
                  </div>
                  <div className="relative ms-4 border-l-2 border-slate-200 pb-2 ps-8">
                    {dayItems.map((entry) => {
                      const Icon = kindIcon(entry.kind);
                      return (
                        <div key={entry.id} className="relative mb-8 last:mb-0">
                          <div className="absolute -start-[2.125rem] top-0 flex size-9 items-center justify-center rounded-full border-2 border-white bg-[#14B8A6]/10 text-[#14B8A6] shadow-sm">
                            <Icon className="size-4" />
                          </div>
                          <div className="flex flex-wrap items-start justify-between gap-2 border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="min-w-0 flex-1 space-y-1 text-sm">
                              {entry.kind === 'email' && (
                                <>
                                  <p className="text-slate-600">
                                    <span className="font-semibold text-slate-800">From:</span> {entry.fromLabel}
                                  </p>
                                  {entry.toLabel ? (
                                    <p className="text-slate-600">
                                      <span className="font-semibold text-slate-800">To:</span> {entry.toLabel}
                                    </p>
                                  ) : null}
                                </>
                              )}
                              {entry.kind === 'sms' && entry.toLabel && (
                                <p className="text-slate-600">
                                  <span className="font-semibold text-slate-800">To:</span> {entry.toLabel}
                                </p>
                              )}
                              <p className="font-semibold text-slate-900">{entry.title}</p>
                              {entry.body ? (
                                entry.kind === 'email' ? (
                                  <div className="prose prose-sm max-w-none text-slate-600" dangerouslySetInnerHTML={{ __html: entry.body }} />
                                ) : (
                                  <p className="whitespace-pre-wrap text-slate-600">{entry.body}</p>
                                )
                              ) : null}
                              {entry.attachment && (
                                <p className="pt-2 text-xs text-[#14B8A6]">
                                  <span className="font-semibold text-slate-700">Attachment:</span> {entry.attachment}
                                </p>
                              )}
                            </div>
                            <div className="shrink-0 text-right text-xs text-slate-500">
                              <p className="font-medium text-slate-700">
                                {entry.kind === 'email' || entry.kind === 'sms' ? 'Sent' : 'Logged'}
                              </p>
                              <p>{dayjs(entry.created_at).format('dddd D MMMM YYYY [at] h:mm a')}</p>
                              {entry.statusBadge && entry.kind === 'email' && (
                                <span className="mt-2 inline-block rounded-full bg-[#14B8A6] px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                                  {entry.statusBadge}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <ul className="space-y-3">
              {filtered.map((entry) => {
                const Icon = kindIcon(entry.kind);
                return (
                  <li
                    key={entry.id}
                    className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50/30 p-4 text-sm"
                  >
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#14B8A6]/10 text-[#14B8A6]">
                      <Icon className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900">{entry.title}</span>
                        <span className="text-xs text-slate-500">
                          {dayjs(entry.created_at).format('DD MMM YYYY, HH:mm')}
                        </span>
                      </div>
                      {entry.body ? (
                        entry.kind === 'email' ? (
                          <div className="prose prose-sm mt-1 max-w-none text-slate-600" dangerouslySetInnerHTML={{ __html: entry.body }} />
                        ) : (
                          <p className="mt-1 text-slate-600">{entry.body}</p>
                        )
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {modal !== 'none' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => !submitting && setModal('none')}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-slate-900">
              {modal === 'note' && 'Add note'}
              {modal === 'email' && 'Send email'}
              {modal === 'sms' && 'Send SMS'}
              {modal === 'phone' && 'Log phone call'}
            </h3>
            {formError && <p className="mt-2 text-sm text-rose-600">{formError}</p>}

            {modal === 'note' && (
              <div className="mt-4 space-y-3">
                <label className="block text-sm font-medium text-slate-700">Note</label>
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  rows={5}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/25"
                  placeholder="Enter your note…"
                />
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setModal('none')}
                    className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => postComm({ type: 'note', text: noteText })}
                    className="flex-1 rounded-lg bg-[#14B8A6] py-2 text-sm font-semibold text-white hover:bg-[#13a89a] disabled:opacity-50"
                  >
                    Save note
                  </button>
                </div>
              </div>
            )}

            {modal === 'email' && (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700">To</label>
                  <input
                    value={emailTo}
                    onChange={(e) => setEmailTo(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/25"
                    placeholder={customerEmail || 'email@example.com'}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Subject</label>
                  <input
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/25"
                    placeholder={`${customerName || 'Customer'}, your quotation…`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Message</label>
                  <textarea
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    rows={5}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/25"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Attachment name (reference)</label>
                  <input
                    value={emailAttachment}
                    onChange={(e) => setEmailAttachment(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/25"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Delivery status</label>
                  <select
                    value={emailStatus}
                    onChange={(e) => setEmailStatus(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/25"
                  >
                    <option value="sent">Sent</option>
                    <option value="delivered">Delivered</option>
                    <option value="clicked">Clicked</option>
                  </select>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setModal('none')}
                    className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() =>
                      postComm({
                        type: 'email',
                        subject: emailSubject,
                        body: emailBody,
                        to_email: emailTo,
                        attachment_name: emailAttachment,
                        email_status: emailStatus,
                      })
                    }
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#14B8A6] py-2 text-sm font-semibold text-white hover:bg-[#13a89a] disabled:opacity-50"
                  >
                    <Send className="size-4" />
                    Log email
                  </button>
                </div>
              </div>
            )}

            {modal === 'sms' && (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700">To (phone)</label>
                  <input
                    value={smsTo}
                    onChange={(e) => setSmsTo(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/25"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Message</label>
                  <textarea
                    value={smsBody}
                    onChange={(e) => setSmsBody(e.target.value)}
                    rows={4}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/25"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setModal('none')}
                    className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => postComm({ type: 'sms', body: smsBody, to_phone: smsTo })}
                    className="flex-1 rounded-lg bg-[#14B8A6] py-2 text-sm font-semibold text-white hover:bg-[#13a89a] disabled:opacity-50"
                  >
                    Log SMS
                  </button>
                </div>
              </div>
            )}

            {modal === 'phone' && (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Summary</label>
                  <textarea
                    value={phoneSummary}
                    onChange={(e) => setPhoneSummary(e.target.value)}
                    rows={4}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/25"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Duration (minutes, optional)</label>
                  <input
                    type="number"
                    min={0}
                    value={phoneDuration}
                    onChange={(e) => setPhoneDuration(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/25"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setModal('none')}
                    className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() =>
                      postComm({
                        type: 'phone',
                        summary: phoneSummary,
                        duration_minutes: phoneDuration ? parseInt(phoneDuration, 10) : undefined,
                      })
                    }
                    className="flex-1 rounded-lg bg-[#14B8A6] py-2 text-sm font-semibold text-white hover:bg-[#13a89a] disabled:opacity-50"
                  >
                    Save call
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
