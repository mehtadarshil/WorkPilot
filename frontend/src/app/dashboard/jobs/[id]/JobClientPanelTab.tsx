'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, ExternalLink, Send } from 'lucide-react';
import { getJson, postJson, getBlob } from '../../../apiClient';

interface ClientSubmission {
  id: number;
  pdf_public_token: string;
  created_at: string;
  submitter_name: string | null;
  submitter_email: string | null;
}

interface DiaryEventRow {
  id: number;
  start_time: string;
  status: string;
  officer_full_name: string | null;
}

type ReportAnswer = {
  question_id: number;
  prompt: string;
  question_type: string;
  has_value: boolean;
};

type ExtraMediaItem = {
  extra_submission_id: number;
  stored_filename: string;
  original_filename: string;
  content_type: string;
  kind: string;
  submission_notes: string | null;
};

type ShareOptionsPayload = {
  diary_event_id: number;
  report_answers: ReportAnswer[];
  extra_media: ExtraMediaItem[];
};

function extraKey(m: Pick<ExtraMediaItem, 'extra_submission_id' | 'stored_filename'>): string {
  return `${m.extra_submission_id}\t${m.stored_filename}`;
}

type Props = {
  jobId: string;
  token: string;
  onJobRefresh: () => void;
};

export default function JobClientPanelTab({ jobId, token, onJobRefresh }: Props) {
  const [subs, setSubs] = useState<ClientSubmission[]>([]);
  const [diaryEvents, setDiaryEvents] = useState<DiaryEventRow[]>([]);
  const [diaryEventId, setDiaryEventId] = useState<number | null>(null);
  const [options, setOptions] = useState<ShareOptionsPayload | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [selectedQuestions, setSelectedQuestions] = useState<Set<number>>(() => new Set());
  const [selectedExtra, setSelectedExtra] = useState<Set<string>>(() => new Set());
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [appOrigin, setAppOrigin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastReportUrl, setLastReportUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  /** Which submission row last had its report URL copied (for “Copied” label). */
  const [copiedSubId, setCopiedSubId] = useState<number | null>(null);
  const [notifyOffice, setNotifyOffice] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') setAppOrigin(window.location.origin);
  }, []);

  const loadSubs = useCallback(async () => {
    try {
      const r = await getJson<{ submissions: ClientSubmission[] }>(`/jobs/${jobId}/client-submissions`, token);
      setSubs(r.submissions || []);
    } catch {
      setSubs([]);
    }
  }, [jobId, token]);

  const loadDiary = useCallback(async () => {
    try {
      const r = await getJson<{ events: DiaryEventRow[] }>(`/jobs/${jobId}/diary-events`, token);
      const ev = r.events || [];
      setDiaryEvents(ev);
      const completed = ev.filter((e) => String(e.status || '').trim().toLowerCase() === 'completed');
      setDiaryEventId((cur) => {
        if (cur != null && completed.some((c) => c.id === cur)) return cur;
        if (completed.length === 1) return completed[0].id;
        return null;
      });
    } catch {
      setDiaryEvents([]);
      setDiaryEventId(null);
    }
  }, [jobId, token]);

  useEffect(() => {
    void loadSubs();
    void loadDiary();
  }, [loadSubs, loadDiary]);

  useEffect(() => {
    return () => {
      setPreviewUrls((prev) => {
        for (const u of Object.values(prev)) URL.revokeObjectURL(u);
        return {};
      });
    };
  }, []);

  useEffect(() => {
    if (diaryEventId == null) {
      setOptions(null);
      setSelectedQuestions(new Set());
      setSelectedExtra(new Set());
      return;
    }
    let cancelled = false;
    setOptionsLoading(true);
    setOptionsError(null);
    void (async () => {
      try {
        const o = await getJson<ShareOptionsPayload>(
          `/jobs/${jobId}/diary-events/${diaryEventId}/client-share-options`,
          token,
        );
        if (!cancelled) {
          setOptions(o);
          setSelectedQuestions(new Set());
          setSelectedExtra(new Set());
        }
      } catch (e) {
        if (!cancelled) {
          setOptions(null);
          setOptionsError(e instanceof Error ? e.message : 'Failed to load visit data');
        }
      } finally {
        if (!cancelled) setOptionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId, diaryEventId, token]);

  useEffect(() => {
    if (!options || diaryEventId == null) {
      setPreviewUrls((prev) => {
        for (const u of Object.values(prev)) URL.revokeObjectURL(u);
        return {};
      });
      return;
    }
    let cancelled = false;
    const built: Record<string, string> = {};
    void (async () => {
      for (const m of options.extra_media) {
        if (cancelled) break;
        const k = extraKey(m);
        const path = `/diary-events/${diaryEventId}/extra-submissions/${m.extra_submission_id}/files/${encodeURIComponent(m.stored_filename)}`;
        try {
          const blob = await getBlob(path, token);
          built[k] = URL.createObjectURL(blob);
        } catch {
          /* skip broken preview */
        }
      }
      if (cancelled) {
        for (const u of Object.values(built)) URL.revokeObjectURL(u);
        return;
      }
      setPreviewUrls((prev) => {
        for (const u of Object.values(prev)) URL.revokeObjectURL(u);
        return built;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [options, diaryEventId, token]);

  const completedVisits = useMemo(
    () => diaryEvents.filter((e) => String(e.status || '').trim().toLowerCase() === 'completed'),
    [diaryEvents],
  );

  const visitLabel = (e: DiaryEventRow) => {
    const d = new Date(e.start_time);
    const date = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    return e.officer_full_name ? `${date} · ${e.officer_full_name}` : date;
  };

  const canCreate = useMemo(() => {
    if (diaryEventId == null || !options) return false;
    return selectedQuestions.size > 0 || selectedExtra.size > 0;
  }, [diaryEventId, options, selectedQuestions.size, selectedExtra.size]);

  const toggleQuestion = (qid: number, hasValue: boolean) => {
    if (!hasValue) return;
    setSelectedQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(qid)) next.delete(qid);
      else next.add(qid);
      return next;
    });
  };

  const toggleExtra = (m: ExtraMediaItem) => {
    const k = extraKey(m);
    setSelectedExtra((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const createShare = async () => {
    if (diaryEventId == null || !options) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const extra_media = options.extra_media
        .filter((m) => selectedExtra.has(extraKey(m)))
        .map((m) => ({ extra_submission_id: m.extra_submission_id, stored_filename: m.stored_filename }));
      const res = await postJson<{ report_url: string }>(
        `/jobs/${jobId}/diary-events/${diaryEventId}/client-share`,
        {
          report_question_ids: [...selectedQuestions],
          extra_media,
          notify_office: notifyOffice,
        },
        token,
      );
      setLastReportUrl(res.report_url);
      await loadSubs();
      onJobRefresh();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Could not create link');
    } finally {
      setSubmitting(false);
    }
  };

  const copyLast = async () => {
    if (!lastReportUrl || !navigator.clipboard?.writeText) return;
    await navigator.clipboard.writeText(lastReportUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const reportUrlForToken = (pdfToken: string) => {
    const origin = appOrigin || (typeof window !== 'undefined' ? window.location.origin : '');
    return origin ? `${origin}/public/job-client-report/${pdfToken}` : '';
  };

  const copySubmissionLink = async (submissionId: number, pdfToken: string) => {
    const url = reportUrlForToken(pdfToken);
    if (!url || !navigator.clipboard?.writeText) return;
    await navigator.clipboard.writeText(url);
    setCopiedSubId(submissionId);
    window.setTimeout(() => setCopiedSubId(null), 2000);
  };

  return (
    <div className="space-y-8">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">Share visit report with the customer</h2>
        <p className="mt-1 text-sm text-slate-600">
          Choose a <strong>completed</strong> visit, tick every job report answer and every extra file you want on the
          customer-facing page, then click <strong>Create customer link</strong> once. That creates{' '}
          <strong>one</strong> printable link that includes <strong>all</strong> selected items together (not a link
          per row). The report opens with job and visit details at the top, then your selected answers and media.
        </p>

        {completedVisits.length === 0 ? (
          <p className="mt-4 text-sm text-amber-800">
            This job has no completed visits yet. Complete a visit and submit the job report first.
          </p>
        ) : (
          <>
            <label className="mt-4 block text-xs font-bold uppercase text-slate-500">Visit (diary event)</label>
            <select
              className="mt-1 w-full max-w-md rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-800"
              value={diaryEventId ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                setDiaryEventId(v === '' ? null : parseInt(v, 10));
              }}
            >
              <option value="">Select visit…</option>
              {completedVisits.map((v) => (
                <option key={v.id} value={v.id}>
                  {visitLabel(v)}
                </option>
              ))}
            </select>
          </>
        )}

        {optionsLoading ? <p className="mt-4 text-sm text-slate-500">Loading visit report…</p> : null}
        {optionsError ? <p className="mt-4 text-sm text-rose-600">{optionsError}</p> : null}

        {options && diaryEventId != null ? (
          <div className="mt-6 space-y-6">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Job report answers</h3>
              <p className="mt-0.5 text-xs text-slate-500">Only rows with data can be selected.</p>
              {options.report_answers.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">No answers for this visit.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {options.report_answers.map((a) => (
                    <li key={a.question_id}>
                      <label
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border border-slate-100 px-3 py-2 ${
                          a.has_value ? 'hover:bg-slate-50' : 'cursor-not-allowed opacity-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={selectedQuestions.has(a.question_id)}
                          disabled={!a.has_value}
                          onChange={() => toggleQuestion(a.question_id, a.has_value)}
                        />
                        <span className="text-sm font-medium text-slate-800">{a.prompt}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="text-sm font-bold text-slate-900">Extra photos & videos</h3>
              <p className="mt-0.5 text-xs text-slate-500">From diary extra submissions for this visit.</p>
              {options.extra_media.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">No extra files.</p>
              ) : (
                <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {options.extra_media.map((m) => {
                    const k = extraKey(m);
                    const checked = selectedExtra.has(k);
                    const src = previewUrls[k];
                    return (
                      <li key={k}>
                        <label className="block cursor-pointer overflow-hidden rounded-lg border border-slate-200 bg-slate-50 shadow-sm hover:ring-2 hover:ring-[#14B8A6]/40">
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={checked}
                            onChange={() => toggleExtra(m)}
                          />
                          <div className={`relative aspect-square bg-black/5 ${checked ? 'ring-2 ring-[#14B8A6]' : ''}`}>
                            {src ? (
                              m.kind === 'video' ? (
                                <video src={src} className="size-full object-cover" muted playsInline preload="metadata" />
                              ) : (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={src} alt="" className="size-full object-cover" />
                              )
                            ) : (
                              <div className="flex size-full items-center justify-center text-[10px] text-slate-400">
                                …
                              </div>
                            )}
                            {checked ? (
                              <span className="absolute right-1 top-1 rounded bg-[#14B8A6] px-1.5 py-0.5 text-[10px] font-bold text-white">
                                On
                              </span>
                            ) : null}
                          </div>
                          <p
                            className="truncate px-2 py-1.5 text-[11px] font-medium text-slate-700"
                            title={m.original_filename}
                          >
                            {m.original_filename}
                          </p>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={notifyOffice} onChange={(e) => setNotifyOffice(e.target.checked)} />
              Email job owner when email is configured (same notification as before)
            </label>

            {submitError ? <p className="text-sm text-rose-600">{submitError}</p> : null}

            <button
              type="button"
              disabled={!canCreate || submitting}
              onClick={() => void createShare()}
              className="inline-flex items-center gap-2 rounded-lg bg-[#14B8A6] px-5 py-2.5 text-sm font-bold text-white shadow hover:bg-[#13a89a] disabled:opacity-50"
            >
              <Send className="size-4" />
              {submitting ? 'Creating…' : 'Create single customer link'}
            </button>

            {lastReportUrl ? (
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-4">
                <p className="text-xs font-bold uppercase text-emerald-800">Latest link (copy and send)</p>
                <p className="mt-1 break-all font-mono text-xs text-slate-800">{lastReportUrl}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void copyLast()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700"
                  >
                    <Copy className="size-3.5" />
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  <a
                    href={lastReportUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700"
                  >
                    <ExternalLink className="size-3.5" />
                    Open
                  </a>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">Shared reports for this job</h2>
        {subs.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            None yet. Each time you create a link, one combined report is stored here (same selections, one URL).
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {subs.map((s) => {
              const href = reportUrlForToken(s.pdf_public_token) || '#';
              return (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span className="text-slate-600">
                    {new Date(s.created_at).toLocaleString()}
                    {s.submitter_name ? ` · ${s.submitter_name}` : ''}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={!href || href === '#'}
                      onClick={() => void copySubmissionLink(s.id, s.pdf_public_token)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <Copy className="size-3.5" />
                      {copiedSubId === s.id ? 'Copied' : 'Copy link'}
                    </button>
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-[#14B8A6] hover:bg-teal-50"
                    >
                      <ExternalLink className="size-3.5" />
                      View / print
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
