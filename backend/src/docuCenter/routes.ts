import type { Application, Request, Response } from 'express';
import type { Pool, PoolClient } from 'pg';
import path from 'path';
import crypto from 'crypto';
import {
  getTenantScopeUserId,
  staffHasPermission,
  tenantCrmAccessAllowed,
  type TenantAuthUser,
} from '../tenantAccess';
import {
  loadWorkpilotFile,
  sendWorkpilotFile,
  writeWorkpilotFile,
} from '../workpilotFileStorage';
import { ensureDocuCenterSchema } from './schema';

type AuthReq = Request & { user?: TenantAuthUser };

type DocuRouteDeps = {
  pool: Pool;
  authenticate: (req: Request, res: Response, next: () => void) => void;
};

const ALLOWED_ROLE_VALUES = ['ADMIN', 'STAFF', 'OFFICER'] as const;
type FolderRole = (typeof ALLOWED_ROLE_VALUES)[number];

const DOCU_FILE_MAX_BYTES = 20 * 1024 * 1024;

function canManageDocu(user: TenantAuthUser | undefined): boolean {
  if (!user) return false;
  if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') return true;
  if (user.role === 'STAFF') return staffHasPermission(user, 'docu_center_manage');
  return false;
}

function canViewDocu(user: TenantAuthUser | undefined, method: string): boolean {
  if (canManageDocu(user)) return true;
  return tenantCrmAccessAllowed(user, 'docu_center', method);
}

function viewerRole(user: TenantAuthUser): FolderRole | 'SUPER_ADMIN' {
  const r = String(user.role || '').toUpperCase();
  if (r === 'SUPER_ADMIN') return 'SUPER_ADMIN';
  if (r === 'ADMIN') return 'ADMIN';
  if (r === 'STAFF') return 'STAFF';
  if (r === 'OFFICER') return 'OFFICER';
  return 'STAFF';
}

function parseAllowedRoles(raw: unknown): FolderRole[] {
  if (!Array.isArray(raw)) return [];
  const out: FolderRole[] = [];
  for (const item of raw) {
    const s = String(item || '')
      .trim()
      .toUpperCase();
    if ((ALLOWED_ROLE_VALUES as readonly string[]).includes(s) && !out.includes(s as FolderRole)) {
      out.push(s as FolderRole);
    }
  }
  return out;
}

function parseIdList(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const item of raw) {
    const n = typeof item === 'number' ? item : parseInt(String(item), 10);
    if (Number.isFinite(n) && n > 0 && !out.includes(n)) out.push(n);
  }
  return out;
}

function sanitizeOriginalName(name: string): string {
  const base = path.basename(String(name || '').trim()) || 'document';
  return base.replace(/[^\w.\- ()[\]]+/g, '_').slice(0, 500);
}

type FolderRow = {
  id: number;
  parent_id: number | null;
  name: string;
  allowed_roles: string[] | null;
  sort_order: number;
  created_by: number;
  created_at: Date;
  updated_at: Date;
};

type FolderAccessDetail = {
  userIds: Set<number>;
  officerIds: Set<number>;
  allowed_users: { user_id: number; full_name: string | null; email: string | null }[];
  allowed_officers: { officer_id: number; full_name: string | null }[];
};

function emptyFolderAccess(): FolderAccessDetail {
  return {
    userIds: new Set(),
    officerIds: new Set(),
    allowed_users: [],
    allowed_officers: [],
  };
}

function folderPayload(row: FolderRow, access: FolderAccessDetail = emptyFolderAccess()) {
  return {
    id: Number(row.id),
    parent_id: row.parent_id != null ? Number(row.parent_id) : null,
    name: row.name,
    allowed_roles: Array.isArray(row.allowed_roles) ? row.allowed_roles : [],
    allowed_user_ids: [...access.userIds],
    allowed_officer_ids: [...access.officerIds],
    allowed_users: access.allowed_users,
    allowed_officers: access.allowed_officers,
    sort_order: Number(row.sort_order) || 0,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : null,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : null,
  };
}

function userOfficerId(user: TenantAuthUser): number | null {
  if (user.officerId != null && Number.isFinite(user.officerId)) return user.officerId;
  if (user.role === 'OFFICER' && Number.isFinite(user.userId)) return user.userId;
  return null;
}

function maySeeFolder(
  user: TenantAuthUser,
  allowedRoles: string[] | null | undefined,
  access: FolderAccessDetail,
): boolean {
  if (user.role === 'SUPER_ADMIN') return true;
  if (canManageDocu(user)) return true;

  const officerId = userOfficerId(user);
  if (officerId != null && access.officerIds.has(officerId)) return true;
  if (user.role !== 'OFFICER' && access.userIds.has(user.userId)) return true;

  const roles = Array.isArray(allowedRoles) ? allowedRoles.map((r) => String(r).toUpperCase()) : [];
  if (roles.length === 0) return false;
  const vr = viewerRole(user);
  if (vr === 'SUPER_ADMIN') return true;
  return roles.includes(vr);
}

async function loadFolder(
  db: Pool | PoolClient,
  folderId: number,
  tenantId: number,
  isSuperAdmin: boolean,
): Promise<FolderRow | null> {
  const r = await db.query<FolderRow>(
    isSuperAdmin
      ? `SELECT id, parent_id, name, allowed_roles, sort_order, created_by, created_at, updated_at
         FROM docu_folders WHERE id = $1`
      : `SELECT id, parent_id, name, allowed_roles, sort_order, created_by, created_at, updated_at
         FROM docu_folders WHERE id = $1 AND created_by = $2`,
    isSuperAdmin ? [folderId] : [folderId, tenantId],
  );
  return r.rows[0] ?? null;
}

async function loadAccessForFolders(
  db: Pool | PoolClient,
  folderIds: number[],
): Promise<Map<number, FolderAccessDetail>> {
  const map = new Map<number, FolderAccessDetail>();
  if (folderIds.length === 0) return map;
  for (const id of folderIds) map.set(id, emptyFolderAccess());

  const r = await db.query<{
    folder_id: number;
    user_id: number | null;
    officer_id: number | null;
    user_name: string | null;
    user_email: string | null;
    officer_name: string | null;
  }>(
    `SELECT a.folder_id, a.user_id, a.officer_id,
            u.full_name AS user_name, u.email AS user_email,
            o.full_name AS officer_name
     FROM docu_folder_access a
     LEFT JOIN users u ON u.id = a.user_id
     LEFT JOIN officers o ON o.id = a.officer_id
     WHERE a.folder_id = ANY($1::int[])
     ORDER BY a.folder_id ASC, COALESCE(u.full_name, u.email, o.full_name) ASC`,
    [folderIds],
  );

  for (const row of r.rows) {
    const folderId = Number(row.folder_id);
    const entry = map.get(folderId) ?? emptyFolderAccess();
    if (row.user_id != null) {
      const userId = Number(row.user_id);
      entry.userIds.add(userId);
      entry.allowed_users.push({
        user_id: userId,
        full_name: row.user_name,
        email: row.user_email,
      });
    }
    if (row.officer_id != null) {
      const officerId = Number(row.officer_id);
      entry.officerIds.add(officerId);
      entry.allowed_officers.push({
        officer_id: officerId,
        full_name: row.officer_name,
      });
    }
    map.set(folderId, entry);
  }
  return map;
}

async function resolveValidAccessIds(
  db: Pool | PoolClient,
  tenantId: number,
  userIds: number[],
  officerIds: number[],
): Promise<{ userIds: number[]; officerIds: number[] }> {
  const validUsers: number[] = [];
  if (userIds.length > 0) {
    const ur = await db.query<{ id: number }>(
      `SELECT id FROM users
       WHERE id = ANY($1::int[])
         AND ((tenant_admin_id = $2 AND role = 'STAFF') OR (id = $2 AND role = 'ADMIN'))`,
      [userIds, tenantId],
    );
    for (const row of ur.rows) validUsers.push(Number(row.id));
  }

  const validOfficers: number[] = [];
  if (officerIds.length > 0) {
    const or = await db.query<{ id: number }>(
      `SELECT id FROM officers WHERE created_by = $1 AND id = ANY($2::int[])`,
      [tenantId, officerIds],
    );
    for (const row of or.rows) validOfficers.push(Number(row.id));
  }

  return { userIds: validUsers, officerIds: validOfficers };
}

async function replaceFolderAccess(
  db: Pool | PoolClient,
  folderId: number,
  tenantId: number,
  userIds: number[],
  officerIds: number[],
): Promise<FolderAccessDetail> {
  const valid = await resolveValidAccessIds(db, tenantId, userIds, officerIds);
  await db.query(`DELETE FROM docu_folder_access WHERE folder_id = $1`, [folderId]);
  for (const userId of valid.userIds) {
    await db.query(
      `INSERT INTO docu_folder_access (folder_id, user_id) VALUES ($1, $2)`,
      [folderId, userId],
    );
  }
  for (const officerId of valid.officerIds) {
    await db.query(
      `INSERT INTO docu_folder_access (folder_id, officer_id) VALUES ($1, $2)`,
      [folderId, officerId],
    );
  }
  const map = await loadAccessForFolders(db, [folderId]);
  return map.get(folderId) ?? emptyFolderAccess();
}

/** Walk parents; user must be allowed on every ancestor and the folder itself. */
async function userCanAccessFolder(
  db: Pool | PoolClient,
  user: TenantAuthUser,
  folderId: number,
  tenantId: number,
  isSuperAdmin: boolean,
): Promise<FolderRow | null> {
  let currentId: number | null = folderId;
  let leaf: FolderRow | null = null;
  const seen = new Set<number>();
  const chain: FolderRow[] = [];
  while (currentId != null) {
    if (seen.has(currentId)) break;
    seen.add(currentId);
    const folder = await loadFolder(db, currentId, tenantId, isSuperAdmin);
    if (!folder) return null;
    chain.push(folder);
    if (leaf == null) leaf = folder;
    currentId = folder.parent_id != null ? Number(folder.parent_id) : null;
  }

  const accessMap = await loadAccessForFolders(
    db,
    chain.map((f) => Number(f.id)),
  );
  for (const folder of chain) {
    const access = accessMap.get(Number(folder.id)) ?? emptyFolderAccess();
    if (!maySeeFolder(user, folder.allowed_roles, access)) return null;
  }
  return leaf;
}

export function mountDocuCenterRoutes(app: Application, deps: DocuRouteDeps): void {
  const { pool, authenticate } = deps;

  app.get('/api/docu-center/access-principals', authenticate, async (req: AuthReq, res: Response) => {
    if (!canViewDocu(req.user, req.method) || !canManageDocu(req.user)) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
    const tenantId = getTenantScopeUserId(req.user!);
    try {
      const usersR = await pool.query<{
        id: number;
        full_name: string | null;
        email: string;
        role: string;
      }>(
        `SELECT id, full_name, email, role
         FROM users
         WHERE (tenant_admin_id = $1 AND role = 'STAFF') OR (id = $1 AND role = 'ADMIN')
         ORDER BY role DESC, COALESCE(full_name, email) ASC`,
        [tenantId],
      );
      const officersR = await pool.query<{ id: number; full_name: string }>(
        `SELECT id, full_name FROM officers WHERE created_by = $1 ORDER BY full_name ASC LIMIT 500`,
        [tenantId],
      );
      const people: {
        kind: 'user' | 'officer';
        id: number;
        full_name: string;
        subtitle: string | null;
      }[] = [];
      for (const row of usersR.rows) {
        people.push({
          kind: 'user',
          id: Number(row.id),
          full_name: (row.full_name || row.email || `User #${row.id}`).trim(),
          subtitle: row.role === 'ADMIN' ? 'Admin' : 'Staff',
        });
      }
      for (const row of officersR.rows) {
        people.push({
          kind: 'officer',
          id: Number(row.id),
          full_name: (row.full_name || `Officer #${row.id}`).trim(),
          subtitle: 'Officer / field',
        });
      }
      return res.json({ people });
    } catch (err) {
      console.error('docu-center access-principals:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.get('/api/docu-center/folders', authenticate, async (req: AuthReq, res: Response) => {
    if (!canViewDocu(req.user, req.method)) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
    const user = req.user!;
    const tenantId = getTenantScopeUserId(user);
    const isSuperAdmin = user.role === 'SUPER_ADMIN';
    const parentRaw = typeof req.query.parent_id === 'string' ? req.query.parent_id.trim() : '';
    const parentId =
      parentRaw === '' || parentRaw === 'null' || parentRaw === 'root'
        ? null
        : parseInt(parentRaw, 10);
    if (parentId != null && !Number.isFinite(parentId)) {
      return res.status(400).json({ message: 'Invalid parent_id' });
    }

    try {
      if (parentId != null) {
        const parent = await userCanAccessFolder(pool, user, parentId, tenantId, isSuperAdmin);
        if (!parent) return res.status(404).json({ message: 'Folder not found' });
      }

      const r = await pool.query<FolderRow>(
        parentId == null
          ? isSuperAdmin
            ? `SELECT id, parent_id, name, allowed_roles, sort_order, created_by, created_at, updated_at
               FROM docu_folders WHERE parent_id IS NULL ORDER BY sort_order ASC, name ASC`
            : `SELECT id, parent_id, name, allowed_roles, sort_order, created_by, created_at, updated_at
               FROM docu_folders WHERE parent_id IS NULL AND created_by = $1
               ORDER BY sort_order ASC, name ASC`
          : isSuperAdmin
            ? `SELECT id, parent_id, name, allowed_roles, sort_order, created_by, created_at, updated_at
               FROM docu_folders WHERE parent_id = $1 ORDER BY sort_order ASC, name ASC`
            : `SELECT id, parent_id, name, allowed_roles, sort_order, created_by, created_at, updated_at
               FROM docu_folders WHERE parent_id = $1 AND created_by = $2
               ORDER BY sort_order ASC, name ASC`,
        parentId == null
          ? isSuperAdmin
            ? []
            : [tenantId]
          : isSuperAdmin
            ? [parentId]
            : [parentId, tenantId],
      );

      const accessMap = await loadAccessForFolders(
        pool,
        r.rows.map((row) => Number(row.id)),
      );

      const folders = r.rows
        .filter((row) => {
          const access = accessMap.get(Number(row.id)) ?? emptyFolderAccess();
          return maySeeFolder(user, row.allowed_roles, access);
        })
        .map((row) => folderPayload(row, accessMap.get(Number(row.id))));

      return res.json({
        parent_id: parentId,
        folders,
        can_manage: canManageDocu(user),
      });
    } catch (err) {
      console.error('docu-center list folders:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.get('/api/docu-center/folders/:id', authenticate, async (req: AuthReq, res: Response) => {
    if (!canViewDocu(req.user, req.method)) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
    const user = req.user!;
    const tenantId = getTenantScopeUserId(user);
    const isSuperAdmin = user.role === 'SUPER_ADMIN';
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid folder id' });

    try {
      const folder = await userCanAccessFolder(pool, user, id, tenantId, isSuperAdmin);
      if (!folder) return res.status(404).json({ message: 'Folder not found' });

      const accessMap = await loadAccessForFolders(pool, [id]);
      const access = accessMap.get(id) ?? emptyFolderAccess();

      const crumbs: { id: number; name: string }[] = [];
      let cur: number | null = id;
      const seen = new Set<number>();
      while (cur != null && !seen.has(cur)) {
        seen.add(cur);
        const f = await loadFolder(pool, cur, tenantId, isSuperAdmin);
        if (!f) break;
        crumbs.unshift({ id: Number(f.id), name: f.name });
        cur = f.parent_id != null ? Number(f.parent_id) : null;
      }

      return res.json({
        folder: folderPayload(folder, access),
        breadcrumbs: crumbs,
        can_manage: canManageDocu(user),
      });
    } catch (err) {
      console.error('docu-center get folder:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.post('/api/docu-center/folders', authenticate, async (req: AuthReq, res: Response) => {
    if (!canViewDocu(req.user, req.method) || !canManageDocu(req.user)) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
    const user = req.user!;
    const tenantId = getTenantScopeUserId(user);
    const isSuperAdmin = user.role === 'SUPER_ADMIN';
    const body = req.body as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 255) : '';
    if (!name) return res.status(400).json({ message: 'Folder name is required' });

    let parentId: number | null = null;
    if (body.parent_id != null && body.parent_id !== '') {
      const p = typeof body.parent_id === 'number' ? body.parent_id : parseInt(String(body.parent_id), 10);
      if (!Number.isFinite(p)) return res.status(400).json({ message: 'Invalid parent_id' });
      parentId = p;
    }
    const allowedRoles = parseAllowedRoles(body.allowed_roles);
    const allowedUserIds = parseIdList(body.allowed_user_ids);
    const allowedOfficerIds = parseIdList(body.allowed_officer_ids);
    const sortOrder =
      typeof body.sort_order === 'number' && Number.isFinite(body.sort_order)
        ? Math.round(body.sort_order)
        : 0;

    try {
      if (parentId != null) {
        const parent = await userCanAccessFolder(pool, user, parentId, tenantId, isSuperAdmin);
        if (!parent) return res.status(404).json({ message: 'Parent folder not found' });
      }

      const ins = await pool.query<FolderRow>(
        `INSERT INTO docu_folders (parent_id, name, allowed_roles, sort_order, created_by)
         VALUES ($1, $2, $3::text[], $4, $5)
         RETURNING id, parent_id, name, allowed_roles, sort_order, created_by, created_at, updated_at`,
        [parentId, name, allowedRoles, sortOrder, tenantId],
      );
      const row = ins.rows[0];
      const access = await replaceFolderAccess(
        pool,
        Number(row.id),
        tenantId,
        allowedUserIds,
        allowedOfficerIds,
      );
      return res.status(201).json({ folder: folderPayload(row, access) });
    } catch (err) {
      console.error('docu-center create folder:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.patch('/api/docu-center/folders/:id', authenticate, async (req: AuthReq, res: Response) => {
    if (!canViewDocu(req.user, req.method) || !canManageDocu(req.user)) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
    const user = req.user!;
    const tenantId = getTenantScopeUserId(user);
    const isSuperAdmin = user.role === 'SUPER_ADMIN';
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid folder id' });
    const body = req.body as Record<string, unknown>;

    try {
      const existing = await loadFolder(pool, id, tenantId, isSuperAdmin);
      if (!existing) return res.status(404).json({ message: 'Folder not found' });

      const updates: string[] = ['updated_at = NOW()'];
      const values: unknown[] = [];
      let idx = 1;
      let hasScalarUpdate = false;

      if (typeof body.name === 'string') {
        const name = body.name.trim().slice(0, 255);
        if (!name) return res.status(400).json({ message: 'Folder name cannot be empty' });
        updates.push(`name = $${idx++}`);
        values.push(name);
        hasScalarUpdate = true;
      }
      if (body.allowed_roles !== undefined) {
        updates.push(`allowed_roles = $${idx++}::text[]`);
        values.push(parseAllowedRoles(body.allowed_roles));
        hasScalarUpdate = true;
      }
      if (typeof body.sort_order === 'number' && Number.isFinite(body.sort_order)) {
        updates.push(`sort_order = $${idx++}`);
        values.push(Math.round(body.sort_order));
        hasScalarUpdate = true;
      }

      const hasAccessUpdate =
        body.allowed_user_ids !== undefined || body.allowed_officer_ids !== undefined;

      if (!hasScalarUpdate && !hasAccessUpdate) {
        return res.status(400).json({ message: 'No fields to update' });
      }

      let row = existing;
      if (hasScalarUpdate) {
        values.push(id);
        const r = await pool.query<FolderRow>(
          `UPDATE docu_folders SET ${updates.join(', ')} WHERE id = $${idx}
           RETURNING id, parent_id, name, allowed_roles, sort_order, created_by, created_at, updated_at`,
          values,
        );
        row = r.rows[0];
      } else {
        await pool.query(`UPDATE docu_folders SET updated_at = NOW() WHERE id = $1`, [id]);
      }

      let access: FolderAccessDetail;
      if (hasAccessUpdate) {
        const currentMap = await loadAccessForFolders(pool, [id]);
        const current = currentMap.get(id) ?? emptyFolderAccess();
        const userIds =
          body.allowed_user_ids !== undefined
            ? parseIdList(body.allowed_user_ids)
            : [...current.userIds];
        const officerIds =
          body.allowed_officer_ids !== undefined
            ? parseIdList(body.allowed_officer_ids)
            : [...current.officerIds];
        access = await replaceFolderAccess(pool, id, tenantId, userIds, officerIds);
      } else {
        const accessMap = await loadAccessForFolders(pool, [id]);
        access = accessMap.get(id) ?? emptyFolderAccess();
      }

      return res.json({ folder: folderPayload(row, access) });
    } catch (err) {
      console.error('docu-center patch folder:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.delete('/api/docu-center/folders/:id', authenticate, async (req: AuthReq, res: Response) => {
    if (!canViewDocu(req.user, req.method) || !canManageDocu(req.user)) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
    const user = req.user!;
    const tenantId = getTenantScopeUserId(user);
    const isSuperAdmin = user.role === 'SUPER_ADMIN';
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid folder id' });

    try {
      const existing = await loadFolder(pool, id, tenantId, isSuperAdmin);
      if (!existing) return res.status(404).json({ message: 'Folder not found' });
      await pool.query(`DELETE FROM docu_folders WHERE id = $1`, [id]);
      return res.json({ ok: true });
    } catch (err) {
      console.error('docu-center delete folder:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.get('/api/docu-center/folders/:id/files', authenticate, async (req: AuthReq, res: Response) => {
    if (!canViewDocu(req.user, req.method)) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
    const user = req.user!;
    const tenantId = getTenantScopeUserId(user);
    const isSuperAdmin = user.role === 'SUPER_ADMIN';
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid folder id' });

    try {
      const folder = await userCanAccessFolder(pool, user, id, tenantId, isSuperAdmin);
      if (!folder) return res.status(404).json({ message: 'Folder not found' });

      const r = await pool.query(
        `SELECT f.id, f.folder_id, f.original_filename, f.content_type, f.byte_size, f.notes,
                f.created_at, f.created_by_user_id, COALESCE(u.full_name, u.email) AS uploaded_by_name
         FROM docu_files f
         LEFT JOIN users u ON u.id = f.created_by_user_id
         WHERE f.folder_id = $1 AND f.created_by = $2
         ORDER BY f.original_filename ASC, f.id ASC`,
        [id, folder.created_by],
      );

      return res.json({
        files: r.rows.map((row) => ({
          id: Number(row.id),
          folder_id: Number(row.folder_id),
          original_filename: row.original_filename as string,
          content_type: (row.content_type as string | null) ?? null,
          byte_size: Number(row.byte_size),
          notes: (row.notes as string | null) ?? null,
          created_at: row.created_at instanceof Date ? row.created_at.toISOString() : null,
          uploaded_by_name: (row.uploaded_by_name as string | null) ?? null,
          content_path: `/docu-center/files/${Number(row.id)}/content`,
        })),
        can_manage: canManageDocu(user),
      });
    } catch (err) {
      console.error('docu-center list files:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.post('/api/docu-center/folders/:id/files', authenticate, async (req: AuthReq, res: Response) => {
    if (!canViewDocu(req.user, req.method) || !canManageDocu(req.user)) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
    const user = req.user!;
    const tenantId = getTenantScopeUserId(user);
    const isSuperAdmin = user.role === 'SUPER_ADMIN';
    const folderId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(folderId)) return res.status(400).json({ message: 'Invalid folder id' });

    const body = req.body as Record<string, unknown>;
    const filenameRaw = typeof body.filename === 'string' ? body.filename : '';
    const b64 = typeof body.content_base64 === 'string' ? body.content_base64.trim() : '';
    const contentType =
      typeof body.content_type === 'string' && body.content_type.trim()
        ? body.content_type.trim().slice(0, 255)
        : 'application/octet-stream';
    const notes =
      typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 2000) : null;

    if (!filenameRaw.trim() || !b64) {
      return res.status(400).json({ message: 'filename and content_base64 are required' });
    }

    let buf: Buffer;
    try {
      buf = Buffer.from(b64, 'base64');
    } catch {
      return res.status(400).json({ message: 'Invalid base64 file data' });
    }
    if (buf.length === 0) return res.status(400).json({ message: 'Empty file' });
    if (buf.length > DOCU_FILE_MAX_BYTES) {
      return res.status(400).json({
        message: `File too large (max ${Math.round(DOCU_FILE_MAX_BYTES / (1024 * 1024))} MB)`,
      });
    }

    try {
      const folder = await loadFolder(pool, folderId, tenantId, isSuperAdmin);
      if (!folder) return res.status(404).json({ message: 'Folder not found' });

      const originalFilename = sanitizeOriginalName(filenameRaw);
      const storedExt = path.extname(originalFilename).slice(0, 32) || '';
      const storedFilename = `${Date.now()}_${crypto.randomBytes(12).toString('hex')}${storedExt}`;

      const uploaded = await writeWorkpilotFile(
        'docu-center',
        [tenantId, folderId],
        storedFilename,
        buf,
        contentType,
      );

      const ins = await pool.query(
        `INSERT INTO docu_files
           (folder_id, original_filename, stored_filename, content_type, byte_size, spaces_key, file_url, notes, created_by, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, folder_id, original_filename, content_type, byte_size, notes, created_at`,
        [
          folderId,
          originalFilename,
          storedFilename,
          contentType,
          buf.length,
          uploaded.spacesKey,
          uploaded.fileUrl,
          notes,
          tenantId,
          user.userId,
        ],
      );
      const row = ins.rows[0];
      return res.status(201).json({
        file: {
          id: Number(row.id),
          folder_id: Number(row.folder_id),
          original_filename: row.original_filename as string,
          content_type: (row.content_type as string | null) ?? null,
          byte_size: Number(row.byte_size),
          notes: (row.notes as string | null) ?? null,
          created_at: row.created_at instanceof Date ? row.created_at.toISOString() : null,
          content_path: `/docu-center/files/${Number(row.id)}/content`,
        },
      });
    } catch (err) {
      console.error('docu-center upload file:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.get('/api/docu-center/files/:id/content', authenticate, async (req: AuthReq, res: Response) => {
    if (!canViewDocu(req.user, req.method)) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
    const user = req.user!;
    const tenantId = getTenantScopeUserId(user);
    const isSuperAdmin = user.role === 'SUPER_ADMIN';
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid file id' });

    try {
      const r = await pool.query<{
        folder_id: number;
        stored_filename: string;
        original_filename: string;
        content_type: string | null;
        spaces_key: string | null;
        created_by: number;
      }>(
        isSuperAdmin
          ? `SELECT folder_id, stored_filename, original_filename, content_type, spaces_key, created_by
             FROM docu_files WHERE id = $1`
          : `SELECT folder_id, stored_filename, original_filename, content_type, spaces_key, created_by
             FROM docu_files WHERE id = $1 AND created_by = $2`,
        isSuperAdmin ? [id] : [id, tenantId],
      );
      if ((r.rowCount ?? 0) === 0) return res.status(404).json({ message: 'File not found' });
      const file = r.rows[0];
      const folder = await userCanAccessFolder(pool, user, Number(file.folder_id), tenantId, isSuperAdmin);
      if (!folder) return res.status(404).json({ message: 'File not found' });

      const loaded = await loadWorkpilotFile(
        'docu-center',
        [file.created_by, file.folder_id],
        file.stored_filename,
        file.spaces_key,
      );
      if (!loaded) return res.status(404).json({ message: 'File content missing' });

      return sendWorkpilotFile(res, loaded, file.content_type || 'application/octet-stream', {
        disposition: `inline; filename="${sanitizeOriginalName(file.original_filename).replace(/"/g, '')}"`,
      });
    } catch (err) {
      console.error('docu-center file content:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.delete('/api/docu-center/files/:id', authenticate, async (req: AuthReq, res: Response) => {
    if (!canViewDocu(req.user, req.method) || !canManageDocu(req.user)) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
    const user = req.user!;
    const tenantId = getTenantScopeUserId(user);
    const isSuperAdmin = user.role === 'SUPER_ADMIN';
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid file id' });

    try {
      const r = await pool.query(
        isSuperAdmin
          ? `DELETE FROM docu_files WHERE id = $1 RETURNING id`
          : `DELETE FROM docu_files WHERE id = $1 AND created_by = $2 RETURNING id`,
        isSuperAdmin ? [id] : [id, tenantId],
      );
      if ((r.rowCount ?? 0) === 0) return res.status(404).json({ message: 'File not found' });
      return res.json({ ok: true });
    } catch (err) {
      console.error('docu-center delete file:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });
}

export { ensureDocuCenterSchema };
