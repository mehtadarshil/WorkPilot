import type { Pool, PoolClient } from 'pg';
import { applyTemplateVars } from '../emailHelpers';
import { getCompanyLabourRates } from '../priceBookResolution';
import { addIntervalToDate, daysBetween, isoDateOnly, parseDateOnly, projectTaskOccurrences, dateOnlyFromPg } from './dateUtils';
import type { PpmIntervalUnit } from './types';

type DbExecutor = Pool | PoolClient;

export type CreatePpmInvoiceFn = (
  jobId: number,
  userId: number,
  opts?: { description?: string | null },
) => Promise<number | null>;

export type PpmContractJobSetup = {
  job_description_id?: number | null;
  rate_overrides_json?: Record<string, unknown> | null;
  price_book_id?: number | null;
  created_by?: number | null;
};

export type PpmListFilter = 'active' | 'due_soon' | 'overdue' | 'expired' | 'all';

function rollNextDueFromCompletion(
  completedAt: Date,
  intervalN: number,
  intervalUnit: PpmIntervalUnit,
  previousDue: string | null,
): string {
  let next = addIntervalToDate(completedAt, intervalN, intervalUnit);
  const today = new Date();
  today.setUTCHours(12, 0, 0, 0);
  // Roll forward until next due is in the future (or equal to today)
  for (let i = 0; i < 120; i++) {
    if (next >= today) break;
    next = addIntervalToDate(next, intervalN, intervalUnit);
  }
  // If previous due was ahead of rolled date, use interval from previous due anchor
  if (previousDue) {
    let anchor = new Date(`${previousDue}T12:00:00.000Z`);
    anchor = addIntervalToDate(anchor, intervalN, intervalUnit);
    while (anchor < today) {
      anchor = addIntervalToDate(anchor, intervalN, intervalUnit);
    }
    if (anchor > next) return isoDateOnly(anchor);
  }
  return isoDateOnly(next);
}

export async function advancePpmTaskFromJob(pool: DbExecutor, jobId: number): Promise<boolean> {
  const jobRow = await pool.query<{
    id: number;
    state: string;
    ppm_contract_task_id: number | null;
  }>(`SELECT id, state, ppm_contract_task_id FROM jobs WHERE id = $1`, [jobId]);
  if ((jobRow.rowCount ?? 0) === 0) return false;
  const job = jobRow.rows[0];
  if (job.ppm_contract_task_id == null) return false;
  if (job.state !== 'completed' && job.state !== 'closed') return false;

  const taskRow = await pool.query<{
    id: number;
    contract_id: number;
    interval_n: number;
    interval_unit: string;
    next_due_date: string;
    last_job_id: number | null;
  }>(
    `SELECT id, contract_id, interval_n, interval_unit, next_due_date::text, last_job_id
     FROM ppm_contract_tasks WHERE id = $1 AND is_active = true`,
    [job.ppm_contract_task_id],
  );
  if ((taskRow.rowCount ?? 0) === 0) return false;
  const task = taskRow.rows[0];
  if (task.last_job_id === jobId) return false;

  const completedAt = new Date();
  const prevDue = parseDateOnly(task.next_due_date);
  const nextDue = rollNextDueFromCompletion(
    completedAt,
    task.interval_n,
    (task.interval_unit as PpmIntervalUnit) || 'months',
    prevDue,
  );

  await pool.query(
    `UPDATE ppm_contract_tasks
     SET last_completed_at = $1, next_due_date = $2, last_job_id = $3, updated_at = NOW()
     WHERE id = $4`,
    [completedAt, nextDue, jobId, task.id],
  );
  await pool.query(
    `INSERT INTO ppm_contract_task_history (task_id, job_id, completed_at, previous_due_date, next_due_date)
     VALUES ($1, $2, $3, $4, $5)`,
    [task.id, jobId, completedAt, prevDue, nextDue],
  );
  await pool.query(
    `UPDATE ppm_contracts SET last_activity_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [task.contract_id],
  );
  return true;
}

function parseRate(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const value = typeof raw === 'number' ? raw : parseFloat(String(raw));
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100) / 100;
}

/** Apply contract price book + rate_overrides_json to job_cost_rate_overrides. */
export async function applyPpmContractRatesToJob(
  pool: DbExecutor,
  jobId: number,
  contract: PpmContractJobSetup,
  updatedBy: number | null,
): Promise<void> {
  const overrides = (contract.rate_overrides_json || {}) as Record<string, unknown>;
  let companyTravel: number | null = null;
  let companyFirst: number | null = null;
  let companyAdditional: number | null = null;
  const tenantUserId = contract.created_by;
  if (tenantUserId != null && Number.isFinite(tenantUserId)) {
    const company = await getCompanyLabourRates(pool as Pool, tenantUserId);
    companyTravel = company.travel_rate_per_hr;
    companyFirst = company.first_hour_rate_per_hr;
    companyAdditional = company.additional_hour_rate_per_hr;
  }
  const travel = parseRate(overrides.travel_hourly_rate) ?? companyTravel;
  const firstHour = parseRate(overrides.first_hour_labour_rate) ?? companyFirst;
  const additionalHour = parseRate(overrides.additional_hour_labour_rate) ?? companyAdditional;
  if (travel == null && firstHour == null && additionalHour == null) return;

  await pool.query(
    `INSERT INTO job_cost_rate_overrides (
       job_id, travel_hourly_rate, on_site_hourly_rate, first_hour_labour_rate, additional_hour_labour_rate, updated_by, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (job_id) DO UPDATE SET
       travel_hourly_rate = EXCLUDED.travel_hourly_rate,
       on_site_hourly_rate = EXCLUDED.on_site_hourly_rate,
       first_hour_labour_rate = EXCLUDED.first_hour_labour_rate,
       additional_hour_labour_rate = EXCLUDED.additional_hour_labour_rate,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()`,
    [jobId, travel, firstHour, firstHour, additionalHour, updatedBy],
  );
}

async function seedJobDescriptionReportQuestions(
  pool: DbExecutor,
  jobId: number,
  jobDescriptionId: number,
): Promise<void> {
  const id = Math.trunc(jobDescriptionId);
  if (!Number.isFinite(id) || id < 1) return;

  const globalRes = await pool.query<{
    sort_order: number;
    question_type: string;
    prompt: string;
    helper_text: string | null;
    required: boolean;
  }>(
    `SELECT sort_order, question_type, prompt, helper_text, required
     FROM job_report_default_questions ORDER BY sort_order ASC, id ASC`,
  );
  const descRes = await pool.query<{
    sort_order: number;
    question_type: string;
    prompt: string;
    helper_text: string | null;
    required: boolean;
  }>(
    `SELECT sort_order, question_type, prompt, helper_text, required
     FROM job_report_job_description_questions
     WHERE job_description_id = $1 ORDER BY sort_order ASC, id ASC`,
    [id],
  );
  if (globalRes.rows.length === 0 && descRes.rows.length === 0) return;

  let order = 0;
  for (const row of globalRes.rows) {
    await pool.query(
      `INSERT INTO job_report_questions (job_id, sort_order, question_type, prompt, helper_text, required)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [jobId, order++, row.question_type, row.prompt, row.helper_text, row.required],
    );
  }
  for (const row of descRes.rows) {
    await pool.query(
      `INSERT INTO job_report_questions (job_id, sort_order, question_type, prompt, helper_text, required)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [jobId, order++, row.question_type, row.prompt, row.helper_text, row.required],
    );
  }
}

/** Seed report questions and labour rates after a PPM job is created. */
export async function finalizePpmJob(
  pool: DbExecutor,
  jobId: number,
  contract: PpmContractJobSetup,
  actingUserId: number | null,
): Promise<void> {
  try {
    await applyPpmContractRatesToJob(pool, jobId, contract, actingUserId);
  } catch (e) {
    console.error('PPM apply contract rates:', e);
  }
  const jd = contract.job_description_id;
  if (jd != null && Number.isFinite(jd) && jd > 0) {
    try {
      await seedJobDescriptionReportQuestions(pool, jobId, jd);
    } catch (e) {
      console.error('PPM seed job report questions:', e);
    }
  }
}

export async function buildPpmInvoiceDescription(
  pool: Pool,
  jobId: number,
  contractId: number,
): Promise<string | null> {
  const row = await pool.query<{
    template: string | null;
    contract_title: string;
    contract_reference: string | null;
    task_name: string | null;
    job_number: string | null;
    job_title: string;
    task_next_due: string | null;
    customer_name: string | null;
  }>(
    `SELECT c.invoicing_json->>'invoice_description_template' AS template,
            c.title AS contract_title,
            c.reference AS contract_reference,
            pt.name AS task_name,
            j.job_number,
            j.title AS job_title,
            pt.next_due_date::text AS task_next_due,
            cu.full_name AS customer_name
     FROM ppm_contracts c
     JOIN jobs j ON j.id = $1 AND j.ppm_contract_id = c.id
     LEFT JOIN ppm_contract_tasks pt ON pt.id = j.ppm_contract_task_id
     LEFT JOIN customers cu ON cu.id = j.customer_id
     WHERE c.id = $2`,
    [jobId, contractId],
  );
  if ((row.rowCount ?? 0) === 0) return null;
  const data = row.rows[0];
  const template =
    typeof data.template === 'string' && data.template.trim()
      ? data.template.trim()
      : 'PPM visit — {{task_name}}';
  return applyTemplateVars(template, {
    task_name: data.task_name || '',
    contract_title: data.contract_title || '',
    contract_reference: data.contract_reference || '',
    job_number: data.job_number || String(jobId),
    job_title: data.job_title || '',
    due_date: data.task_next_due?.slice(0, 10) || '',
    customer_name: data.customer_name || '',
  }).trim() || null;
}

/** Create draft invoice when contract invoicing_json.auto_invoice_on_complete is enabled. */
export async function maybeAutoInvoicePpmJob(
  pool: Pool,
  jobId: number,
  actingUserId: number,
  createInvoice: CreatePpmInvoiceFn,
): Promise<number | null> {
  const jobRow = await pool.query<{
    ppm_contract_id: number | null;
    state: string;
  }>(`SELECT ppm_contract_id, state FROM jobs WHERE id = $1`, [jobId]);
  if ((jobRow.rowCount ?? 0) === 0) return null;
  const job = jobRow.rows[0];
  if (job.ppm_contract_id == null) return null;
  if (job.state !== 'completed' && job.state !== 'closed') return null;

  const existing = await pool.query(`SELECT id FROM invoices WHERE job_id = $1 LIMIT 1`, [jobId]);
  if ((existing.rowCount ?? 0) > 0) return null;

  const contractRow = await pool.query<{ invoicing_json: Record<string, unknown> | null }>(
    `SELECT invoicing_json FROM ppm_contracts WHERE id = $1`,
    [job.ppm_contract_id],
  );
  if ((contractRow.rowCount ?? 0) === 0) return null;
  const invoicing = contractRow.rows[0].invoicing_json;
  if (!invoicing || invoicing.auto_invoice_on_complete !== true) return null;

  const description = await buildPpmInvoiceDescription(pool, jobId, job.ppm_contract_id);
  return createInvoice(jobId, actingUserId, { description });
}

export async function handlePpmJobCompletion(
  pool: Pool,
  jobId: number,
  actingUserId: number,
  createInvoice?: CreatePpmInvoiceFn,
): Promise<void> {
  try {
    await advancePpmTaskFromJob(pool, jobId);
  } catch (e) {
    console.error('Advance PPM task from job:', e);
  }
  if (createInvoice) {
    try {
      await maybeAutoInvoicePpmJob(pool, jobId, actingUserId, createInvoice);
    } catch (e) {
      console.error('PPM auto-invoice from job:', e);
    }
  }
}

export type PpmReportingSummary = {
  active_contracts: number;
  overdue_tasks: number;
  due_soon_tasks: number;
  compliance_percent: number | null;
  total_invoiced: number;
  currency: string;
};

export async function getPpmReportingSummary(
  pool: Pool,
  tenantUserId: number,
  isSuperAdmin: boolean,
): Promise<PpmReportingSummary> {
  const today = new Date().toISOString().slice(0, 10);
  const params: unknown[] = [today];
  let owner = '';
  if (!isSuperAdmin) {
    params.push(tenantUserId);
    owner = ' AND c.created_by = $2';
  }

  const counts = await pool.query<{
    active_contracts: string;
    overdue_tasks: string;
    due_soon_tasks: string;
  }>(
    `SELECT
      (SELECT COUNT(*)::text FROM ppm_contracts c WHERE c.status = 'active'${owner}) AS active_contracts,
      (SELECT COUNT(*)::text FROM ppm_contract_tasks t
        JOIN ppm_contracts c ON c.id = t.contract_id
        WHERE t.is_active = true AND t.next_due_date < $1::date AND c.status = 'active'${owner}) AS overdue_tasks,
      (SELECT COUNT(*)::text FROM ppm_contract_tasks t
        JOIN ppm_contracts c ON c.id = t.contract_id
        WHERE t.is_active = true AND t.next_due_date >= $1::date
          AND t.next_due_date <= ($1::date + INTERVAL '30 days') AND c.status = 'active'${owner}) AS due_soon_tasks`,
    params,
  );

  const complianceParams: unknown[] = [];
  let complianceOwner = '';
  if (!isSuperAdmin) {
    complianceParams.push(tenantUserId);
    complianceOwner = ' AND c.created_by = $1';
  }
  const compliance = await pool.query<{ total: string; on_time: string }>(
    `SELECT COUNT(*)::text AS total,
      COUNT(*) FILTER (WHERE h.completed_at::date <= h.previous_due_date)::text AS on_time
     FROM ppm_contract_task_history h
     JOIN ppm_contract_tasks t ON t.id = h.task_id
     JOIN ppm_contracts c ON c.id = t.contract_id
     WHERE h.previous_due_date IS NOT NULL${complianceOwner}`,
    complianceParams,
  );
  const totalHist = parseInt(compliance.rows[0]?.total ?? '0', 10);
  const onTime = parseInt(compliance.rows[0]?.on_time ?? '0', 10);
  const compliancePercent = totalHist > 0 ? Math.round((onTime / totalHist) * 100) : null;

  const revParams: unknown[] = [];
  let revOwner = '';
  if (!isSuperAdmin) {
    revParams.push(tenantUserId);
    revOwner = ' AND c.created_by = $1';
  }
  const revenue = await pool.query<{ total: string; currency: string | null }>(
    `SELECT COALESCE(SUM(i.total_amount), 0)::text AS total,
            MAX(i.currency) AS currency
     FROM invoices i
     JOIN jobs j ON j.id = i.job_id
     JOIN ppm_contracts c ON c.id = j.ppm_contract_id
     WHERE j.ppm_contract_id IS NOT NULL${revOwner}`,
    revParams,
  );

  return {
    active_contracts: parseInt(counts.rows[0]?.active_contracts ?? '0', 10),
    overdue_tasks: parseInt(counts.rows[0]?.overdue_tasks ?? '0', 10),
    due_soon_tasks: parseInt(counts.rows[0]?.due_soon_tasks ?? '0', 10),
    compliance_percent: compliancePercent,
    total_invoiced: parseFloat(revenue.rows[0]?.total ?? '0') || 0,
    currency: revenue.rows[0]?.currency || 'GBP',
  };
}

export type PpmBulkAction = 'suspend' | 'activate' | 'expire' | 'renew';

export async function bulkPpmContractAction(
  pool: Pool,
  contractIds: number[],
  action: PpmBulkAction,
  tenantUserId: number,
  isSuperAdmin: boolean,
  extendMonths = 12,
): Promise<{ updated: number }> {
  if (contractIds.length === 0) return { updated: 0 };

  const ids = contractIds.filter((id) => Number.isFinite(id) && id > 0);
  if (ids.length === 0) return { updated: 0 };

  const params: unknown[] = [ids];
  let owner = '';
  if (!isSuperAdmin) {
    params.push(tenantUserId);
    owner = ` AND created_by = $${params.length}`;
  }

  if (action === 'renew') {
    const months = Math.max(1, Math.min(120, Math.round(extendMonths)));
    params.push(months);
    const result = await pool.query(
      `UPDATE ppm_contracts SET
        status = 'active',
        renewal_type = 'fixed',
        end_date = (
          CASE
            WHEN end_date IS NULL OR end_date < CURRENT_DATE THEN CURRENT_DATE
            ELSE end_date
          END + ($${params.length}::text || ' months')::interval
        )::date,
        updated_at = NOW()
       WHERE id = ANY($1::int[])${owner}`,
      params,
    );
    return { updated: result.rowCount ?? 0 };
  }

  const status = action === 'suspend' ? 'suspended' : action === 'expire' ? 'expired' : 'active';
  params.push(status);
  const result = await pool.query(
    `UPDATE ppm_contracts SET status = $${params.length}, updated_at = NOW()
     WHERE id = ANY($1::int[])${owner}`,
    params,
  );
  return { updated: result.rowCount ?? 0 };
}

export async function getContractTaskHistory(pool: Pool, contractId: number) {
  const result = await pool.query<{
    id: number;
    task_id: number;
    task_name: string;
    job_id: number | null;
    job_number: string | null;
    completed_at: Date;
    previous_due_date: string | null;
    next_due_date: string | null;
  }>(
    `SELECT h.id, h.task_id, t.name AS task_name, h.job_id, j.job_number,
            h.completed_at, h.previous_due_date::text, h.next_due_date::text
     FROM ppm_contract_task_history h
     JOIN ppm_contract_tasks t ON t.id = h.task_id
     LEFT JOIN jobs j ON j.id = h.job_id
     WHERE t.contract_id = $1
     ORDER BY h.completed_at DESC
     LIMIT 100`,
    [contractId],
  );
  return result.rows.map((r) => ({
    id: r.id,
    task_id: r.task_id,
    task_name: r.task_name,
    job_id: r.job_id,
    job_number: r.job_number,
    completed_at: r.completed_at instanceof Date ? r.completed_at.toISOString() : r.completed_at,
    previous_due_date: dateOnlyFromPg(r.previous_due_date),
    next_due_date: dateOnlyFromPg(r.next_due_date),
  }));
}

export function computeSlaDueAt(
  nextDueDate: string | null,
  slaCompletionMinutes: number | null,
): string | null {
  if (!nextDueDate || slaCompletionMinutes == null || slaCompletionMinutes <= 0) return null;
  const d = new Date(`${nextDueDate}T23:59:59.000Z`);
  d.setUTCMinutes(d.getUTCMinutes() + slaCompletionMinutes);
  return d.toISOString();
}

export function enrichContractRow(row: Record<string, unknown>) {
  const today = new Date();
  today.setUTCHours(12, 0, 0, 0);
  const endDateStr = dateOnlyFromPg(row.end_date);
  const endDate = endDateStr ? new Date(`${endDateStr}T12:00:00.000Z`) : null;
  let daysUntilExpiry: number | null = null;
  if (endDate && !Number.isNaN(endDate.getTime())) daysUntilExpiry = daysBetween(today, endDate);

  const nextDue = dateOnlyFromPg(row.earliest_next_due);
  let daysUntilDue: number | null = null;
  if (nextDue) {
    const due = new Date(`${nextDue}T12:00:00.000Z`);
    if (!Number.isNaN(due.getTime())) daysUntilDue = daysBetween(today, due);
  }

  return {
    ...row,
    end_date: dateOnlyFromPg(row.end_date),
    start_date: dateOnlyFromPg(row.start_date),
    earliest_next_due: nextDue,
    days_until_expiry: daysUntilExpiry,
    days_until_due: daysUntilDue,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    last_activity_at:
      row.last_activity_at instanceof Date ? row.last_activity_at.toISOString() : row.last_activity_at,
  };
}

export function enrichTaskRow(row: Record<string, unknown>, contract?: Record<string, unknown>) {
  const nextDue = dateOnlyFromPg(row.next_due_date);
  const today = new Date();
  today.setUTCHours(12, 0, 0, 0);
  let daysUntilDue: number | null = null;
  let overdue = false;
  if (nextDue) {
    const due = new Date(`${nextDue}T12:00:00.000Z`);
    if (!Number.isNaN(due.getTime())) {
      daysUntilDue = daysBetween(today, due);
      overdue = due < today;
    }
  }
  const slaMinutes =
    contract && contract.sla_completion_minutes != null
      ? Number(contract.sla_completion_minutes)
      : null;
  const calendar = nextDue
    ? projectTaskOccurrences(
        nextDue,
        Number(row.interval_n) || 6,
        (String(row.interval_unit || 'months') as PpmIntervalUnit),
        12,
      )
    : [];
  return {
    ...row,
    next_due_date: nextDue,
    last_completed_at:
      row.last_completed_at instanceof Date ? row.last_completed_at.toISOString() : row.last_completed_at,
    days_until_due: daysUntilDue,
    is_overdue: overdue,
    sla_due_at: computeSlaDueAt(nextDue, slaMinutes),
    calendar_occurrences: calendar,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

export async function runPpmAutoCreateJobs(pool: Pool, tenantUserId?: number): Promise<{
  created: number;
  skipped: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let created = 0;
  let skipped = 0;
  const today = new Date();
  today.setUTCHours(12, 0, 0, 0);

  const params: unknown[] = [];
  let tenantClause = '';
  if (tenantUserId != null) {
    params.push(tenantUserId);
    tenantClause = ' AND c.created_by = $1';
  }

  const rows = await pool.query<{
    task_id: number;
    contract_id: number;
    task_name: string;
    next_due_date: string;
    auto_create_jobs_days_before: number;
    customer_id: number;
    work_address_id: number | null;
    job_description_id: number | null;
    default_officer_id: number | null;
    created_by: number | null;
    charge_type: string | null;
    price_book_id: number | null;
    rate_overrides_json: Record<string, unknown> | null;
  }>(
    `SELECT t.id AS task_id, c.id AS contract_id, t.name AS task_name,
            t.next_due_date::text, c.auto_create_jobs_days_before,
            c.customer_id, c.work_address_id, c.job_description_id, c.default_officer_id,
            c.created_by, c.price_book_id, c.rate_overrides_json,
            COALESCE(c.invoicing_json->>'charge_type', 'chargeable') AS charge_type
     FROM ppm_contract_tasks t
     JOIN ppm_contracts c ON c.id = t.contract_id
     WHERE c.status = 'active' AND t.is_active = true${tenantClause}`,
    params,
  );

  for (const row of rows.rows) {
    const due = new Date(`${row.next_due_date.slice(0, 10)}T12:00:00.000Z`);
    const daysBefore = Math.max(0, row.auto_create_jobs_days_before ?? 14);
    const trigger = new Date(due);
    trigger.setUTCDate(trigger.getUTCDate() - daysBefore);
    if (today < trigger) {
      skipped++;
      continue;
    }
    const dueKey = row.next_due_date.slice(0, 10);
    const existing = await pool.query(
      `SELECT 1 FROM ppm_contract_auto_jobs WHERE task_id = $1 AND due_date = $2`,
      [row.task_id, dueKey],
    );
    if ((existing.rowCount ?? 0) > 0) {
      skipped++;
      continue;
    }
    const openJob = await pool.query(
      `SELECT id FROM jobs
       WHERE ppm_contract_task_id = $1 AND state NOT IN ('completed', 'closed') LIMIT 1`,
      [row.task_id],
    );
    if ((openJob.rowCount ?? 0) > 0) {
      skipped++;
      continue;
    }

    try {
      const title = `${row.task_name} (PPM)`;
      const jobResult = await pool.query<{ id: number; job_number: string }>(
        `INSERT INTO jobs (
          title, customer_id, work_address_id, officer_id, job_description_id,
          state, created_by, is_service_job, ppm_contract_id, ppm_contract_task_id,
          expected_completion, charge_type, job_notes
        ) VALUES ($1, $2, $3, $4, $5, 'created', $6, true, $7, $8, $9, $10, $11)
        RETURNING id, job_number`,
        [
          title,
          row.customer_id,
          row.work_address_id,
          row.default_officer_id,
          row.job_description_id,
          row.created_by,
          row.contract_id,
          row.task_id,
          due,
          ['chargeable', 'free', 'callback'].includes(row.charge_type || '')
            ? row.charge_type
            : 'chargeable',
          `Auto-created PPM job for due date ${dueKey}`,
        ],
      );
      const job = jobResult.rows[0];
      if (row.default_officer_id) {
        await pool.query(
          `INSERT INTO job_officers (job_id, officer_id, is_primary) VALUES ($1, $2, true)
           ON CONFLICT DO NOTHING`,
          [job.id, row.default_officer_id],
        );
      }
      await finalizePpmJob(
        pool,
        job.id,
        {
          job_description_id: row.job_description_id,
          price_book_id: row.price_book_id,
          rate_overrides_json: row.rate_overrides_json,
          created_by: row.created_by,
        },
        row.created_by,
      );
      await pool.query(
        `INSERT INTO ppm_contract_auto_jobs (task_id, due_date, job_id) VALUES ($1, $2, $3)`,
        [row.task_id, dueKey, job.id],
      );
      created++;
    } catch (e) {
      errors.push(`task ${row.task_id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { created, skipped, errors };
}

export async function findMissedTasks(pool: Pool, contractId: number, tenantUserId: number, isSuperAdmin: boolean) {
  const today = isoDateOnly(new Date());
  const params: unknown[] = [contractId, today];
  let ownerClause = '';
  if (!isSuperAdmin) {
    params.push(tenantUserId);
    ownerClause = ' AND c.created_by = $3';
  }
  const result = await pool.query(
    `SELECT t.* FROM ppm_contract_tasks t
     JOIN ppm_contracts c ON c.id = t.contract_id
     WHERE t.contract_id = $1 AND t.is_active = true AND t.next_due_date < $2::date${ownerClause}
     ORDER BY t.next_due_date`,
    params,
  );
  return result.rows.map((r) => enrichTaskRow(r as Record<string, unknown>));
}
