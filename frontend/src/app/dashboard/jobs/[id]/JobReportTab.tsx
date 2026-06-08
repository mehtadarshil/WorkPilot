'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { getJson } from '../../../apiClient';
import { format } from 'date-fns';
import { ClipboardCheck, FileImage, FileVideo, Paperclip, User, Calendar } from 'lucide-react';

interface ReportAnswer {
  question_id: number;
  prompt: string;
  question_type: string;
  value: string;
  helper_text: string | null;
}

interface ExtraMedia {
  original_filename: string;
  content_type: string;
  kind: string;
  byte_size: number;
  file_path: string;
}

interface ExtraSubmission {
  id: number;
  notes: string | null;
  created_at: string;
  created_by_name: string | null;
  display_name: string | null;
  media: ExtraMedia[];
}

interface Submission {
  diary_event_id: number;
  start_time: string;
  officer_full_name: string | null;
  answers: ReportAnswer[];
  extra_submissions: ExtraSubmission[];
}

const DEFAULT_API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '/api';
function fileUrlFromApiPath(filePath: string) {
  const base = DEFAULT_API_BASE.replace(/\/$/, '');
  return `${base}${filePath.startsWith('/') ? filePath : `/${filePath}`}`;
}

function AuthenticatedFilePreview({ filePath, contentType, kind, token }: { filePath: string; contentType: string; kind: string; token: string | null }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const lastBlobRef = useRef<string | null>(null);

  useEffect(() => {
    if (!token) return;
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
  if (kind === 'video' || contentType.startsWith('video/')) {
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

function renderAnswer(q: { question_type: string; prompt: string }, raw: string | undefined): ReactNode {
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

interface Props {
  jobId: string;
  token: string;
}

export default function JobReportTab({ jobId, token }: Props) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getJson<{ submissions: Submission[] }>(`/jobs/${jobId}/job-report-history`, token);
      setSubmissions(res.submissions || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load job reports');
    } finally {
      setLoading(false);
    }
  }, [jobId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="p-8 text-slate-500 text-sm font-medium">Loading submitted job reports…</div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      </div>
    );
  }

  if (submissions.length === 0) {
    return (
      <div className="p-12 flex flex-col items-center justify-center text-center">
        <div className="bg-slate-50 p-6 rounded-full border border-slate-100 mb-4 ring-8 ring-slate-50/50">
          <ClipboardCheck className="size-10 text-slate-300 stroke-[1.5]" />
        </div>
        <p className="text-[15px] font-black text-slate-400 italic tracking-tight uppercase">
          No submitted job reports yet
        </p>
        <p className="text-sm text-slate-400 mt-2">
          Reports appear here once a diary visit is marked complete and the engineer submits their job report.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <ClipboardCheck className="size-5 text-[#14B8A6]" />
        <h2 className="text-lg font-bold text-slate-900">Submitted Job Reports</h2>
        <span className="ml-auto text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
          {submissions.length} visit{submissions.length !== 1 ? 's' : ''}
        </span>
      </div>

      {submissions.map((sub) => (
        <div
          key={sub.diary_event_id}
          className="bg-white rounded-xl border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden"
        >
          {/* Visit header */}
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="size-4 text-slate-400" />
              <span className="font-bold text-slate-700">
                {format(new Date(sub.start_time), 'EEEE do MMMM yyyy')}
              </span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-600">{format(new Date(sub.start_time), 'HH:mm')}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <User className="size-4 text-slate-400" />
              <span className="font-semibold text-slate-600">
                {sub.officer_full_name || 'Unknown officer'}
              </span>
            </div>
          </div>

          {/* Answers */}
          {sub.answers.length > 0 && (
            <div className="px-6 py-4 space-y-4">
              {sub.answers.map((ans, idx) => (
                <div key={`${ans.question_id}-${idx}`} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                      {ans.prompt}
                    </span>
                    {ans.helper_text && (
                      <span className="text-[11px] text-slate-400">({ans.helper_text})</span>
                    )}
                  </div>
                  <div className="pl-0">{renderAnswer(ans, ans.value)}</div>
                </div>
              ))}
            </div>
          )}

          {/* Extra submissions */}
          {sub.extra_submissions.length > 0 && (
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/30">
              <h4 className="text-xs font-black uppercase tracking-wide text-slate-500 mb-3 flex items-center gap-1.5">
                <Paperclip className="size-3.5" />
                Extra submissions
              </h4>
              <div className="space-y-4">
                {sub.extra_submissions.map((extra) => (
                  <div key={extra.id} className="bg-white rounded-lg border border-slate-200 p-3 space-y-2">
                    {extra.notes && (
                      <p className="text-sm text-slate-700 whitespace-pre-wrap">{extra.notes}</p>
                    )}
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span className="font-medium">
                        {extra.display_name || extra.created_by_name || 'Unknown'}
                      </span>
                      <span>·</span>
                      <span>{format(new Date(extra.created_at), 'dd MMM yyyy HH:mm')}</span>
                    </div>
                    {extra.media.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {extra.media.map((m, mIdx) => (
                          <div key={mIdx} className="space-y-1">
                            {m.kind === 'video' || m.content_type.startsWith('video/') ? (
                              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                                <FileVideo className="size-4 text-slate-400" />
                                <span className="truncate max-w-[200px]">{m.original_filename}</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                                <FileImage className="size-4 text-slate-400" />
                                <span className="truncate max-w-[200px]">{m.original_filename}</span>
                              </div>
                            )}
                            <AuthenticatedFilePreview
                              filePath={m.file_path}
                              contentType={m.content_type}
                              kind={m.kind}
                              token={token}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
