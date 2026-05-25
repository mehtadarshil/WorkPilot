'use client';

import { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { AlertCircle, Check, Edit, Loader2, Plus, StickyNote, Trash2, X } from 'lucide-react';
import { deleteRequest, getJson, patchJson, postJson } from '../../../apiClient';

interface JobNote {
  id: number;
  job_id: number;
  title: string;
  description: string;
  created_at: string;
  updated_at: string;
  created_by_name: string | null;
}

interface Props {
  jobId: string;
  token: string;
  jobNotes?: string | null;
}

function emptyDraft() {
  return { title: '', description: '' };
}

export default function JobNotesTab({ jobId, token, jobNotes }: Props) {
  const [notes, setNotes] = useState<JobNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState(emptyDraft);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getJson<{ notes: JobNote[] }>(`/jobs/${jobId}/notes`, token);
      setNotes(res.notes ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load job notes');
    } finally {
      setLoading(false);
    }
  }, [jobId, token]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  const resetComposer = () => {
    setDraft(emptyDraft());
    setEditingId(null);
    setIsAdding(false);
  };

  const saveNewNote = async () => {
    if (!draft.title.trim() || !draft.description.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const note = await postJson<JobNote>(
        `/jobs/${jobId}/notes`,
        { title: draft.title, description: draft.description },
        token,
      );
      setNotes((prev) => [note, ...prev]);
      resetComposer();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save job note');
    } finally {
      setSaving(false);
    }
  };

  const saveEditedNote = async (noteId: number) => {
    if (!draft.title.trim() || !draft.description.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const note = await patchJson<JobNote>(
        `/jobs/${jobId}/notes/${noteId}`,
        { title: draft.title, description: draft.description },
        token,
      );
      setNotes((prev) => prev.map((n) => (n.id === note.id ? note : n)));
      resetComposer();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update job note');
    } finally {
      setSaving(false);
    }
  };

  const deleteNote = async (noteId: number) => {
    if (!window.confirm('Delete this job note?')) return;
    setError(null);
    try {
      await deleteRequest(`/jobs/${jobId}/notes/${noteId}`, token);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      if (editingId === noteId) resetComposer();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete job note');
    }
  };

  const startAdding = () => {
    setEditingId(null);
    setDraft(emptyDraft());
    setIsAdding(true);
  };

  const startEditing = (note: JobNote) => {
    setIsAdding(false);
    setEditingId(note.id);
    setDraft({ title: note.title, description: note.description });
  };

  const canSave = draft.title.trim().length > 0 && draft.description.trim().length > 0 && !saving;
  const setupNotes = (jobNotes ?? '').trim();

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/40 px-6 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-[17px] font-black uppercase tracking-tight text-slate-800">
              <StickyNote className="size-5 text-[#14B8A6]" />
              Job notes
            </h2>
            <p className="mt-1 text-sm text-slate-500">Private notes saved only against this job.</p>
          </div>
          <button
            type="button"
            onClick={startAdding}
            className="inline-flex items-center gap-2 rounded bg-[#14B8A6] px-4 py-2 text-[13px] font-black uppercase text-white shadow-sm transition-colors hover:bg-[#13a89a]"
          >
            <Plus className="size-4" />
            Add note
          </button>
        </div>

        {error ? (
          <div className="mx-6 mt-5 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {error}
          </div>
        ) : null}

        <div className="p-6">
          {setupNotes ? (
            <div className="mb-4 rounded-lg border border-amber-100 bg-amber-50/60 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-amber-700">Job setup notes</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{setupNotes}</p>
            </div>
          ) : null}

          {isAdding ? (
            <NoteEditor
              draft={draft}
              saving={saving}
              canSave={canSave}
              onChange={setDraft}
              onCancel={resetComposer}
              onSave={saveNewNote}
            />
          ) : null}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm font-semibold text-slate-500">
              <Loader2 className="size-4 animate-spin" />
              Loading job notes...
            </div>
          ) : notes.length === 0 && !isAdding ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-14 text-center">
              <StickyNote className="mx-auto mb-3 size-9 text-slate-300" />
              <p className="text-sm font-bold text-slate-500">No job notes yet.</p>
              <p className="mt-1 text-xs text-slate-400">Add a note to keep job-specific context here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {notes.map((note) => (
                <div key={note.id} className="rounded-lg border border-slate-100 p-4 transition-colors hover:border-slate-200 hover:bg-slate-50/60">
                  {editingId === note.id ? (
                    <NoteEditor
                      draft={draft}
                      saving={saving}
                      canSave={canSave}
                      onChange={setDraft}
                      onCancel={resetComposer}
                      onSave={() => saveEditedNote(note.id)}
                    />
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="font-bold text-slate-800">{note.title}</h3>
                          <p className="mt-1 text-xs font-medium text-slate-400">
                            {dayjs(note.created_at).format('DD/MM/YYYY h:mm a')}
                            {note.created_by_name ? ` by ${note.created_by_name}` : ''}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => startEditing(note)}
                            className="rounded p-1.5 text-slate-400 transition-colors hover:bg-white hover:text-[#14B8A6]"
                            aria-label="Edit job note"
                          >
                            <Edit className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteNote(note.id)}
                            className="rounded p-1.5 text-slate-400 transition-colors hover:bg-white hover:text-rose-500"
                            aria-label="Delete job note"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{note.description}</p>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NoteEditor({
  draft,
  saving,
  canSave,
  onChange,
  onCancel,
  onSave,
}: {
  draft: { title: string; description: string };
  saving: boolean;
  canSave: boolean;
  onChange: (draft: { title: string; description: string }) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="mb-4 rounded-lg border border-emerald-100 bg-emerald-50/40 p-4">
      <div className="space-y-3">
        <input
          autoFocus
          type="text"
          value={draft.title}
          onChange={(event) => onChange({ ...draft, title: event.target.value })}
          placeholder="Note title"
          className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 outline-none transition-colors focus:border-[#14B8A6]"
        />
        <textarea
          rows={5}
          value={draft.description}
          onChange={(event) => onChange({ ...draft, description: event.target.value })}
          placeholder="Add job-specific note details..."
          className="w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed text-slate-700 outline-none transition-colors focus:border-[#14B8A6]"
        />
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50"
        >
          <X className="size-4" />
          Cancel
        </button>
        <button
          type="button"
          disabled={!canSave}
          onClick={onSave}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#14B8A6] px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-[#13a89a] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Save note
        </button>
      </div>
    </div>
  );
}
