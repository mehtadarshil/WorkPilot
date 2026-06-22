import type { Application, Request, Response } from 'express';
import type { Pool } from 'pg';
import { assertStaffPermissionAny, getTenantScopeUserId, tenantCrmAccessAllowed } from './tenantAccess';
import type { TenantAuthUser } from './tenantAccess';
import { officerAssignedToJob } from './jobAssignment';

type AuthReq = Request & { user?: TenantAuthUser };

type StaffWorkRouteDeps = {
  pool: Pool;
  authenticate: (req: Request, res: Response, next: () => void) => void;
};

function parseId(raw: unknown): number | null {
  const n = parseInt(String(Array.isArray(raw) ? raw[0] : raw), 10);
  return Number.isFinite(n) ? n : null;
}

function parseDateParam(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.trim().length < 10) return null;
  return raw.trim().slice(0, 10);
}

function defaultFromDate(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function defaultToDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function money(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw ?? '').replace(/,/g, ''));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function isoDate(raw: unknown): string {
  const value = parseDateParam(raw);
  return value ?? new Date().toISOString().slice(0, 10);
}

async function jobVisibleToUser(pool: Pool, jobId: number, user: TenantAuthUser): Promise<boolean> {
  if (user.role === 'SUPER_ADMIN') {
    const result = await pool.query('SELECT id FROM jobs WHERE id = $1', [jobId]);
    return (result.rowCount ?? 0) > 0;
  }
  if (user.role === 'OFFICER') {
    return user.officerId != null && (await officerAssignedToJob(pool, user.officerId, jobId));
  }
  if (!tenantCrmAccessAllowed(user, 'jobs', 'GET')) return false;
  const result = await pool.query('SELECT id FROM jobs WHERE id = $1 AND created_by = $2', [
    jobId,
    getTenantScopeUserId(user),
  ]);
  return (result.rowCount ?? 0) > 0;
}

function expenseRow(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    job_id: Number(row.job_id),
    officer_id: row.officer_id == null ? null : Number(row.officer_id),
    officer_name: (row.officer_name as string | null) ?? null,
    job_title: (row.job_title as string | null) ?? null,
    job_number: (row.job_number as string | null) ?? null,
    customer_name: (row.customer_name as string | null) ?? null,
    expense_date:
      row.expense_date instanceof Date
        ? row.expense_date.toISOString().slice(0, 10)
        : String(row.expense_date ?? '').slice(0, 10),
    category: (row.category as string | null) ?? 'Expense',
    description: (row.description as string | null) ?? null,
    amount: Number(row.amount ?? 0),
    status: (row.status as string | null) ?? 'submitted',
    expense_type: (row.expense_type as string | null) ?? 'personal',
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : null,
  };
}

export async function ensureStaffWorkSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_expenses (
      id SERIAL PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      officer_id INTEGER REFERENCES officers(id) ON DELETE SET NULL,
      expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
      category VARCHAR(80) NOT NULL DEFAULT 'Expense',
      description TEXT,
      amount NUMERIC(10,2) NOT NULL DEFAULT 0,
      status VARCHAR(40) NOT NULL DEFAULT 'submitted',
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_job_expenses_job ON job_expenses(job_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_job_expenses_officer_date ON job_expenses(officer_id, expense_date DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_job_expenses_status ON job_expenses(status)');
  await pool.query('ALTER TABLE job_expenses ADD COLUMN IF NOT EXISTS approved_by INTEGER');
  await pool.query('ALTER TABLE job_expenses ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ');
  await pool.query("ALTER TABLE job_expenses ADD COLUMN IF NOT EXISTS expense_type VARCHAR(40) NOT NULL DEFAULT 'personal'");
}

export function mountStaffWorkRoutes(app: Application, deps: StaffWorkRouteDeps): void {
  const { pool, authenticate } = deps;

  app.get('/api/staff-work/summary', authenticate, async (req: AuthReq, res: Response) => {
    const user = req.user!;
    if (!assertStaffPermissionAny(user, ['field_users'])) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
    const from = parseDateParam(req.query.from) ?? defaultFromDate();
    const to = parseDateParam(req.query.to) ?? defaultToDate();
    const userId = getTenantScopeUserId(user);
    const isSuperAdmin = user.role === 'SUPER_ADMIN';
    try {
      const officerResult = await pool.query(
        `SELECT id, full_name, role_position, department, state
         FROM officers
         ${isSuperAdmin ? '' : 'WHERE created_by = $1'}
         ORDER BY full_name ASC`,
        isSuperAdmin ? [] : [userId],
      );
      const timesheetResult = await pool.query(
        `SELECT te.officer_id,
                COUNT(DISTINCT te.clock_in::date)::int AS days_worked,
                COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(te.clock_out, NOW()) - te.clock_in))), 0)::bigint AS total_seconds,
                COALESCE(SUM(CASE WHEN te.segment_type = 'travelling' THEN EXTRACT(EPOCH FROM (COALESCE(te.clock_out, NOW()) - te.clock_in)) ELSE 0 END), 0)::bigint AS travelling_seconds,
                COALESCE(SUM(CASE WHEN te.segment_type = 'on_site' THEN EXTRACT(EPOCH FROM (COALESCE(te.clock_out, NOW()) - te.clock_in)) ELSE 0 END), 0)::bigint AS on_site_seconds
         FROM timesheet_entries te
         JOIN officers o ON o.id = te.officer_id
         WHERE te.clock_in >= $1::date
           AND te.clock_in < ($2::date + INTERVAL '1 day')
           ${isSuperAdmin ? '' : 'AND o.created_by = $3'}
         GROUP BY te.officer_id`,
        isSuperAdmin ? [from, to] : [from, to, userId],
      );
      const approvedExpenseResult = await pool.query(
        `SELECT je.officer_id, COALESCE(SUM(je.amount), 0)::numeric AS expenses_total, COUNT(*)::int AS expenses_count
         FROM job_expenses je
         JOIN jobs j ON j.id = je.job_id
         WHERE je.expense_date >= $1::date
           AND je.expense_date < ($2::date + INTERVAL '1 day')
           AND je.status = 'approved'
           AND je.expense_type = 'personal'
           ${isSuperAdmin ? '' : 'AND j.created_by = $3'}
         GROUP BY je.officer_id`,
        isSuperAdmin ? [from, to] : [from, to, userId],
      );
      const pendingExpenseResult = await pool.query(
        `SELECT je.officer_id, COALESCE(SUM(je.amount), 0)::numeric AS pending_expenses_total, COUNT(*)::int AS pending_expenses_count
         FROM job_expenses je
         JOIN jobs j ON j.id = je.job_id
         WHERE je.expense_date >= $1::date
           AND je.expense_date < ($2::date + INTERVAL '1 day')
           AND je.status = 'submitted'
           AND je.expense_type = 'personal'
           ${isSuperAdmin ? '' : 'AND j.created_by = $3'}
         GROUP BY je.officer_id`,
        isSuperAdmin ? [from, to] : [from, to, userId],
      );

      const byOfficer = new Map<number, Record<string, unknown>>();
      for (const row of timesheetResult.rows) byOfficer.set(Number(row.officer_id), row);
      const expByOfficer = new Map<number, Record<string, unknown>>();
      for (const row of approvedExpenseResult.rows) {
        if (row.officer_id != null) expByOfficer.set(Number(row.officer_id), row);
      }
      const pendingByOfficer = new Map<number, Record<string, unknown>>();
      for (const row of pendingExpenseResult.rows) {
        if (row.officer_id != null) pendingByOfficer.set(Number(row.officer_id), row);
      }
      const officers = officerResult.rows.map((o) => {
        const ts = byOfficer.get(Number(o.id));
        const ex = expByOfficer.get(Number(o.id));
        const pending = pendingByOfficer.get(Number(o.id));
        return {
          id: Number(o.id),
          full_name: o.full_name as string,
          role_position: (o.role_position as string | null) ?? null,
          department: (o.department as string | null) ?? null,
          state: o.state as string,
          days_worked: Number(ts?.days_worked ?? 0),
          total_seconds: Number(ts?.total_seconds ?? 0),
          travelling_seconds: Number(ts?.travelling_seconds ?? 0),
          on_site_seconds: Number(ts?.on_site_seconds ?? 0),
          expenses_total: Number(ex?.expenses_total ?? 0),
          expenses_count: Number(ex?.expenses_count ?? 0),
          pending_expenses_total: Number(pending?.pending_expenses_total ?? 0),
          pending_expenses_count: Number(pending?.pending_expenses_count ?? 0),
        };
      });
      const totals = officers.reduce(
        (acc, o) => ({
          days_worked: acc.days_worked + o.days_worked,
          total_seconds: acc.total_seconds + o.total_seconds,
          travelling_seconds: acc.travelling_seconds + o.travelling_seconds,
          on_site_seconds: acc.on_site_seconds + o.on_site_seconds,
          expenses_total: acc.expenses_total + o.expenses_total,
          expenses_count: acc.expenses_count + o.expenses_count,
          pending_expenses_total: acc.pending_expenses_total + o.pending_expenses_total,
          pending_expenses_count: acc.pending_expenses_count + o.pending_expenses_count,
        }),
        {
          days_worked: 0,
          total_seconds: 0,
          travelling_seconds: 0,
          on_site_seconds: 0,
          expenses_total: 0,
          expenses_count: 0,
          pending_expenses_total: 0,
          pending_expenses_count: 0,
        },
      );
      return res.json({ from, to, officers, totals });
    } catch (error) {
      console.error('Staff work summary error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.get('/api/staff-work/expenses', authenticate, async (req: AuthReq, res: Response) => {
    const user = req.user!;
    if (!assertStaffPermissionAny(user, ['field_users'])) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
    const from = parseDateParam(req.query.from) ?? defaultFromDate();
    const to = parseDateParam(req.query.to) ?? defaultToDate();
    const userId = getTenantScopeUserId(user);
    const isSuperAdmin = user.role === 'SUPER_ADMIN';
    try {
      const result = await pool.query(
        `SELECT je.*, o.full_name AS officer_name, j.title AS job_title, j.job_number, c.full_name AS customer_name
         FROM job_expenses je
         JOIN jobs j ON j.id = je.job_id
         LEFT JOIN officers o ON o.id = je.officer_id
         LEFT JOIN customers c ON c.id = j.customer_id
         WHERE je.expense_date >= $1::date
           AND je.expense_date < ($2::date + INTERVAL '1 day')
           ${isSuperAdmin ? '' : 'AND j.created_by = $3'}
         ORDER BY je.expense_date DESC, je.id DESC`,
        isSuperAdmin ? [from, to] : [from, to, userId],
      );
      return res.json({ expenses: result.rows.map(expenseRow) });
    } catch (error) {
      console.error('Staff work expenses error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.get('/api/jobs/:jobId/expenses', authenticate, async (req: AuthReq, res: Response) => {
    const jobId = parseId(req.params.jobId);
    if (!jobId) return res.status(400).json({ message: 'Invalid job id' });
    if (!(await jobVisibleToUser(pool, jobId, req.user!))) {
      return res.status(404).json({ message: 'Job not found' });
    }
    try {
      const result = await pool.query(
        `SELECT je.*, o.full_name AS officer_name, j.title AS job_title, j.job_number, c.full_name AS customer_name
         FROM job_expenses je
         JOIN jobs j ON j.id = je.job_id
         LEFT JOIN officers o ON o.id = je.officer_id
         LEFT JOIN customers c ON c.id = j.customer_id
         WHERE je.job_id = $1
         ORDER BY je.expense_date DESC, je.id DESC`,
        [jobId],
      );
      return res.json({ expenses: result.rows.map(expenseRow) });
    } catch (error) {
      console.error('List job expenses error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.post('/api/jobs/:jobId/expenses', authenticate, async (req: AuthReq, res: Response) => {
    const jobId = parseId(req.params.jobId);
    if (!jobId) return res.status(400).json({ message: 'Invalid job id' });
    const user = req.user!;
    if (!(await jobVisibleToUser(pool, jobId, user))) {
      return res.status(404).json({ message: 'Job not found' });
    }
    const amount = money((req.body as Record<string, unknown>).amount);
    if (amount == null || amount <= 0) return res.status(400).json({ message: 'Amount must be greater than zero' });
    const category =
      typeof (req.body as Record<string, unknown>).category === 'string'
        ? String((req.body as Record<string, unknown>).category).trim().slice(0, 80) || 'Expense'
        : 'Expense';
    const description =
      typeof (req.body as Record<string, unknown>).description === 'string'
        ? String((req.body as Record<string, unknown>).description).trim() || null
        : null;
    const requestedOfficerId =
      typeof (req.body as Record<string, unknown>).officer_id === 'number' && Number.isFinite((req.body as Record<string, unknown>).officer_id)
        ? Number((req.body as Record<string, unknown>).officer_id)
        : null;
    const officerId = user.role === 'OFFICER' ? (user.officerId ?? null) : requestedOfficerId;
    const rawType = typeof (req.body as Record<string, unknown>).expense_type === 'string'
      ? String((req.body as Record<string, unknown>).expense_type).trim().toLowerCase()
      : 'personal';
    const expenseType = rawType === 'company' ? 'company' : 'personal';
    try {
      const result = await pool.query(
        `INSERT INTO job_expenses (job_id, officer_id, expense_date, category, description, amount, expense_type, created_by)
         VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8)
         RETURNING *`,
        [jobId, officerId, isoDate((req.body as Record<string, unknown>).expense_date), category, description, amount, expenseType, user.userId],
      );
      return res.status(201).json({ expense: expenseRow(result.rows[0] as Record<string, unknown>) });
    } catch (error) {
      console.error('Create job expense error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.patch('/api/job-expenses/:expenseId', authenticate, async (req: AuthReq, res: Response) => {
    const expenseId = parseId(req.params.expenseId);
    if (!expenseId) return res.status(400).json({ message: 'Invalid expense id' });
    const user = req.user!;
    if (!assertStaffPermissionAny(user, ['field_users'])) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
    const body = req.body as Record<string, unknown>;

    // Build update query dynamically
    const updates: string[] = [];
    const params: unknown[] = [];

    if (typeof body.status === 'string' && body.status.trim()) {
      const status = body.status.trim();
      if (status === 'approved' || status === 'rejected' || status === 'submitted') {
        updates.push(`status = $${params.length + 1}`);
        params.push(status);

        updates.push(`approved_by = CASE WHEN $${params.length - 1 + 1} = 'approved' THEN $${params.length + 1}::integer ELSE NULL END`);
        params.push(user.userId);

        updates.push(`approved_at = CASE WHEN $${params.length - 2 + 1} = 'approved' THEN NOW() ELSE NULL END`);
      } else {
        return res.status(400).json({ message: 'Status must be submitted, approved, or rejected' });
      }
    }

    if (typeof body.expense_type === 'string' && body.expense_type.trim()) {
      const et = body.expense_type.trim().toLowerCase();
      if (et === 'personal' || et === 'company') {
        updates.push(`expense_type = $${params.length + 1}`);
        params.push(et);
      } else {
        return res.status(400).json({ message: 'expense_type must be personal or company' });
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);

    const userId = getTenantScopeUserId(user);
    const isSuperAdmin = user.role === 'SUPER_ADMIN';

    try {
      let query = `
        UPDATE job_expenses je
        SET ${updates.join(', ')}
        FROM jobs j
        WHERE je.id = $${params.length + 1}
          AND j.id = je.job_id
      `;
      params.push(expenseId);

      if (!isSuperAdmin) {
        query += ` AND j.created_by = $${params.length + 1}`;
        params.push(userId);
      }

      query += ` RETURNING je.*, j.title AS job_title, j.job_number, NULL::text AS officer_name, NULL::text AS customer_name`;

      const result = await pool.query(query, params);
      if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Expense not found' });
      return res.json({ expense: expenseRow(result.rows[0] as Record<string, unknown>) });
    } catch (error) {
      console.error('Patch job expense error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });
}
