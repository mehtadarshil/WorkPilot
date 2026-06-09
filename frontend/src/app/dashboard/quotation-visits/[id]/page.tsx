'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  User,
  MapPin,
  Calendar,
  Clock,
  FileText,
  Briefcase,
  Plus,
  Loader2,
} from 'lucide-react';
import { getJson, postJson } from '../../../apiClient';

interface DiaryEvent {
  diary_id: number;
  officer_full_name: string | null;
  start_time: string;
  duration_minutes: number | null;
  event_status: string;
  notes: string | null;
  extra_submissions: { id: number; notes: string | null; created_at: string; created_by_name: string | null }[];
  technical_notes: { id: number; notes: string; created_at: string; created_by_name: string | null }[];
  timesheet_entries: { officer_full_name: string | null; segment_type: string | null; duration_seconds: number; clock_in: string; clock_out: string | null }[];
  timesheet_total_seconds: number;
}

interface VisitDetail {
  visit: {
    id: number;
    title: string;
    description: string | null;
    state: string;
    location: string | null;
    customer_id: number | null;
    customer_full_name: string | null;
    officer_full_name: string | null;
    officers: { id: number; full_name: string; is_primary: boolean }[];
    created_at: string;
  };
  diary_events: DiaryEvent[];
  quotation: {
    id: number;
    quotation_number: string;
    state: string;
    diary_event_id: number | null;
    total_amount: number;
    currency: string;
  } | null;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatStatus(raw: string): string {
  if (!raw || raw === 'No status') return 'Scheduled';
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function isVisitReadyForQuotation(status: string): boolean {
  const s = status.toLowerCase();
  return s === 'completed' || s === 'arrived_at_site' || s === 'arrived' || s === 'on_site';
}

export default function QuotationVisitDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  const [data, setData] = useState<VisitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creatingQuote, setCreatingQuote] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getJson<VisitDetail>(`/quotation-visits/${id}`, token);
      setData(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load visit');
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useEffect(() => {
    void fetchDetail();
  }, [fetchDetail]);

  const handleCreateQuotation = async () => {
    if (!token || !data) return;
    const readyEvent = data.diary_events.find((e) => isVisitReadyForQuotation(e.event_status));
    if (!readyEvent) {
      setActionError('Officer must arrive at site or complete the visit before creating a quotation.');
      return;
    }
    setCreatingQuote(true);
    setActionError(null);
    try {
      const noteTexts = [
        ...readyEvent.technical_notes.map((n) => n.notes),
        ...readyEvent.extra_submissions.map((s) => s.notes).filter(Boolean) as string[],
        readyEvent.notes,
      ].filter(Boolean);
      const combinedNotes = noteTexts.join('\n\n');
      const res = await postJson<{ quotation: { id: number } }>(
        `/diary-events/${readyEvent.diary_id}/create-quotation`,
        { notes: combinedNotes || undefined, description: data.visit.title },
        token,
      );
      router.push(`/dashboard/quotations/${res.quotation.id}/edit`);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Failed to create quotation');
    } finally {
      setCreatingQuote(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-[#14B8A6]" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-slate-500">{error ?? 'Visit not found'}</p>
        <Link href="/dashboard/quotation-visits" className="text-sm font-semibold text-[#14B8A6] hover:underline">
          Back to visits
        </Link>
      </div>
    );
  }

  const { visit, diary_events: diaryEvents, quotation } = data;
  const canCreateQuotation = !quotation && diaryEvents.some((e) => isVisitReadyForQuotation(e.event_status));
  const canSetupWorkJob = quotation?.state === 'accepted';

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 md:px-6">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => router.back()} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100">
            <ArrowLeft className="size-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">Quotation Visit</span>
              <h1 className="text-lg font-bold text-slate-900">{visit.title}</h1>
            </div>
            <p className="text-xs text-slate-500">Visit #{visit.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canCreateQuotation && (
            <button
              type="button"
              onClick={handleCreateQuotation}
              disabled={creatingQuote}
              className="inline-flex items-center gap-2 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
            >
              {creatingQuote ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Create quotation
            </button>
          )}
          {quotation && (
            <Link
              href={`/dashboard/quotations/${quotation.id}`}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <FileText className="size-4" />
              {quotation.quotation_number}
            </Link>
          )}
          {canSetupWorkJob && visit.customer_id && (
            <Link
              href={`/dashboard/customers/${visit.customer_id}/jobs/new?edit=${visit.id}&from_quotation=${quotation!.id}&convert_visit=1`}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100"
            >
              <Briefcase className="size-4" />
              Set up work job
            </Link>
          )}
        </div>
      </header>

      {actionError && (
        <div className="mx-6 mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{actionError}</div>
      )}

      <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                <User className="size-3.5" /> Customer
              </div>
              {visit.customer_id ? (
                <Link href={`/dashboard/customers/${visit.customer_id}`} className="font-semibold text-[#14B8A6] hover:underline">
                  {visit.customer_full_name}
                </Link>
              ) : (
                <span className="text-slate-700">—</span>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                <User className="size-3.5" /> Officer
              </div>
              <p className="font-semibold text-slate-900">
                {visit.officers.length > 0
                  ? visit.officers.map((o) => o.full_name).join(', ')
                  : visit.officer_full_name ?? '—'}
              </p>
            </div>
            {visit.location && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <MapPin className="size-3.5" /> Site
                </div>
                <p className="text-sm text-slate-700">{visit.location}</p>
              </div>
            )}
          </div>

          {diaryEvents.map((ev) => (
            <div key={ev.diary_id} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <Calendar className="size-4 text-slate-400" />
                    {formatDateTime(ev.start_time)}
                    {ev.duration_minutes && (
                      <span className="font-normal text-slate-500">· {ev.duration_minutes} min</span>
                    )}
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                    {formatStatus(ev.event_status)}
                  </span>
                </div>
                {ev.notes && <p className="mt-2 text-sm text-slate-600">{ev.notes}</p>}
              </div>

              <div className="divide-y divide-slate-100">
                {ev.timesheet_entries.length > 0 && (
                  <div className="px-5 py-4">
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800">
                      <Clock className="size-4 text-slate-400" />
                      Timesheet ({formatDuration(ev.timesheet_total_seconds)})
                    </h3>
                    <div className="space-y-2">
                      {ev.timesheet_entries.map((te, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
                          <span className="font-medium">{te.officer_full_name ?? 'Officer'}</span>
                          <span className="capitalize">{te.segment_type?.replace(/_/g, ' ') ?? 'time'}</span>
                          <span>{formatDuration(te.duration_seconds)}</span>
                          <span className="text-xs text-slate-400">
                            {formatDateTime(te.clock_in)}
                            {te.clock_out ? ` → ${formatDateTime(te.clock_out)}` : ' (open)'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="px-5 py-4">
                  <h3 className="mb-3 text-sm font-bold text-slate-800">Officer site notes</h3>
                  {ev.technical_notes.length === 0 && ev.extra_submissions.length === 0 ? (
                    <p className="text-sm text-slate-400 italic">No site notes yet. Officer can add notes from the mobile app during the visit.</p>
                  ) : (
                    <div className="space-y-4">
                      {ev.technical_notes.map((n) => (
                        <div key={n.id} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                          <p className="whitespace-pre-wrap text-sm text-slate-800">{n.notes}</p>
                          <p className="mt-2 text-xs text-slate-400">
                            {n.created_by_name ?? 'Officer'} · {formatDateTime(n.created_at)}
                          </p>
                        </div>
                      ))}
                      {ev.extra_submissions.map((s) => (
                        <div key={s.id} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                          {s.notes && <p className="whitespace-pre-wrap text-sm text-slate-800">{s.notes}</p>}
                          <p className="mt-2 text-xs text-slate-400">
                            {s.created_by_name ?? 'Officer'} · {formatDateTime(s.created_at)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {quotation && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5">
              <h3 className="font-bold text-emerald-950">Linked quotation</h3>
              <p className="mt-1 text-sm text-emerald-900">
                {quotation.quotation_number} — {quotation.state}
                {quotation.state === 'accepted' && ' · Ready to set up as work job'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
