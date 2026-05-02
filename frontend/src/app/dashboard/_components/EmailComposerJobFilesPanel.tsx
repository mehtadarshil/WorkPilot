'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getJson } from '../../apiClient';
import { FileText, FileType, FolderOpen, Image as ImageIcon, Loader2, Video } from 'lucide-react';
import {
  type JobManifestFile,
  type JobFilesManifestResponse,
  type ComposerPresetAttachment,
  canAttachJobFileToEmail,
  jobManifestFileToEmailAttachment,
  MAX_EMAIL_ATTACH_TOTAL_BYTES,
  approxBytesFromBase64,
} from './emailComposerManifest';

function FileKindIcon({ kind }: { kind: JobManifestFile['kind'] }) {
  if (kind === 'video') return <Video className="size-3.5 text-violet-600" />;
  if (kind === 'pdf') return <FileType className="size-3.5 text-rose-600" />;
  if (kind === 'image' || kind === 'signature') return <ImageIcon className="size-3.5 text-sky-600" />;
  return <FileText className="size-3.5 text-[#14B8A6]" />;
}

function formatBytes(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

type Props = {
  jobId: string | null | undefined;
  token: string | null;
  /** When false, clears in-memory manifest cache when composer closes */
  active: boolean;
  /** Approximate bytes already in composer presets + chosen files (parent updates each render) */
  existingPresetBytesApprox: number;
  onAddAttachments: (items: ComposerPresetAttachment[]) => void;
  onPrepareError: (message: string | null) => void;
};

export default function EmailComposerJobFilesPanel({
  jobId,
  token,
  active,
  existingPresetBytesApprox,
  onAddAttachments,
  onPrepareError,
}: Props) {
  const [open, setOpen] = useState(false);
  const [manifest, setManifest] = useState<JobManifestFile[]>([]);
  const [loadingManifest, setLoadingManifest] = useState(false);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const loadedForJobRef = useRef<string | null>(null);

  const jid = jobId?.trim() || null;

  useEffect(() => {
    if (!active) {
      loadedForJobRef.current = null;
      setManifest([]);
      setSelectedIds([]);
      setManifestError(null);
      setOpen(false);
    }
  }, [active]);

  useEffect(() => {
    loadedForJobRef.current = null;
    setManifest([]);
    setSelectedIds([]);
    setManifestError(null);
  }, [jid]);

  const attachable = useMemo(() => manifest.filter(canAttachJobFileToEmail), [manifest]);

  const loadManifest = useCallback(async () => {
    if (!token || !jid) return;
    if (loadedForJobRef.current === jid) return;
    setLoadingManifest(true);
    setManifestError(null);
    try {
      const res = await getJson<JobFilesManifestResponse>(`/jobs/${jid}/files`, token);
      setManifest(res.files || []);
      loadedForJobRef.current = jid;
      setSelectedIds([]);
    } catch (e) {
      setManifestError(e instanceof Error ? e.message : 'Failed to load job files');
      setManifest([]);
    } finally {
      setLoadingManifest(false);
    }
  }, [token, jid]);

  useEffect(() => {
    if (active && open && jid && token) {
      void loadManifest();
    }
  }, [active, open, jid, token, loadManifest]);

  const toggleId = useCallback((id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const selectAllAttachable = useCallback(() => {
    setSelectedIds(attachable.map((f) => f.id));
  }, [attachable]);

  const clearSelection = useCallback(() => setSelectedIds([]), []);

  const addSelected = useCallback(async () => {
    if (!token || !jid || selectedIds.length === 0) return;
    setAdding(true);
    onPrepareError(null);
    try {
      const rows = manifest.filter((f) => selectedIds.includes(f.id));
      let running = existingPresetBytesApprox;
      const out: ComposerPresetAttachment[] = [];
      for (const row of rows) {
        const att = await jobManifestFileToEmailAttachment(row, token);
        const add = approxBytesFromBase64(att.content_base64);
        if (running + add > MAX_EMAIL_ATTACH_TOTAL_BYTES) {
          onPrepareError(
            `Total attachments would exceed ${MAX_EMAIL_ATTACH_TOTAL_BYTES / (1024 * 1024)} MB. Remove some attachments or send fewer job files.`,
          );
          return;
        }
        running += add;
        out.push(att);
      }
      onAddAttachments(out);
      clearSelection();
      onPrepareError(null);
    } catch (e) {
      onPrepareError(e instanceof Error ? e.message : 'Could not add attachments');
    } finally {
      setAdding(false);
    }
  }, [
    token,
    jid,
    manifest,
    selectedIds,
    existingPresetBytesApprox,
    onAddAttachments,
    onPrepareError,
    clearSelection,
  ]);

  if (!jid) {
    return (
      <p className="mb-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-500">
        No job is linked to this record, so job file picking is not available. Use <strong>Attach files</strong> below.
      </p>
    );
  }

  return (
    <div className="mb-3 rounded-lg border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left text-xs font-semibold text-slate-800 hover:bg-slate-50"
      >
        <span className="inline-flex items-center gap-2">
          <FolderOpen className="size-4 text-slate-500" />
          Pick files from linked job
        </span>
        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open ? (
        <div className="border-t border-slate-100 px-2.5 pb-2.5 pt-1">
          {manifestError ? (
            <p className="text-[11px] text-rose-700">{manifestError}</p>
          ) : loadingManifest ? (
            <div className="flex items-center gap-2 py-3 text-xs text-slate-500">
              <Loader2 className="size-4 animate-spin" />
              Loading job file list…
            </div>
          ) : manifest.length === 0 ? (
            <p className="py-2 text-[11px] text-slate-500">No files on this job yet.</p>
          ) : (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={selectAllAttachable}
                  disabled={attachable.length === 0}
                  className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  disabled={selectedIds.length === 0}
                  className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                >
                  Clear
                </button>
                {selectedIds.length > 0 ? (
                  <span className="text-[10px] font-semibold text-slate-500">{selectedIds.length} selected</span>
                ) : null}
                <button
                  type="button"
                  onClick={() => void addSelected()}
                  disabled={selectedIds.length === 0 || adding}
                  className="ml-auto inline-flex items-center gap-1 rounded border border-[#14B8A6]/40 bg-[#14B8A6]/10 px-2.5 py-1 text-[10px] font-bold text-teal-900 hover:bg-[#14B8A6]/15 disabled:opacity-50"
                >
                  {adding ? <Loader2 className="size-3 animate-spin" /> : null}
                  Add selected to email
                </button>
              </div>
              <div className="max-h-40 overflow-y-auto rounded border border-slate-100">
                <table className="w-full text-left text-[10px] text-slate-700">
                  <thead className="sticky top-0 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="w-8 px-1 py-1" />
                      <th className="px-1 py-1 font-semibold">Name</th>
                      <th className="w-14 px-1 py-1 font-semibold">Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {manifest.map((f) => {
                      const ok = canAttachJobFileToEmail(f);
                      return (
                        <tr key={f.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                          <td className="px-1 py-1 text-center align-middle">
                            <input
                              type="checkbox"
                              className="size-3.5 rounded border-slate-300 text-[#14B8A6] focus:ring-[#14B8A6]"
                              checked={selectedIds.includes(f.id)}
                              disabled={!ok}
                              title={
                                !ok
                                  ? 'Too large or unavailable in this list — attach manually if needed.'
                                  : 'Select for email'
                              }
                              onChange={() => toggleId(f.id)}
                              aria-label={f.label}
                            />
                          </td>
                          <td className="max-w-[200px] px-1 py-1">
                            <div className="flex items-center gap-1">
                              <FileKindIcon kind={f.kind} />
                              <span className="truncate font-medium" title={f.label}>
                                {f.label}
                              </span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-1 py-1 text-slate-500">{formatBytes(f.byte_size)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
