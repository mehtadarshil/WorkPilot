import type { NextFunction, Request, Response } from 'express';
import type { TenantPermissionKey } from './tenantPermissions';
import type { TenantAuthUser } from './tenantAccess';
import { tenantCrmAccessAllowed } from './tenantAccess';
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
  if (u.role === 'ADMIN') {
    return u.permissions == null ? presetManagerPermissions() : normalizePermissionsJson(u.permissions);
  }
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

/** Tenant-wide diary list (mobile “All team” tab) — admin, super admin, or staff with jobs/scheduling. */
export function canUseTeamDiaryScope(u: FieldMobileJwtUser): boolean {
  if (u.role === 'SUPER_ADMIN' || u.role === 'ADMIN') return true;
  if (u.role === 'STAFF') {
    const p = fieldEffectivePerms(u);
    return p.jobs === true || p.scheduling === true;
  }
  return false;
}

/** Field officers on the mobile app may read/write job-linked certificates and site reports. */
export function tenantCrmOrMobileJobDocsAccessAllowed(
  user: TenantAuthUser | undefined,
  permission: TenantPermissionKey,
  method: string,
  req: { get(name: string): string | undefined },
): boolean {
  if (tenantCrmAccessAllowed(user, permission, method)) return true;
  if (!user || user.role !== 'OFFICER') return false;
  if (!isMobileWorkPilotClient(req)) return false;
  if (!fieldMobileHasJobs(user)) return false;
  if (user.tenantScopeUserId == null || !Number.isFinite(user.tenantScopeUserId)) return false;
  const m = (method || 'GET').toUpperCase();
  const allowed = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH'];
  if (!allowed.includes(m)) return false;
  if (permission === 'certifications' || permission === 'customers') return true;
  return false;
}

export function requireTenantCrmOrMobileJobDocs(permission: TenantPermissionKey) {
  return (req: Request & { user?: TenantAuthUser }, res: Response, next: NextFunction): void => {
    if (!tenantCrmOrMobileJobDocsAccessAllowed(req.user, permission, req.method, req)) {
      res.status(403).json({ message: 'Forbidden: insufficient permissions' });
      return;
    }
    next();
  };
}
