import type { Application, Request, Response } from 'express';
import type { Pool } from 'pg';
import { getTenantScopeUserId, tenantCrmAccessAllowed } from '../tenantAccess';
import type { TenantAuthUser } from '../tenantAccess';
import { parseDateOnly, dateOnlyFromPg } from './dateUtils';
import {
  advancePpmTaskFromJob,
  computeSlaDueAt,
  enrichContractRow,
  enrichTaskRow,
  findMissedTasks,
  getPpmReportingSummary,
  getContractTaskHistory,
  bulkPpmContractAction,
  finalizePpmJob,
  handlePpmJobCompletion,
  runPpmAutoCreateJobs,
  type PpmListFilter,
} from './service';
import type { PpmIntervalUnit } from './types';

type AuthReq = Request & { user?: TenantAuthUser };

type RouteDeps = {
  pool: Pool;
  authenticate: (req: Request, res: Response, next: () => void) => void;
};

function parseId(raw: unknown): number | null {
  const n = parseInt(String(Array.isArray(raw) ? raw[0] : raw), 10);
  return Number.isFinite(n) ? n : null;
}

function jsonCol(raw: unknown, fallback: Record<string, unknown> = {}): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return fallback;
}

function jsonArr(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => Number(v)).filter((n) => Number.isFinite(n));
}

const CONTRACT_SELECT = `
  c.*,
  cu.full_name AS customer_name,
  wa.name AS work_address_name,
  wa.branch_name AS work_address_branch,
  (SELECT MIN(t.next_due_date) FROM ppm_contract_tasks t WHERE t.contract_id = c.id AND t.is_active = true) AS earliest_next_due,
  (SELECT COUNT(*)::int FROM ppm_contract_tasks t WHERE t.contract_id = c.id AND t.is_active = true) AS task_count
`;

function listFilterClause(filter: PpmListFilter, today: string): { clause: string; params: unknown[] } {
  switch (filter) {
    case 'due_soon':
      return {
        clause: ` AND c.status = 'active' AND EXISTS (
          SELECT 1 FROM ppm_contract_tasks t
          WHERE t.contract_id = c.id AND t.is_active = true
            AND t.next_due_date >= $TODAY::date
            AND t.next_due_date <= ($TODAY::date + INTERVAL '30 days')
        )`,
        params: [],
      };
    case 'overdue':
      return {
        clause: ` AND c.status = 'active' AND EXISTS (
          SELECT 1 FROM ppm_contract_tasks t
          WHERE t.contract_id = c.id AND t.is_active = true AND t.next_due_date < $TODAY::date
        )`,
        params: [],
      };
    case 'expired':
      return {
        clause: ` AND (c.status = 'expired' OR (c.end_date IS NOT NULL AND c.end_date < $TODAY::date))`,
        params: [],
      };
    case 'active':
      return {
        clause: ` AND c.status = 'active' AND (c.end_date IS NULL OR c.end_date >= $TODAY::date)`,
        params: [],
      };
    default:
      return { clause: '', params: [] };
  }
}

async function loadContract(
  pool: Pool,
  id: number,
  tenantUserId: number,
  isSuperAdmin: boolean,
): Promise<Record<string, unknown> | null> {
  const params: unknown[] = [id];
  let owner = '';
  if (!isSuperAdmin) {
    params.push(tenantUserId);
    owner = ' AND c.created_by = $2';
  }
  const result = await pool.query(
    `SELECT ${CONTRACT_SELECT} FROM ppm_contracts c
     LEFT JOIN customers cu ON cu.id = c.customer_id
     LEFT JOIN customer_work_addresses wa ON wa.id = c.work_address_id
     WHERE c.id = $1${owner}`,
    params,
  );
  if ((result.rowCount ?? 0) === 0) return null;
  return enrichContractRow(result.rows[0] as Record<string, unknown>);
}

async function loadTasks(pool: Pool, contractId: number, contract?: Record<string, unknown>) {
  const result = await pool.query(
    `SELECT t.*,
            COALESCE(NULLIF(TRIM(a.description), ''), a.asset_group) AS asset_name
     FROM ppm_contract_tasks t
     LEFT JOIN customer_assets a ON a.id = t.asset_id
     WHERE t.contract_id = $1
     ORDER BY t.sort_order, t.id`,
    [contractId],
  );
  return result.rows.map((r) => enrichTaskRow(r as Record<string, unknown>, contract));
}

export function mountPpmContractRoutes(app: Application, deps: RouteDeps): void {
  const { pool, authenticate } = deps;

  app.get('/api/ppm-contracts', authenticate, async (req: AuthReq, res: Response) => {
    if (!req.user || !tenantCrmAccessAllowed(req.user, 'jobs', req.method)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const userId = getTenantScopeUserId(req.user);
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    const filter = (String(req.query.filter || 'active') as PpmListFilter) || 'active';
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const today = new Date().toISOString().slice(0, 10);
    const { clause } = listFilterClause(filter, today);
    const filterSql = clause.replace(/\$TODAY/g, '$1');

    const params: unknown[] = isSuperAdmin ? [today] : [today, userId];
    let searchClause = '';
    if (search) {
      params.push(`%${search}%`);
      const p = `$${params.length}`;
      searchClause = ` AND (c.title ILIKE ${p} OR c.reference ILIKE ${p} OR cu.full_name ILIKE ${p})`;
    }
    const ownerClause = isSuperAdmin ? '' : ` AND c.created_by = $2`;

    const result = await pool.query(
      `SELECT ${CONTRACT_SELECT}
       FROM ppm_contracts c
       LEFT JOIN customers cu ON cu.id = c.customer_id
       LEFT JOIN customer_work_addresses wa ON wa.id = c.work_address_id
       WHERE 1=1${ownerClause}${filterSql}${searchClause}
       ORDER BY earliest_next_due NULLS LAST, c.title`,
      params,
    );
    return res.json({
      contracts: result.rows.map((r) => enrichContractRow(r as Record<string, unknown>)),
      filter,
    });
  });

  app.get('/api/ppm-contracts/reporting/summary', authenticate, async (req: AuthReq, res: Response) => {
    if (!req.user || !tenantCrmAccessAllowed(req.user, 'jobs', req.method)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const userId = getTenantScopeUserId(req.user);
    const summary = await getPpmReportingSummary(pool, userId, req.user.role === 'SUPER_ADMIN');
    return res.json({ summary });
  });

  app.post('/api/ppm-contracts/bulk', authenticate, async (req: AuthReq, res: Response) => {
    if (!req.user || !tenantCrmAccessAllowed(req.user, 'jobs', req.method)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const body = req.body as { action?: string; contract_ids?: unknown; extend_months?: number };
    const action = body.action;
    if (!action || !['suspend', 'activate', 'expire', 'renew'].includes(action)) {
      return res.status(400).json({ message: 'action must be suspend, activate, expire, or renew' });
    }
    const contractIds = jsonArr(body.contract_ids);
    if (contractIds.length === 0) {
      return res.status(400).json({ message: 'contract_ids required' });
    }
    const userId = getTenantScopeUserId(req.user);
    const result = await bulkPpmContractAction(
      pool,
      contractIds,
      action as 'suspend' | 'activate' | 'expire' | 'renew',
      userId,
      req.user.role === 'SUPER_ADMIN',
      typeof body.extend_months === 'number' ? body.extend_months : 12,
    );
    return res.json(result);
  });

  app.post('/api/ppm-contracts', authenticate, async (req: AuthReq, res: Response) => {
    if (!req.user || !tenantCrmAccessAllowed(req.user, 'jobs', req.method)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const userId = getTenantScopeUserId(req.user);
    const body = req.body as Record<string, unknown>;
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const customerId = parseId(body.customer_id);
    if (!title || customerId == null) {
      return res.status(400).json({ message: 'title and customer_id are required' });
    }

    const tasks = Array.isArray(body.tasks) ? body.tasks : [];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const insert = await client.query(
        `INSERT INTO ppm_contracts (
          customer_id, work_address_id, title, reference, status, start_date, end_date,
          renewal_type, renewal_notice_days, price_book_id, job_description_id, default_officer_id,
          sla_response_minutes, sla_completion_minutes, auto_create_jobs_days_before,
          asset_ids, communications_json, invoicing_json, rate_overrides_json, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb,$18::jsonb,$19::jsonb,$20)
        RETURNING id`,
        [
          customerId,
          parseId(body.work_address_id),
          title,
          typeof body.reference === 'string' ? body.reference.trim() || null : null,
          typeof body.status === 'string' ? body.status : 'draft',
          parseDateOnly(body.start_date),
          parseDateOnly(body.end_date),
          typeof body.renewal_type === 'string' ? body.renewal_type : 'open_ended',
          typeof body.renewal_notice_days === 'number' ? body.renewal_notice_days : 60,
          parseId(body.price_book_id),
          parseId(body.job_description_id),
          parseId(body.default_officer_id),
          typeof body.sla_response_minutes === 'number' ? body.sla_response_minutes : null,
          typeof body.sla_completion_minutes === 'number' ? body.sla_completion_minutes : null,
          typeof body.auto_create_jobs_days_before === 'number' ? body.auto_create_jobs_days_before : 14,
          JSON.stringify(jsonArr(body.asset_ids)),
          JSON.stringify(jsonCol(body.communications_json)),
          JSON.stringify(jsonCol(body.invoicing_json)),
          JSON.stringify(jsonCol(body.rate_overrides_json)),
          userId,
        ],
      );
      const contractId = insert.rows[0].id as number;
      for (let i = 0; i < tasks.length; i++) {
        const t = tasks[i] as Record<string, unknown>;
        const name = typeof t.name === 'string' ? t.name.trim() : '';
        const nextDue = parseDateOnly(t.next_due_date);
        if (!name || !nextDue) continue;
        await client.query(
          `INSERT INTO ppm_contract_tasks (
            contract_id, name, asset_id, interval_n, interval_unit, next_due_date, sort_order, is_active
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            contractId,
            name,
            parseId(t.asset_id),
            typeof t.interval_n === 'number' ? t.interval_n : 6,
            typeof t.interval_unit === 'string' ? t.interval_unit : 'months',
            nextDue,
            typeof t.sort_order === 'number' ? t.sort_order : i,
            t.is_active !== false,
          ],
        );
      }
      await client.query('COMMIT');
      const contract = await loadContract(pool, contractId, userId, req.user.role === 'SUPER_ADMIN');
      const taskRows = await loadTasks(pool, contractId, contract ?? undefined);
      return res.status(201).json({ contract, tasks: taskRows });
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('Create PPM contract:', e);
      return res.status(500).json({ message: 'Internal server error' });
    } finally {
      client.release();
    }
  });

  app.get('/api/ppm-contracts/:id', authenticate, async (req: AuthReq, res: Response) => {
    if (!req.user || !tenantCrmAccessAllowed(req.user, 'jobs', req.method)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const id = parseId(req.params.id);
    if (id == null) return res.status(400).json({ message: 'Invalid id' });
    const userId = getTenantScopeUserId(req.user);
    const contract = await loadContract(pool, id, userId, req.user.role === 'SUPER_ADMIN');
    if (!contract) return res.status(404).json({ message: 'Contract not found' });
    const tasks = await loadTasks(pool, id, contract);
    const jobs = await pool.query(
      `SELECT j.id, j.job_number, j.title, j.state, j.created_at, j.ppm_contract_task_id
       FROM jobs j WHERE j.ppm_contract_id = $1 ORDER BY j.created_at DESC LIMIT 50`,
      [id],
    );
    const invoices = await pool.query(
      `SELECT i.id, i.invoice_number, i.total_amount, i.currency, i.state, i.job_id, i.invoice_date
       FROM invoices i
       JOIN jobs j ON j.id = i.job_id
       WHERE j.ppm_contract_id = $1
       ORDER BY i.created_at DESC LIMIT 50`,
      [id],
    );
    const historyCount = await pool.query<{ total: string; on_time: string }>(
      `SELECT COUNT(*)::text AS total,
              COUNT(*) FILTER (WHERE h.completed_at::date <= h.previous_due_date)::text AS on_time
       FROM ppm_contract_task_history h
       JOIN ppm_contract_tasks t ON t.id = h.task_id
       WHERE t.contract_id = $1 AND h.previous_due_date IS NOT NULL`,
      [id],
    );
    const histTotal = parseInt(historyCount.rows[0]?.total ?? '0', 10);
    const histOnTime = parseInt(historyCount.rows[0]?.on_time ?? '0', 10);
    const compliance_percent = histTotal > 0 ? Math.round((histOnTime / histTotal) * 100) : null;
    const invoicedTotal = invoices.rows.reduce((sum, row) => sum + parseFloat(String(row.total_amount ?? 0)), 0);
    const history = await getContractTaskHistory(pool, id);

    return res.json({
      contract: { ...contract, compliance_percent, invoiced_total: invoicedTotal },
      tasks,
      jobs: jobs.rows.map((j) => ({
        ...j,
        created_at: j.created_at instanceof Date ? j.created_at.toISOString() : j.created_at,
      })),
      invoices: invoices.rows.map((i) => ({
        id: i.id,
        invoice_number: i.invoice_number,
        total_amount: parseFloat(String(i.total_amount ?? 0)),
        currency: i.currency,
        state: i.state,
        job_id: i.job_id,
        invoice_date: i.invoice_date instanceof Date ? i.invoice_date.toISOString().slice(0, 10) : i.invoice_date,
      })),
      task_history: history,
    });
  });

  app.patch('/api/ppm-contracts/:id', authenticate, async (req: AuthReq, res: Response) => {
    if (!req.user || !tenantCrmAccessAllowed(req.user, 'jobs', req.method)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const id = parseId(req.params.id);
    if (id == null) return res.status(400).json({ message: 'Invalid id' });
    const userId = getTenantScopeUserId(req.user);
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    const existing = await loadContract(pool, id, userId, isSuperAdmin);
    if (!existing) return res.status(404).json({ message: 'Contract not found' });

    const body = req.body as Record<string, unknown>;
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    const set = (col: string, val: unknown) => {
      fields.push(`${col} = $${idx++}`);
      values.push(val);
    };

    if (body.title !== undefined) set('title', String(body.title).trim());
    if (body.reference !== undefined) set('reference', body.reference ? String(body.reference).trim() : null);
    if (body.status !== undefined) set('status', body.status);
    if (body.customer_id !== undefined) set('customer_id', parseId(body.customer_id));
    if (body.work_address_id !== undefined) set('work_address_id', parseId(body.work_address_id));
    if (body.start_date !== undefined) set('start_date', parseDateOnly(body.start_date));
    if (body.end_date !== undefined) set('end_date', parseDateOnly(body.end_date));
    if (body.renewal_type !== undefined) set('renewal_type', body.renewal_type);
    if (body.renewal_notice_days !== undefined) set('renewal_notice_days', body.renewal_notice_days);
    if (body.price_book_id !== undefined) set('price_book_id', parseId(body.price_book_id));
    if (body.job_description_id !== undefined) set('job_description_id', parseId(body.job_description_id));
    if (body.default_officer_id !== undefined) set('default_officer_id', parseId(body.default_officer_id));
    if (body.sla_response_minutes !== undefined) set('sla_response_minutes', body.sla_response_minutes);
    if (body.sla_completion_minutes !== undefined) set('sla_completion_minutes', body.sla_completion_minutes);
    if (body.auto_create_jobs_days_before !== undefined) {
      set('auto_create_jobs_days_before', body.auto_create_jobs_days_before);
    }
    if (body.asset_ids !== undefined) set('asset_ids', JSON.stringify(jsonArr(body.asset_ids)));
    if (body.communications_json !== undefined) {
      set('communications_json', JSON.stringify(jsonCol(body.communications_json)));
    }
    if (body.invoicing_json !== undefined) set('invoicing_json', JSON.stringify(jsonCol(body.invoicing_json)));
    if (body.rate_overrides_json !== undefined) {
      set('rate_overrides_json', JSON.stringify(jsonCol(body.rate_overrides_json)));
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (fields.length > 0) {
        fields.push('updated_at = NOW()');
        values.push(id);
        const owner = isSuperAdmin ? '' : ` AND created_by = $${idx + 1}`;
        if (!isSuperAdmin) values.push(userId);
        await client.query(`UPDATE ppm_contracts SET ${fields.join(', ')} WHERE id = $${idx}${owner}`, values);
      }

      if (Array.isArray(body.tasks)) {
        for (let i = 0; i < body.tasks.length; i++) {
          const t = body.tasks[i] as Record<string, unknown>;
          const taskId = parseId(t.id);
          const name = typeof t.name === 'string' ? t.name.trim() : '';
          const nextDue = parseDateOnly(t.next_due_date);
          if (taskId != null) {
            await client.query(
              `UPDATE ppm_contract_tasks SET
                name = COALESCE($2, name), asset_id = $3, interval_n = $4, interval_unit = $5,
                next_due_date = COALESCE($6, next_due_date), sort_order = $7, is_active = $8, updated_at = NOW()
               WHERE id = $1 AND contract_id = $9`,
              [
                taskId,
                name || null,
                parseId(t.asset_id),
                typeof t.interval_n === 'number' ? t.interval_n : 6,
                typeof t.interval_unit === 'string' ? t.interval_unit : 'months',
                nextDue,
                typeof t.sort_order === 'number' ? t.sort_order : i,
                t.is_active !== false,
                id,
              ],
            );
          } else if (name && nextDue) {
            await client.query(
              `INSERT INTO ppm_contract_tasks (
                contract_id, name, asset_id, interval_n, interval_unit, next_due_date, sort_order, is_active
              ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
              [
                id,
                name,
                parseId(t.asset_id),
                typeof t.interval_n === 'number' ? t.interval_n : 6,
                typeof t.interval_unit === 'string' ? t.interval_unit : 'months',
                nextDue,
                typeof t.sort_order === 'number' ? t.sort_order : i,
                t.is_active !== false,
              ],
            );
          }
        }
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('Update PPM contract:', e);
      return res.status(500).json({ message: 'Internal server error' });
    } finally {
      client.release();
    }

    const contract = await loadContract(pool, id, userId, isSuperAdmin);
    const tasks = await loadTasks(pool, id, contract ?? undefined);
    return res.json({ contract, tasks });
  });

  app.post('/api/ppm-contracts/:id/tasks', authenticate, async (req: AuthReq, res: Response) => {
    if (!req.user || !tenantCrmAccessAllowed(req.user, 'jobs', req.method)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const contractId = parseId(req.params.id);
    if (contractId == null) return res.status(400).json({ message: 'Invalid id' });
    const userId = getTenantScopeUserId(req.user);
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    const contract = await loadContract(pool, contractId, userId, isSuperAdmin);
    if (!contract) return res.status(404).json({ message: 'Contract not found' });

    const body = req.body as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const nextDue = parseDateOnly(body.next_due_date);
    if (!name || !nextDue) return res.status(400).json({ message: 'name and next_due_date required' });

    const result = await pool.query(
      `INSERT INTO ppm_contract_tasks (
        contract_id, name, asset_id, interval_n, interval_unit, next_due_date, sort_order
      ) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        contractId,
        name,
        parseId(body.asset_id),
        typeof body.interval_n === 'number' ? body.interval_n : 6,
        typeof body.interval_unit === 'string' ? body.interval_unit : 'months',
        nextDue,
        typeof body.sort_order === 'number' ? body.sort_order : 0,
      ],
    );
    return res.status(201).json({ task: enrichTaskRow(result.rows[0] as Record<string, unknown>, contract) });
  });

  app.post('/api/ppm-contracts/:id/create-job', authenticate, async (req: AuthReq, res: Response) => {
    if (!req.user || !tenantCrmAccessAllowed(req.user, 'jobs', req.method)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const contractId = parseId(req.params.id);
    if (contractId == null) return res.status(400).json({ message: 'Invalid id' });
    const userId = getTenantScopeUserId(req.user);
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    const contract = await loadContract(pool, contractId, userId, isSuperAdmin);
    if (!contract) return res.status(404).json({ message: 'Contract not found' });

    const body = req.body as Record<string, unknown>;
    const taskId = parseId(body.task_id);
    if (taskId == null) return res.status(400).json({ message: 'task_id required' });

    const taskRow = await pool.query(
      `SELECT * FROM ppm_contract_tasks WHERE id = $1 AND contract_id = $2 AND is_active = true`,
      [taskId, contractId],
    );
    if ((taskRow.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Task not found' });
    const task = taskRow.rows[0] as Record<string, unknown>;
    const invoicing = jsonCol(contract.invoicing_json as unknown);
    const chargeType =
      typeof body.charge_type === 'string'
        ? body.charge_type
        : typeof invoicing.charge_type === 'string'
          ? invoicing.charge_type
          : 'chargeable';

    const officerId = parseId(body.officer_id) ?? (contract.default_officer_id as number | null);
    const title =
      typeof body.title === 'string' && body.title.trim()
        ? body.title.trim()
        : `${String(task.name)} (PPM)`;
    const expectedCompletion = parseDateOnly(body.expected_completion) ?? dateOnlyFromPg(task.next_due_date);

    const jobResult = await pool.query(
      `INSERT INTO jobs (
        title, customer_id, work_address_id, officer_id, job_description_id,
        state, created_by, is_service_job, ppm_contract_id, ppm_contract_task_id,
        expected_completion, charge_type, job_notes
      ) VALUES ($1,$2,$3,$4,$5,'created',$6,true,$7,$8,$9,$10,$11)
      RETURNING *`,
      [
        title,
        contract.customer_id,
        contract.work_address_id,
        officerId,
        contract.job_description_id,
        userId,
        contractId,
        taskId,
        expectedCompletion,
        ['chargeable', 'free', 'callback'].includes(chargeType) ? chargeType : 'chargeable',
        typeof body.job_notes === 'string' ? body.job_notes : `PPM: ${contract.title}`,
      ],
    );
    const job = jobResult.rows[0];
    if (officerId) {
      await pool.query(
        `INSERT INTO job_officers (job_id, officer_id, is_primary) VALUES ($1, $2, true) ON CONFLICT DO NOTHING`,
        [job.id, officerId],
      );
    }
    await finalizePpmJob(
      pool,
      job.id as number,
      {
        job_description_id: contract.job_description_id as number | null,
        price_book_id: contract.price_book_id as number | null,
        rate_overrides_json: jsonCol(contract.rate_overrides_json as unknown) as Record<string, unknown>,
        created_by: userId,
      },
      userId,
    );
    const slaDue = computeSlaDueAt(
      dateOnlyFromPg(task.next_due_date),
      contract.sla_completion_minutes as number | null,
    );
    return res.status(201).json({
      job: {
        ...job,
        sla_due_at: slaDue,
        created_at: job.created_at instanceof Date ? job.created_at.toISOString() : job.created_at,
      },
    });
  });

  app.get('/api/ppm-contracts/:id/missed-tasks', authenticate, async (req: AuthReq, res: Response) => {
    if (!req.user || !tenantCrmAccessAllowed(req.user, 'jobs', req.method)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const id = parseId(req.params.id);
    if (id == null) return res.status(400).json({ message: 'Invalid id' });
    const userId = getTenantScopeUserId(req.user);
    const tasks = await findMissedTasks(pool, id, userId, req.user!.role === 'SUPER_ADMIN');
    return res.json({ tasks });
  });

  app.get('/api/customers/:id/ppm-contracts', authenticate, async (req: AuthReq, res: Response) => {
    if (!req.user || !tenantCrmAccessAllowed(req.user, 'customers', req.method)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const customerId = parseId(req.params.id);
    if (customerId == null) return res.status(400).json({ message: 'Invalid customer id' });
    const userId = getTenantScopeUserId(req.user);
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    const params: unknown[] = [customerId];
    let owner = '';
    if (!isSuperAdmin) {
      params.push(userId);
      owner = ' AND c.created_by = $2';
    }
    const result = await pool.query(
      `SELECT ${CONTRACT_SELECT}
       FROM ppm_contracts c
       LEFT JOIN customers cu ON cu.id = c.customer_id
       LEFT JOIN customer_work_addresses wa ON wa.id = c.work_address_id
       WHERE c.customer_id = $1${owner}
       ORDER BY c.status, earliest_next_due NULLS LAST`,
      params,
    );
    return res.json({
      contracts: result.rows.map((r) => enrichContractRow(r as Record<string, unknown>)),
    });
  });

  app.post('/api/internal/ppm-auto-jobs', async (req: Request, res: Response) => {
    const secret = process.env.INTERNAL_CRON_SECRET || process.env.CRON_SECRET;
    const hdr = req.headers['x-cron-secret'] || req.body?.secret;
    if (!secret || hdr !== secret) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const result = await runPpmAutoCreateJobs(pool);
    return res.json(result);
  });
}

export { advancePpmTaskFromJob, handlePpmJobCompletion, runPpmAutoCreateJobs };
