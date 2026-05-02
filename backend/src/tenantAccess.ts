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
 * SUPER_ADMIN and tenant owner ADMIN: always true. STAFF: must have flag. OFFICER: false here (use officer routes).
 */
export function staffHasPermission(user: TenantAuthUser, permission: TenantPermissionKey): boolean {
  if (user.role === 'SUPER_ADMIN') return true;
  if (user.role === 'ADMIN') return isTenantOwner(user);
  if (user.role === 'STAFF') {
    const p = user.permissions;
    if (p && typeof p === 'object' && p[permission] === true) return true;
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
 * OFFICER may only GET/HEAD when they have the matching permission and a tenant scope user id on the JWT.
 */
export function tenantCrmAccessAllowed(
  user: TenantAuthUser | undefined,
  permission: TenantPermissionKey,
  method: string,
): boolean {
  if (!user) return false;
  const m = (method || 'GET').toUpperCase();
  if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') return true;
  if (user.role === 'STAFF') return staffHasPermission(user, permission);
  if (user.role === 'OFFICER') {
    if (m !== 'GET' && m !== 'HEAD') return false;
    if (user.tenantScopeUserId == null || !Number.isFinite(user.tenantScopeUserId)) return false;
    return officerHasPermission(user, permission);
  }
  return false;
}

export function requireTenantCrmAccess(permission: TenantPermissionKey) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!tenantCrmAccessAllowed(req.user, permission, req.method)) {
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
