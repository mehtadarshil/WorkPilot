import type { Application, Request, Response } from 'express';
import type { Pool } from 'pg';
import crypto from 'crypto';
import path from 'path';
import { getTenantScopeUserId, tenantCrmAccessAllowed } from './tenantAccess';
import type { TenantAuthUser } from './tenantAccess';
import { getWorkpilotFileRootDir, loadWorkpilotFile, sendWorkpilotFile, writeWorkpilotFile } from './workpilotFileStorage';

type AuthReq = Request & { user?: TenantAuthUser };

type JobCostsRouteDeps = {
  pool: Pool;
  authenticate: (req: Request, res: Response, next: () => void) => void;
};

type CostLine = {
  id: string;
  source: 'manual' | 'timesheet' | 'job_pricing' | 'quotation' | 'part' | 'expense';
  editable?: boolean;
  label: string;
  description: string | null;
  quantity: number | null;
  unit_amount: number | null;
  amount: number;
  currency: string;
  created_at: string | null;
  created_by_name: string | null;
  proof_files?: ProofFile[];
};

type RateConfig = {
  default_hourly_rate: number;
  default_rate_name: string | null;
  travel_hourly_rate: number;
  on_site_hourly_rate: number;
  first_hour_labour_rate: number;
  additional_hour_labour_rate: number;
  travel_override: number | null;
  on_site_override: number | null;
  first_hour_override: number | null;
  additional_hour_override: number | null;
  updated_at: string | null;
  updated_by_name: string | null;
};

type ProofFile = {
  stored_filename: string;
  original_filename: string;
  content_type: string;
  byte_size: number;
  href: string;
};

function getJobCostProofRoot(): string {
  return getWorkpilotFileRootDir('job-cost-proofs');
}

function parseId(raw: unknown): number | null {
  const n = parseInt(String(Array.isArray(raw) ? raw[0] : raw), 10);
  return Number.isFinite(n) ? n : null;
}

function n(v: unknown): number {
  const out = typeof v === 'number' ? v : parseFloat(String(v ?? '0'));
  return Number.isFinite(out) ? out : 0;
}

function iso(v: unknown): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function cleanFilename(name: string): string {
  return (name || 'proof.bin').replace(/[/\\?%*:|"<>]/g, '_').slice(0, 180) || 'proof.bin';
}

function decodeProofFiles(raw: unknown): { buf: Buffer; original: string; contentType: string }[] {
  if (!Array.isArray(raw)) return [];
  const out: { buf: Buffer; original: string; contentType: string }[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const m = item as Record<string, unknown>;
    const original = cleanFilename(typeof m.filename === 'string' ? m.filename : 'proof.bin');
    const contentType = typeof m.content_type === 'string' && m.content_type.trim() ? m.content_type.trim() : 'application/octet-stream';
    const b64 = typeof m.content_base64 === 'string' ? m.content_base64 : '';
    if (!b64.trim()) continue;
    const buf = Buffer.from(b64, 'base64');
    if (buf.length > 0) out.push({ buf, original, contentType });
  }
  return out;
}

async function ensureSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_cost_entries (
      id SERIAL PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      diary_event_id INTEGER REFERENCES diary_events(id) ON DELETE SET NULL,
      cost_type VARCHAR(80) NOT NULL DEFAULT 'site_cost',
      description TEXT NOT NULL,
      amount DECIMAL(14,2) NOT NULL DEFAULT 0,
      currency VARCHAR(10) NOT NULL DEFAULT 'GBP',
      notes TEXT,
      proof_files JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_job_cost_entries_job_id ON job_cost_entries(job_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_job_cost_entries_diary_event_id ON job_cost_entries(diary_event_id) WHERE diary_event_id IS NOT NULL');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_cost_rate_overrides (
      job_id INTEGER PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
      travel_hourly_rate DECIMAL(14,2),
      on_site_hourly_rate DECIMAL(14,2),
      first_hour_labour_rate DECIMAL(14,2),
      additional_hour_labour_rate DECIMAL(14,2),
      notes TEXT,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE job_cost_rate_overrides ADD COLUMN IF NOT EXISTS first_hour_labour_rate DECIMAL(14,2)`);
  await pool.query(`ALTER TABLE job_cost_rate_overrides ADD COLUMN IF NOT EXISTS additional_hour_labour_rate DECIMAL(14,2)`);
}

async function canAccessJob(pool: Pool, jobId: number, user: TenantAuthUser, write = false): Promise<boolean> {
  if (user.role === 'SUPER_ADMIN') {
    const r = await pool.query('SELECT id FROM jobs WHERE id = $1', [jobId]);
    return (r.rowCount ?? 0) > 0;
  }
  if (user.role === 'OFFICER') {
    if (user.officerId == null) return false;
    const r = await pool.query(
      `SELECT j.id
       FROM jobs j
       LEFT JOIN diary_events d ON d.job_id = j.id AND d.officer_id = $2
       WHERE j.id = $1 AND (j.officer_id = $2 OR d.id IS NOT NULL)
       LIMIT 1`,
      [jobId, user.officerId],
    );
    return (r.rowCount ?? 0) > 0;
  }
  const r = await pool.query('SELECT id FROM jobs WHERE id = $1 AND created_by = $2', [
    jobId,
    getTenantScopeUserId(user),
  ]);
  return (r.rowCount ?? 0) > 0;
}

async function getJobRateConfig(pool: Pool, jobId: number): Promise<RateConfig> {
  const rateResult = await pool.query(
    `SELECT COALESCE(lr.basic_rate_per_hr, 0)::numeric AS default_hourly_rate,
            lr.name AS default_rate_name,
            o.travel_hourly_rate,
            o.on_site_hourly_rate,
            o.first_hour_labour_rate,
            o.additional_hour_labour_rate,
            o.updated_at,
            COALESCE(u.full_name, u.email) AS updated_by_name
     FROM jobs j
     LEFT JOIN customers c ON c.id = j.customer_id
     LEFT JOIN LATERAL (
       SELECT name, basic_rate_per_hr
       FROM price_book_labour_rates
       WHERE price_book_id = c.price_book_id
       ORDER BY id ASC
       LIMIT 1
     ) lr ON true
     LEFT JOIN job_cost_rate_overrides o ON o.job_id = j.id
     LEFT JOIN users u ON u.id = o.updated_by
     WHERE j.id = $1`,
    [jobId],
  );
  const row = rateResult.rows[0] ?? {};
  const defaultRate = n(row.default_hourly_rate);
  const travelOverride = row.travel_hourly_rate == null ? null : n(row.travel_hourly_rate);
  const onSiteOverride = row.on_site_hourly_rate == null ? null : n(row.on_site_hourly_rate);
  const firstHourOverride = row.first_hour_labour_rate == null ? null : n(row.first_hour_labour_rate);
  const additionalHourOverride = row.additional_hour_labour_rate == null ? null : n(row.additional_hour_labour_rate);
  return {
    default_hourly_rate: defaultRate,
    default_rate_name: row.default_rate_name ? String(row.default_rate_name) : null,
    travel_hourly_rate: travelOverride ?? defaultRate,
    on_site_hourly_rate: onSiteOverride ?? defaultRate,
    first_hour_labour_rate: firstHourOverride ?? onSiteOverride ?? defaultRate,
    additional_hour_labour_rate: additionalHourOverride ?? onSiteOverride ?? defaultRate,
    travel_override: travelOverride,
    on_site_override: onSiteOverride,
    first_hour_override: firstHourOverride,
    additional_hour_override: additionalHourOverride,
    updated_at: iso(row.updated_at),
    updated_by_name: row.updated_by_name ? String(row.updated_by_name) : null,
  };
}

export async function buildJobCostPayload(pool: Pool, jobId: number) {
  const rateConfig = await getJobRateConfig(pool, jobId);
  const manual = await pool.query(
    `SELECT e.id, e.cost_type, e.description, e.amount, e.currency, e.notes, e.proof_files, e.created_at,
            COALESCE(u.full_name, u.email) AS created_by_name
     FROM job_cost_entries e
     LEFT JOIN users u ON u.id = e.created_by
     WHERE e.job_id = $1
     ORDER BY e.created_at DESC, e.id DESC`,
    [jobId],
  );

  const timesheet = await pool.query(
    `SELECT te.id, te.clock_in, te.clock_out, te.segment_type,
            EXTRACT(EPOCH FROM (COALESCE(te.clock_out, NOW()) - te.clock_in))::numeric AS duration_seconds,
            o.full_name AS officer_full_name
     FROM timesheet_entries te
     INNER JOIN diary_events d ON d.id = te.diary_event_id
     LEFT JOIN officers o ON o.id = te.officer_id
     WHERE d.job_id = $1
     ORDER BY te.clock_in ASC`,
    [jobId],
  );

  const jobPricing = await pool.query(
    `SELECT id, item_name, time_included, unit_price, quantity, total, sort_order
     FROM job_pricing_items
     WHERE job_id = $1
     ORDER BY sort_order ASC, id ASC`,
    [jobId],
  );

  const quotations = await pool.query(
    `SELECT q.id, q.quotation_number, q.state, li.id AS line_id, li.description, li.quantity, li.unit_price, li.amount
     FROM quotations q
     LEFT JOIN quotation_line_items li ON li.quotation_id = q.id
     WHERE q.job_id = $1
     ORDER BY q.created_at DESC, li.sort_order ASC, li.id ASC`,
    [jobId],
  );

  const parts = await pool.query(
    `SELECT id, part_name, quantity, unit_cost_price, status, created_at
     FROM job_parts
     WHERE job_id = $1
     ORDER BY created_at DESC, id DESC`,
    [jobId],
  );

  const expenses = await pool.query(
    `SELECT je.id, je.expense_date, je.category, je.description, je.amount, je.expense_type, je.created_at,
            o.full_name AS officer_full_name
     FROM job_expenses je
     LEFT JOIN officers o ON o.id = je.officer_id
     WHERE je.job_id = $1 AND je.status = 'approved'
     ORDER BY je.expense_date DESC, je.id DESC`,
    [jobId],
  );

  const lines: CostLine[] = [];

  for (const row of manual.rows) {
    const proof = Array.isArray(row.proof_files) ? row.proof_files : [];
    lines.push({
      id: `manual-${row.id}`,
      source: 'manual',
      editable: true,
      label: String(row.cost_type || 'Site cost'),
      description: row.notes ? `${row.description}\n${row.notes}` : row.description,
      quantity: 1,
      unit_amount: n(row.amount),
      amount: n(row.amount),
      currency: row.currency || 'GBP',
      created_at: iso(row.created_at),
      created_by_name: row.created_by_name ?? null,
      proof_files: proof.map((p: Record<string, unknown>) => ({
        stored_filename: String(p.stored_filename || ''),
        original_filename: String(p.original_filename || 'proof'),
        content_type: String(p.content_type || 'application/octet-stream'),
        byte_size: n(p.byte_size),
        href: `/jobs/${jobId}/costs/${row.id}/proof/${encodeURIComponent(String(p.stored_filename || ''))}`,
      })),
    });
  }

  for (const row of timesheet.rows) {
    const seconds = n(row.duration_seconds);
    const hours = seconds / 3600;
    const isTravel = row.segment_type === 'travelling';
    const firstHour = Math.min(hours, 1);
    const additionalHours = Math.max(0, hours - 1);
    const rate = isTravel ? rateConfig.travel_hourly_rate : rateConfig.first_hour_labour_rate;
    const amount = isTravel
      ? Math.round(hours * rateConfig.travel_hourly_rate * 100) / 100
      : Math.round(
          (firstHour * rateConfig.first_hour_labour_rate +
            additionalHours * rateConfig.additional_hour_labour_rate) *
            100,
        ) / 100;
    lines.push({
      id: `timesheet-${row.id}`,
      source: 'timesheet',
      label: `${isTravel ? 'Travel time' : 'On-site time'}${row.officer_full_name ? ` · ${row.officer_full_name}` : ''}`,
      description: `${iso(row.clock_in) ?? ''}${row.clock_out ? ` to ${iso(row.clock_out) ?? ''}` : ' to open'}${
        isTravel
          ? ''
          : `\nFirst hour ${firstHour.toFixed(2)}h @ £${rateConfig.first_hour_labour_rate.toFixed(2)}, additional ${additionalHours.toFixed(2)}h @ £${rateConfig.additional_hour_labour_rate.toFixed(2)}`
      }`,
      quantity: hours,
      unit_amount: rate,
      amount,
      currency: 'GBP',
      created_at: iso(row.clock_in),
      created_by_name: row.officer_full_name ?? null,
    });
  }

  for (const row of jobPricing.rows) {
    lines.push({
      id: `job-pricing-${row.id}`,
      source: 'job_pricing',
      label: row.item_name,
      description: row.time_included ? `${row.time_included} minutes included` : null,
      quantity: n(row.quantity),
      unit_amount: n(row.unit_price),
      amount: n(row.total),
      currency: 'GBP',
      created_at: null,
      created_by_name: null,
    });
  }

  for (const row of quotations.rows) {
    if (row.line_id == null) continue;
    lines.push({
      id: `quotation-${row.line_id}`,
      source: 'quotation',
      label: `${row.quotation_number} · ${row.description}`,
      description: `Quotation state: ${row.state}`,
      quantity: n(row.quantity),
      unit_amount: n(row.unit_price),
      amount: n(row.amount),
      currency: 'GBP',
      created_at: null,
      created_by_name: null,
    });
  }

  for (const row of parts.rows) {
    const qty = n(row.quantity);
    const unit = n(row.unit_cost_price);
    lines.push({
      id: `part-${row.id}`,
      source: 'part',
      label: row.part_name,
      description: `Part status: ${row.status}`,
      quantity: qty,
      unit_amount: unit,
      amount: Math.round(qty * unit * 100) / 100,
      currency: 'GBP',
      created_at: iso(row.created_at),
      created_by_name: null,
    });
  }

  for (const row of expenses.rows) {
    const isCompany = row.expense_type === 'company';
    lines.push({
      id: `expense-${row.id}`,
      source: 'expense',
      label: `${isCompany ? 'Company expense' : 'Approved expense'} · ${row.category || 'Expense'}`,
      description: [
        row.description ? String(row.description) : null,
        isCompany ? 'Company Account' : (row.officer_full_name ? `Officer: ${row.officer_full_name}` : null),
        row.expense_date ? `Expense date: ${iso(row.expense_date)?.slice(0, 10)}` : null,
      ].filter(Boolean).join('\n') || null,
      quantity: 1,
      unit_amount: n(row.amount),
      amount: n(row.amount),
      currency: 'GBP',
      created_at: iso(row.created_at),
      created_by_name: isCompany ? 'Company' : (row.officer_full_name ?? null),
    });
  }

  const bySource = lines.reduce<Record<string, number>>((acc, line) => {
    acc[line.source] = Math.round(((acc[line.source] ?? 0) + line.amount) * 100) / 100;
    return acc;
  }, {});

  return {
    rate_config: rateConfig,
    summary: {
      total: Math.round(lines.reduce((acc, line) => acc + line.amount, 0) * 100) / 100,
      manual_total: bySource.manual ?? 0,
      timesheet_total: bySource.timesheet ?? 0,
      job_pricing_total: bySource.job_pricing ?? 0,
      quotation_total: bySource.quotation ?? 0,
      parts_total: bySource.part ?? 0,
      expenses_total: bySource.expense ?? 0,
      currency: 'GBP',
    },
    lines,
  };
}

export function mountJobCostsRoutes(app: Application, deps: JobCostsRouteDeps): void {
  const { pool, authenticate } = deps;
  void ensureSchema(pool).catch((err) => console.error('Migration error (job_cost_entries):', err));

  app.get('/api/jobs/:id/costs', authenticate, async (req: Request, res: Response) => {
    const jobId = parseId(req.params.id);
    if (jobId == null) return res.status(400).json({ message: 'Invalid job id' });
    const user = (req as AuthReq).user!;
    try {
      if (user.role !== 'OFFICER' && !tenantCrmAccessAllowed(user, 'jobs', 'GET')) {
        return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
      }
      if (!(await canAccessJob(pool, jobId, user))) return res.status(404).json({ message: 'Job not found' });
      return res.json(await buildJobCostPayload(pool, jobId));
    } catch (error) {
      console.error('Get job costs error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.patch('/api/jobs/:id/costs/rates', authenticate, async (req: Request, res: Response) => {
    const jobId = parseId(req.params.id);
    if (jobId == null) return res.status(400).json({ message: 'Invalid job id' });
    const user = (req as AuthReq).user!;
    const body = req.body as Record<string, unknown>;
    if (user.role !== 'OFFICER' && !tenantCrmAccessAllowed(user, 'jobs', 'PATCH')) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }

    const parseNullableRate = (raw: unknown): number | null | undefined => {
      if (raw === undefined) return undefined;
      if (raw === null || raw === '') return null;
      const value = typeof raw === 'number' ? raw : parseFloat(String(raw));
      if (!Number.isFinite(value) || value < 0) return undefined;
      return Math.round(value * 100) / 100;
    };
    const travelRate = parseNullableRate(body.travel_hourly_rate);
    const onSiteRate = parseNullableRate(body.on_site_hourly_rate);
    const firstHourRate = parseNullableRate(body.first_hour_labour_rate);
    const additionalHourRate = parseNullableRate(body.additional_hour_labour_rate);
    const reset = body.reset_to_default === true;

    if (!reset && travelRate === undefined && onSiteRate === undefined && firstHourRate === undefined && additionalHourRate === undefined) {
      return res.status(400).json({ message: 'Provide a valid labour rate' });
    }

    try {
      if (!(await canAccessJob(pool, jobId, user, true))) return res.status(404).json({ message: 'Job not found' });
      if (reset) {
        await pool.query('DELETE FROM job_cost_rate_overrides WHERE job_id = $1', [jobId]);
      } else {
        const existing = await pool.query(
          'SELECT travel_hourly_rate, on_site_hourly_rate, first_hour_labour_rate, additional_hour_labour_rate FROM job_cost_rate_overrides WHERE job_id = $1',
          [jobId],
        );
        const currentTravel = existing.rows[0]?.travel_hourly_rate == null ? null : n(existing.rows[0].travel_hourly_rate);
        const currentOnSite = existing.rows[0]?.on_site_hourly_rate == null ? null : n(existing.rows[0].on_site_hourly_rate);
        const currentFirstHour = existing.rows[0]?.first_hour_labour_rate == null ? null : n(existing.rows[0].first_hour_labour_rate);
        const currentAdditionalHour = existing.rows[0]?.additional_hour_labour_rate == null ? null : n(existing.rows[0].additional_hour_labour_rate);
        const nextTravel = travelRate === undefined ? currentTravel : travelRate;
        const nextOnSite = onSiteRate === undefined ? currentOnSite : onSiteRate;
        const nextFirstHour = firstHourRate === undefined ? currentFirstHour : firstHourRate;
        const nextAdditionalHour = additionalHourRate === undefined ? currentAdditionalHour : additionalHourRate;
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
          [jobId, nextTravel, nextOnSite, nextFirstHour, nextAdditionalHour, user.userId],
        );
      }
      return res.json({ rate_config: await getJobRateConfig(pool, jobId) });
    } catch (error) {
      console.error('Update job cost rates error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.post('/api/jobs/:id/costs', authenticate, async (req: Request, res: Response) => {
    const jobId = parseId(req.params.id);
    if (jobId == null) return res.status(400).json({ message: 'Invalid job id' });
    const user = (req as AuthReq).user!;
    const body = req.body as Record<string, unknown>;
    const amount = n(body.amount);
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const costType = typeof body.cost_type === 'string' && body.cost_type.trim() ? body.cost_type.trim() : 'site_cost';
    const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null;
    const diaryEventId = body.diary_event_id == null ? null : parseId(body.diary_event_id);
    const proof = decodeProofFiles(body.proof_files);

    if (!description) return res.status(400).json({ message: 'Description is required' });
    if (!(amount > 0)) return res.status(400).json({ message: 'Amount must be greater than zero' });
    if (proof.length === 0) return res.status(400).json({ message: 'Proof is required for job costs' });
    if (user.role !== 'OFFICER' && !tenantCrmAccessAllowed(user, 'jobs', 'POST')) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }

    try {
      if (!(await canAccessJob(pool, jobId, user, true))) return res.status(404).json({ message: 'Job not found' });
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const ins = await client.query<{ id: number }>(
          `INSERT INTO job_cost_entries (job_id, diary_event_id, cost_type, description, amount, currency, notes, proof_files, created_by)
           VALUES ($1, $2, $3, $4, $5, 'GBP', $6, '[]'::jsonb, $7)
           RETURNING id`,
          [jobId, diaryEventId, costType, description, amount, notes, user.userId],
        );
        const entryId = ins.rows[0].id;
        const proofJson = [];
        for (const file of proof) {
          const ext = path.extname(file.original).slice(0, 24) || '.bin';
          const stored = `${crypto.randomBytes(16).toString('hex')}${ext}`;
          const uploaded = await writeWorkpilotFile('job-cost-proofs', [jobId, entryId], stored, file.buf, file.contentType);
          proofJson.push({
            stored_filename: stored,
            original_filename: file.original,
            content_type: file.contentType,
            byte_size: file.buf.length,
            spaces_key: uploaded.spacesKey,
            file_url: uploaded.fileUrl,
          });
        }
        await client.query('UPDATE job_cost_entries SET proof_files = $1::jsonb WHERE id = $2', [JSON.stringify(proofJson), entryId]);
        await client.query('COMMIT');
        return res.status(201).json({ id: entryId, proof_files: proofJson });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Create job cost error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.patch('/api/jobs/:id/costs/:costId', authenticate, async (req: Request, res: Response) => {
    const jobId = parseId(req.params.id);
    const costId = parseId(req.params.costId);
    if (jobId == null || costId == null) return res.status(400).json({ message: 'Invalid id' });
    const user = (req as AuthReq).user!;
    const body = req.body as Record<string, unknown>;
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const amount = n(body.amount);
    const costType = typeof body.cost_type === 'string' && body.cost_type.trim() ? body.cost_type.trim() : 'site_cost';
    const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null;

    if (!description) return res.status(400).json({ message: 'Description is required' });
    if (!(amount > 0)) return res.status(400).json({ message: 'Amount must be greater than zero' });
    if (user.role !== 'OFFICER' && !tenantCrmAccessAllowed(user, 'jobs', 'PATCH')) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }

    try {
      if (!(await canAccessJob(pool, jobId, user, true))) return res.status(404).json({ message: 'Job not found' });
      const result = await pool.query(
        `UPDATE job_cost_entries
         SET cost_type = $1, description = $2, amount = $3, notes = $4, updated_at = NOW()
         WHERE id = $5 AND job_id = $6
         RETURNING id`,
        [costType, description, amount, notes, costId, jobId],
      );
      if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Cost entry not found' });
      return res.json({ ok: true });
    } catch (error) {
      console.error('Update job cost error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.delete('/api/jobs/:id/costs/:costId', authenticate, async (req: Request, res: Response) => {
    const jobId = parseId(req.params.id);
    const costId = parseId(req.params.costId);
    if (jobId == null || costId == null) return res.status(400).json({ message: 'Invalid id' });
    const user = (req as AuthReq).user!;
    if (user.role !== 'OFFICER' && !tenantCrmAccessAllowed(user, 'jobs', 'DELETE')) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }

    try {
      if (!(await canAccessJob(pool, jobId, user, true))) return res.status(404).json({ message: 'Job not found' });
      const result = await pool.query('DELETE FROM job_cost_entries WHERE id = $1 AND job_id = $2', [costId, jobId]);
      if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Cost entry not found' });
      return res.json({ ok: true });
    } catch (error) {
      console.error('Delete job cost error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.get('/api/jobs/:id/costs/:costId/proof/:filename', authenticate, async (req: Request, res: Response) => {
    const jobId = parseId(req.params.id);
    const costId = parseId(req.params.costId);
    const filename = cleanFilename(String(req.params.filename || ''));
    if (jobId == null || costId == null || !filename) return res.status(400).json({ message: 'Invalid id' });
    const user = (req as AuthReq).user!;
    try {
      if (user.role !== 'OFFICER' && !tenantCrmAccessAllowed(user, 'jobs', 'GET')) {
        return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
      }
      if (!(await canAccessJob(pool, jobId, user, false))) return res.status(404).json({ message: 'Job not found' });
      const r = await pool.query('SELECT proof_files FROM job_cost_entries WHERE id = $1 AND job_id = $2', [costId, jobId]);
      if ((r.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Proof not found' });
      const proof = Array.isArray(r.rows[0].proof_files) ? r.rows[0].proof_files : [];
      const meta = proof.find((p: Record<string, unknown>) => String(p.stored_filename) === filename) as Record<string, unknown> | undefined;
      if (!meta) return res.status(404).json({ message: 'Proof not found' });
      const file = await loadWorkpilotFile('job-cost-proofs', [jobId, costId], filename);
      if (!file) return res.status(404).json({ message: 'Proof not found' });
      return sendWorkpilotFile(res, file, String(meta.content_type || 'application/octet-stream'), {
        disposition: `inline; filename="${cleanFilename(String(meta.original_filename || 'proof'))}"`,
      });
    } catch (error) {
      console.error('Get job cost proof error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });
}
