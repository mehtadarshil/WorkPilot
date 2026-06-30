'use client';

import { useCallback, useEffect, useState } from 'react';
import { getJson, postJson, deleteRequest, getBlob, patchJson } from '../../../apiClient';
import { prepareImageFileForUpload, readFileAsBase64 } from './customerSiteReportShared';
import { Upload, FileText, Trash2, Download, AlertCircle, Eye } from 'lucide-react';
import { showFullscreenImage } from '@/components/ImageLightboxProvider';
import dayjs from 'dayjs';

interface CustomerFileRow {
  id: number | string;
  customer_id: number;
  work_address_id: number | null;
  original_filename: string;
  content_type: string | null;
  byte_size: number | null;
  created_at: string;
  created_by: number | null;
  created_by_name: string;
  notes: string;
  kind?: 'uploaded' | 'electrical_certificate' | 'site_report';
  href?: string;
  source_label?: string;
}

interface FilesResponse {
  files: CustomerFileRow[];
}

interface Props {
  customerId: string;
  workAddressId?: string;
}

const MAX_BYTES = 8 * 1024 * 1024;

function formatBytes(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fileContentPath(customerId: string, file: CustomerFileRow): string {
  return (file.kind === 'electrical_certificate' || file.kind === 'site_report') && file.href
    ? file.href
    : `/customers/${customerId}/files/${file.id}/content`;
}

function AuthImage({ customerId, file, className }: { customerId: string; file: CustomerFileRow; className?: string }) {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!token) return;
    getBlob(fileContentPath(customerId, file), token)
      .then((blob) => {
        if (active) setSrc(URL.createObjectURL(blob));
      })
      .catch((err) => console.error('Failed to load image preview:', err));
    return () => {
      active = false;
    };
  }, [customerId, file, token]);

  // Clean up object URL when component unmounts or src changes
  useEffect(() => {
    return () => {
      if (src) URL.revokeObjectURL(src);
    };
  }, [src]);

  if (!src) return <div className={`animate-pulse bg-slate-200 ${className || ''}`} />;
  return <img src={src} alt={file.original_filename} className={className} />;
}

export default function CustomerSiteImagesTab({ customerId, workAddressId }: Props) {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;
  const [files, setFiles] = useState<CustomerFileRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [savingNotes, setSavingNotes] = useState<Record<string, boolean>>({});
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const fetchFiles = useCallback(async () => {
    if (!token || !customerId) return;
    setError(null);
    try {
      const q = new URLSearchParams();
      if (workAddressId) q.set('work_address_id', workAddressId);
      const qs = q.toString();
      const res = await getJson<FilesResponse>(`/customers/${customerId}/files${qs ? `?${qs}` : ''}`, token);
      const imagesOnly = (res.files || []).filter(f => f.content_type?.startsWith('image/'));
      setFiles(imagesOnly);
      setNoteDrafts(Object.fromEntries(imagesOnly.map((f) => [String(f.id), f.notes ?? ''])));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load files');
    }
  }, [token, customerId, workAddressId]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const uploadFiles = async (list: FileList | File[]) => {
    if (!token) return;
    const arr = Array.from(list);
    if (arr.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of arr) {
        const prepared = await prepareImageFileForUpload(file);
        if (prepared.size > MAX_BYTES) {
          throw new Error(`"${file.name}" is too large after processing (max ${formatBytes(MAX_BYTES)} per file).`);
        }
        const content_base64 = await readFileAsBase64(prepared);
        await postJson(
          `/customers/${customerId}/files`,
          {
            filename: prepared.name,
            content_type: prepared.type || null,
            content_base64,
            ...(workAddressId ? { work_address_id: Number(workAddressId) } : {}),
          },
          token,
        );
      }
      await fetchFiles();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const downloadFile = async (f: CustomerFileRow) => {
    if (!token) return;
    setError(null);
    try {
      const blob = await getBlob(fileContentPath(customerId, f), token);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = f.original_filename || 'download';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed');
    }
  };

  const canPreviewInline = (f: CustomerFileRow) => {
    const t = (f.content_type || '').toLowerCase();
    return t.startsWith('image/') || t === 'application/pdf';
  };  const previewFile = async (f: CustomerFileRow) => {
    if (!token || !canPreviewInline(f)) return;
    setError(null);
    try {
      const blob = await getBlob(fileContentPath(customerId, f), token);
      const url = URL.createObjectURL(blob);
      showFullscreenImage(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preview failed');
    }
  };

  const removeFile = async (f: CustomerFileRow) => {
    if (!token) return;
    if (f.kind === 'electrical_certificate' || f.kind === 'site_report') return;
    if (!window.confirm(`Delete "${f.original_filename}"?`)) return;
    setError(null);
    try {
      await deleteRequest(`/customers/${customerId}/files/${f.id}`, token);
      await fetchFiles();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const saveImageNote = async (f: CustomerFileRow) => {
    if (!token || f.kind !== 'uploaded') return;
    const key = String(f.id);
    setSavingNotes((prev) => ({ ...prev, [key]: true }));
    setError(null);
    try {
      const notes = noteDrafts[key] ?? '';
      const res = await patchJson<{ file: { id: number; notes: string } }>(
        `/customers/${customerId}/files/${f.id}`,
        { notes },
        token,
      );
      const nextNotes = res.file.notes ?? '';
      setFiles((prev) => prev.map((item) => (String(item.id) === key ? { ...item, notes: nextNotes } : item)));
      setNoteDrafts((prev) => ({ ...prev, [key]: nextNotes }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save image note');
    } finally {
      setSavingNotes((prev) => ({ ...prev, [key]: false }));
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div
        className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          dragOver ? 'border-[#14B8A6] bg-[#14B8A6]/5' : 'border-slate-200 bg-white'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) void uploadFiles(e.dataTransfer.files);
        }}
      >
        <Upload className="mx-auto size-10 text-slate-300" />
        <p className="mt-2 text-sm font-semibold text-slate-800">Drop files here or choose from your device</p>
        <p className="mt-1 text-xs text-slate-500">
          Up to {formatBytes(MAX_BYTES)} per file. All common types supported.
          {workAddressId ? ' Files are stored for this work site only.' : ' Files are stored at customer level (all sites).'}
        </p>
        <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#119f90] has-[:disabled]:opacity-50">
          <input
            type="file"
            multiple
            className="sr-only"
            disabled={uploading}
            onChange={(e) => {
              const fl = e.target.files ? Array.from(e.target.files) : [];
              e.target.value = '';
              if (fl.length) void uploadFiles(fl);
            }}
          />
          <span>{uploading ? 'Uploading…' : 'Choose files'}</span>
        </label>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-4 py-3">
          <span className="text-sm font-semibold text-slate-900">Site images</span>
          <span className="rounded-full bg-[#14B8A6]/10 px-2.5 py-0.5 text-xs font-semibold text-[#14B8A6]">
            {files.length} image{files.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="p-4">
          {files.length === 0 ? (
            <div className="px-4 py-12 text-center text-slate-400">
              No images yet. Upload photos of this site here.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {files.map((f) => (
                <div key={f.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="group relative aspect-square overflow-hidden bg-slate-100">
                    <button
                      type="button"
                      onClick={() => void previewFile(f)}
                      className="absolute inset-0 z-10 cursor-pointer"
                      title="Click to enlarge"
                    >
                      <span className="sr-only">View full size</span>
                    </button>
                    <AuthImage
                      customerId={customerId}
                      file={f}
                      className="pointer-events-none h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/60 opacity-0 transition-opacity group-hover:opacity-100">
                      <p className="w-full truncate px-2 text-center text-xs font-medium text-white">{f.original_filename}</p>
                      <p className="mt-1 text-[10px] text-slate-300">{formatBytes(f.byte_size)}</p>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); void previewFile(f); }}
                          className="rounded-full bg-white/20 p-2 text-white hover:bg-white/40"
                          title="View Full Size"
                        >
                          <Eye className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); void removeFile(f); }}
                          className="rounded-full bg-rose-500/80 p-2 text-white hover:bg-rose-500"
                          title="Delete Image"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2 p-3">
                    <label className="block text-xs font-semibold text-slate-600">
                      Image note
                      <textarea
                        value={noteDrafts[String(f.id)] ?? f.notes ?? ''}
                        onChange={(event) => {
                          const key = String(f.id);
                          setNoteDrafts((prev) => ({ ...prev, [key]: event.target.value }));
                        }}
                        rows={3}
                        maxLength={2000}
                        placeholder="Add notes for this specific image..."
                        disabled={f.kind !== 'uploaded'}
                        className="mt-1 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal leading-relaxed outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/20 disabled:bg-slate-50 disabled:text-slate-400"
                      />
                    </label>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] text-slate-400">{f.original_filename}</span>
                      <button
                        type="button"
                        onClick={() => void saveImageNote(f)}
                        disabled={f.kind !== 'uploaded' || savingNotes[String(f.id)] || (noteDrafts[String(f.id)] ?? '') === (f.notes ?? '')}
                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-[#14B8A6] hover:bg-[#14B8A6]/5 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {savingNotes[String(f.id)] ? 'Saving...' : 'Save note'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
    </div>
  );
}
