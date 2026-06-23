import crypto from 'crypto';
import path from 'path';
import type { Application, Request, Response } from 'express';
import type { Pool } from 'pg';
import { assertStaffPermissionAny, getTenantScopeUserId, tenantCrmAccessAllowed } from './tenantAccess';
import type { TenantAuthUser } from './tenantAccess';
import { officerAssignedToJob } from './jobAssignment';
import { loadWorkpilotFile, sendWorkpilotFile, writeWorkpilotFile } from './workpilotFileStorage';

type AuthReq = Request & { user?: TenantAuthUser };

type StaffWorkRouteDeps = {
  pool: Pool;
  authenticate: (req: Request, res: Response, next: () => void) => void;
};

const EXPENSE_SELECT = `
  je.*,
  o.full_name AS officer_name,
  COALESCE(o.full_name, cu.full_name, cu.email) AS claimed_by_name,
  j.title AS job_title,
  j.job_number,
  c.full_name AS customer_name
`;

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

function cleanFilename(raw: string): string {
  return raw.replace(/[^\w.\-()+ ]/g, '_').slice(0, 180) || 'proof.bin';
}

function decodeProofFiles(raw: unknown): { buf: Buffer; original: string; contentType: string }[] {
  if (!Array.isArray(raw)) return [];
  const out: { buf: Buffer; original: string; contentType: string }[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const m = item as Record<string, unknown>;
    const original = cleanFilename(typeof m.filename === 'string' ? m.filename : 'proof.jpg');
    const contentType =
      typeof m.content_type === 'string' && m.content_type.trim() ? m.content_type.trim() : 'image/jpeg';
    const b64 = typeof m.content_base64 === 'string' ? m.content_base64 : '';
    if (!b64.trim()) continue;
    const buf = Buffer.from(b64, 'base64');
    if (buf.length > 0) out.push({ buf, original, contentType });
  }
  return out;
}

function mapProofFiles(jobId: number, expenseId: number, raw: unknown) {
  const proof = Array.isArray(raw) ? raw : [];
  return proof
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const p = item as Record<string, unknown>;
      const stored = typeof p.stored_filename === 'string' ? p.stored_filename : '';
      if (!stored) return null;
      return {
        stored_filename: stored,
        original_filename: typeof p.original_filename === 'string' ? p.original_filename : stored,
        content_type: typeof p.content_type === 'string' ? p.content_type : 'image/jpeg',
        byte_size: typeof p.byte_size === 'number' ? p.byte_size : null,
        href: `/api/jobs/${jobId}/expenses/${expenseId}/proof/${encodeURIComponent(stored)}`,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p != null);
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
  const jobId = Number(row.job_id);
  const expenseId = Number(row.id);
  return {
    id: expenseId,
    job_id: jobId,
    officer_id: row.officer_id == null ? null : Number(row.officer_id),
    officer_name: (row.officer_name as string | null) ?? null,
    claimed_by_name: (row.claimed_by_name as string | null) ?? null,
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
    proof_files: mapProofFiles(jobId, expenseId, row.proof_files),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : null,
  };
}

async function loadExpenseRow(
  pool: Pool,
  expenseId: number,
  userId: number,
  isSuperAdmin: boolean,
): Promise<Record<string, unknown> | null> {
  const params: unknown[] = [expenseId];
  let sql = `
    SELECT ${EXPENSE_SELECT}
    FROM job_expenses je
    JOIN jobs j ON j.id = je.job_id
    LEFT JOIN officers o ON o.id = je.officer_id
    LEFT JOIN users cu ON cu.id = je.created_by
    LEFT JOIN customers c ON c.id = j.customer_id
    WHERE je.id = $1
  `;
  if (!isSuperAdmin) {
    sql += ' AND j.created_by = $2';
    params.push(userId);
  }
  const result = await pool.query(sql, params);
  return (result.rows[0] as Record<string, unknown> | undefined) ?? null;
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
  await pool.query('ALTER TABLE job_expenses ADD COLUMN IF NOT EXISTS expense_type VARCHAR(40)');
  await pool.query(`ALTER TABLE job_expenses ADD COLUMN IF NOT EXISTS proof_files JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`
    UPDATE job_expenses
    SET expense_type = 'personal'
    WHERE expense_type IS NULL OR TRIM(expense_type) = ''
  `);
  await pool.query("ALTER TABLE job_expenses ALTER COLUMN expense_type SET DEFAULT 'personal'");
  await pool.query('ALTER TABLE job_expenses ALTER COLUMN expense_type SET NOT NULL').catch((err) => {
    console.warn('job_expenses.expense_type NOT NULL constraint skipped:', err);
  });
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
        `SELECT ${EXPENSE_SELECT}
         FROM job_expenses je
         JOIN jobs j ON j.id = je.job_id
         LEFT JOIN officers o ON o.id = je.officer_id
         LEFT JOIN users cu ON cu.id = je.created_by
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
        `SELECT ${EXPENSE_SELECT}
         FROM job_expenses je
         JOIN jobs j ON j.id = je.job_id
         LEFT JOIN officers o ON o.id = je.officer_id
         LEFT JOIN users cu ON cu.id = je.created_by
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
    const body = req.body as Record<string, unknown>;
    const amount = money(body.amount);
    if (amount == null || amount <= 0) return res.status(400).json({ message: 'Amount must be greater than zero' });
    const category =
      typeof body.category === 'string' ? body.category.trim().slice(0, 80) || 'Expense' : 'Expense';
    const description = typeof body.description === 'string' ? body.description.trim() || null : null;
    const requestedOfficerId =
      typeof body.officer_id === 'number' && Number.isFinite(body.officer_id) ? Number(body.officer_id) : null;
    const officerId = user.role === 'OFFICER' ? (user.officerId ?? null) : requestedOfficerId;
    const rawType = typeof body.expense_type === 'string' ? body.expense_type.trim().toLowerCase() : 'personal';
    const expenseType = rawType === 'company' ? 'company' : 'personal';
    const proof = decodeProofFiles(body.proof_files);
    const isOfficer = user.role === 'OFFICER';
    if (isOfficer && proof.length === 0) {
      return res.status(400).json({ message: 'A receipt photo is required for expense claims' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const ins = await client.query<{ id: number }>(
        `INSERT INTO job_expenses (job_id, officer_id, expense_date, category, description, amount, expense_type, proof_files, created_by)
         VALUES ($1, $2, $3::date, $4, $5, $6, $7, '[]'::jsonb, $8)
         RETURNING id`,
        [jobId, officerId, isoDate(body.expense_date), category, description, amount, expenseType, user.userId],
      );
      const expenseId = ins.rows[0].id;
      const proofJson = [];
      for (const file of proof) {
        const ext = path.extname(file.original).slice(0, 24) || '.jpg';
        const stored = `${crypto.randomBytes(16).toString('hex')}${ext}`;
        const uploaded = await writeWorkpilotFile('job-expense-proofs', [jobId, expenseId], stored, file.buf, file.contentType);
        proofJson.push({
          stored_filename: stored,
          original_filename: file.original,
          content_type: file.contentType,
          byte_size: file.buf.length,
          spaces_key: uploaded.spacesKey,
          file_url: uploaded.fileUrl,
        });
      }
      if (proofJson.length > 0) {
        await client.query('UPDATE job_expenses SET proof_files = $1::jsonb WHERE id = $2', [
          JSON.stringify(proofJson),
          expenseId,
        ]);
      }
      await client.query('COMMIT');

      const userId = getTenantScopeUserId(user);
      const isSuperAdmin = user.role === 'SUPER_ADMIN';
      const row = await loadExpenseRow(pool, expenseId, userId, isSuperAdmin);
      if (!row) return res.status(201).json({ expense: { id: expenseId, job_id: jobId } });
      return res.status(201).json({ expense: expenseRow(row) });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      console.error('Create job expense error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    } finally {
      client.release();
    }
  });

  app.get('/api/jobs/:jobId/expenses/:expenseId/proof/:filename', authenticate, async (req: AuthReq, res: Response) => {
    const jobId = parseId(req.params.jobId);
    const expenseId = parseId(req.params.expenseId);
    const filename = cleanFilename(String(req.params.filename || ''));
    if (!jobId || !expenseId || !filename) return res.status(400).json({ message: 'Invalid id' });
    const user = req.user!;
    try {
      if (!(await jobVisibleToUser(pool, jobId, user))) {
        return res.status(404).json({ message: 'Expense not found' });
      }
      if (user.role !== 'OFFICER' && !assertStaffPermissionAny(user, ['field_users', 'jobs'])) {
        return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
      }
      const r = await pool.query('SELECT proof_files FROM job_expenses WHERE id = $1 AND job_id = $2', [
        expenseId,
        jobId,
      ]);
      if ((r.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Proof not found' });
      const proof = Array.isArray(r.rows[0].proof_files) ? r.rows[0].proof_files : [];
      const meta = proof.find((p: Record<string, unknown>) => String(p.stored_filename) === filename) as
        | Record<string, unknown>
        | undefined;
      if (!meta) return res.status(404).json({ message: 'Proof not found' });
      const file = await loadWorkpilotFile('job-expense-proofs', [jobId, expenseId], filename);
      if (!file) return res.status(404).json({ message: 'Proof not found' });
      return sendWorkpilotFile(res, file, String(meta.content_type || 'image/jpeg'), {
        disposition: `inline; filename="${cleanFilename(String(meta.original_filename || 'receipt'))}"`,
      });
    } catch (error) {
      console.error('Get job expense proof error:', error);
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
    const userId = getTenantScopeUserId(user);
    const isSuperAdmin = user.role === 'SUPER_ADMIN';

    const rawStatus = typeof body.status === 'string' ? body.status.trim() : '';
    const rawExpenseType = typeof body.expense_type === 'string' ? body.expense_type.trim().toLowerCase() : '';

    const hasStatus = rawStatus.length > 0;
    const hasExpenseType = rawExpenseType.length > 0;

    if (!hasStatus && !hasExpenseType) {
      return res.status(400).json({ message: 'No fields to update' });
    }
    if (hasStatus && rawStatus !== 'approved' && rawStatus !== 'rejected' && rawStatus !== 'submitted') {
      return res.status(400).json({ message: 'Status must be submitted, approved, or rejected' });
    }
    if (hasExpenseType && rawExpenseType !== 'personal' && rawExpenseType !== 'company') {
      return res.status(400).json({ message: 'expense_type must be personal or company' });
    }

    const setParts: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (hasStatus) {
      setParts.push(`status = $${paramIndex++}`);
      params.push(rawStatus);
      setParts.push(`approved_by = $${paramIndex++}`);
      params.push(rawStatus === 'approved' ? user.userId : null);
      setParts.push(`approved_at = ${rawStatus === 'approved' ? 'NOW()' : 'NULL'}`);
    }

    if (hasExpenseType) {
      setParts.push(`expense_type = $${paramIndex++}`);
      params.push(rawExpenseType);
    }

    setParts.push('updated_at = NOW()');

    const expenseIdParam = paramIndex++;
    params.push(expenseId);

    let whereClause = `je.id = $${expenseIdParam} AND j.id = je.job_id`;
    if (!isSuperAdmin) {
      const tenantParam = paramIndex++;
      params.push(userId);
      whereClause += ` AND j.created_by = $${tenantParam}`;
    }

    try {
      const updateResult = await pool.query(
        `UPDATE job_expenses je
         SET ${setParts.join(', ')}
         FROM jobs j
         WHERE ${whereClause}`,
        params,
      );
      if ((updateResult.rowCount ?? 0) === 0) {
        return res.status(404).json({ message: 'Expense not found' });
      }

      const row = await loadExpenseRow(pool, expenseId, userId, isSuperAdmin);
      if (!row) return res.status(404).json({ message: 'Expense not found' });
      return res.json({ expense: expenseRow(row) });
    } catch (error) {
      const pgError = error as { code?: string; detail?: string; message?: string };
      console.error(
        'Patch job expense error:',
        pgError.message ?? error,
        pgError.code ? `code=${pgError.code}` : '',
        pgError.detail ? `detail=${pgError.detail}` : '',
      );
      return res.status(500).json({ message: 'Internal server error' });
    }
  });
}
