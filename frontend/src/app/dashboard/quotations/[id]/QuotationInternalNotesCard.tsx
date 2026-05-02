'use client';

import { useCallback, useState } from 'react';
import { Lock, Trash2 } from 'lucide-react';
import dayjs from 'dayjs';
import { postJson, deleteRequest } from '../../../apiClient';

export type QuotationInternalNote = {
  id: number;
  body: string;
  created_at: string;
  created_by: number | null;
  created_by_label: string | null;
};

type Props = {
  quotationId: string;
  notes: QuotationInternalNote[];
  authToken: string;
  onAppendNote: (note: QuotationInternalNote) => void;
  onRemoveNote: (noteId: number) => void;
};

export default function QuotationInternalNotesCard({ quotationId, notes, authToken, onAppendNote, onRemoveNote }: Props) {
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const addNote = useCallback(async () => {
    const text = draft.trim();
    if (!text) return;
    setSaving(true);
    setError(null);
    try {
      const res = await postJson<{ note: QuotationInternalNote }>(
        `/quotations/${quotationId}/internal-notes`,
        { body: text },
        authToken,
      );
      onAppendNote(res.note);
      setDraft('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [authToken, draft, onAppendNote, quotationId]);

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
        <button
          type="button"
          disabled={saving || !draft.trim()}
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
          <ul className="max-h-64 space-y-3 overflow-y-auto pr-1">
            {notes.map((n) => (
              <li
                key={n.id}
                className="rounded-lg border border-amber-100 bg-white/90 p-3 text-sm shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="whitespace-pre-wrap text-slate-800">{n.body}</p>
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
