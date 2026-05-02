import type { Express, Request, Response, NextFunction } from 'express';
import type { Pool } from 'pg';
import { requireTenantOwner, permissionsFromDb, type TenantAuthUser } from './tenantAccess';

type AuthReq = Request & { user?: TenantAuthUser };

export function mountTenantTeamRoutes(
  app: Express,
  deps: {
    pool: Pool;
    authenticate: (req: Request, res: Response, next: NextFunction) => void;
  },
): void {
  const { pool, authenticate } = deps;

  app.get('/api/tenant-team', authenticate, requireTenantOwner, async (req: Request, res: Response) => {
    const owner = (req as AuthReq).user!;
    try {
      const staff = await pool.query<{
        id: number;
        email: string;
        full_name: string | null;
        role: string;
        permissions: unknown;
        status: string | null;
        created_at: Date;
      }>(
        `SELECT id, email, full_name, role, permissions, status, created_at
         FROM users
         WHERE (tenant_admin_id = $1 AND role = 'STAFF') OR (id = $1 AND role = 'ADMIN')
         ORDER BY role DESC, id ASC`,
        [owner.userId],
      );

      const offs = await pool.query<{
        id: number;
        email: string | null;
        full_name: string;
        state: string;
        permissions: unknown;
        linked_user_id: number | null;
        password_hash: string | null;
        created_at: Date;
      }>(
        `SELECT id, email, full_name, state, permissions, linked_user_id, password_hash, created_at
         FROM officers WHERE created_by = $1 ORDER BY full_name ASC`,
        [owner.userId],
      );

      const dashboardRows = staff.rows.map((row) => ({
        kind: 'dashboard' as const,
        id: row.id,
        email: row.email,
        full_name: row.full_name ?? null,
        role: row.role,
        is_owner: row.role === 'ADMIN',
        permissions: row.role === 'STAFF' ? permissionsFromDb(row.permissions) : null,
        status: row.status ?? 'ACTIVE',
        created_at: row.created_at.toISOString(),
        access_label: row.role === 'ADMIN' ? 'Owner (web + mobile)' : 'Dashboard (web + mobile)',
      }));

      const fieldRows = offs.rows.map((row) => ({
        kind: 'field' as const,
        id: row.id,
        email: row.email,
        full_name: row.full_name,
        role: 'OFFICER',
        is_owner: false,
        permissions: permissionsFromDb(row.permissions),
        status: row.state,
        created_at: row.created_at.toISOString(),
        linked_user_id: row.linked_user_id,
        has_mobile_login: row.password_hash != null || row.linked_user_id != null,
        access_label:
          row.linked_user_id != null
            ? 'Field profile (mobile via dashboard login)'
            : 'Field (mobile app only)',
      }));

      return res.json({ members: [...dashboardRows, ...fieldRows] });
    } catch (e) {
      console.error('tenant-team list', e);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });
}
