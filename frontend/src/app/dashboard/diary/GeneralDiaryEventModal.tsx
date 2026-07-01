'use client';

import { useEffect, useState } from 'react';
import { postJson } from '../../apiClient';

export type GeneralDiaryEventForm = {
  title: string;
  start_time: string;
  duration_minutes: number;
  officer_ids: number[];
  notes: string;
  location: string;
};

type Officer = { id: number; full_name: string };

type Props = {
  open: boolean;
  officers: Officer[];
  initialForm: GeneralDiaryEventForm;
  token: string | null;
  onClose: () => void;
  onSaved: () => void;
};

export function GeneralDiaryEventModal({
  open,
  officers,
  initialForm,
  token,
  onClose,
  onSaved,
}: Props) {
  const [form, setForm] = useState<GeneralDiaryEventForm>(initialForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(initialForm);
      setError(null);
    }
  }, [open, initialForm]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (!form.title.trim()) {
      setError('Title is required');
      return;
    }
    if (form.officer_ids.length === 0) {
      setError('Select at least one engineer');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await postJson(
        '/diary-events',
        {
          title: form.title.trim(),
          start_time: new Date(form.start_time).toISOString(),
          duration_minutes: form.duration_minutes,
          officer_ids: form.officer_ids,
          notes: form.notes.trim() || null,
          location: form.location.trim() || null,
        },
        token,
      );
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create event');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded shadow-xl w-[420px] max-h-[90vh] overflow-y-auto p-6">
        <h3 className="text-lg font-bold text-slate-800 mb-1">Add general event</h3>
        <p className="text-sm text-slate-500 mb-4">Calendar entry without a linked job.</p>
        {error && (
          <p className="mb-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">{error}</p>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="mt-1 w-full border border-slate-300 rounded px-3 py-2 text-sm"
              required
              maxLength={255}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Date &amp; time</label>
            <input
              type="datetime-local"
              value={form.start_time}
              onChange={(e) => setForm({ ...form, start_time: e.target.value })}
              className="mt-1 w-full border border-slate-300 rounded px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Duration (mins)</label>
            <input
              type="number"
              step="15"
              value={form.duration_minutes}
              onChange={(e) => setForm({ ...form, duration_minutes: parseInt(e.target.value, 10) || 60 })}
              className="mt-1 w-full border border-slate-300 rounded px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Location (optional)</label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className="mt-1 w-full border border-slate-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Notes (optional)</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="mt-1 w-full border border-slate-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Engineers</label>
            <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-300 bg-white p-2">
              {officers.length === 0 && <p className="px-2 py-1 text-sm text-slate-400">No users</p>}
              {officers.map((o) => {
                const checked = form.officer_ids.includes(o.id);
                const isPrimary = form.officer_ids[0] === o.id;
                return (
                  <label
                    key={o.id}
                    className="flex items-center gap-2 py-1.5 px-2 hover:bg-slate-50 rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setForm({ ...form, officer_ids: [...form.officer_ids, o.id] });
                        } else {
                          setForm({
                            ...form,
                            officer_ids: form.officer_ids.filter((id) => id !== o.id),
                          });
                        }
                      }}
                      className="rounded border-slate-300 text-[#14B8A6] focus:ring-[#14B8A6]"
                    />
                    <span className="text-sm text-slate-700 flex-1">{o.full_name}</span>
                    {checked && (
                      <input
                        type="radio"
                        name="general_primary_officer"
                        checked={isPrimary}
                        onChange={() => {
                          setForm({
                            ...form,
                            officer_ids: [o.id, ...form.officer_ids.filter((id) => id !== o.id)],
                          });
                        }}
                        title="Primary"
                        className="text-[#14B8A6] focus:ring-[#14B8A6]"
                      />
                    )}
                  </label>
                );
              })}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-50 rounded"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-bold text-white bg-[#14B8A6] rounded hover:brightness-110 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
