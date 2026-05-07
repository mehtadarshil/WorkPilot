'use client';

import { useCallback, useEffect, useState } from 'react';
import { Lock, Trash2, ImagePlus, X } from 'lucide-react';
import dayjs from 'dayjs';
import { postJson, deleteRequest, getBlob } from '../../../apiClient';

export type QuotationInternalNoteMedia = {
  stored_filename: string;
  original_filename: string | null;
  content_type: string | null;
  kind: string;
  byte_size: number | null;
  file_path: string;
};

export type QuotationInternalNote = {
  id: number;
  body: string;
  media?: QuotationInternalNoteMedia[];
  created_at: string;
  created_by: number | null;
  created_by_label: string | null;
};

const MAX_IMAGES = 8;
const MAX_BYTES_PER_IMAGE = 6 * 1024 * 1024;

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = r.result as string;
      const i = s.indexOf(',');
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.onerror = () => reject(new Error('Could not read file'));
    r.readAsDataURL(file);
  });
}

function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function InternalNoteImage({ filePath, alt, token }: { filePath: string; alt: string; token: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let revoke: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const blob = await getBlob(filePath, token);
        const u = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(u);
          return;
        }
        revoke = u;
        setSrc(u);
      } catch {
        if (!cancelled) setSrc(null);
      }
    })();
    return () => {
      cancelled = true;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [filePath, token]);

  if (!src) {
    return <div className="h-24 w-32 shrink-0 animate-pulse rounded border border-slate-200 bg-slate-100" aria-hidden />;
  }
  return (
    <a
      href={src}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-block max-w-full shrink-0 rounded border border-slate-200 bg-white shadow-sm"
    >
      <img src={src} alt={alt} className="max-h-48 max-w-full rounded object-contain" />
    </a>
  );
}

type Props = {
  quotationId: string;
  notes: QuotationInternalNote[];
  authToken: string;
  onAppendNote: (note: QuotationInternalNote) => void;
  onRemoveNote: (noteId: number) => void;
};

type PendingImage = { id: string; file: File; previewUrl: string };

export default function QuotationInternalNotesCard({ quotationId, notes, authToken, onAppendNote, onRemoveNote }: Props) {
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<PendingImage[]>([]);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const addPendingFiles = useCallback((list: FileList | File[]) => {
    const arr = Array.from(list).filter((f) => f.type.startsWith('image/'));
    if (arr.length === 0) return;
    setError(null);
    setPending((prev) => {
      const next = [...prev];
      for (const file of arr) {
        if (file.size > MAX_BYTES_PER_IMAGE) {
          setError(`"${file.name}" is too large (max ${formatBytes(MAX_BYTES_PER_IMAGE)} per image).`);
          continue;
        }
        if (next.length >= MAX_IMAGES) {
          setError(`At most ${MAX_IMAGES} images per note.`);
          break;
        }
        next.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file,
          previewUrl: URL.createObjectURL(file),
        });
      }
      return next;
    });
  }, []);

  const removePending = useCallback((id: string) => {
    setPending((prev) => {
      const row = prev.find((p) => p.id === id);
      if (row) URL.revokeObjectURL(row.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }, []);

  const addNote = useCallback(async () => {
    const text = draft.trim();
    if (!text && pending.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const media =
        pending.length > 0
          ? await Promise.all(
              pending.map(async (p) => ({
                content_base64: await readFileAsBase64(p.file),
                content_type: p.file.type || 'image/jpeg',
                filename: p.file.name,
              })),
            )
          : [];
      const res = await postJson<{ note: QuotationInternalNote }>(
        `/quotations/${quotationId}/internal-notes`,
        { body: text, media },
        authToken,
      );
      pending.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      setPending([]);
      setDraft('');
      onAppendNote(res.note);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [authToken, draft, onAppendNote, pending, quotationId]);

  const removeNote = useCallback(
    async (noteId: number) => {
      setDeletingId(noteId);
      setError(null);
      try {
        await deleteRequest(`/quotations/${quotationId}/internal-notes/${noteId}`, authToken);
        onRemoveNote(noteId);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to delete');
      } finally {
        setDeletingId(null);
      }
    },
    [authToken, onRemoveNote, quotationId],
  );

  const canSubmit = draft.trim().length > 0 || pending.length > 0;

  return (
    <div className="rounded-xl border border-amber-200/80 bg-amber-50/40 p-6 shadow-sm">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
          <Lock className="size-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold text-slate-900">Internal notes</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            For your team only. These notes are not shown on the printable quotation, PDF, or the public customer link.
            You can attach reference photos (images only).
          </p>
        </div>
      </div>

      {error ? <p className="mb-3 text-sm font-medium text-rose-600">{error}</p> : null}

      <div className="space-y-2">
        <label htmlFor="internal-note-draft" className="sr-only">
          New internal note
        </label>
        <textarea
          id="internal-note-draft"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder="Add a private note…"
          className="w-full rounded-lg border border-amber-200/90 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-300/30"
        />

        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-amber-300/80 bg-white px-3 py-2 text-sm font-medium text-amber-900 shadow-sm hover:bg-amber-50">
            <ImagePlus className="size-4 shrink-0" aria-hidden />
            <span>Add images</span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) addPendingFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
          <span className="text-xs text-slate-500">
            Up to {MAX_IMAGES} images, {formatBytes(MAX_BYTES_PER_IMAGE)} each
          </span>
        </div>

        {pending.length > 0 ? (
          <ul className="flex flex-wrap gap-2 pt-1">
            {pending.map((p) => (
              <li key={p.id} className="relative">
                <img
                  src={p.previewUrl}
                  alt=""
                  className="h-20 w-20 rounded-lg border border-amber-200 object-cover"
                />
                <button
                  type="button"
                  title="Remove image"
                  onClick={() => removePending(p.id)}
                  className="absolute -right-1 -top-1 flex size-6 items-center justify-center rounded-full bg-white text-slate-600 shadow ring-1 ring-slate-200 hover:bg-rose-50 hover:text-rose-600"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <button
          type="button"
          disabled={saving || !canSubmit}
          onClick={addNote}
          className="w-full rounded-lg bg-amber-700 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Add note'}
        </button>
      </div>

      <div className="mt-6 border-t border-amber-200/60 pt-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Notes ({notes.length})</p>
        {notes.length === 0 ? (
          <p className="text-sm text-slate-500">No internal notes yet.</p>
        ) : (
          <ul className="max-h-96 space-y-3 overflow-y-auto pr-1">
            {notes.map((n) => (
              <li key={n.id} className="rounded-lg border border-amber-100 bg-white/90 p-3 text-sm shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-2">
                    {n.body.trim() ? <p className="whitespace-pre-wrap text-slate-800">{n.body}</p> : null}
                    {n.media && n.media.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {n.media.map((m) => (
                          <InternalNoteImage
                            key={m.stored_filename}
                            filePath={m.file_path}
                            alt={m.original_filename || 'Attachment'}
                            token={authToken}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    title="Delete note"
                    disabled={deletingId === n.id}
                    onClick={() => removeNote(n.id)}
                    className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <p className="mt-2 text-[11px] font-medium text-slate-400">
                  {dayjs(n.created_at).format('D MMM YYYY, HH:mm')}
                  {n.created_by_label ? ` · ${n.created_by_label}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
