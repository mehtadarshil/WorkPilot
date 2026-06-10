import { useEffect, useState } from 'react';
import Image from 'next/image';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { deleteRequest, getBlob, postJson } from '../../../apiClient';
import { IMAGE_MAX_BYTES, prepareImageFileForUpload, readFileAsBase64 } from './customerSiteReportShared';

export interface TechnicalNoteMediaItem {
  stored_filename: string;
  original_filename: string;
  content_type: string;
  byte_size: number;
  file_path: string;
}

interface TechnicalNoteMediaProps {
  customerId: number;
  noteId: number;
  media: TechnicalNoteMediaItem[];
  token: string | null;
  onMediaChange: (noteId: number, media: TechnicalNoteMediaItem[]) => void;
}

function TechnicalNoteImagePreview({ item, token }: { item: TechnicalNoteMediaItem; token: string | null }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!item.file_path) return;
    let cancelled = false;
    let nextUrl: string | null = null;
    getBlob(item.file_path, token)
      .then((blob) => {
        if (cancelled) return;
        nextUrl = URL.createObjectURL(blob);
        setObjectUrl(nextUrl);
        setError('');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error && err.message ? err.message : 'Could not load');
      });
    return () => {
      cancelled = true;
      if (nextUrl) URL.revokeObjectURL(nextUrl);
    };
  }, [item.file_path, token]);

  if (error) {
    return (
      <div className="flex h-16 items-center justify-center rounded border border-dashed border-rose-200 bg-rose-50 px-2 text-[10px] text-rose-600">
        {error}
      </div>
    );
  }

  if (!objectUrl) {
    return (
      <div className="flex h-16 items-center justify-center rounded border border-slate-200 bg-slate-50 text-slate-400">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  }

  return (
    <Image
      src={objectUrl}
      alt={item.original_filename}
      width={160}
      height={64}
      unoptimized
      className="h-16 w-full rounded border border-slate-200 object-cover"
    />
  );
}

export default function CustomerTechnicalNoteMedia({ customerId, noteId, media, token, onMediaChange }: TechnicalNoteMediaProps) {
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState('');

  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || !token) return;
    setBusy(true);
    setError('');
    try {
      let latestMedia = media;
      for (const original of Array.from(files)) {
        const file = await prepareImageFileForUpload(original);
        if (file.size > IMAGE_MAX_BYTES) {
          throw new Error(`"${original.name}" is too large (max ${Math.round(IMAGE_MAX_BYTES / (1024 * 1024))} MB).`);
        }
        const contentBase64 = await readFileAsBase64(file);
        const res = await postJson<{ media: TechnicalNoteMediaItem[] }>(
          `/customers/${customerId}/specific-notes/${noteId}/media`,
          {
            filename: file.name,
            content_type: file.type || 'image/jpeg',
            content_base64: contentBase64,
          },
          token,
        );
        latestMedia = res.media;
      }
      onMediaChange(noteId, latestMedia);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const deleteImage = async (item: TechnicalNoteMediaItem) => {
    if (!token) return;
    setDeleting(item.stored_filename);
    setError('');
    try {
      await deleteRequest(
        `/customers/${customerId}/specific-notes/${noteId}/media/${encodeURIComponent(item.stored_filename)}`,
        token,
      );
      onMediaChange(
        noteId,
        media.filter((m) => m.stored_filename !== item.stored_filename),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="mt-2 space-y-2">
      {media.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {media.map((item) => (
            <div key={item.stored_filename} className="group/image relative">
              <TechnicalNoteImagePreview item={item} token={token} />
              <button
                type="button"
                disabled={deleting === item.stored_filename}
                onClick={() => void deleteImage(item)}
                className="absolute right-1 top-1 rounded bg-white/90 p-1 text-rose-600 opacity-0 shadow-sm transition group-hover/image:opacity-100 disabled:opacity-60"
                title="Delete image"
              >
                {deleting === item.stored_filename ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {error ? <p className="text-[11px] text-rose-600">{error}</p> : null}
      <label className="inline-flex cursor-pointer items-center gap-1 rounded border border-dashed border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-500 hover:border-[#14B8A6] hover:text-[#14B8A6]">
        {busy ? <Loader2 className="size-3 animate-spin" /> : <ImagePlus className="size-3" />}
        {busy ? 'Uploading...' : 'Add picture'}
        <input
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            void uploadFiles(e.target.files);
            e.currentTarget.value = '';
          }}
        />
      </label>
    </div>
  );
}
