'use client';

import {
  emptyPermissions,
  PERMISSION_HINTS,
  PERMISSION_LABELS,
  PERMISSION_UI_GROUPS,
  presetManagerPermissions,
  type TenantPermissionKey,
  type TenantPermissionsMap,
} from '../../../lib/tenantPermissions';

interface ClientPermissionsEditorProps {
  value: TenantPermissionsMap;
  onChange: (next: TenantPermissionsMap) => void;
}

export function fullClientPermissions(): TenantPermissionsMap {
  return presetManagerPermissions();
}

export function normalizeClientPermissions(raw: Partial<Record<TenantPermissionKey, boolean>> | null | undefined): TenantPermissionsMap {
  const base = emptyPermissions();
  for (const key of Object.keys(base) as TenantPermissionKey[]) {
    base[key] = raw?.[key] === true;
  }
  return base;
}

export default function ClientPermissionsEditor({ value, onChange }: ClientPermissionsEditorProps) {
  const allKeys = PERMISSION_UI_GROUPS.flatMap((group) => group.keys);
  const enabledCount = allKeys.filter((key) => value[key]).length;

  const setAll = (enabled: boolean) => {
    const next = emptyPermissions();
    for (const key of Object.keys(next) as TenantPermissionKey[]) {
      next[key] = enabled;
    }
    onChange(next);
  };

  const toggle = (key: TenantPermissionKey) => {
    onChange({ ...value, [key]: !value[key] });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-900">Client admin permissions</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            New client admins start with all permissions. Super admins can limit modules here.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setAll(true)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100">
            Select all
          </button>
          <button type="button" onClick={() => setAll(false)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100">
            Clear
          </button>
        </div>
      </div>
      <p className="mt-3 text-xs font-semibold text-slate-500">{enabledCount} permissions enabled</p>
      <div className="mt-4 space-y-4">
        {PERMISSION_UI_GROUPS.map((group) => (
          <div key={group.id} className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-600">{group.title}</p>
            <p className="mt-0.5 text-xs text-slate-500">{group.description}</p>
            <div className="mt-3 grid gap-2">
              {group.keys.map((key) => (
                <label key={key} className="flex items-start gap-2 rounded-lg border border-slate-100 p-2 text-sm text-slate-700">
                  <input type="checkbox" checked={value[key]} onChange={() => toggle(key)} className="mt-1 rounded border-slate-300" />
                  <span>
                    <span className="block font-semibold">{PERMISSION_LABELS[key]}</span>
                    <span className="block text-xs leading-snug text-slate-500">{PERMISSION_HINTS[key]}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
