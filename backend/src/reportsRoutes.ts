import type { Application, Request, Response } from 'express';
import type { Pool } from 'pg';
import { assertStaffPermissionAny, getTenantScopeUserId } from './tenantAccess';
import type { TenantAuthUser } from './tenantAccess';
import { calculateJobsCosts } from './jobCostsRoutes';
import { generateReportsPdfBuffer } from './reportsPrintHtml';
import { PdfRenderUnavailableError } from './jobClientReportPdf';

type AuthReq = Request & { user?: TenantAuthUser };

type ReportsRouteDeps = {
  pool: Pool;
  authenticate: (req: Request, res: Response, next: () => void) => void;
};

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

function num(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw ?? '0'));
  return Number.isFinite(n) ? n : 0;
}

export type ReportsOverview = {
  from: string;
  to: string;
  staff: {
    officer_id: number;
    full_name: string;
    days_worked: number;
    total_seconds: number;
    travelling_seconds: number;
    on_site_seconds: number;
  }[];
  totals: {
    total_seconds: number;
    travelling_seconds: number;
    on_site_seconds: number;
  };
  revenueByCustomer: {
    customer_id: number;
    customer_name: string;
    invoice_count: number;
    total: number;
  }[];
  topJobs: { title: string; count: number }[];
  workByCustomer: {
    customer_id: number;
    customer_name: string;
    job_count: number;
    total_seconds: number;
    travelling_seconds: number;
    on_site_seconds: number;
  }[];
  financials: {
    turnover: number;
    invoice_count: number;
    profit: number;
    overheads: number;
    overhead_count: number;
    net_profit: number;
  };
};

export async function buildReportsOverview(
  pool: Pool,
  user: TenantAuthUser,
  from: string,
  to: string,
): Promise<ReportsOverview> {
  const userId = getTenantScopeUserId(user);
  const isSuperAdmin = user.role === 'SUPER_ADMIN';
  const rangeParams = isSuperAdmin ? [from, to] : [from, to, userId];
  const scope = (col: string) => (isSuperAdmin ? '' : `AND ${col} = $3`);

  // a. Staff hours (who worked what, incl. travel time)
  const staffRes = await pool.query<{
    officer_id: number;
    full_name: string;
    days_worked: number;
    total_seconds: string;
    travelling_seconds: string;
    on_site_seconds: string;
  }>(
    `SELECT o.id AS officer_id, o.full_name,
            COUNT(DISTINCT te.clock_in::date)::int AS days_worked,
            COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(te.clock_out, NOW()) - te.clock_in))), 0)::bigint AS total_seconds,
            COALESCE(SUM(CASE WHEN te.segment_type = 'travelling' THEN EXTRACT(EPOCH FROM (COALESCE(te.clock_out, NOW()) - te.clock_in)) ELSE 0 END), 0)::bigint AS travelling_seconds,
            COALESCE(SUM(CASE WHEN te.segment_type = 'on_site' THEN EXTRACT(EPOCH FROM (COALESCE(te.clock_out, NOW()) - te.clock_in)) ELSE 0 END), 0)::bigint AS on_site_seconds
     FROM officers o
     LEFT JOIN timesheet_entries te ON te.officer_id = o.id
       AND te.clock_in >= $1::date
       AND te.clock_in < ($2::date + INTERVAL '1 day')
     WHERE 1 = 1 ${scope('o.created_by')}
     GROUP BY o.id, o.full_name
     ORDER BY total_seconds DESC, o.full_name ASC`,
    rangeParams,
  );

  // b. Revenue by customer (invoiced totals)
  const revenueRes = await pool.query<{
    customer_id: number;
    customer_name: string;
    invoice_count: number;
    total: string;
  }>(
    `SELECT c.id AS customer_id, c.full_name AS customer_name,
            COUNT(i.id)::int AS invoice_count,
            COALESCE(SUM(i.total_amount), 0)::numeric AS total
     FROM invoices i
     JOIN customers c ON c.id = i.customer_id
     WHERE i.invoice_date >= $1::date
       AND i.invoice_date < ($2::date + INTERVAL '1 day')
       AND i.state NOT IN ('draft', 'cancelled') ${scope('i.created_by')}
     GROUP BY c.id, c.full_name
     ORDER BY total DESC`,
    rangeParams,
  );

  // c. Jobs done the most (by title)
  const topJobsRes = await pool.query<{ title: string; count: number }>(
    `SELECT COALESCE(NULLIF(TRIM(j.title), ''), 'Untitled') AS title,
            COUNT(*)::int AS count
     FROM jobs j
     WHERE j.created_at >= $1::date
       AND j.created_at < ($2::date + INTERVAL '1 day') ${scope('j.created_by')}
     GROUP BY 1
     ORDER BY count DESC, title ASC
     LIMIT 10`,
    rangeParams,
  );

  // d. Customers worked for the most (job count + hours on their sites)
  const workJobsRes = await pool.query<{
    customer_id: number;
    customer_name: string;
    job_count: number;
  }>(
    `SELECT c.id AS customer_id, c.full_name AS customer_name,
            COUNT(j.id)::int AS job_count
     FROM jobs j
     JOIN customers c ON c.id = j.customer_id
     WHERE j.created_at >= $1::date
       AND j.created_at < ($2::date + INTERVAL '1 day') ${scope('j.created_by')}
     GROUP BY c.id, c.full_name
     ORDER BY job_count DESC, c.full_name ASC
     LIMIT 10`,
    rangeParams,
  );
  const workHoursRes = await pool.query<{
    customer_id: number;
    total_seconds: string;
    travelling_seconds: string;
    on_site_seconds: string;
  }>(
    `SELECT c.id AS customer_id,
            COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(te.clock_out, NOW()) - te.clock_in))), 0)::bigint AS total_seconds,
            COALESCE(SUM(CASE WHEN te.segment_type = 'travelling' THEN EXTRACT(EPOCH FROM (COALESCE(te.clock_out, NOW()) - te.clock_in)) ELSE 0 END), 0)::bigint AS travelling_seconds,
            COALESCE(SUM(CASE WHEN te.segment_type = 'on_site' THEN EXTRACT(EPOCH FROM (COALESCE(te.clock_out, NOW()) - te.clock_in)) ELSE 0 END), 0)::bigint AS on_site_seconds
     FROM timesheet_entries te
     JOIN diary_events d ON d.id = te.diary_event_id
     JOIN jobs j ON j.id = d.job_id
     JOIN customers c ON c.id = j.customer_id
     WHERE te.clock_in >= $1::date
       AND te.clock_in < ($2::date + INTERVAL '1 day') ${scope('j.created_by')}
     GROUP BY c.id`,
    rangeParams,
  );

  // e. Financials (turnover / profit for the period)
  const invoiceRows = await pool.query<{
    job_id: number | null;
    subtotal: string;
    total_amount: string;
  }>(
    `SELECT i.job_id, i.subtotal, i.total_amount
     FROM invoices i
     WHERE i.invoice_date >= $1::date
       AND i.invoice_date < ($2::date + INTERVAL '1 day')
       AND i.state NOT IN ('draft', 'cancelled') ${scope('i.created_by')}`,
    rangeParams,
  );
  const overheadRes = await pool.query<{ total: string; count: number }>(
    `SELECT COALESCE(SUM(amount), 0)::numeric AS total, COUNT(*)::int AS count
     FROM company_overhead_expenses
     WHERE expense_date >= $1::date
       AND expense_date < ($2::date + INTERVAL '1 day') ${scope('created_by')}`,
    rangeParams,
  );

  const jobIds = Array.from(
    new Set(invoiceRows.rows.map((r) => r.job_id).filter((id): id is number => id !== null)),
  );
  const costsMap = await calculateJobsCosts(pool, jobIds);
  // A job's cost is split evenly across every invoice linked to it, matching
  // the invoices page profit calculation.
  const invoiceCountByJob: Record<number, number> = {};
  for (const r of invoiceRows.rows) {
    if (r.job_id != null) invoiceCountByJob[r.job_id] = (invoiceCountByJob[r.job_id] ?? 0) + 1;
  }
  let turnover = 0;
  let profit = 0;
  for (const r of invoiceRows.rows) {
    turnover += num(r.total_amount);
    const sub = num(r.subtotal);
    const invoiceCount = r.job_id ? (invoiceCountByJob[r.job_id] ?? 1) : 1;
    const cost = r.job_id ? (costsMap[r.job_id] ?? 0) / (invoiceCount || 1) : 0;
    profit += sub - cost;
  }
  turnover = Math.round(turnover * 100) / 100;
  profit = Math.round(profit * 100) / 100;
  const overheads = Math.round(num(overheadRes.rows[0]?.total) * 100) / 100;
  const netProfit = Math.round((profit - overheads) * 100) / 100;

  const staff = staffRes.rows.map((r) => ({
    officer_id: r.officer_id,
    full_name: r.full_name,
    days_worked: Number(r.days_worked),
    total_seconds: num(r.total_seconds),
    travelling_seconds: num(r.travelling_seconds),
    on_site_seconds: num(r.on_site_seconds),
  }));
  const hoursByCustomer = new Map(workHoursRes.rows.map((r) => [r.customer_id, r]));
  const workByCustomer = workJobsRes.rows.map((r) => {
    const h = hoursByCustomer.get(r.customer_id);
    return {
      customer_id: r.customer_id,
      customer_name: r.customer_name,
      job_count: Number(r.job_count),
      total_seconds: num(h?.total_seconds),
      travelling_seconds: num(h?.travelling_seconds),
      on_site_seconds: num(h?.on_site_seconds),
    };
  });

  return {
    from,
    to,
    staff,
    totals: {
      total_seconds: staff.reduce((s, r) => s + r.total_seconds, 0),
      travelling_seconds: staff.reduce((s, r) => s + r.travelling_seconds, 0),
      on_site_seconds: staff.reduce((s, r) => s + r.on_site_seconds, 0),
    },
    revenueByCustomer: revenueRes.rows.map((r) => ({
      customer_id: r.customer_id,
      customer_name: r.customer_name,
      invoice_count: Number(r.invoice_count),
      total: Math.round(num(r.total) * 100) / 100,
    })),
    topJobs: topJobsRes.rows.map((r) => ({ title: r.title, count: Number(r.count) })),
    workByCustomer,
    financials: {
      turnover,
      invoice_count: invoiceRows.rows.length,
      profit,
      overheads,
      overhead_count: Number(overheadRes.rows[0]?.count ?? 0),
      net_profit: netProfit,
    },
  };
}

export function mountReportsRoutes(app: Application, deps: ReportsRouteDeps): void {
  const { pool, authenticate } = deps;

  app.get('/api/reports/overview', authenticate, async (req: AuthReq, res: Response) => {
    const user = req.user!;
    if (!assertStaffPermissionAny(user, ['jobs', 'invoices'])) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
    const from = parseDateParam(req.query.from) ?? defaultFromDate();
    const to = parseDateParam(req.query.to) ?? defaultToDate();
    try {
      return res.json(await buildReportsOverview(pool, user, from, to));
    } catch (error) {
      console.error('Reports overview error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.get('/api/reports/overview.pdf', authenticate, async (req: AuthReq, res: Response) => {
    const user = req.user!;
    if (!assertStaffPermissionAny(user, ['jobs', 'invoices'])) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
    const from = parseDateParam(req.query.from) ?? defaultFromDate();
    const to = parseDateParam(req.query.to) ?? defaultToDate();
    try {
      const data = await buildReportsOverview(pool, user, from, to);
      const pdf = await generateReportsPdfBuffer(pool, getTenantScopeUserId(user), data);
      const filename = `report-${from}-to-${to}`.replace(/[^\w.-]+/g, '_');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
      res.setHeader('Content-Length', String(pdf.length));
      return res.send(pdf);
    } catch (error) {
      if (error instanceof PdfRenderUnavailableError) {
        return res.status(503).json({ message: error.message });
      }
      console.error('Reports PDF error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });
}
