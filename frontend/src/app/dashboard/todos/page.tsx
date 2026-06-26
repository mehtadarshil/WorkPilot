'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle,
  Circle,
  Plus,
  Trash2,
  Calendar,
  Clock,
  Filter,
  X,
  Loader2,
} from 'lucide-react';
import { getJson, postJson, patchJson, deleteRequest } from '../../apiClient';

type Todo = {
  id: number;
  user_id: number;
  user_name: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  due_time: string | null;
  completed: boolean;
  completed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type User = {
  id: number;
  full_name: string;
  role: string;
};

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/30';

export default function TodosPage() {
  const [token, setToken] = useState<string | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [filterCompleted, setFilterCompleted] = useState<'all' | 'pending' | 'done'>('pending');
  const [users, setUsers] = useState<User[]>([]);
  const [userFilter, setUserFilter] = useState<string>('');

  const [form, setForm] = useState({
    title: '',
    description: '',
    due_date: '',
    due_time: '',
    user_id: '',
  });

  const isAdmin = (() => {
    if (typeof window === 'undefined') return false;
    try {
      const raw = localStorage.getItem('wp_user');
      if (!raw) return false;
      const u = JSON.parse(raw);
      return u.role === 'SUPER_ADMIN' || u.role === 'ADMIN';
    } catch {
      return false;
    }
  })();

  useEffect(() => {
    setToken(localStorage.getItem('wp_token'));
  }, []);

  const fetchTodos = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      let url = '/todos';
      const params: string[] = [];
      if (filterCompleted === 'pending') params.push('completed=false');
      else if (filterCompleted === 'done') params.push('completed=true');
      if (isAdmin && userFilter) params.push(`user_id=${userFilter}`);
      if (params.length > 0) url += '?' + params.join('&');
      const res = await getJson<{ todos: Todo[] }>(url, token);
      setTodos(res.todos || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load todos');
    } finally {
      setLoading(false);
    }
  }, [token, filterCompleted, userFilter, isAdmin]);

  const fetchUsers = useCallback(async () => {
    if (!token || !isAdmin) return;
    try {
      const res = await getJson<{ users: User[] }>('/tenant-staff', token);
      setUsers(res.users || []);
    } catch {
      // non-critical
    }
  }, [token, isAdmin]);

  useEffect(() => {
    void fetchTodos();
  }, [fetchTodos]);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const resetForm = () => {
    setForm({ title: '', description: '', due_date: '', due_time: '', user_id: '' });
    setEditingId(null);
    setShowAdd(false);
  };

  const handleSave = async () => {
    if (!token || !form.title.trim()) return;
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        due_date: form.due_date || null,
        due_time: form.due_time || null,
      };
      if (isAdmin && form.user_id) payload.user_id = form.user_id;

      if (editingId) {
        await patchJson(`/todos/${editingId}`, payload, token);
      } else {
        await postJson('/todos', payload, token);
      }
      resetForm();
      await fetchTodos();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save todo');
    }
  };

  const handleToggleComplete = async (todo: Todo) => {
    if (!token) return;
    try {
      await patchJson(`/todos/${todo.id}`, { completed: !todo.completed }, token);
      await fetchTodos();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const handleDelete = async (id: number) => {
    if (!token) return;
    try {
      await deleteRequest(`/todos/${id}`, token);
      await fetchTodos();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const startEdit = (todo: Todo) => {
    setForm({
      title: todo.title,
      description: todo.description || '',
      due_date: todo.due_date || '',
      due_time: todo.due_time || '',
      user_id: String(todo.user_id),
    });
    setEditingId(todo.id);
    setShowAdd(true);
  };

  const formatDue = (todo: Todo) => {
    const parts: string[] = [];
    if (todo.due_date) parts.push(todo.due_date);
    if (todo.due_time) parts.push(todo.due_time.length > 5 ? todo.due_time.slice(0, 5) : todo.due_time);
    return parts.join(' ');
  };

  const isOverdue = (todo: Todo) => {
    if (todo.completed || !todo.due_date) return false;
    const due = new Date(todo.due_date + (todo.due_time ? `T${todo.due_time}` : 'T23:59:59'));
    return due < new Date();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black tracking-tight text-slate-900">Todos</h1>
          <p className="text-sm text-slate-500">Manage your tasks and to-dos</p>
        </div>
        <button
          type="button"
          onClick={() => { resetForm(); setShowAdd(true); }}
          className="inline-flex items-center gap-2 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-bold text-white hover:bg-[#119f8e]"
        >
          <Plus className="size-4" />
          New todo
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <Filter className="size-4 text-slate-400" />
        <div className="flex gap-1">
          {(['pending', 'done', 'all'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilterCompleted(f)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                filterCompleted === f
                  ? 'bg-[#14B8A6]/10 text-[#14B8A6]'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {f === 'pending' ? 'Pending' : f === 'done' ? 'Done' : 'All'}
            </button>
          ))}
        </div>
        {isAdmin && users.length > 0 && (
          <select
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            className="ml-auto rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-[#14B8A6]"
          >
            <option value="">All team members</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.full_name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Todo list */}
      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
          <Loader2 className="mx-auto mb-2 size-5 animate-spin text-slate-400" />
          Loading todos…
        </div>
      ) : todos.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-400">
          {filterCompleted === 'pending' ? 'No pending todos. Nice work!' : 'No todos found.'}
        </div>
      ) : (
        <div className="space-y-2">
          {todos.map((todo) => (
            <div
              key={todo.id}
              className={`flex items-start gap-3 rounded-xl border bg-white px-4 py-3 transition-colors ${
                todo.completed ? 'border-slate-200 opacity-60' : isOverdue(todo) ? 'border-rose-200 bg-rose-50/50' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <button
                type="button"
                onClick={() => void handleToggleComplete(todo)}
                className="mt-0.5 shrink-0"
              >
                {todo.completed ? (
                  <CheckCircle className="size-5 text-[#14B8A6]" />
                ) : (
                  <Circle className="size-5 text-slate-300 hover:text-[#14B8A6]" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className={`text-sm font-semibold ${todo.completed ? 'text-slate-500 line-through' : 'text-slate-900'}`}>
                    {todo.title}
                  </h3>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(todo)}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      title="Edit"
                    >
                      <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(todo.id)}
                      className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      title="Delete"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
                {todo.description && (
                  <p className="mt-1 text-xs text-slate-500 line-clamp-2">{todo.description}</p>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                  {formatDue(todo) && (
                    <span className={`inline-flex items-center gap-1 ${isOverdue(todo) ? 'font-bold text-rose-600' : ''}`}>
                      <Calendar className="size-3" />
                      {formatDue(todo)}
                    </span>
                  )}
                  {isAdmin && todo.user_name && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                      {todo.user_name}
                    </span>
                  )}
                  {todo.completed && todo.completed_at && (
                    <span className="inline-flex items-center gap-1 text-[#14B8A6]">
                      <CheckCircle className="size-3" />
                      Done
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={resetForm}>
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">{editingId ? 'Edit todo' : 'New todo'}</h2>
              <button type="button" onClick={resetForm} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="size-5" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-500">Title *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="What needs to be done?"
                  className={`${inputClass} mt-1`}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  placeholder="Optional details…"
                  className={`${inputClass} mt-1 resize-none`}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500">Due date</label>
                  <input
                    type="date"
                    value={form.due_date}
                    onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                    className={`${inputClass} mt-1`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500">Due time</label>
                  <input
                    type="time"
                    value={form.due_time}
                    onChange={(e) => setForm((f) => ({ ...f, due_time: e.target.value }))}
                    className={`${inputClass} mt-1`}
                  />
                </div>
              </div>
              {isAdmin && !editingId && users.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-slate-500">Assign to</label>
                  <select
                    value={form.user_id}
                    onChange={(e) => setForm((f) => ({ ...f, user_id: e.target.value }))}
                    className={`${inputClass} mt-1`}
                  >
                    <option value="">Myself</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.full_name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={!form.title.trim()}
                className="rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-bold text-white hover:bg-[#119f8e] disabled:opacity-50"
              >
                {editingId ? 'Save changes' : 'Add todo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
