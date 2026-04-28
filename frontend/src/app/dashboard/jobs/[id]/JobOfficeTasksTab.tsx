'use client';

import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { deleteRequest, patchJson, postJson } from '../../../apiClient';
import { Info } from 'lucide-react';

interface OfficeTask {
  id: number;
  job_id: number;
  description: string;
  assignee_officer_id: number | null;
  assignee_name: string | null;
  created_by_name: string;
  completed: boolean;
  completed_at: string | null;
  completed_by_name?: string | null;
  /** Set when the task is marked complete: dashboard admin vs field officer mobile app. */
  completion_source?: 'web' | 'mobile' | string | null;
  created_at: string;
}

function formatOfficeTaskCompletedBy(task: OfficeTask): string {
  const name = task.completed_by_name?.trim();
  if (!name) return '—';
  if (task.completion_source === 'mobile') return `${name} (Mobile app)`;
  if (task.completion_source === 'web') return `${name} (Dashboard)`;
  return name;
}

interface OfficerOption {
  id: number;
  full_name: string;
}

interface Props {
  jobId: string;
  tasks: OfficeTask[];
  officers: OfficerOption[];
  onRefresh: () => Promise<void> | void;
}

export default function JobOfficeTasksTab({ jobId, tasks, officers, onRefresh }: Props) {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;
  const [newTask, setNewTask] = useState('');
  const [assigneeOfficerId, setAssigneeOfficerId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const openTasks = useMemo(() => tasks.filter((t) => !t.completed), [tasks]);
  const completedTasks = useMemo(() => tasks.filter((t) => t.completed), [tasks]);

  const mentionMatch = newTask.match(/@([a-zA-Z0-9 ._-]*)$/);
  const mentionQuery = mentionMatch ? mentionMatch[1].toLowerCase() : '';
  const mentionSuggestions = mentionMatch
    ? officers.filter((o) => o.full_name.toLowerCase().includes(mentionQuery)).slice(0, 8)
    : [];

  const assignMention = (officer: OfficerOption) => {
    setAssigneeOfficerId(officer.id);
    setNewTask((prev) => prev.replace(/@([a-zA-Z0-9 ._-]*)$/, `@${officer.full_name} `));
  };

  const createTask = async () => {
    if (!token) return;
    const description = newTask.trim();
    if (!description) return;
    setSaving(true);
    setError(null);
    try {
      await postJson(`/jobs/${jobId}/office-tasks`, { description, assignee_officer_id: assigneeOfficerId }, token);
      setNewTask('');
      setAssigneeOfficerId(null);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setSaving(false);
    }
  };

  const completeTask = async (taskId: number) => {
    if (!token) return;
    try {
      await patchJson(`/jobs/${jobId}/office-tasks/${taskId}`, { completed: true }, token);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete task');
    }
  };

  const removeTask = async (taskId: number) => {
    if (!token) return;
    if (!window.confirm('Delete this office task?')) return;
    try {
      await deleteRequest(`/jobs/${jobId}/office-tasks/${taskId}`, token);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete task');
    }
  };

  const saveEdit = async () => {
    if (!token || !editingTaskId) return;
    try {
      await patchJson(`/jobs/${jobId}/office-tasks/${editingTaskId}`, { description: editingText }, token);
      setEditingTaskId(null);
      setEditingText('');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update task');
    }
  };

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-3">
          <h3 className="text-[16px] font-semibold text-slate-900">Office tasks</h3>
        </div>
        <div className="p-4">
          <input
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') createTask(); }}
            placeholder="Assign the task using '@', tag the task using '#'"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]"
          />
          {mentionSuggestions.length > 0 && (
            <div className="mt-2 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
              {mentionSuggestions.map((officer) => (
                <button
                  key={officer.id}
                  type="button"
                  onClick={() => assignMention(officer)}
                  className="block w-full rounded px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  @{officer.full_name}
                </button>
              ))}
            </div>
          )}
          <div className="mt-3 flex items-center gap-2">
            <select
              value={assigneeOfficerId ?? ''}
              onChange={(e) => setAssigneeOfficerId(e.target.value ? parseInt(e.target.value, 10) : null)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-[#14B8A6]"
            >
              <option value="">Assignee (optional)</option>
              {officers.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
            </select>
            <button onClick={createTask} disabled={saving} className="rounded-lg bg-[#14B8A6] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#119f90] disabled:opacity-50">
              {saving ? 'Saving...' : 'Add task'}
            </button>
          </div>
        </div>
        <div className="overflow-x-auto border-t border-slate-100">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase">Date</th>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase">Description</th>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase">Created by</th>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase">Assignee</th>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {openTasks.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No open office tasks saved</td></tr>
              ) : openTasks.map((task) => (
                <tr key={task.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 text-slate-600">{dayjs(task.created_at).format('ddd D MMM YYYY [at] h:mm a')}</td>
                  <td className="px-4 py-3 text-slate-800">
                    {editingTaskId === task.id ? (
                      <div className="flex items-center gap-2">
                        <input value={editingText} onChange={(e) => setEditingText(e.target.value)} className="w-full rounded border border-slate-200 px-2 py-1 text-sm outline-none focus:border-[#14B8A6]" />
                        <button onClick={saveEdit} className="text-xs font-semibold text-[#14B8A6] hover:underline">Save</button>
                        <button onClick={() => { setEditingTaskId(null); setEditingText(''); }} className="text-xs font-semibold text-slate-500 hover:underline">Cancel</button>
                      </div>
                    ) : (
                      task.description
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{task.created_by_name}</td>
                  <td className="px-4 py-3 text-slate-700">{task.assignee_name || '-'}</td>
                  <td className="px-4 py-3 text-right">
                    {editingTaskId !== task.id && (
                      <>
                        <button onClick={() => { setEditingTaskId(task.id); setEditingText(task.description); }} className="text-[#14B8A6] hover:underline font-medium">Edit</button>
                        <button onClick={() => completeTask(task.id)} className="ml-3 text-emerald-600 hover:underline font-medium">Complete</button>
                        <button onClick={() => removeTask(task.id)} className="ml-3 text-rose-600 hover:underline font-medium">Delete</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-3">
          <h3 className="text-[16px] font-semibold text-slate-900">Completed office tasks</h3>
        </div>
        {completedTasks.length === 0 ? (
          <div className="p-12 flex flex-col items-center justify-center text-center">
            <div className="mb-3 rounded-full border-4 border-slate-200 p-3">
              <Info className="size-6 text-slate-400" />
            </div>
            <p className="text-sm text-slate-500">No completed office tasks saved</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase">Completed at</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase">Completed by</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase">Description</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase">Created by</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase">Assignee</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {completedTasks.map((task) => (
                  <tr key={task.id}>
                    <td className="px-4 py-3 text-slate-600">{task.completed_at ? dayjs(task.completed_at).format('ddd D MMM YYYY [at] h:mm a') : '-'}</td>
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{formatOfficeTaskCompletedBy(task)}</td>
                    <td className="px-4 py-3 text-slate-800">{task.description}</td>
                    <td className="px-4 py-3 text-slate-700">{task.created_by_name}</td>
                    <td className="px-4 py-3 text-slate-700">{task.assignee_name || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div>}
    </div>
  );
}
