import type { TenantPermissionKey } from './tenantPermissions';
import {
  emptyPermissions,
  normalizePermissionsJson,
  presetFieldOfficerPermissions,
  presetManagerPermissions,
} from './tenantPermissions';

/** Subset of JWT user used for mobile field routes (avoid circular imports with index). */
export interface FieldMobileJwtUser {
  role: string;
  officerId?: number | null;
  permissions?: Record<string, boolean> | null;
}

export function isMobileWorkPilotClient(req: { get(name: string): string | undefined }): boolean {
  const v = req.get('x-workpilot-client');
  return typeof v === 'string' && v.trim().toLowerCase() === 'mobile';
}

/** Field officer, or dashboard user on the mobile app with a linked officer profile. */
export function diaryActsAsFieldOfficer(req: { get(name: string): string | undefined }, u: FieldMobileJwtUser): boolean {
  const oid = u.officerId ?? null;
  if (oid == null) return false;
  if (u.role === 'OFFICER') return true;
  if (u.role === 'STAFF' || u.role === 'ADMIN') return isMobileWorkPilotClient(req);
  return false;
}

export function fieldMobileSessionOk(u: FieldMobileJwtUser | undefined): boolean {
  if (!u?.officerId) return false;
  return u.role === 'OFFICER' || u.role === 'ADMIN' || u.role === 'STAFF';
}

export function fieldEffectivePerms(u: FieldMobileJwtUser): Record<TenantPermissionKey, boolean> {
  if (u.role === 'OFFICER') {
    const base = normalizePermissionsJson(u.permissions ?? {});
    if (!Object.values(base).some(Boolean)) return presetFieldOfficerPermissions();
    return base;
  }
  if (u.role === 'ADMIN') return presetManagerPermissions();
  if (u.role === 'STAFF') return normalizePermissionsJson(u.permissions ?? {});
  return emptyPermissions();
}

export function fieldMobileFeaturesEnabled(u: FieldMobileJwtUser): boolean {
  if (!fieldMobileSessionOk(u)) return false;
  const p = fieldEffectivePerms(u);
  return p.jobs === true || p.scheduling === true;
}

export function fieldMobileHasJobs(u: FieldMobileJwtUser): boolean {
  return fieldEffectivePerms(u).jobs === true;
}

export function fieldMobileHasScheduling(u: FieldMobileJwtUser): boolean {
  return fieldEffectivePerms(u).scheduling === true;
}
