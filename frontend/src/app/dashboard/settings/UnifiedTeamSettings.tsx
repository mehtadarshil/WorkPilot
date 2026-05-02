'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Pencil, UserCircle } from 'lucide-react';
import { getJson, postJson, patchJson, deleteRequest } from '../../apiClient';
import {
  TENANT_PERMISSION_KEYS,
  PERMISSION_LABELS,
  PERMISSION_HINTS,
  PERMISSION_UI_GROUPS,
  FIELD_MOBILE_PERMISSION_KEYS,
  stripToFieldMobilePermissions,
  type TenantPermissionsMap,
  presetManagerPermissions,
  presetDeskOfficerPermissions,
  presetFieldOfficerPermissions,
  emptyPermissions,
} from '../../../lib/tenantPermissions';
import type { User } from './UsersSettings';

export type TeamMemberKind = 'dashboard' | 'field';

export interface TeamMemberRow {
  kind: TeamMemberKind;
  id: number;
  email: string | null;
  full_name: string | null;
  role: string;
  is_owner: boolean;
  permissions: TenantPermissionsMap | null;
  status: string;
  created_at: string;
  access_label: string;
  linked_user_id?: number | null;
}

interface UnifiedTeamSettingsProps {
  onOfficerProfile?: (u: User) => void;
  onTeamChanged?: () => void;
}

function permSummary(p: TenantPermissionsMap | null): string {
  if (!p) return '—';
  const on = TENANT_PERMISSION_KEYS.filter((k) => p[k]).map((k) => PERMISSION_LABELS[k]);
  return on.length ? on.slice(0, 4).join(', ') + (on.length > 4 ? '…' : '') : 'None';
}

export default function UnifiedTeamSettings({ onOfficerProfile, onTeamChanged }: UnifiedTeamSettingsProps) {
  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [accountKind, setAccountKind] = useState<'dashboard' | 'field'>('dashboard');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formFullName, setFormFullName] = useState('');
  const [linkFieldProfile, setLinkFieldProfile] = useState(false);
  const [preset, setPreset] = useState<'manager' | 'desk_officer' | 'field' | 'custom'>('desk_officer');
  const [perms, setPerms] = useState<TenantPermissionsMap>(() => presetDeskOfficerPermissions());
  const [formError, setFormError] = useState<string | null>(null);

  const [editRow, setEditRow] = useState<TeamMemberRow | null>(null);
  const [editPassword, setEditPassword] = useState('');

  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  const applyPreset = (p: typeof preset) => {
    setPreset(p);
    if (p === 'manager') setPerms(presetManagerPermissions());
    else if (p === 'desk_officer') setPerms(presetDeskOfficerPermissions());
    else if (p === 'field') setPerms(presetFieldOfficerPermissions());
    else setPerms(emptyPermissions());
  };

  const fetchMembers = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getJson<{ members: TeamMemberRow[] }>('/tenant-team', token);
      setMembers(data.members ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load team.');
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const togglePerm = (key: keyof TenantPermissionsMap) => {
    setPreset('custom');
    setPerms((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const openAdd = () => {
    setFormError(null);
    setFormEmail('');
    setFormPassword('');
    setFormFullName('');
    setAccountKind('dashboard');
    setLinkFieldProfile(false);
    applyPreset('desk_officer');
    setAddOpen(true);
  };

  const openEdit = (m: TeamMemberRow) => {
    if (m.is_owner) return;
    setFormError(null);
    setEditPassword('');
    setEditRow(m);
    setFormFullName(m.full_name || '');
    setPreset('custom');
    setPerms(m.permissions ? { ...emptyPermissions(), ...m.permissions } : presetDeskOfficerPermissions());
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!token) return;
    if (!formEmail.trim() || !formPassword.trim()) {
      setFormError('Email and password are required.');
      return;
    }
    if (accountKind === 'field' && !formFullName.trim()) {
      setFormError('Display name is required for field accounts (used on jobs).');
      return;
    }
    try {
      if (accountKind === 'dashboard') {
        await postJson(
          '/tenant-staff',
          {
            email: formEmail.trim(),
            password: formPassword,
            full_name: formFullName.trim() || undefined,
            preset: preset === 'custom' ? undefined : preset === 'field' ? 'desk_officer' : preset,
            permissions: preset === 'custom' ? perms : undefined,
            link_field_profile: linkFieldProfile,
          },
          token,
        );
      } else {
        const fn = formFullName.trim() || formEmail.trim().split('@')[0] || 'Field user';
        await postJson(
          '/officers',
          {
            full_name: fn,
            email: formEmail.trim().toLowerCase(),
            initial_password: formPassword,
            state: 'active',
            permissions: stripToFieldMobilePermissions(perms),
          },
          token,
        );
      }
      setAddOpen(false);
      await fetchMembers();
      onTeamChanged?.();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create.');
    }
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!token || !editRow) return;
    try {
      if (editRow.kind === 'dashboard') {
        const body: Record<string, unknown> = {
          full_name: formFullName.trim() || null,
          preset: preset === 'custom' ? undefined : preset,
          permissions: preset === 'custom' ? perms : undefined,
        };
        const np = editPassword.trim();
        if (np) body.password = np;
        await patchJson(`/tenant-staff/${editRow.id}`, body, token);
      } else {
        const body: Record<string, unknown> = {
          permissions: stripToFieldMobilePermissions(perms),
          full_name: formFullName.trim(),
        };
        const np = editPassword.trim();
        if (np) body.initial_password = np;
        await patchJson(`/officers/${editRow.id}`, body, token);
      }
      setEditRow(null);
      await fetchMembers();
      onTeamChanged?.();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to update.');
    }
  };

  const handleDelete = async (m: TeamMemberRow) => {
    if (m.is_owner || !token) return;
    if (!window.confirm(`Remove ${m.kind === 'field' ? 'field account' : 'login'} for ${m.email}?`)) return;
    try {
      if (m.kind === 'dashboard') {
        await deleteRequest(`/tenant-staff/${m.id}`, token);
      } else {
        await deleteRequest(`/officers/${m.id}`, token);
      }
      await fetchMembers();
      onTeamChanged?.();
    } catch {
      setError('Failed to remove.');
    }
  };

  const permFormFor = (roleCtx: 'dashboard' | 'field') => (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-semibold text-slate-600">Role preset</label>
        <select
          value={preset}
          onChange={(e) => applyPreset(e.target.value as typeof preset)}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          {roleCtx === 'dashboard' ? (
            <>
              <option value="desk_officer">Desk (customers, jobs, scheduling)</option>
              <option value="manager">Manager (full CRM modules)</option>
              <option value="custom">Custom</option>
            </>
          ) : (
            <>
              <option value="field">Field mobile (jobs, diary, certifications)</option>
              <option value="custom">Custom</option>
            </>
          )}
        </select>
      </div>
      <div className="max-h-[min(28rem,55vh)] space-y-4 overflow-y-auto rounded-lg border border-slate-200 p-3">
        {roleCtx === 'field' ? (
          <>
            <p className="text-xs leading-relaxed text-slate-600">
              These control the <strong>WorkPilot mobile app</strong> for this field-only login. Quotes, invoices, parts catalog, and
              settings stay off because they are web CRM only.
            </p>
            <div className="space-y-2">
              {FIELD_MOBILE_PERMISSION_KEYS.map((k) => (
                <label
                  key={k}
                  className="flex flex-col gap-0.5 rounded-lg border border-slate-100 bg-slate-50/90 p-2.5 text-left transition hover:bg-slate-50"
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
                    <input type="checkbox" checked={perms[k]} onChange={() => togglePerm(k)} className="rounded border-slate-300" />
                    {PERMISSION_LABELS[k]}
                  </span>
                  <span className="pl-6 text-xs leading-snug text-slate-500">{PERMISSION_HINTS[k]}</span>
                </label>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="text-xs leading-relaxed text-slate-600">
              Controls the <strong>browser CRM</strong>. If you enable “linked field profile” when adding someone, Jobs, Diary, and the
              field-related flags below also apply on their phone.
            </p>
            {PERMISSION_UI_GROUPS.map((g) => (
              <div key={g.id} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-600">{g.title}</p>
                <p className="mt-0.5 text-xs text-slate-500">{g.description}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {g.keys.map((k) => (
                    <label
                      key={k}
                      className="flex flex-col gap-0.5 rounded-lg border border-slate-100 bg-white p-2 text-left shadow-sm"
                    >
                      <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
                        <input type="checkbox" checked={perms[k]} onChange={() => togglePerm(k)} className="rounded border-slate-300" />
                        {PERMISSION_LABELS[k]}
                      </span>
                      <span className="pl-6 text-xs leading-snug text-slate-500">{PERMISSION_HINTS[k]}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-8 pb-10 mb-2 border-b border-slate-200">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Team & access</h2>
          <p className="mt-1 text-sm text-slate-500">
            One place for dashboard logins and field-only mobile accounts. Permissions apply on the web and on the mobile app; field-only
            accounts cannot sign in to the web CRM.
          </p>
        </div>
        <motion.button
          type="button"
          onClick={openAdd}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#14B8A6] px-5 py-2.5 font-bold text-white shadow-sm transition hover:brightness-110"
        >
          <Plus className="size-5" />
          Add team member
        </motion.button>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Access</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Email</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Name</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Modules</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    Loading…
                  </td>
                </tr>
              ) : members.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    No team members yet.
                  </td>
                </tr>
              ) : (
                members.map((m) => (
                  <tr key={`${m.kind}-${m.id}`} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm text-slate-700">{m.access_label}</td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">{m.email || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{m.full_name || '—'}</td>
                    <td className="max-w-[200px] px-4 py-3 text-xs text-slate-500">{permSummary(m.permissions)}</td>
                    <td className="px-4 py-3 text-sm capitalize text-slate-600">{m.status?.toLowerCase() || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      {!m.is_owner && (
                        <div className="flex justify-end gap-1">
                          {m.kind === 'field' && onOfficerProfile && (
                            <button
                              type="button"
                              onClick={() =>
                                onOfficerProfile({
                                  id: m.id,
                                  full_name: m.full_name || '',
                                  role_position: null,
                                  department: null,
                                  phone: null,
                                  email: m.email,
                                  system_access_level: 'standard',
                                  certifications: null,
                                  assigned_responsibilities: null,
                                  state: m.status,
                                  created_at: m.created_at,
                                  updated_at: m.created_at,
                                })
                              }
                              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                              aria-label="Job profile"
                              title="Job profile & certifications"
                            >
                              <UserCircle className="size-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEdit(m)}
                            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                            aria-label="Edit"
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(m)}
                            className="rounded-lg p-2 text-rose-500 hover:bg-rose-50"
                            aria-label="Remove"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {addOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => setAddOpen(false)}
          >
            <motion.form
              initial={{ scale: 0.96 }}
              animate={{ scale: 1 }}
              onClick={(ev) => ev.stopPropagation()}
              onSubmit={handleAdd}
              className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            >
              <h3 className="text-lg font-bold text-slate-900">Add team member</h3>
              {formError && <p className="mt-2 text-sm text-rose-600">{formError}</p>}
              <div className="mt-4 space-y-4">
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs font-semibold text-slate-600">Account type</p>
                  <label className="mt-2 flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="acct"
                      checked={accountKind === 'dashboard'}
                      onChange={() => {
                        setAccountKind('dashboard');
                        applyPreset('desk_officer');
                      }}
                    />
                    Dashboard + mobile (same login; web CRM + app with permissions below)
                  </label>
                  <label className="mt-2 flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="acct"
                      checked={accountKind === 'field'}
                      onChange={() => {
                        setAccountKind('field');
                        applyPreset('field');
                      }}
                    />
                    Field — mobile app only (no web CRM; uses permissions on the app)
                  </label>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Email</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Initial password</label>
                  <input
                    type="password"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Display name</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={formFullName}
                    onChange={(e) => setFormFullName(e.target.value)}
                    placeholder={accountKind === 'field' ? 'Required for job assignment' : 'Optional'}
                  />
                </div>
                {accountKind === 'dashboard' && (
                  <label className="flex items-start gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="mt-1 rounded border-slate-300"
                      checked={linkFieldProfile}
                      onChange={(e) => setLinkFieldProfile(e.target.checked)}
                    />
                    <span>
                      Also create a field profile (same email) so this person can use diary and assigned jobs on the mobile app with this
                      login. Requires Jobs and/or Scheduling above.
                    </span>
                  </label>
                )}
                {permFormFor(accountKind)}
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button type="submit" className="rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-bold text-white hover:brightness-110">
                  Create
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editRow && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => setEditRow(null)}
          >
            <motion.form
              initial={{ scale: 0.96 }}
              animate={{ scale: 1 }}
              onClick={(ev) => ev.stopPropagation()}
              onSubmit={handleEditSave}
              className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            >
              <h3 className="text-lg font-bold text-slate-900">{editRow.kind === 'field' ? 'Edit field access' : 'Edit dashboard login'}</h3>
              <p className="text-sm text-slate-500">{editRow.email}</p>
              {formError && <p className="mt-2 text-sm text-rose-600">{formError}</p>}
              <div className="mt-4 space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600">Display name</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={formFullName}
                    onChange={(e) => setFormFullName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">New password (leave blank to keep)</label>
                  <input
                    type="password"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                {permFormFor(editRow.kind === 'field' ? 'field' : 'dashboard')}
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditRow(null)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button type="submit" className="rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-bold text-white hover:brightness-110">
                  Save
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
