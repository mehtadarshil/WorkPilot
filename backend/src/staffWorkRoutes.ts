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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS officer_payments (
      id SERIAL PRIMARY KEY,
      officer_id INTEGER NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
      amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
      payment_method VARCHAR(50) NOT NULL DEFAULT 'bank_transfer',
      payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
      reference_number VARCHAR(120),
      notes TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_officer_payments_officer ON officer_payments(officer_id, payment_date DESC)');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS company_overhead_expenses (
      id SERIAL PRIMARY KEY,
      expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
      category VARCHAR(80) NOT NULL DEFAULT 'General',
      description TEXT,
      amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_company_overhead_expenses_tenant_date ON company_overhead_expenses(created_by, expense_date DESC)',
  );
}

function overheadExpenseRow(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    expense_date:
      row.expense_date instanceof Date
        ? row.expense_date.toISOString().slice(0, 10)
        : String(row.expense_date ?? '').slice(0, 10),
    category: (row.category as string | null) ?? 'General',
    description: (row.description as string | null) ?? null,
    amount: Number(row.amount ?? 0),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : null,
  };
}

async function sumOverheadExpenses(
  pool: Pool,
  userId: number,
  isSuperAdmin: boolean,
  from?: string,
  to?: string,
): Promise<{ total: number; count: number }> {
  const params: unknown[] = [];
  let where = 'WHERE 1=1';
  if (!isSuperAdmin) {
    params.push(userId);
    where += ` AND created_by = $${params.length}`;
  }
  if (from && to) {
    params.push(from, to);
    where += ` AND expense_date >= $${params.length - 1}::date AND expense_date < ($${params.length}::date + INTERVAL '1 day')`;
  }
  const result = await pool.query<{ total: string; count: number }>(
    `SELECT COALESCE(SUM(amount), 0)::numeric AS total, COUNT(*)::int AS count
     FROM company_overhead_expenses ${where}`,
    params,
  );
  const row = result.rows[0];
  return { total: Number(row?.total ?? 0), count: Number(row?.count ?? 0) };
}

const OFFICER_PAYMENT_METHODS = ['bank_transfer', 'credit_card', 'cash', 'digital_payment', 'check', 'other'] as const;

async function officerVisibleToUser(
  pool: Pool,
  officerId: number,
  userId: number,
  isSuperAdmin: boolean,
): Promise<boolean> {
  if (isSuperAdmin) {
    const result = await pool.query('SELECT id FROM officers WHERE id = $1', [officerId]);
    return (result.rowCount ?? 0) > 0;
  }
  const result = await pool.query('SELECT id FROM officers WHERE id = $1 AND created_by = $2', [officerId, userId]);
  return (result.rowCount ?? 0) > 0;
}

const RESOLVED_PERSONAL_EXPENSE_BASE = `
  SELECT je.amount,
         COALESCE(
           je.officer_id,
           (SELECT o.id
            FROM officers o
            LEFT JOIN users cu ON cu.id = je.created_by
            WHERE o.created_by = j.created_by
              AND (
                o.linked_user_id = je.created_by
                OR (
                  cu.email IS NOT NULL
                  AND o.email IS NOT NULL
                  AND LOWER(TRIM(o.email)) = LOWER(TRIM(cu.email))
                )
              )
            ORDER BY CASE WHEN o.linked_user_id = je.created_by THEN 0 ELSE 1 END, o.id
            LIMIT 1)
         ) AS resolved_officer_id
  FROM job_expenses je
  JOIN jobs j ON j.id = je.job_id
  WHERE je.status = 'approved'
    AND je.expense_type = 'personal'
`;

async function loadOfficerPaymentSummary(
  pool: Pool,
  officerId: number,
  userId: number,
  isSuperAdmin: boolean,
) {
  const approvedRes = await pool.query<{ approved_total: string; approved_count: number }>(
    `WITH resolved AS (${RESOLVED_PERSONAL_EXPENSE_BASE}
       ${isSuperAdmin ? '' : 'AND j.created_by = $2'}
     )
     SELECT COALESCE(SUM(amount), 0)::numeric AS approved_total,
            COUNT(*)::int AS approved_count
     FROM resolved
     WHERE resolved_officer_id = $1`,
    isSuperAdmin ? [officerId] : [officerId, userId],
  );

  const paidRes = await pool.query<{ paid_total: string; paid_count: number }>(
    `SELECT COALESCE(SUM(op.amount), 0)::numeric AS paid_total,
            COUNT(*)::int AS paid_count
     FROM officer_payments op
     JOIN officers o ON o.id = op.officer_id
     WHERE op.officer_id = $1
       ${isSuperAdmin ? '' : 'AND o.created_by = $2'}`,
    isSuperAdmin ? [officerId] : [officerId, userId],
  );

  const approvedTotal = Number(approvedRes.rows[0]?.approved_total ?? 0);
  const paidTotal = Number(paidRes.rows[0]?.paid_total ?? 0);
  const outstanding = Math.round((approvedTotal - paidTotal) * 100) / 100;

  return {
    approved_total: approvedTotal,
    approved_count: Number(approvedRes.rows[0]?.approved_count ?? 0),
    paid_total: paidTotal,
    paid_count: Number(paidRes.rows[0]?.paid_count ?? 0),
    outstanding,
  };
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
        `SELECT id, full_name, role_position, department, state, bank_name, sort_code, account_number
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
        `WITH resolved AS (
           SELECT je.amount,
                  COALESCE(
                    je.officer_id,
                    (SELECT o.id
                     FROM officers o
                     LEFT JOIN users cu ON cu.id = je.created_by
                     WHERE o.created_by = j.created_by
                       AND (
                         o.linked_user_id = je.created_by
                         OR (
                           cu.email IS NOT NULL
                           AND o.email IS NOT NULL
                           AND LOWER(TRIM(o.email)) = LOWER(TRIM(cu.email))
                         )
                       )
                     ORDER BY CASE WHEN o.linked_user_id = je.created_by THEN 0 ELSE 1 END, o.id
                     LIMIT 1)
                  ) AS resolved_officer_id
           FROM job_expenses je
           JOIN jobs j ON j.id = je.job_id
           WHERE je.expense_date >= $1::date
             AND je.expense_date < ($2::date + INTERVAL '1 day')
             AND je.status = 'approved'
             AND je.expense_type = 'personal'
             ${isSuperAdmin ? '' : 'AND j.created_by = $3'}
         )
         SELECT resolved_officer_id AS officer_id,
                COALESCE(SUM(amount), 0)::numeric AS expenses_total,
                COUNT(*)::int AS expenses_count
         FROM resolved
         WHERE resolved_officer_id IS NOT NULL
         GROUP BY resolved_officer_id`,
        isSuperAdmin ? [from, to] : [from, to, userId],
      );
      const pendingExpenseResult = await pool.query(
        `WITH resolved AS (
           SELECT je.amount,
                  COALESCE(
                    je.officer_id,
                    (SELECT o.id
                     FROM officers o
                     LEFT JOIN users cu ON cu.id = je.created_by
                     WHERE o.created_by = j.created_by
                       AND (
                         o.linked_user_id = je.created_by
                         OR (
                           cu.email IS NOT NULL
                           AND o.email IS NOT NULL
                           AND LOWER(TRIM(o.email)) = LOWER(TRIM(cu.email))
                         )
                       )
                     ORDER BY CASE WHEN o.linked_user_id = je.created_by THEN 0 ELSE 1 END, o.id
                     LIMIT 1)
                  ) AS resolved_officer_id
           FROM job_expenses je
           JOIN jobs j ON j.id = je.job_id
           WHERE je.expense_date >= $1::date
             AND je.expense_date < ($2::date + INTERVAL '1 day')
             AND je.status = 'submitted'
             AND je.expense_type = 'personal'
             ${isSuperAdmin ? '' : 'AND j.created_by = $3'}
         )
         SELECT resolved_officer_id AS officer_id,
                COALESCE(SUM(amount), 0)::numeric AS pending_expenses_total,
                COUNT(*)::int AS pending_expenses_count
         FROM resolved
         WHERE resolved_officer_id IS NOT NULL
         GROUP BY resolved_officer_id`,
        isSuperAdmin ? [from, to] : [from, to, userId],
      );
      const companyApprovedExpenseResult = await pool.query(
        `WITH resolved AS (
           SELECT je.amount,
                  COALESCE(
                    je.officer_id,
                    (SELECT o.id
                     FROM officers o
                     LEFT JOIN users cu ON cu.id = je.created_by
                     WHERE o.created_by = j.created_by
                       AND (
                         o.linked_user_id = je.created_by
                         OR (
                           cu.email IS NOT NULL
                           AND o.email IS NOT NULL
                           AND LOWER(TRIM(o.email)) = LOWER(TRIM(cu.email))
                         )
                       )
                     ORDER BY CASE WHEN o.linked_user_id = je.created_by THEN 0 ELSE 1 END, o.id
                     LIMIT 1)
                  ) AS resolved_officer_id
           FROM job_expenses je
           JOIN jobs j ON j.id = je.job_id
           WHERE je.expense_date >= $1::date
             AND je.expense_date < ($2::date + INTERVAL '1 day')
             AND je.status = 'approved'
             AND je.expense_type = 'company'
             ${isSuperAdmin ? '' : 'AND j.created_by = $3'}
         )
         SELECT resolved_officer_id AS officer_id,
                COALESCE(SUM(amount), 0)::numeric AS company_expenses_total,
                COUNT(*)::int AS company_expenses_count
         FROM resolved
         WHERE resolved_officer_id IS NOT NULL
         GROUP BY resolved_officer_id`,
        isSuperAdmin ? [from, to] : [from, to, userId],
      );
      const periodExpenseTotals = await pool.query<{
        personal_approved_total: string;
        personal_approved_count: number;
        company_approved_total: string;
        company_approved_count: number;
      }>(
        `SELECT
           COALESCE(SUM(je.amount) FILTER (WHERE je.status = 'approved' AND je.expense_type = 'personal'), 0)::numeric AS personal_approved_total,
           COUNT(*) FILTER (WHERE je.status = 'approved' AND je.expense_type = 'personal')::int AS personal_approved_count,
           COALESCE(SUM(je.amount) FILTER (WHERE je.status = 'approved' AND je.expense_type = 'company'), 0)::numeric AS company_approved_total,
           COUNT(*) FILTER (WHERE je.status = 'approved' AND je.expense_type = 'company')::int AS company_approved_count
         FROM job_expenses je
         JOIN jobs j ON j.id = je.job_id
         WHERE je.expense_date >= $1::date
           AND je.expense_date < ($2::date + INTERVAL '1 day')
           ${isSuperAdmin ? '' : 'AND j.created_by = $3'}`,
        isSuperAdmin ? [from, to] : [from, to, userId],
      );
      const allTimePersonalResult = await pool.query(
        `WITH resolved AS (${RESOLVED_PERSONAL_EXPENSE_BASE}
           ${isSuperAdmin ? '' : 'AND j.created_by = $1'}
         )
         SELECT resolved_officer_id AS officer_id,
                COALESCE(SUM(amount), 0)::numeric AS personal_approved_total,
                COUNT(*)::int AS personal_approved_count
         FROM resolved
         WHERE resolved_officer_id IS NOT NULL
         GROUP BY resolved_officer_id`,
        isSuperAdmin ? [] : [userId],
      );
      const officerPaymentsResult = await pool.query(
        `SELECT op.officer_id,
                COALESCE(SUM(op.amount), 0)::numeric AS paid_total,
                COUNT(*)::int AS paid_count
         FROM officer_payments op
         JOIN officers o ON o.id = op.officer_id
         ${isSuperAdmin ? '' : 'WHERE o.created_by = $1'}
         GROUP BY op.officer_id`,
        isSuperAdmin ? [] : [userId],
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
      const companyByOfficer = new Map<number, Record<string, unknown>>();
      for (const row of companyApprovedExpenseResult.rows) {
        if (row.officer_id != null) companyByOfficer.set(Number(row.officer_id), row);
      }
      const allTimePersonalByOfficer = new Map<number, Record<string, unknown>>();
      for (const row of allTimePersonalResult.rows) {
        if (row.officer_id != null) allTimePersonalByOfficer.set(Number(row.officer_id), row);
      }
      const paymentsByOfficer = new Map<number, Record<string, unknown>>();
      for (const row of officerPaymentsResult.rows) {
        if (row.officer_id != null) paymentsByOfficer.set(Number(row.officer_id), row);
      }
      const periodTotals = periodExpenseTotals.rows[0];
      const officers = officerResult.rows.map((o) => {
        const ts = byOfficer.get(Number(o.id));
        const ex = expByOfficer.get(Number(o.id));
        const pending = pendingByOfficer.get(Number(o.id));
        const company = companyByOfficer.get(Number(o.id));
        const allTimePersonal = allTimePersonalByOfficer.get(Number(o.id));
        const paid = paymentsByOfficer.get(Number(o.id));
        const personalApprovedAllTime = Number(allTimePersonal?.personal_approved_total ?? 0);
        const personalPaidTotal = Number(paid?.paid_total ?? 0);
        const personalOutstanding = Math.round((personalApprovedAllTime - personalPaidTotal) * 100) / 100;
        return {
          id: Number(o.id),
          full_name: o.full_name as string,
          role_position: (o.role_position as string | null) ?? null,
          department: (o.department as string | null) ?? null,
          state: o.state as string,
          bank_name: (o as any).bank_name ?? null,
          sort_code: (o as any).sort_code ?? null,
          account_number: (o as any).account_number ?? null,
          days_worked: Number(ts?.days_worked ?? 0),
          total_seconds: Number(ts?.total_seconds ?? 0),
          travelling_seconds: Number(ts?.travelling_seconds ?? 0),
          on_site_seconds: Number(ts?.on_site_seconds ?? 0),
          expenses_total: Number(ex?.expenses_total ?? 0),
          expenses_count: Number(ex?.expenses_count ?? 0),
          company_expenses_total: Number(company?.company_expenses_total ?? 0),
          company_expenses_count: Number(company?.company_expenses_count ?? 0),
          pending_expenses_total: Number(pending?.pending_expenses_total ?? 0),
          pending_expenses_count: Number(pending?.pending_expenses_count ?? 0),
          personal_approved_all_time: personalApprovedAllTime,
          personal_paid_total: personalPaidTotal,
          personal_paid_count: Number(paid?.paid_count ?? 0),
          personal_outstanding: personalOutstanding,
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
          company_expenses_total: acc.company_expenses_total + o.company_expenses_total,
          company_expenses_count: acc.company_expenses_count + o.company_expenses_count,
          pending_expenses_total: acc.pending_expenses_total + o.pending_expenses_total,
          pending_expenses_count: acc.pending_expenses_count + o.pending_expenses_count,
          personal_paid_total: acc.personal_paid_total + o.personal_paid_total,
          personal_outstanding: acc.personal_outstanding + o.personal_outstanding,
        }),
        {
          days_worked: 0,
          total_seconds: 0,
          travelling_seconds: 0,
          on_site_seconds: 0,
          expenses_total: 0,
          expenses_count: 0,
          company_expenses_total: 0,
          company_expenses_count: 0,
          pending_expenses_total: 0,
          pending_expenses_count: 0,
          personal_paid_total: 0,
          personal_outstanding: 0,
        },
      );
      totals.expenses_total = Number(periodTotals?.personal_approved_total ?? totals.expenses_total);
      totals.expenses_count = Number(periodTotals?.personal_approved_count ?? totals.expenses_count);
      totals.company_expenses_total = Number(periodTotals?.company_approved_total ?? 0);
      totals.company_expenses_count = Number(periodTotals?.company_approved_count ?? 0);
      const overheadPeriod = await sumOverheadExpenses(pool, userId, isSuperAdmin, from, to);
      const overheadAllTime = await sumOverheadExpenses(pool, userId, isSuperAdmin);
      return res.json({
        from,
        to,
        officers,
        totals: {
          ...totals,
          general_overhead_total: overheadPeriod.total,
          general_overhead_count: overheadPeriod.count,
          general_overhead_all_time: overheadAllTime.total,
        },
      });
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

  app.get('/api/company-overhead-expenses', authenticate, async (req: AuthReq, res: Response) => {
    const user = req.user!;
    if (!assertStaffPermissionAny(user, ['field_users'])) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
    const from = parseDateParam(req.query.from) ?? defaultFromDate();
    const to = parseDateParam(req.query.to) ?? defaultToDate();
    const userId = getTenantScopeUserId(user);
    const isSuperAdmin = user.role === 'SUPER_ADMIN';
    try {
      const params: unknown[] = [from, to];
      let sql = `
        SELECT id, expense_date, category, description, amount, created_at
        FROM company_overhead_expenses
        WHERE expense_date >= $1::date
          AND expense_date < ($2::date + INTERVAL '1 day')
      `;
      if (!isSuperAdmin) {
        params.push(userId);
        sql += ` AND created_by = $${params.length}`;
      }
      sql += ' ORDER BY expense_date DESC, id DESC';
      const result = await pool.query(sql, params);
      const summary = await sumOverheadExpenses(pool, userId, isSuperAdmin, from, to);
      return res.json({ expenses: result.rows.map(overheadExpenseRow), summary });
    } catch (error) {
      console.error('List company overhead expenses error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.post('/api/company-overhead-expenses', authenticate, async (req: AuthReq, res: Response) => {
    const user = req.user!;
    if (!assertStaffPermissionAny(user, ['field_users'])) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
    const userId = getTenantScopeUserId(user);
    const body = req.body as Record<string, unknown>;
    const amount = money(body.amount);
    if (amount == null || amount <= 0) {
      return res.status(400).json({ message: 'Amount must be greater than zero' });
    }
    const category =
      typeof body.category === 'string' ? body.category.trim().slice(0, 80) || 'General' : 'General';
    const description = typeof body.description === 'string' ? body.description.trim().slice(0, 2000) || null : null;
    const expenseDate = isoDate(body.expense_date);
    try {
      const insert = await pool.query(
        `INSERT INTO company_overhead_expenses (expense_date, category, description, amount, created_by, updated_at)
         VALUES ($1::date, $2, $3, $4, $5, NOW())
         RETURNING id, expense_date, category, description, amount, created_at`,
        [expenseDate, category, description, amount, userId],
      );
      return res.status(201).json({ expense: overheadExpenseRow(insert.rows[0] as Record<string, unknown>) });
    } catch (error) {
      console.error('Create company overhead expense error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.patch('/api/company-overhead-expenses/:id', authenticate, async (req: AuthReq, res: Response) => {
    const user = req.user!;
    if (!assertStaffPermissionAny(user, ['field_users'])) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
    const expenseId = parseId(req.params.id);
    if (!expenseId) return res.status(400).json({ message: 'Invalid expense id' });
    const userId = getTenantScopeUserId(user);
    const isSuperAdmin = user.role === 'SUPER_ADMIN';
    const body = req.body as Record<string, unknown>;
    try {
      const existing = await pool.query(
        `SELECT id FROM company_overhead_expenses WHERE id = $1 ${isSuperAdmin ? '' : 'AND created_by = $2'}`,
        isSuperAdmin ? [expenseId] : [expenseId, userId],
      );
      if ((existing.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Expense not found' });

      const updates: string[] = [];
      const values: unknown[] = [];
      let idx = 1;
      if (body.expense_date !== undefined) {
        updates.push(`expense_date = $${idx++}::date`);
        values.push(isoDate(body.expense_date));
      }
      if (body.category !== undefined) {
        updates.push(`category = $${idx++}`);
        values.push(typeof body.category === 'string' ? body.category.trim().slice(0, 80) || 'General' : 'General');
      }
      if (body.description !== undefined) {
        updates.push(`description = $${idx++}`);
        values.push(typeof body.description === 'string' ? body.description.trim().slice(0, 2000) || null : null);
      }
      if (body.amount !== undefined) {
        const amount = money(body.amount);
        if (amount == null || amount <= 0) {
          return res.status(400).json({ message: 'Amount must be greater than zero' });
        }
        updates.push(`amount = $${idx++}`);
        values.push(amount);
      }
      if (updates.length === 0) {
        return res.status(400).json({ message: 'No fields to update' });
      }
      updates.push('updated_at = NOW()');
      values.push(expenseId);
      const updated = await pool.query(
        `UPDATE company_overhead_expenses SET ${updates.join(', ')} WHERE id = $${idx}
         RETURNING id, expense_date, category, description, amount, created_at`,
        values,
      );
      return res.json({ expense: overheadExpenseRow(updated.rows[0] as Record<string, unknown>) });
    } catch (error) {
      console.error('Update company overhead expense error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.delete('/api/company-overhead-expenses/:id', authenticate, async (req: AuthReq, res: Response) => {
    const user = req.user!;
    if (!assertStaffPermissionAny(user, ['field_users'])) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
    const expenseId = parseId(req.params.id);
    if (!expenseId) return res.status(400).json({ message: 'Invalid expense id' });
    const userId = getTenantScopeUserId(user);
    const isSuperAdmin = user.role === 'SUPER_ADMIN';
    try {
      const result = await pool.query(
        `DELETE FROM company_overhead_expenses WHERE id = $1 ${isSuperAdmin ? '' : 'AND created_by = $2'} RETURNING id`,
        isSuperAdmin ? [expenseId] : [expenseId, userId],
      );
      if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Expense not found' });
      return res.status(204).send();
    } catch (error) {
      console.error('Delete company overhead expense error:', error);
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

    let hasOfficerId = false;
    let officerIdToSet: number | null = null;
    if (body.officer_id !== undefined) {
      hasOfficerId = true;
      if (body.officer_id !== null) {
        const parsed = parseId(body.officer_id);
        if (!parsed) {
          return res.status(400).json({ message: 'Invalid officer id' });
        }
        // Verify officer belongs to tenant
        let officerCheck;
        if (isSuperAdmin) {
          officerCheck = await pool.query('SELECT id FROM officers WHERE id = $1', [parsed]);
        } else {
          officerCheck = await pool.query('SELECT id FROM officers WHERE id = $1 AND created_by = $2', [parsed, userId]);
        }
        if ((officerCheck.rowCount ?? 0) === 0) {
          return res.status(400).json({ message: 'Officer not found or does not belong to tenant' });
        }
        officerIdToSet = parsed;
      }
    }

    if (!hasStatus && !hasExpenseType && !hasOfficerId) {
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

    if (hasOfficerId) {
      setParts.push(`officer_id = $${paramIndex++}`);
      params.push(officerIdToSet);
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

  app.get('/api/officers/:officerId/payments', authenticate, async (req: AuthReq, res: Response) => {
    const user = req.user!;
    if (!assertStaffPermissionAny(user, ['field_users'])) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
    const officerId = parseId(req.params.officerId);
    if (!officerId) return res.status(400).json({ message: 'Invalid officer id' });
    const userId = getTenantScopeUserId(user);
    const isSuperAdmin = user.role === 'SUPER_ADMIN';
    if (!(await officerVisibleToUser(pool, officerId, userId, isSuperAdmin))) {
      return res.status(404).json({ message: 'Officer not found' });
    }
    const from = parseDateParam(req.query.from);
    const to = parseDateParam(req.query.to);
    try {
      const summary = await loadOfficerPaymentSummary(pool, officerId, userId, isSuperAdmin);
      const params: unknown[] = [officerId];
      let dateFilter = '';
      if (from && to) {
        params.push(from, to);
        dateFilter = ` AND op.payment_date >= $2::date AND op.payment_date < ($3::date + INTERVAL '1 day')`;
      }
      const paymentsRes = await pool.query(
        `SELECT op.id, op.amount, op.payment_method, op.payment_date, op.reference_number, op.notes, op.created_at,
                u.full_name AS created_by_name
         FROM officer_payments op
         JOIN officers o ON o.id = op.officer_id
         LEFT JOIN users u ON u.id = op.created_by
         WHERE op.officer_id = $1
           ${isSuperAdmin ? '' : `AND o.created_by = $${params.length + 1}`}
           ${dateFilter}
         ORDER BY op.payment_date DESC, op.id DESC`,
        isSuperAdmin ? params : [...params, userId],
      );
      const payments = paymentsRes.rows.map((row) => ({
        id: Number(row.id),
        amount: Number(row.amount ?? 0),
        payment_method: (row.payment_method as string | null) ?? 'other',
        payment_date:
          row.payment_date instanceof Date
            ? row.payment_date.toISOString().slice(0, 10)
            : String(row.payment_date ?? '').slice(0, 10),
        reference_number: (row.reference_number as string | null) ?? null,
        notes: (row.notes as string | null) ?? null,
        created_at: row.created_at instanceof Date ? row.created_at.toISOString() : null,
        created_by_name: (row.created_by_name as string | null) ?? null,
      }));
      return res.json({ summary, payments });
    } catch (error) {
      console.error('Officer payments list error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.post('/api/officers/:officerId/payments', authenticate, async (req: AuthReq, res: Response) => {
    const user = req.user!;
    if (!assertStaffPermissionAny(user, ['field_users'])) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
    const officerId = parseId(req.params.officerId);
    if (!officerId) return res.status(400).json({ message: 'Invalid officer id' });
    const userId = getTenantScopeUserId(user);
    const isSuperAdmin = user.role === 'SUPER_ADMIN';
    if (!(await officerVisibleToUser(pool, officerId, userId, isSuperAdmin))) {
      return res.status(404).json({ message: 'Officer not found' });
    }
    const body = req.body as Record<string, unknown>;
    const amount = money(body.amount);
    if (amount == null || amount <= 0) {
      return res.status(400).json({ message: 'Payment amount must be greater than zero' });
    }
    const paymentMethod =
      typeof body.payment_method === 'string' &&
      OFFICER_PAYMENT_METHODS.includes(body.payment_method as (typeof OFFICER_PAYMENT_METHODS)[number])
        ? body.payment_method
        : 'bank_transfer';
    const paymentDate = isoDate(body.payment_date);
    const referenceNumber =
      typeof body.reference_number === 'string' ? body.reference_number.trim().slice(0, 120) || null : null;
    const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 500) || null : null;
    try {
      const insert = await pool.query(
        `INSERT INTO officer_payments (officer_id, amount, payment_method, payment_date, reference_number, notes, created_by)
         VALUES ($1, $2, $3, $4::date, $5, $6, $7)
         RETURNING id, amount, payment_method, payment_date, reference_number, notes, created_at`,
        [officerId, amount, paymentMethod, paymentDate, referenceNumber, notes, user.userId],
      );
      const row = insert.rows[0];
      const summary = await loadOfficerPaymentSummary(pool, officerId, userId, isSuperAdmin);
      return res.status(201).json({
        payment: {
          id: Number(row.id),
          amount: Number(row.amount ?? 0),
          payment_method: row.payment_method as string,
          payment_date:
            row.payment_date instanceof Date
              ? row.payment_date.toISOString().slice(0, 10)
              : String(row.payment_date ?? '').slice(0, 10),
          reference_number: (row.reference_number as string | null) ?? null,
          notes: (row.notes as string | null) ?? null,
          created_at: row.created_at instanceof Date ? row.created_at.toISOString() : null,
        },
        summary,
      });
    } catch (error) {
      console.error('Record officer payment error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });
}
