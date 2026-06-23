'use client';

import { useCallback, useEffect, useState } from 'react';
import { getJson, putJson } from '../../../apiClient';
import { Plus, Trash2, ChevronUp, ChevronDown, Save, Type, AlignLeft, PenLine, Camera } from 'lucide-react';

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

const QUESTION_PALETTE: { value: JobReportQuestionType; label: string; Icon: typeof Type }[] = [
  { value: 'text', label: 'Short text', Icon: Type },
  { value: 'textarea', label: 'Long text', Icon: AlignLeft },
  { value: 'officer_signature', label: 'Engineer signature', Icon: PenLine },
  { value: 'customer_signature', label: 'Customer signature', Icon: PenLine },
  { value: 'before_photo', label: 'Before photo', Icon: Camera },
  { value: 'after_photo', label: 'After photo', Icon: Camera },
];

interface Props {
  /** Required when [templateTarget] is `"job"` (per-job checklist on job detail). */
  jobId?: string;
  /** Required when [templateTarget] is `"job-description"` (extra fields merged after global default for new jobs). */
  jobDescriptionId?: string;
  token: string;
  /**
   * `"default"` — global template in Settings; copied to new jobs.
   * `"job"` — this job only (overrides for that job after copy).
   * `"job-description"` — extra questions for a job type (merged after global when a job is created with that description).
   */
  templateTarget?: 'job' | 'default' | 'job-description';
}

export default function JobReportTemplateTab({
  jobId,
  jobDescriptionId,
  token,
  templateTarget = 'job',
}: Props) {
  const [questions, setQuestions] = useState<JobReportQuestionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const apiPath =
    templateTarget === 'default'
      ? '/settings/job-report-template'
      : templateTarget === 'job-description'
        ? `/settings/job-descriptions/${jobDescriptionId}/job-report-questions`
        : `/jobs/${jobId}/job-report-questions`;

  const questionTypeOptions = QUESTION_TYPES;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getJson<{ questions: JobReportQuestionRow[] }>(apiPath, token);
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
  }, [apiPath, token]);

  useEffect(() => {
    if (templateTarget === 'job' && !jobId) {
      setError('Missing job id');
      setLoading(false);
      return;
    }
    if (templateTarget === 'job-description' && !jobDescriptionId) {
      setError('Missing job description id');
      setLoading(false);
      return;
    }
    void load();
  }, [load, templateTarget, jobId, jobDescriptionId]);

  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= questions.length) return;
    const next = [...questions];
    const t = next[index];
    next[index] = next[j];
    next[j] = t;
    setQuestions(next.map((q, i) => ({ ...q, sort_order: i })));
  };

  const addRow = (type: JobReportQuestionType = 'text') => {
    const label = QUESTION_TYPES.find((t) => t.value === type)?.label ?? 'New question';
    setQuestions([
      ...questions,
      {
        sort_order: questions.length,
        question_type: type,
        prompt: type === 'text' || type === 'textarea' ? '' : label,
        helper_text: null,
        required: true,
      },
    ]);
    setExpandedIndex(questions.length);
  };

  const removeRow = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index).map((q, i) => ({ ...q, sort_order: i })));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setSavedAt(null);
    try {
      await putJson<{ questions: JobReportQuestionRow[] }>(apiPath, { questions }, token);
      setSavedAt(new Date().toLocaleTimeString());
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (templateTarget === 'job' && !jobId) {
    return <div className="p-8 text-slate-500 text-sm font-medium">Missing job id.</div>;
  }

  if (loading) {
    return <div className="p-8 text-slate-500 text-sm font-medium">Loading Final Job Report Templates…</div>;
  }

  return (
    <div className="max-w-5xl space-y-5 p-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">
          {templateTarget === 'default'
            ? 'Default Final Job Report Template'
            : templateTarget === 'job-description'
              ? 'Job report — extra fields for this job type'
              : 'Final Job Report Templates'}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {templateTarget === 'default' ? (
            <>
              This checklist is <strong>copied first</strong> onto every new job when the job is created. If the job
              uses a job description that has its own extra report fields, those are <strong>appended after</strong>{' '}
              this default (see <span className="font-semibold text-slate-800">Final Job Report Templates</span> below for
              per-type extras). Existing jobs are not changed.
            </>
          ) : templateTarget === 'job-description' ? (
            <>
              These questions are <strong>merged after</strong> the global default when someone creates a job with this
              job description (e.g. electrical-specific fields plus the general form). They are not copied to jobs
              that use another description or no description. Edit job types under{' '}
              <span className="font-semibold text-slate-800">Settings → Job descriptions</span>.
            </>
          ) : (
            <>
              For <strong>this job only</strong> — it overrides the default for visits on this job. To edit the
              company-wide default for <strong>new</strong> jobs, go to{' '}
              <span className="font-semibold text-slate-800">Settings → Final Job Report Templates</span>. Field officers must
              submit this report before a visit can be marked complete on jobs that include at least one question.
            </>
          )}
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

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex min-h-[320px] flex-col lg:flex-row">
          <aside className="shrink-0 border-b border-slate-200 bg-slate-50 p-3 lg:w-48 lg:border-b-0 lg:border-r">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Add field</p>
            <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-1">
              {QUESTION_PALETTE.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => addRow(value)}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left text-xs font-semibold text-slate-700 shadow-sm hover:border-[#14B8A6] hover:text-[#0d9488]"
                >
                  <Icon className="size-3.5 shrink-0 text-[#14B8A6]" />
                  {label}
                </button>
              ))}
            </div>
          </aside>

          <div className="min-w-0 flex-1 p-4 space-y-2">
            {questions.length === 0 && (
              <p className="rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center text-sm text-slate-500">
                Click a field type on the left to build your job report form.
              </p>
            )}
            {questions.map((q, index) => {
              const expanded = expandedIndex === index;
              const typeLabel = QUESTION_TYPES.find((t) => t.value === q.question_type)?.label ?? q.question_type;
              return (
                <div key={`${index}-${q.id ?? 'new'}`} className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                    <span className="text-[10px] font-bold text-slate-400">#{index + 1}</span>
                    <input
                      className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold text-slate-800 outline-none focus:border-slate-200 focus:bg-slate-50"
                      value={q.prompt}
                      placeholder="Question label"
                      onChange={(e) => {
                        const v = e.target.value;
                        setQuestions(questions.map((row, i) => (i === index ? { ...row, prompt: v } : row)));
                      }}
                    />
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                      {typeLabel}
                    </span>
                    <label className="flex items-center gap-1.5 text-xs text-slate-600">
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
                      className="rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"
                      onClick={() => setExpandedIndex(expanded ? null : index)}
                    >
                      {expanded ? 'Less' : 'Options'}
                    </button>
                    <button type="button" className="rounded p-1 text-slate-500 hover:bg-slate-100" onClick={() => move(index, -1)} title="Move up">
                      <ChevronUp className="size-4" />
                    </button>
                    <button type="button" className="rounded p-1 text-slate-500 hover:bg-slate-100" onClick={() => move(index, 1)} title="Move down">
                      <ChevronDown className="size-4" />
                    </button>
                    <button type="button" className="rounded p-1 text-rose-600 hover:bg-rose-50" onClick={() => removeRow(index)} title="Remove">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  {expanded && (
                    <div className="border-t border-slate-100 bg-slate-50/80 px-3 py-3 space-y-3">
                      <div>
                        <label className="text-[11px] font-bold uppercase text-slate-500">Field type</label>
                        <select
                          className="mt-0.5 w-full max-w-xs rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                          value={q.question_type}
                          onChange={(e) => {
                            const v = e.target.value as JobReportQuestionType;
                            setQuestions(questions.map((row, i) => (i === index ? { ...row, question_type: v } : row)));
                          }}
                        >
                          {questionTypeOptions.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[11px] font-bold uppercase text-slate-500">Helper text (optional)</label>
                        <input
                          className="mt-0.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
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
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => addRow('text')}
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
