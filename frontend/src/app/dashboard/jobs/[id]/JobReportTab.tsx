'use client';

import { useCallback, useEffect, useState } from 'react';
import { getJson, putJson } from '../../../apiClient';
import { Plus, Trash2, ChevronUp, ChevronDown, Save } from 'lucide-react';

export type JobReportQuestionType =
  | 'text'
  | 'textarea'
  | 'customer_signature'
  | 'officer_signature'
  | 'before_photo'
  | 'after_photo';

export interface JobReportQuestionRow {
  id?: number;
  job_id?: number;
  sort_order: number;
  question_type: JobReportQuestionType;
  prompt: string;
  helper_text: string | null;
  required: boolean;
}

const QUESTION_TYPES: { value: JobReportQuestionType; label: string }[] = [
  { value: 'text', label: 'Short text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'customer_signature', label: 'Customer signature' },
  { value: 'officer_signature', label: 'Officer signature' },
  { value: 'before_photo', label: 'Before photo' },
  { value: 'after_photo', label: 'After photo' },
];

interface Props {
  jobId: string;
  token: string;
}

export default function JobReportTab({ jobId, token }: Props) {
  const [questions, setQuestions] = useState<JobReportQuestionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getJson<{ questions: JobReportQuestionRow[] }>(
        `/jobs/${jobId}/job-report-questions`,
        token,
      );
      const list = res.questions || [];
      setQuestions(
        list.map((q, i) => ({
          ...q,
          sort_order: q.sort_order ?? i,
          required: q.required !== false,
          helper_text: q.helper_text ?? null,
        })),
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [jobId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= questions.length) return;
    const next = [...questions];
    const t = next[index];
    next[index] = next[j];
    next[j] = t;
    setQuestions(next.map((q, i) => ({ ...q, sort_order: i })));
  };

  const addRow = () => {
    setQuestions([
      ...questions,
      {
        sort_order: questions.length,
        question_type: 'text',
        prompt: '',
        helper_text: null,
        required: true,
      },
    ]);
  };

  const removeRow = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index).map((q, i) => ({ ...q, sort_order: i })));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setSavedAt(null);
    try {
      await putJson<{ questions: JobReportQuestionRow[] }>(
        `/jobs/${jobId}/job-report-questions`,
        { questions },
        token,
      );
      setSavedAt(new Date().toLocaleTimeString());
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-slate-500 text-sm font-medium">Loading job report template…</div>;
  }

  return (
    <div className="max-w-3xl space-y-6 p-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Job report template</h2>
        <p className="mt-1 text-sm text-slate-600">
          Field officers must submit this report before a visit can be marked complete on jobs that include at least one
          question. Required fields must be answered on the officer app (or here for office completion).
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      )}
      {savedAt && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Saved at {savedAt}
        </div>
      )}

      <div className="space-y-3">
        {questions.length === 0 && (
          <p className="text-sm text-slate-500">No questions yet. Add rows for this job, then save.</p>
        )}
        {questions.map((q, index) => (
          <div
            key={`${index}-${q.id ?? 'new'}`}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-400 w-8">#{index + 1}</span>
              <select
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-medium text-slate-800"
                value={q.question_type}
                onChange={(e) => {
                  const v = e.target.value as JobReportQuestionType;
                  setQuestions(questions.map((row, i) => (i === index ? { ...row, question_type: v } : row)));
                }}
              >
                {QUESTION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <label className="ml-auto flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={q.required}
                  onChange={(e) => {
                    setQuestions(
                      questions.map((row, i) => (i === index ? { ...row, required: e.target.checked } : row)),
                    );
                  }}
                />
                Required
              </label>
              <button
                type="button"
                className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100"
                onClick={() => move(index, -1)}
                title="Move up"
              >
                <ChevronUp className="size-4" />
              </button>
              <button
                type="button"
                className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100"
                onClick={() => move(index, 1)}
                title="Move down"
              >
                <ChevronDown className="size-4" />
              </button>
              <button
                type="button"
                className="p-1.5 rounded-md text-rose-600 hover:bg-rose-50"
                onClick={() => removeRow(index)}
                title="Remove"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Question / label</label>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={q.prompt}
                placeholder="e.g. Describe work completed"
                onChange={(e) => {
                  const v = e.target.value;
                  setQuestions(questions.map((row, i) => (i === index ? { ...row, prompt: v } : row)));
                }}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Helper text (optional)</label>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={q.helper_text ?? ''}
                placeholder="Shown under the field on the officer app"
                onChange={(e) => {
                  const v = e.target.value.trim() ? e.target.value : '';
                  setQuestions(
                    questions.map((row, i) => (i === index ? { ...row, helper_text: v || null } : row)),
                  );
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
        >
          <Plus className="size-4" /> Add question
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-[#14B8A6] px-5 py-2 text-sm font-bold text-white shadow hover:bg-[#119f8e] disabled:opacity-50"
        >
          <Save className="size-4" /> {saving ? 'Saving…' : 'Save template'}
        </button>
      </div>
    </div>
  );
}
