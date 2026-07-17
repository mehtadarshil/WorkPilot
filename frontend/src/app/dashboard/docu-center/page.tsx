'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FolderOpen,
  FileText,
  Plus,
  Trash2,
  Upload,
  ChevronRight,
  Loader2,
  Settings2,
  Download,
  Home,
} from 'lucide-react';
import { deleteRequest, getBlob, getJson, patchJson, postJson } from '../../apiClient';

type FolderRole = 'ADMIN' | 'STAFF' | 'OFFICER';

type AccessPrincipal = {
  kind: 'user' | 'officer';
  id: number;
  full_name: string;
  subtitle: string | null;
};

type DocuFolder = {
  id: number;
  parent_id: number | null;
  name: string;
  allowed_roles: string[];
  allowed_user_ids: number[];
  allowed_officer_ids: number[];
  sort_order: number;
};

type DocuFile = {
  id: number;
  folder_id: number;
  original_filename: string;
  content_type: string | null;
  byte_size: number;
  notes: string | null;
  created_at: string | null;
  uploaded_by_name?: string | null;
  content_path: string;
};

type Breadcrumb = { id: number; name: string };

const ROLE_OPTIONS: { key: FolderRole; label: string }[] = [
  { key: 'ADMIN', label: 'Admin' },
  { key: 'STAFF', label: 'Staff' },
  { key: 'OFFICER', label: 'Officer / field' },
];

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const i = result.indexOf(',');
      resolve(i >= 0 ? result.slice(i + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function principalKey(p: AccessPrincipal): string {
  return `${p.kind}:${p.id}`;
}

function folderAccessSubtitle(f: DocuFolder): string {
  const peopleCount = (f.allowed_user_ids?.length ?? 0) + (f.allowed_officer_ids?.length ?? 0);
  const roles = f.allowed_roles ?? [];
  if (roles.length === 0 && peopleCount === 0) return 'Managers only';
  const parts: string[] = [];
  if (roles.length > 0) parts.push(roles.join(', '));
  if (peopleCount > 0) parts.push(`${peopleCount} specific ${peopleCount === 1 ? 'person' : 'people'}`);
  return `Visible to: ${parts.join(' + ')}`;
}

function selectedPrincipalKeys(userIds: number[], officerIds: number[]): Set<string> {
  const keys = new Set<string>();
  for (const id of userIds) keys.add(`user:${id}`);
  for (const id of officerIds) keys.add(`officer:${id}`);
  return keys;
}

function principalIdsFromKeys(keys: Set<string>): { userIds: number[]; officerIds: number[] } {
  const userIds: number[] = [];
  const officerIds: number[] = [];
  for (const key of keys) {
    const [kind, idRaw] = key.split(':');
    const id = parseInt(idRaw, 10);
    if (!Number.isFinite(id)) continue;
    if (kind === 'user') userIds.push(id);
    if (kind === 'officer') officerIds.push(id);
  }
  return { userIds, officerIds };
}

export default function DocuCenterPage() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [parentId, setParentId] = useState<number | null>(null);
  const [folders, setFolders] = useState<DocuFolder[]>([]);
  const [files, setFiles] = useState<DocuFile[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);
  const [busy, setBusy] = useState(false);

  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderRoles, setNewFolderRoles] = useState<FolderRole[]>(['ADMIN', 'STAFF', 'OFFICER']);
  const [newFolderPeople, setNewFolderPeople] = useState<Set<string>>(new Set());

  const [folderOptions, setFolderOptions] = useState<DocuFolder | null>(null);
  const [editName, setEditName] = useState('');
  const [editRoles, setEditRoles] = useState<FolderRole[]>([]);
  const [editPeople, setEditPeople] = useState<Set<string>>(new Set());

  const [accessPrincipals, setAccessPrincipals] = useState<AccessPrincipal[]>([]);
  const [peopleFilter, setPeopleFilter] = useState('');

  useEffect(() => {
    setToken(localStorage.getItem('wp_token'));
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const q = parentId == null ? '' : `?parent_id=${parentId}`;
      const folderRes = await getJson<{
        folders: DocuFolder[];
        can_manage: boolean;
      }>(`/docu-center/folders${q}`, token);
      setFolders(folderRes.folders ?? []);
      setCanManage(!!folderRes.can_manage);

      if (parentId != null) {
        const detail = await getJson<{
          folder: DocuFolder;
          breadcrumbs: Breadcrumb[];
          can_manage: boolean;
        }>(`/docu-center/folders/${parentId}`, token);
        setBreadcrumbs(detail.breadcrumbs ?? []);
        setCanManage(!!detail.can_manage);
        const fileRes = await getJson<{ files: DocuFile[]; can_manage: boolean }>(
          `/docu-center/folders/${parentId}/files`,
          token,
        );
        setFiles(fileRes.files ?? []);
      } else {
        setBreadcrumbs([]);
        setFiles([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load Docu Center');
      setFolders([]);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [token, parentId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!token || !canManage) return;
    void getJson<{ people: AccessPrincipal[] }>('/docu-center/access-principals', token)
      .then((res) => setAccessPrincipals(res.people ?? []))
      .catch(() => setAccessPrincipals([]));
  }, [token, canManage]);

  const title = useMemo(() => {
    if (breadcrumbs.length === 0) return 'Docu Center';
    return breadcrumbs[breadcrumbs.length - 1]?.name || 'Docu Center';
  }, [breadcrumbs]);

  async function createFolder() {
    if (!token || !newFolderName.trim()) return;
    const { userIds, officerIds } = principalIdsFromKeys(newFolderPeople);
    setBusy(true);
    try {
      await postJson(
        '/docu-center/folders',
        {
          name: newFolderName.trim(),
          parent_id: parentId,
          allowed_roles: newFolderRoles,
          allowed_user_ids: userIds,
          allowed_officer_ids: officerIds,
        },
        token,
      );
      setShowNewFolder(false);
      setNewFolderName('');
      setNewFolderRoles(['ADMIN', 'STAFF', 'OFFICER']);
      setNewFolderPeople(new Set());
      setPeopleFilter('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create folder');
    } finally {
      setBusy(false);
    }
  }

  async function saveFolderOptions() {
    if (!token || !folderOptions) return;
    const { userIds, officerIds } = principalIdsFromKeys(editPeople);
    setBusy(true);
    try {
      await patchJson(
        `/docu-center/folders/${folderOptions.id}`,
        {
          name: editName.trim(),
          allowed_roles: editRoles,
          allowed_user_ids: userIds,
          allowed_officer_ids: officerIds,
        },
        token,
      );
      setFolderOptions(null);
      setPeopleFilter('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update folder');
    } finally {
      setBusy(false);
    }
  }

  async function deleteFolder(id: number) {
    if (!token) return;
    if (!window.confirm('Delete this folder and everything inside it?')) return;
    setBusy(true);
    try {
      await deleteRequest(`/docu-center/folders/${id}`, token);
      if (parentId === id) setParentId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete folder');
    } finally {
      setBusy(false);
    }
  }

  async function onUpload(fileList: FileList | null) {
    if (!token || !fileList?.length || parentId == null) return;
    setBusy(true);
    try {
      for (const file of Array.from(fileList)) {
        const content_base64 = await fileToBase64(file);
        await postJson(
          `/docu-center/folders/${parentId}/files`,
          {
            filename: file.name,
            content_type: file.type || 'application/octet-stream',
            content_base64,
          },
          token,
        );
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function downloadFile(f: DocuFile) {
    if (!token) return;
    try {
      const blob = await getBlob(`/docu-center/files/${f.id}/content`, token);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = f.original_filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed');
    }
  }

  async function deleteFile(id: number) {
    if (!token) return;
    if (!window.confirm('Delete this file?')) return;
    setBusy(true);
    try {
      await deleteRequest(`/docu-center/files/${id}`, token);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete file');
    } finally {
      setBusy(false);
    }
  }

  function toggleRole(list: FolderRole[], key: FolderRole, set: (v: FolderRole[]) => void) {
    if (list.includes(key)) set(list.filter((r) => r !== key));
    else set([...list, key]);
  }

  function togglePerson(keys: Set<string>, key: string, set: (v: Set<string>) => void) {
    const next = new Set(keys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    set(next);
  }

  const filteredPrincipals = useMemo(() => {
    const q = peopleFilter.trim().toLowerCase();
    if (!q) return accessPrincipals;
    return accessPrincipals.filter(
      (p) =>
        p.full_name.toLowerCase().includes(q) ||
        (p.subtitle ?? '').toLowerCase().includes(q),
    );
  }, [accessPrincipals, peopleFilter]);

  function renderPeoplePicker(
    selected: Set<string>,
    setSelected: (v: Set<string>) => void,
  ) {
    return (
      <>
        <p className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-400">
          Specific people (optional)
        </p>
        <input
          className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
          value={peopleFilter}
          onChange={(e) => setPeopleFilter(e.target.value)}
          placeholder="Search by name…"
        />
        <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-100 p-2">
          {filteredPrincipals.length === 0 ? (
            <p className="px-1 py-2 text-xs text-slate-400">No people match.</p>
          ) : (
            filteredPrincipals.map((p) => {
              const key = principalKey(p);
              return (
                <label
                  key={key}
                  className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(key)}
                    onChange={() => togglePerson(selected, key, setSelected)}
                    className="mt-0.5 rounded border-slate-300 text-[#14B8A6] focus:ring-[#14B8A6]"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium text-slate-700">{p.full_name}</span>
                    {p.subtitle ? (
                      <span className="block text-xs text-slate-400">{p.subtitle}</span>
                    ) : null}
                  </span>
                </label>
              );
            })
          )}
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Roles and named people combine with OR — anyone matching either can view. Managers always
          have access.
        </p>
      </>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Docu Center</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Reference guides and company documents in folders. Access is controlled per folder.
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setShowNewFolder(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-[#14B8A6] px-3 py-2 text-sm font-bold text-white hover:bg-[#0d9488] disabled:opacity-50"
            >
              <Plus className="size-4" />
              New folder
            </button>
            {parentId != null && (
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
                <Upload className="size-4" />
                Upload
                <input
                  type="file"
                  className="hidden"
                  multiple
                  disabled={busy}
                  onChange={(e) => {
                    void onUpload(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
            )}
          </div>
        )}
      </div>

      <nav className="mb-4 flex flex-wrap items-center gap-1 text-sm font-semibold text-slate-500">
        <button
          type="button"
          onClick={() => setParentId(null)}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-slate-100 hover:text-[#14B8A6]"
        >
          <Home className="size-3.5" />
          Root
        </button>
        {breadcrumbs.map((c) => (
          <span key={c.id} className="inline-flex items-center gap-1">
            <ChevronRight className="size-3.5 text-slate-300" />
            <button
              type="button"
              onClick={() => setParentId(c.id)}
              className="rounded-md px-1.5 py-0.5 hover:bg-slate-100 hover:text-[#14B8A6]"
            >
              {c.name}
            </button>
          </span>
        ))}
      </nav>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">
                Folders{parentId != null ? ` in ${title}` : ''}
              </h2>
            </div>
            {folders.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm font-medium text-slate-400">
                No folders here yet.
                {canManage ? ' Create one to get started.' : ''}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {folders.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setParentId(f.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <span className="flex size-10 items-center justify-center rounded-lg bg-teal-50 text-[#14B8A6]">
                        <FolderOpen className="size-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-slate-800">{f.name}</span>
                        <span className="block text-xs font-medium text-slate-400">
                          {folderAccessSubtitle(f)}
                        </span>
                      </span>
                    </button>
                    {canManage && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          title="Folder options"
                          onClick={() => {
                            setFolderOptions(f);
                            setEditName(f.name);
                            setEditRoles(
                              (f.allowed_roles || []).filter((r): r is FolderRole =>
                                ROLE_OPTIONS.some((o) => o.key === r),
                              ),
                            );
                            setEditPeople(
                              selectedPrincipalKeys(
                                f.allowed_user_ids ?? [],
                                f.allowed_officer_ids ?? [],
                              ),
                            );
                            setPeopleFilter('');
                          }}
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        >
                          <Settings2 className="size-4" />
                        </button>
                        <button
                          type="button"
                          title="Delete folder"
                          onClick={() => void deleteFolder(f.id)}
                          className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {parentId != null && (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-4 py-3">
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Files</h2>
              </div>
              {files.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm font-medium text-slate-400">
                  No files in this folder.
                  {canManage ? ' Upload a PDF or guide.' : ''}
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {files.map((f) => (
                    <li key={f.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="flex size-10 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                        <FileText className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-slate-800">
                          {f.original_filename}
                        </span>
                        <span className="block text-xs font-medium text-slate-400">
                          {formatBytes(f.byte_size)}
                          {f.uploaded_by_name ? ` · ${f.uploaded_by_name}` : ''}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => void downloadFile(f)}
                        className="rounded-lg p-2 text-slate-400 hover:bg-teal-50 hover:text-[#14B8A6]"
                        title="Download"
                      >
                        <Download className="size-4" />
                      </button>
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => void deleteFile(f.id)}
                          className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          title="Delete"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {showNewFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">New folder</h3>
            <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-slate-400">
              Name
            </label>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="e.g. Safety guides"
            />
            <p className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-400">
              Roles who can view
            </p>
            <div className="mt-2 space-y-2">
              {ROLE_OPTIONS.map((r) => (
                <label key={r.key} className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={newFolderRoles.includes(r.key)}
                    onChange={() => toggleRole(newFolderRoles, r.key, setNewFolderRoles)}
                    className="rounded border-slate-300 text-[#14B8A6] focus:ring-[#14B8A6]"
                  />
                  {r.label}
                </label>
              ))}
            </div>
            {renderPeoplePicker(newFolderPeople, setNewFolderPeople)}
            <p className="mt-2 text-xs text-slate-400">
              Leave roles and people unchecked for managers only. Nested folders also require access to
              parent folders.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewFolder(false)}
                className="rounded-lg px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !newFolderName.trim()}
                onClick={() => void createFolder()}
                className="rounded-lg bg-[#14B8A6] px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {folderOptions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Folder options</h3>
            <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-slate-400">
              Name
            </label>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
            <p className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-400">
              Roles who can view
            </p>
            <div className="mt-2 space-y-2">
              {ROLE_OPTIONS.map((r) => (
                <label key={r.key} className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={editRoles.includes(r.key)}
                    onChange={() => toggleRole(editRoles, r.key, setEditRoles)}
                    className="rounded border-slate-300 text-[#14B8A6] focus:ring-[#14B8A6]"
                  />
                  {r.label}
                </label>
              ))}
            </div>
            {renderPeoplePicker(editPeople, setEditPeople)}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFolderOptions(null)}
                className="rounded-lg px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !editName.trim()}
                onClick={() => void saveFolderOptions()}
                className="rounded-lg bg-[#14B8A6] px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
