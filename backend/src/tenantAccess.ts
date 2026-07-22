import type { Response, NextFunction, Request } from 'express';
import {
  type TenantPermissionKey,
  isTenantPermissionKey,
  normalizePermissionsJson,
} from './tenantPermissions';

export type CmsUserRole = 'SUPER_ADMIN' | 'ADMIN' | 'STAFF' | 'OFFICER';

/** JWT / session user shape used for tenant scoping (matches backend JwtPayload). */
export interface TenantAuthUser {
  userId: number;
  email: string;
  role: CmsUserRole;
  officerId?: number;
  /** User id used for `created_by` / tenant data scope (owner id for STAFF). */
  tenantScopeUserId?: number;
  /** Owner's users.id when this login is STAFF; null/undefined for owner ADMIN. */
  tenantAdminId?: number | null;
  permissions?: Record<string, boolean> | null;
}

export type AuthenticatedRequest = Request & { user?: TenantAuthUser };

export function getTenantScopeUserId(user: TenantAuthUser): number {
  if (user.tenantScopeUserId != null && Number.isFinite(user.tenantScopeUserId)) {
    return user.tenantScopeUserId;
  }
  return user.userId;
}

/** True if this login is a company CRM admin (primary tenant account), not STAFF or SUPER_ADMIN. */
export function isTenantOwner(user: TenantAuthUser): boolean {
  return user.role === 'ADMIN';
}

/**
 * Returns whether the user may perform actions keyed by `permission`.
 * SUPER_ADMIN always true. ADMIN defaults to true unless a permissions map exists.
 * STAFF must have the flag. OFFICER: false here (use officer routes).
 */
export function staffHasPermission(user: TenantAuthUser, permission: TenantPermissionKey): boolean {
  if (user.role === 'SUPER_ADMIN') return true;
  if (user.role === 'ADMIN') {
    if (!isTenantOwner(user)) return false;
    const p = user.permissions;
    if (p == null) return true;
    if (typeof p !== 'object') return false;
    if (p[permission] === true) return true;
    if (
      (permission === 'settings_invoice' || permission === 'settings_quotation' || permission === 'settings_email') &&
      p.settings_company === true
    ) {
      return true;
    }
    if (
      permission.startsWith('settings_') &&
      permission !== 'settings_company' &&
      permission !== 'settings_invoice' &&
      permission !== 'settings_quotation' &&
      permission !== 'settings_email' &&
      p.settings_master_data === true
    ) {
      return true;
    }
    return false;
  }
  if (user.role === 'STAFF') {
    const p = user.permissions;
    if (p && typeof p === 'object' && p[permission] === true) return true;
    if (p && typeof p === 'object') {
      if (
        (permission === 'settings_invoice' || permission === 'settings_quotation' || permission === 'settings_email') &&
        p.settings_company === true
      ) {
        return true;
      }
      if (
        permission.startsWith('settings_') &&
        permission !== 'settings_company' &&
        permission !== 'settings_invoice' &&
        permission !== 'settings_quotation' &&
        permission !== 'settings_email' &&
        p.settings_master_data === true
      ) {
        return true;
      }
    }
    return false;
  }
  return false;
}

export function assertStaffPermission(user: TenantAuthUser | undefined, permission: TenantPermissionKey): boolean {
  if (!user) return false;
  return staffHasPermission(user, permission);
}

/** Field-officer JWT: explicit permission flag after normalization. */
export function officerHasPermission(user: TenantAuthUser, permission: TenantPermissionKey): boolean {
  if (user.role !== 'OFFICER') return false;
  const p = normalizePermissionsJson(user.permissions ?? {});
  return p[permission] === true;
}

/**
 * Same CRM routes as the web dashboard: tenant owner + STAFF keep full verbs;
 * OFFICER may GET/HEAD with the matching permission. For writes, pass
 * `officerWritePermission` so officers can POST when they have that flag
 * (e.g. invoices create, invoice_send for email).
 */
export function tenantCrmAccessAllowed(
  user: TenantAuthUser | undefined,
  permission: TenantPermissionKey,
  method: string,
  opts?: { officerWritePermission?: TenantPermissionKey },
): boolean {
  if (!user) return false;
  const m = (method || 'GET').toUpperCase();
  if (user.role === 'SUPER_ADMIN') return true;
  if (user.role === 'ADMIN') return staffHasPermission(user, permission);
  if (user.role === 'STAFF') return staffHasPermission(user, permission);
  if (user.role === 'OFFICER') {
    if (user.tenantScopeUserId == null || !Number.isFinite(user.tenantScopeUserId)) return false;
    if (m === 'GET' || m === 'HEAD') {
      return officerHasPermission(user, permission);
    }
    const writeKey = opts?.officerWritePermission;
    if (!writeKey) return false;
    return officerHasPermission(user, writeKey);
  }
  return false;
}

export function requireTenantCrmAccess(
  permission: TenantPermissionKey,
  opts?: { officerWritePermission?: TenantPermissionKey },
) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!tenantCrmAccessAllowed(req.user, permission, req.method, opts)) {
      res.status(403).json({ message: 'Forbidden: insufficient permissions' });
      return;
    }
    next();
  };
}

/** STAFF: any of the listed permissions; SUPER_ADMIN / ADMIN: true. */
export function assertStaffPermissionAny(
  user: TenantAuthUser | undefined,
  keys: readonly TenantPermissionKey[],
): boolean {
  if (!user) return false;
  if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') return true;
  if (user.role === 'STAFF') return keys.some((k) => staffHasPermission(user, k));
  if (user.role === 'OFFICER') return true;
  return false;
}

export function requirePermission(permission: TenantPermissionKey) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!assertStaffPermission(req.user, permission)) {
      res.status(403).json({ message: 'Forbidden: insufficient permissions' });
      return;
    }
    next();
  };
}

export function requireTenantOwner(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'ADMIN') {
    res.status(403).json({ message: 'Forbidden: tenant owner access required' });
    return;
  }
  next();
}

/** Parse permissions from DB JSONB for JWT / responses. */
export function permissionsFromDb(raw: unknown): Record<TenantPermissionKey, boolean> {
  return normalizePermissionsJson(raw);
}

export function parsePermissionsBody(body: unknown): Record<TenantPermissionKey, boolean> | null {
  if (body == null) return null;
  if (typeof body !== 'object' || Array.isArray(body)) return null;
  const o = body as Record<string, unknown>;
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(o)) {
    if (isTenantPermissionKey(k) && typeof v === 'boolean') out[k] = v;
  }
  return normalizePermissionsJson(out);
}
