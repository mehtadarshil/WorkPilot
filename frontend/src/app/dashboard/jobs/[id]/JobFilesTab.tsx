'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getJson, getBlob } from '../../../apiClient';
import {
  AlertCircle,
  Download,
  Eye,
  FileText,
  Image as ImageIcon,
  RefreshCw,
  Video,
  FileType,
  Mail,
  Loader2,
} from 'lucide-react';
import dayjs from 'dayjs';
import JobEmailComposer, { type JobEmailPresetAttachment } from './JobEmailComposer';
import {
  type JobManifestFile,
  type JobFilesManifestResponse,
  browserPublicUrl,
  canAttachJobFileToEmail,
  jobManifestFileToEmailAttachment,
  MAX_EMAIL_ATTACH_TOTAL_BYTES,
} from '../../_components/emailComposerManifest';

function formatBytes(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function FileKindIcon({ kind }: { kind: JobManifestFile['kind'] }) {
  if (kind === 'video') return <Video className="size-4 text-violet-600" />;
  if (kind === 'pdf') return <FileType className="size-4 text-rose-600" />;
  if (kind === 'image' || kind === 'signature') return <ImageIcon className="size-4 text-sky-600" />;
  return <FileText className="size-4 text-[#14B8A6]" />;
}

interface Props {
  jobId: string;
  token: string | null;
}

export default function JobFilesTab({ jobId, token }: Props) {
  const [files, setFiles] = useState<JobManifestFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewKind, setPreviewKind] = useState<'image' | 'video' | 'pdf' | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailSession, setEmailSession] = useState(0);
  const [emailInitialAttachments, setEmailInitialAttachments] = useState<JobEmailPresetAttachment[]>([]);
  const [preparingEmail, setPreparingEmail] = useState(false);

  const attachableFiles = useMemo(() => files.filter(canAttachJobFileToEmail), [files]);

  const fetchManifest = useCallback(async () => {
    if (!token || !jobId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getJson<JobFilesManifestResponse>(`/jobs/${jobId}/files`, token);
      setFiles(res.files || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load files');
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [token, jobId]);

  useEffect(() => {
    void fetchManifest();
  }, [fetchManifest]);

  useEffect(() => {
    const valid = new Set(files.map((f) => f.id));
    setSelectedIds((prev) => prev.filter((id) => valid.has(id)));
  }, [files]);

  const selectAllAttachable = useCallback(() => {
    setSelectedIds(attachableFiles.map((f) => f.id));
  }, [attachableFiles]);

  const clearSelection = useCallback(() => setSelectedIds([]), []);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const openEmailComposer = useCallback(async () => {
    if (!token) return;
    setError(null);
    const selectedRows = files.filter((f) => selectedIds.includes(f.id));
    if (selectedRows.length === 0) {
      setEmailInitialAttachments([]);
      setEmailSession((s) => s + 1);
      setEmailOpen(true);
      return;
    }
    setPreparingEmail(true);
    try {
      let running = 0;
      const out: JobEmailPresetAttachment[] = [];
      for (const row of selectedRows) {
        const att = await jobManifestFileToEmailAttachment(row, token);
        running += Math.floor(att.content_base64.length * 0.75);
        if (running > MAX_EMAIL_ATTACH_TOTAL_BYTES) {
          throw new Error(
            `Combined attachments exceed ${MAX_EMAIL_ATTACH_TOTAL_BYTES / (1024 * 1024)} MB. Select fewer files or send in separate emails.`,
          );
        }
        out.push(att);
      }
      setEmailInitialAttachments(out);
      setEmailSession((s) => s + 1);
      setEmailOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not prepare attachments');
    } finally {
      setPreparingEmail(false);
    }
  }, [token, files, selectedIds]);

  const closePreview = useCallback(() => {
    if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewKind(null);
  }, [previewUrl]);

  const openPreview = useCallback(
    async (f: JobManifestFile) => {
      if (!token) return;
      setError(null);
      try {
        if (f.too_large_for_inline || (f.access === 'inline' && !f.href)) {
          setError('This file is too large to preview here. Open the visit job report or download if available.');
          return;
        }
        if (f.access === 'inline' && f.href.startsWith('data:')) {
          if (f.kind === 'video') {
            setPreviewKind('video');
            setPreviewUrl(f.href);
          } else if (f.kind === 'pdf') {
            setPreviewKind('pdf');
            setPreviewUrl(f.href);
          } else {
            setPreviewKind('image');
            setPreviewUrl(f.href);
          }
          return;
        }
        if (f.access === 'public') {
          const u = browserPublicUrl(f.href);
          if (f.kind === 'video') {
            setPreviewKind('video');
            setPreviewUrl(u);
          } else if (f.kind === 'pdf') {
            window.open(u, '_blank', 'noopener,noreferrer');
            return;
          } else {
            setPreviewKind('image');
            setPreviewUrl(u);
          }
          return;
        }
        if (f.access === 'bearer') {
          const blob = f.href.startsWith('http')
            ? await fetch(f.href, { headers: { Authorization: `Bearer ${token}` } }).then((r) => {
                if (!r.ok) throw new Error('Download failed');
                return r.blob();
              })
            : await getBlob(f.href, token);
          const url = URL.createObjectURL(blob);
          if (f.kind === 'video') {
            setPreviewKind('video');
            setPreviewUrl(url);
          } else if (f.kind === 'pdf') {
            setPreviewKind('pdf');
            setPreviewUrl(url);
          } else {
            setPreviewKind('image');
            setPreviewUrl(url);
          }
          return;
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Preview failed');
      }
    },
    [token],
  );

  const downloadFile = useCallback(
    async (f: JobManifestFile) => {
      if (!token) return;
      setError(null);
      try {
        if (f.access === 'inline' && f.href.startsWith('data:')) {
          const res = await fetch(f.href);
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = f.label.replace(/[/\\]/g, '_') || 'download';
          a.rel = 'noopener';
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
          return;
        }
        if (f.access === 'public') {
          const u = browserPublicUrl(f.href);
          window.open(u, '_blank', 'noopener,noreferrer');
          return;
        }
        if (f.access === 'bearer') {
          const blob = f.href.startsWith('http')
            ? await fetch(f.href, { headers: { Authorization: `Bearer ${token}` } }).then((r) => {
                if (!r.ok) throw new Error('Download failed');
                return r.blob();
              })
            : await getBlob(f.href, token);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = f.label.replace(/[/\\]/g, '_') || 'download';
          a.rel = 'noopener';
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
          return;
        }
        setError('This file cannot be downloaded from this list.');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Download failed');
      }
    },
    [token],
  );

  const canPreview = useCallback((f: JobManifestFile) => {
    if (f.too_large_for_inline) return false;
    if (f.access === 'inline' && f.href) return f.kind === 'image' || f.kind === 'signature' || f.kind === 'video' || f.kind === 'pdf';
    if (f.access === 'public') return f.kind === 'image' || f.kind === 'video' || f.kind === 'pdf';
    if (f.access === 'bearer') return f.kind === 'image' || f.kind === 'video' || f.kind === 'pdf';
    return false;
  }, []);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div>
          <h2 className="text-base font-black tracking-tight text-slate-800">All job files</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Photos, videos, PDFs, and documents from this job: visits, job reports, client packs, customer files,
            invoices, and quotations linked to this job. Select rows and use <strong>Compose email</strong> to attach
            them (files that are too large for the list cannot be selected).
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={selectAllAttachable}
            disabled={loading || !token || attachableFiles.length === 0}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={clearSelection}
            disabled={selectedIds.length === 0}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Clear
          </button>
          {selectedIds.length > 0 ? (
            <span className="text-xs font-semibold text-slate-500">{selectedIds.length} selected</span>
          ) : null}
          <button
            type="button"
            onClick={() => void openEmailComposer()}
            disabled={loading || !token || preparingEmail}
            className="inline-flex items-center gap-2 rounded-lg border border-[#14B8A6]/40 bg-[#14B8A6]/10 px-3 py-2 text-xs font-bold text-teal-900 hover:bg-[#14B8A6]/15 disabled:opacity-50"
          >
            {preparingEmail ? <Loader2 className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />}
            Compose email
          </button>
          <button
            type="button"
            onClick={() => void fetchManifest()}
            disabled={loading || !token}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm font-medium text-slate-500">
          Loading files…
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-4 py-3">
            <span className="text-sm font-semibold text-slate-900">Files & media</span>
            <span className="rounded-full bg-[#14B8A6]/10 px-2.5 py-0.5 text-xs font-semibold text-[#14B8A6]">
              {files.length} item{files.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="w-12 px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide">
                    <span className="sr-only">Attach</span>
                  </th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">Name</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">Source</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">Type</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">Size</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">Date</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {files.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                      No files linked to this job yet.
                    </td>
                  </tr>
                ) : (
                  files.map((f) => (
                    <tr key={f.id} className="hover:bg-slate-50/50">
                      <td className="px-3 py-3 text-center align-middle">
                        <input
                          type="checkbox"
                          className="size-4 rounded border-slate-300 text-[#14B8A6] focus:ring-[#14B8A6]"
                          checked={selectedIds.includes(f.id)}
                          disabled={!canAttachJobFileToEmail(f)}
                          title={
                            !canAttachJobFileToEmail(f)
                              ? 'This file cannot be loaded for attachment (too large or unavailable in this list).'
                              : 'Include in email attachments'
                          }
                          onChange={() => toggleSelected(f.id)}
                          aria-label={`Attach ${f.label}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <FileKindIcon kind={f.kind} />
                          <span className="font-medium text-slate-900">{f.label}</span>
                        </div>
                        {f.content_type ? <p className="mt-0.5 pl-6 text-xs text-slate-400">{f.content_type}</p> : null}
                        {f.too_large_for_inline ? (
                          <p className="mt-1 pl-6 text-xs text-amber-700">Too large for inline preview in this list.</p>
                        ) : null}
                      </td>
                      <td className="max-w-[200px] px-4 py-3">
                        <div className="text-xs font-semibold text-slate-800">{f.source}</div>
                        <div className="truncate text-xs text-slate-500" title={f.source_detail}>
                          {f.source_detail}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs capitalize text-slate-600">{f.kind}</td>
                      <td className="px-4 py-3 text-slate-600">{formatBytes(f.byte_size)}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {f.created_at ? dayjs(f.created_at).format('D MMM YYYY, h:mm a') : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canPreview(f) ? (
                          <button
                            type="button"
                            onClick={() => void openPreview(f)}
                            className="inline-flex items-center gap-1 font-semibold text-slate-700 hover:underline"
                          >
                            <Eye className="size-3.5" />
                            Preview
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void downloadFile(f)}
                          className={`inline-flex items-center gap-1 font-semibold text-[#14B8A6] hover:underline ${canPreview(f) ? 'ml-4' : ''}`}
                        >
                          <Download className="size-3.5" />
                          Open / save
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <JobEmailComposer
        key={emailSession}
        open={emailOpen}
        onClose={() => setEmailOpen(false)}
        jobId={jobId}
        onSent={() => {}}
        initialAttachments={emailInitialAttachments}
      />

      {previewUrl && previewKind ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="File preview"
        >
          <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={closePreview} />
          <div className="relative z-10 max-h-[90vh] max-w-[min(96vw,900px)] overflow-auto rounded-xl bg-white p-4 shadow-xl">
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={closePreview}
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200"
              >
                Close
              </button>
            </div>
            {previewKind === 'image' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Preview" className="max-h-[80vh] w-auto max-w-full object-contain" />
            ) : previewKind === 'video' ? (
              <video src={previewUrl} controls className="max-h-[80vh] w-full max-w-full" playsInline />
            ) : (
              <iframe title="PDF preview" src={previewUrl} className="h-[80vh] w-full min-w-[320px] border-0" />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
