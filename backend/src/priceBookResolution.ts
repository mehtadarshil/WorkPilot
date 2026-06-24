import type { Pool } from 'pg';

export type PriceBookSource = 'customer' | 'company_default' | null;

export type ResolvedPriceBook = {
  price_book_id: number | null;
  price_book_name: string | null;
  source: PriceBookSource;
};

export type LabourRateRow = {
  name: string;
  basic_rate_per_hr: number;
  travel_rate_per_hr: number | null;
  first_hour_rate_per_hr: number | null;
  additional_hour_rate_per_hr: number | null;
};

export type PricingSettings = {
  default_price_book_id: number | null;
  default_price_book_name: string | null;
  default_parts_markup_pct: number;
};

function n(v: unknown): number {
  const out = typeof v === 'number' ? v : parseFloat(String(v ?? '0'));
  return Number.isFinite(out) ? out : 0;
}

export async function ensurePricingSettingsSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pricing_settings (
      created_by INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      default_price_book_id INTEGER REFERENCES price_books(id) ON DELETE SET NULL,
      default_parts_markup_pct DECIMAL(7,2) NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

export async function getTenantPricingSettings(pool: Pool, tenantUserId: number): Promise<PricingSettings> {
  await ensurePricingSettingsSchema(pool);
  const res = await pool.query<{
    default_price_book_id: number | null;
    default_parts_markup_pct: string | number;
    price_book_name: string | null;
  }>(
    `SELECT ps.default_price_book_id, ps.default_parts_markup_pct, pb.name AS price_book_name
     FROM pricing_settings ps
     LEFT JOIN price_books pb ON pb.id = ps.default_price_book_id
     WHERE ps.created_by = $1`,
    [tenantUserId],
  );
  if ((res.rowCount ?? 0) === 0) {
    return { default_price_book_id: null, default_price_book_name: null, default_parts_markup_pct: 0 };
  }
  const row = res.rows[0];
  return {
    default_price_book_id: row.default_price_book_id,
    default_price_book_name: row.price_book_name,
    default_parts_markup_pct: n(row.default_parts_markup_pct),
  };
}

export async function resolvePriceBookForCustomer(
  pool: Pool,
  customerId: number | null,
  tenantUserId: number,
): Promise<ResolvedPriceBook> {
  if (customerId) {
    const customerRes = await pool.query<{ price_book_id: number | null; price_book_name: string | null }>(
      `SELECT c.price_book_id, pb.name AS price_book_name
       FROM customers c
       LEFT JOIN price_books pb ON pb.id = c.price_book_id
       WHERE c.id = $1`,
      [customerId],
    );
    const customerPb = customerRes.rows[0];
    if (customerPb?.price_book_id) {
      return {
        price_book_id: customerPb.price_book_id,
        price_book_name: customerPb.price_book_name,
        source: 'customer',
      };
    }
  }

  const settings = await getTenantPricingSettings(pool, tenantUserId);
  if (settings.default_price_book_id) {
    return {
      price_book_id: settings.default_price_book_id,
      price_book_name: settings.default_price_book_name,
      source: 'company_default',
    };
  }

  return { price_book_id: null, price_book_name: null, source: null };
}

export async function resolvePriceBookForJob(pool: Pool, jobId: number): Promise<ResolvedPriceBook & { tenant_user_id: number | null }> {
  const jobRes = await pool.query<{ customer_id: number | null; created_by: number | null }>(
    'SELECT customer_id, created_by FROM jobs WHERE id = $1',
    [jobId],
  );
  if ((jobRes.rowCount ?? 0) === 0) {
    return { price_book_id: null, price_book_name: null, source: null, tenant_user_id: null };
  }
  const job = jobRes.rows[0];
  const tenantUserId = job.created_by ?? 0;
  const resolved = await resolvePriceBookForCustomer(pool, job.customer_id, tenantUserId);
  return { ...resolved, tenant_user_id: job.created_by };
}

export async function getPrimaryLabourRate(pool: Pool, priceBookId: number | null): Promise<LabourRateRow | null> {
  if (!priceBookId) return null;
  const res = await pool.query(
    `SELECT name, basic_rate_per_hr, travel_rate_per_hr, first_hour_rate_per_hr, additional_hour_rate_per_hr
     FROM price_book_labour_rates
     WHERE price_book_id = $1
     ORDER BY id ASC
     LIMIT 1`,
    [priceBookId],
  );
  if ((res.rowCount ?? 0) === 0) return null;
  const row = res.rows[0];
  return {
    name: String(row.name),
    basic_rate_per_hr: n(row.basic_rate_per_hr),
    travel_rate_per_hr: row.travel_rate_per_hr == null ? null : n(row.travel_rate_per_hr),
    first_hour_rate_per_hr: row.first_hour_rate_per_hr == null ? null : n(row.first_hour_rate_per_hr),
    additional_hour_rate_per_hr: row.additional_hour_rate_per_hr == null ? null : n(row.additional_hour_rate_per_hr),
  };
}

/** Copy default sell pricing onto a new job when none was supplied explicitly. */
export async function seedJobPricingDefaults(
  pool: Pool,
  jobId: number,
  customerId: number | null,
  jobDescriptionId: number | null,
  tenantUserId: number,
): Promise<void> {
  const existing = await pool.query('SELECT id FROM job_pricing_items WHERE job_id = $1 LIMIT 1', [jobId]);
  if ((existing.rowCount ?? 0) > 0) return;

  if (jobDescriptionId) {
    const descItems = await pool.query<{
      item_name: string;
      time_included: number;
      unit_price: string | number;
      vat_rate: string | number;
      quantity: number;
      sort_order: number;
    }>(
      `SELECT item_name, time_included, unit_price, vat_rate, quantity, sort_order
       FROM job_description_pricing_items
       WHERE job_description_id = $1
       ORDER BY sort_order ASC, id ASC`,
      [jobDescriptionId],
    );
    if ((descItems.rowCount ?? 0) > 0) {
      for (let i = 0; i < descItems.rows.length; i++) {
        const pi = descItems.rows[i];
        const unitPrice = n(pi.unit_price);
        const qty = pi.quantity || 1;
        const total = unitPrice * qty;
        await pool.query(
          `INSERT INTO job_pricing_items (job_id, item_name, time_included, unit_price, vat_rate, quantity, total, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [jobId, pi.item_name, pi.time_included || 0, unitPrice, n(pi.vat_rate) || 20, qty, total, pi.sort_order ?? i],
        );
      }
      return;
    }
  }

  const resolved = await resolvePriceBookForCustomer(pool, customerId, tenantUserId);
  if (!resolved.price_book_id) return;

  const pbItems = await pool.query<{
    item_name: string;
    unit_price: string | number;
    price: string | number;
  }>(
    `SELECT item_name, unit_price, price FROM price_book_items WHERE price_book_id = $1 ORDER BY id ASC`,
    [resolved.price_book_id],
  );
  for (let i = 0; i < pbItems.rows.length; i++) {
    const item = pbItems.rows[i];
    const sellPrice = n(item.price) || n(item.unit_price);
    await pool.query(
      `INSERT INTO job_pricing_items (job_id, item_name, time_included, unit_price, vat_rate, quantity, total, sort_order)
       VALUES ($1, $2, 0, $3, 20, 1, $3, $4)`,
      [jobId, item.item_name, sellPrice, i],
    );
  }
}
