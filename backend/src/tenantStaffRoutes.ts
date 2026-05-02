import type { Express, Request, Response, NextFunction } from 'express';
import type { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import {
  requireTenantOwner,
  parsePermissionsBody,
  permissionsFromDb,
  type TenantAuthUser,
} from './tenantAccess';
import {
  pickFieldPermissionsFromStaff,
  presetDeskOfficerPermissions,
  presetManagerPermissions,
  type TenantPermissionKey,
} from './tenantPermissions';

type AuthReq = Request & { user?: TenantAuthUser };

interface DbStaffRow {
  id: number;
  email: string;
  full_name: string | null;
  role: string;
  tenant_admin_id: number | null;
  permissions: unknown;
  status: string | null;
  created_at: Date;
}

export function mountTenantStaffRoutes(
  app: Express,
  deps: {
    pool: Pool;
    authenticate: (req: Request, res: Response, next: NextFunction) => void;
  },
): void {
  const { pool, authenticate } = deps;

  app.get('/api/tenant-staff', authenticate, requireTenantOwner, async (req: Request, res: Response) => {
    const u = (req as AuthReq).user!;
    try {
      const r = await pool.query<DbStaffRow>(
        `SELECT id, email, full_name, role, tenant_admin_id, permissions, status, created_at
         FROM users
         WHERE (tenant_admin_id = $1 AND role = 'STAFF') OR (id = $1 AND role = 'ADMIN')
         ORDER BY role DESC, id ASC`,
        [u.userId],
      );
      const members = r.rows.map((row) => ({
        id: row.id,
        email: row.email,
        full_name: row.full_name ?? null,
        role: row.role,
        is_owner: row.role === 'ADMIN',
        permissions: row.role === 'STAFF' ? permissionsFromDb(row.permissions) : null,
        status: row.status ?? 'ACTIVE',
        created_at: row.created_at.toISOString(),
      }));
      return res.json({ members });
    } catch (e) {
      console.error('tenant-staff list', e);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.post('/api/tenant-staff', authenticate, requireTenantOwner, async (req: Request, res: Response) => {
    const owner = (req as AuthReq).user!;
    const body = req.body as {
      email?: string;
      password?: string;
      full_name?: string;
      preset?: string;
      permissions?: unknown;
      /** When true, creates a linked officers row (same email) so this person can use the mobile field app with the dashboard login. */
      link_field_profile?: boolean;
    };
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const fullName = typeof body.full_name === 'string' ? body.full_name.trim() || null : null;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }
    let perms: Record<TenantPermissionKey, boolean> | null = null;
    if (body.preset === 'manager') {
      perms = presetManagerPermissions();
    } else if (body.preset === 'desk_officer' || body.preset === 'officer') {
      perms = presetDeskOfficerPermissions();
    } else if (body.permissions != null) {
      perms = parsePermissionsBody(body.permissions);
    }
    if (perms == null) {
      return res.status(400).json({ message: 'preset or permissions is required' });
    }
    if (!Object.values(perms).some(Boolean)) {
      return res.status(400).json({ message: 'Select at least one permission' });
    }
    const linkField = body.link_field_profile === true;
    if (linkField && !perms.jobs && !perms.scheduling) {
      return res.status(400).json({
        message: 'Linking a field profile requires Jobs and/or Scheduling permission so the mobile app can show visits.',
      });
    }
    try {
      const dup = await pool.query('SELECT id FROM users WHERE LOWER(TRIM(email)) = $1', [email]);
      if ((dup.rowCount ?? 0) > 0) {
        return res.status(409).json({ message: 'A user with this email already exists' });
      }
      const dupOf = await pool.query('SELECT id FROM officers WHERE LOWER(TRIM(email)) = $1', [email]);
      if ((dupOf.rowCount ?? 0) > 0) {
        return res.status(409).json({ message: 'This email is already used for a field team member' });
      }
      const hash = await bcrypt.hash(password, 10);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const ins = await client.query<DbStaffRow>(
          `INSERT INTO users (
           email, password_hash, role, created_by, tenant_admin_id, permissions,
           full_name, company_name, phone, service_plan, status
         ) VALUES ($1, $2, 'STAFF', $3, $4, $5::jsonb, $6, NULL, NULL, 'Standard', 'ACTIVE')
         RETURNING id, email, full_name, role, tenant_admin_id, permissions, status, created_at`,
          [email, hash, owner.userId, owner.userId, JSON.stringify(perms), fullName],
        );
        const row = ins.rows[0];
        if (linkField) {
          const displayName = (fullName && fullName.trim()) || email.split('@')[0] || 'Team member';
          const fieldPerms = pickFieldPermissionsFromStaff(perms);
          await client.query(
            `INSERT INTO officers (
               full_name, role_position, department, phone, email, system_access_level,
               certifications, assigned_responsibilities, state, created_by, password_hash, permissions, linked_user_id
             ) VALUES ($1, NULL, NULL, NULL, $2, 'standard', NULL, NULL, 'active', $3, NULL, $4::jsonb, $5)`,
            [displayName, email, owner.userId, JSON.stringify(fieldPerms), row.id],
          );
        }
        await client.query('COMMIT');
        return res.status(201).json({
          member: {
            id: row.id,
            email: row.email,
            full_name: row.full_name ?? null,
            role: row.role,
            is_owner: false,
            permissions: permissionsFromDb(row.permissions),
            status: row.status ?? 'ACTIVE',
            created_at: row.created_at.toISOString(),
            linked_field_profile: linkField,
          },
        });
      } catch (e) {
        try {
          await client.query('ROLLBACK');
        } catch {
          /* ignore */
        }
        console.error('tenant-staff create', e);
        return res.status(500).json({ message: 'Internal server error' });
      } finally {
        client.release();
      }
    } catch (e) {
      console.error('tenant-staff create', e);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.patch('/api/tenant-staff/:id', authenticate, requireTenantOwner, async (req: Request, res: Response) => {
    const owner = (req as AuthReq).user!;
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' });
    if (id === owner.userId) {
      return res.status(400).json({ message: 'Use account settings to change the owner account' });
    }
    const body = req.body as {
      full_name?: string;
      status?: string;
      permissions?: unknown;
      preset?: string;
      password?: string;
    };
    try {
      const cur = await pool.query<{ id: number; role: string; tenant_admin_id: number | null }>(
        `SELECT id, role, tenant_admin_id FROM users WHERE id = $1`,
        [id],
      );
      if ((cur.rowCount ?? 0) === 0) return res.status(404).json({ message: 'User not found' });
      const row = cur.rows[0];
      if (row.role !== 'STAFF' || row.tenant_admin_id !== owner.userId) {
        return res.status(404).json({ message: 'User not found' });
      }
      const updates: string[] = [];
      const vals: unknown[] = [];
      let i = 1;
      if (typeof body.full_name === 'string') {
        updates.push(`full_name = $${i++}`);
        vals.push(body.full_name.trim() || null);
      }
      if (typeof body.status === 'string' && ['ACTIVE', 'PENDING_SETUP', 'SUSPENDED'].includes(body.status)) {
        updates.push(`status = $${i++}`);
        vals.push(body.status);
      }
      if (typeof body.password === 'string' && body.password.length > 0) {
        if (body.password.length < 8) {
          return res.status(400).json({ message: 'Password must be at least 8 characters' });
        }
        updates.push(`password_hash = $${i++}`);
        vals.push(await bcrypt.hash(body.password, 10));
      }
      let perms: Record<TenantPermissionKey, boolean> | null = null;
      if (body.preset === 'manager') perms = presetManagerPermissions();
      else if (body.preset === 'desk_officer' || body.preset === 'officer') perms = presetDeskOfficerPermissions();
      else if (body.permissions != null) perms = parsePermissionsBody(body.permissions);
      if (body.permissions != null || body.preset != null) {
        if (perms == null) return res.status(400).json({ message: 'Invalid permissions' });
        if (!Object.values(perms).some(Boolean)) {
          return res.status(400).json({ message: 'Select at least one permission' });
        }
        updates.push(`permissions = $${i++}::jsonb`);
        vals.push(JSON.stringify(perms));
      }
      if (updates.length === 0) {
        return res.status(400).json({ message: 'No updates' });
      }
      vals.push(id);
      const up = await pool.query<DbStaffRow>(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${i} RETURNING id, email, full_name, role, tenant_admin_id, permissions, status, created_at`,
        vals,
      );
      const urow = up.rows[0];
      if (perms) {
        const fieldSlice = pickFieldPermissionsFromStaff(perms);
        await pool.query(`UPDATE officers SET permissions = $1::jsonb, updated_at = NOW() WHERE linked_user_id = $2`, [
          JSON.stringify(fieldSlice),
          id,
        ]);
      }
      return res.json({
        member: {
          id: urow.id,
          email: urow.email,
          full_name: urow.full_name ?? null,
          role: urow.role,
          is_owner: false,
          permissions: permissionsFromDb(urow.permissions),
          status: urow.status ?? 'ACTIVE',
          created_at: urow.created_at.toISOString(),
        },
      });
    } catch (e) {
      console.error('tenant-staff patch', e);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.delete('/api/tenant-staff/:id', authenticate, requireTenantOwner, async (req: Request, res: Response) => {
    const owner = (req as AuthReq).user!;
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' });
    if (id === owner.userId) {
      return res.status(400).json({ message: 'Cannot delete the owner account' });
    }
    try {
      const r = await pool.query(
        `DELETE FROM users WHERE id = $1 AND role = 'STAFF' AND tenant_admin_id = $2`,
        [id, owner.userId],
      );
      if ((r.rowCount ?? 0) === 0) return res.status(404).json({ message: 'User not found' });
      return res.status(204).send();
    } catch (e) {
      console.error('tenant-staff delete', e);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });
}
