'use client';

import { useCallback, useEffect, useState } from 'react';
import { getJson, postJson, deleteRequest, getBlob } from '../../../apiClient';
import { prepareImageFileForUpload, readFileAsBase64 } from './customerSiteReportShared';
import { Upload, FileText, Trash2, Download, AlertCircle, Eye } from 'lucide-react';
import dayjs from 'dayjs';

interface CustomerFileRow {
  id: number;
  customer_id: number;
  work_address_id: number | null;
  original_filename: string;
  content_type: string | null;
  byte_size: number;
  created_at: string;
  created_by: number | null;
  created_by_name: string;
}

interface FilesResponse {
  files: CustomerFileRow[];
}

interface Props {
  customerId: string;
  workAddressId?: string;
}

const MAX_BYTES = 8 * 1024 * 1024;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CustomerFilesTab({ customerId, workAddressId }: Props) {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;
  const [files, setFiles] = useState<CustomerFileRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fetchFiles = useCallback(async () => {
    if (!token || !customerId) return;
    setError(null);
    try {
      const q = new URLSearchParams();
      if (workAddressId) q.set('work_address_id', workAddressId);
      const qs = q.toString();
      const res = await getJson<FilesResponse>(`/customers/${customerId}/files${qs ? `?${qs}` : ''}`, token);
      setFiles(res.files || []);
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
      const blob = await getBlob(`/customers/${customerId}/files/${f.id}/content`, token);
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
  };

  const previewFile = async (f: CustomerFileRow) => {
    if (!token || !canPreviewInline(f)) return;
    setError(null);
    try {
      const blob = await getBlob(`/customers/${customerId}/files/${f.id}/content`, token);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preview failed');
    }
  };

  const removeFile = async (f: CustomerFileRow) => {
    if (!token) return;
    if (!window.confirm(`Delete "${f.original_filename}"?`)) return;
    setError(null);
    try {
      await deleteRequest(`/customers/${customerId}/files/${f.id}`, token);
      await fetchFiles();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
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
              const fl = e.target.files;
              e.target.value = '';
              if (fl?.length) void uploadFiles(fl);
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
          <span className="text-sm font-semibold text-slate-900">Uploaded files</span>
          <span className="rounded-full bg-[#14B8A6]/10 px-2.5 py-0.5 text-xs font-semibold text-[#14B8A6]">
            {files.length} file{files.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">Name</th>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">Size</th>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">Uploaded</th>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">By</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {files.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                    No files yet. Upload documents, photos, or PDFs using the area above.
                  </td>
                </tr>
              ) : (
                files.map((f) => (
                  <tr key={f.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FileText className="size-4 shrink-0 text-[#14B8A6]" />
                        <span className="font-medium text-slate-900">{f.original_filename}</span>
                      </div>
                      {f.content_type && <p className="mt-0.5 pl-6 text-xs text-slate-400">{f.content_type}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatBytes(f.byte_size)}</td>
                    <td className="px-4 py-3 text-slate-600">{dayjs(f.created_at).format('D MMM YYYY, h:mm a')}</td>
                    <td className="px-4 py-3 text-slate-600">{f.created_by_name}</td>
                    <td className="px-4 py-3 text-right">
                      {canPreviewInline(f) && (
                        <button
                          type="button"
                          onClick={() => void previewFile(f)}
                          className="inline-flex items-center gap-1 font-semibold text-slate-700 hover:underline"
                        >
                          <Eye className="size-3.5" />
                          View
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void downloadFile(f)}
                        className={`inline-flex items-center gap-1 font-semibold text-[#14B8A6] hover:underline ${canPreviewInline(f) ? 'ml-4' : ''}`}
                      >
                        <Download className="size-3.5" />
                        Download
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeFile(f)}
                        className="ml-4 inline-flex items-center gap-1 font-semibold text-rose-600 hover:underline"
                      >
                        <Trash2 className="size-3.5" />
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
