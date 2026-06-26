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
  default_travel_rate_per_hr: number | null;
  default_first_hour_rate_per_hr: number | null;
  default_additional_hour_rate_per_hr: number | null;
};

export type CompanyLabourRates = {
  travel_rate_per_hr: number | null;
  first_hour_rate_per_hr: number | null;
  additional_hour_rate_per_hr: number | null;
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
  await pool.query(`ALTER TABLE pricing_settings ADD COLUMN IF NOT EXISTS default_travel_rate_per_hr DECIMAL(10,2)`);
  await pool.query(`ALTER TABLE pricing_settings ADD COLUMN IF NOT EXISTS default_first_hour_rate_per_hr DECIMAL(10,2)`);
  await pool.query(`ALTER TABLE pricing_settings ADD COLUMN IF NOT EXISTS default_additional_hour_rate_per_hr DECIMAL(10,2)`);
}

function nullableRate(v: unknown): number | null {
  if (v == null || v === '') return null;
  const out = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(out) ? out : null;
}

export async function getTenantPricingSettings(pool: Pool, tenantUserId: number): Promise<PricingSettings> {
  await ensurePricingSettingsSchema(pool);
  const res = await pool.query<{
    default_price_book_id: number | null;
    default_parts_markup_pct: string | number;
    price_book_name: string | null;
    default_travel_rate_per_hr: string | number | null;
    default_first_hour_rate_per_hr: string | number | null;
    default_additional_hour_rate_per_hr: string | number | null;
  }>(
    `SELECT ps.default_price_book_id, ps.default_parts_markup_pct, pb.name AS price_book_name,
            ps.default_travel_rate_per_hr, ps.default_first_hour_rate_per_hr, ps.default_additional_hour_rate_per_hr
     FROM pricing_settings ps
     LEFT JOIN price_books pb ON pb.id = ps.default_price_book_id
     WHERE ps.created_by = $1`,
    [tenantUserId],
  );
  if ((res.rowCount ?? 0) === 0) {
    return {
      default_price_book_id: null,
      default_price_book_name: null,
      default_parts_markup_pct: 0,
      default_travel_rate_per_hr: null,
      default_first_hour_rate_per_hr: null,
      default_additional_hour_rate_per_hr: null,
    };
  }
  const row = res.rows[0];
  let travel = nullableRate(row.default_travel_rate_per_hr);
  let firstHour = nullableRate(row.default_first_hour_rate_per_hr);
  let additionalHour = nullableRate(row.default_additional_hour_rate_per_hr);

  if (travel == null && firstHour == null && additionalHour == null && row.default_price_book_id != null) {
    const legacy = await getPrimaryLabourRate(pool, row.default_price_book_id);
    if (legacy) {
      travel = legacy.travel_rate_per_hr ?? legacy.basic_rate_per_hr;
      firstHour = legacy.first_hour_rate_per_hr ?? legacy.basic_rate_per_hr;
      additionalHour = legacy.additional_hour_rate_per_hr ?? legacy.basic_rate_per_hr;
      await pool.query(
        `UPDATE pricing_settings
         SET default_travel_rate_per_hr = $2,
             default_first_hour_rate_per_hr = $3,
             default_additional_hour_rate_per_hr = $4,
             updated_at = NOW()
         WHERE created_by = $1`,
        [tenantUserId, travel, firstHour, additionalHour],
      );
    }
  }

  return {
    default_price_book_id: row.default_price_book_id,
    default_price_book_name: row.price_book_name,
    default_parts_markup_pct: n(row.default_parts_markup_pct),
    default_travel_rate_per_hr: travel,
    default_first_hour_rate_per_hr: firstHour,
    default_additional_hour_rate_per_hr: additionalHour,
  };
}

/** Account-wide labour rates used for timesheet cost and engineer billing. */
export async function getCompanyLabourRates(pool: Pool, tenantUserId: number): Promise<CompanyLabourRates> {
  const settings = await getTenantPricingSettings(pool, tenantUserId);
  return {
    travel_rate_per_hr: settings.default_travel_rate_per_hr,
    first_hour_rate_per_hr: settings.default_first_hour_rate_per_hr,
    additional_hour_rate_per_hr: settings.default_additional_hour_rate_per_hr,
  };
}

export async function getCompanyLabourRatesForJob(pool: Pool, jobId: number): Promise<CompanyLabourRates> {
  const jobRes = await pool.query<{ created_by: number | null }>(
    'SELECT created_by FROM jobs WHERE id = $1',
    [jobId],
  );
  const tenantUserId = jobRes.rows[0]?.created_by ?? 0;
  return getCompanyLabourRates(pool, tenantUserId);
}

export type CustomerPriceBookItem = {
  id: number;
  item_name: string;
  unit_price: number;
  price: number;
  sell_unit_price: number;
};

export type CustomerPriceBookWithItems = {
  price_book_id: number;
  price_book_name: string;
  source: 'customer' | 'company_default';
  items: CustomerPriceBookItem[];
};

export async function ensureCustomerPriceBooksSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customer_price_books (
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      price_book_id INTEGER NOT NULL REFERENCES price_books(id) ON DELETE CASCADE,
      sort_order INT NOT NULL DEFAULT 0,
      PRIMARY KEY (customer_id, price_book_id)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_customer_price_books_customer ON customer_price_books(customer_id)`);
  await pool.query(`
    INSERT INTO customer_price_books (customer_id, price_book_id, sort_order)
    SELECT id, price_book_id, 0 FROM customers
    WHERE price_book_id IS NOT NULL
    ON CONFLICT DO NOTHING
  `);
}

export async function getCustomerPriceBookIds(pool: Pool, customerId: number): Promise<number[]> {
  await ensureCustomerPriceBooksSchema(pool);
  const junction = await pool.query<{ price_book_id: number }>(
    `SELECT price_book_id FROM customer_price_books WHERE customer_id = $1 ORDER BY sort_order ASC, price_book_id ASC`,
    [customerId],
  );
  if (junction.rows.length > 0) {
    return junction.rows.map((row) => row.price_book_id);
  }
  const legacy = await pool.query<{ price_book_id: number | null }>(
    'SELECT price_book_id FROM customers WHERE id = $1',
    [customerId],
  );
  const legacyId = legacy.rows[0]?.price_book_id;
  return legacyId ? [legacyId] : [];
}

export async function getCustomerPriceBooksSummary(
  pool: Pool,
  customerId: number,
): Promise<{ id: number; name: string }[]> {
  const ids = await getCustomerPriceBookIds(pool, customerId);
  if (ids.length === 0) return [];
  const res = await pool.query<{ id: number; name: string }>(
    `SELECT id, name FROM price_books WHERE id = ANY($1::int[]) ORDER BY array_position($1::int[], id)`,
    [ids],
  );
  return res.rows;
}

export async function setCustomerPriceBooks(pool: Pool, customerId: number, priceBookIds: number[]): Promise<void> {
  await ensureCustomerPriceBooksSchema(pool);
  const unique = [...new Set(priceBookIds.filter((id) => Number.isFinite(id) && id > 0))];
  await pool.query('DELETE FROM customer_price_books WHERE customer_id = $1', [customerId]);
  for (let i = 0; i < unique.length; i++) {
    await pool.query(
      `INSERT INTO customer_price_books (customer_id, price_book_id, sort_order) VALUES ($1, $2, $3)`,
      [customerId, unique[i], i],
    );
  }
  await pool.query('UPDATE customers SET price_book_id = $2 WHERE id = $1', [customerId, unique[0] ?? null]);
}

function mapPriceBookItemRow(row: { id: number; item_name: string; unit_price: string | number; price: string | number }): CustomerPriceBookItem {
  const unitPrice = n(row.unit_price);
  const price = n(row.price);
  return {
    id: row.id,
    item_name: String(row.item_name),
    unit_price: unitPrice,
    price,
    sell_unit_price: price > 0 ? price : unitPrice,
  };
}

export async function getCustomerInvoicePriceBooks(
  pool: Pool,
  customerId: number,
  tenantUserId: number,
): Promise<CustomerPriceBookWithItems[]> {
  await ensureCustomerPriceBooksSchema(pool);
  const bookIds = await getCustomerPriceBookIds(pool, customerId);
  const books: CustomerPriceBookWithItems[] = [];

  const loadBook = async (pbId: number, source: 'customer' | 'company_default') => {
    const bookRes = await pool.query<{ id: number; name: string }>(
      'SELECT id, name FROM price_books WHERE id = $1',
      [pbId],
    );
    if ((bookRes.rowCount ?? 0) === 0) return;
    const itemsRes = await pool.query<{ id: number; item_name: string; unit_price: string | number; price: string | number }>(
      `SELECT id, item_name, unit_price, price FROM price_book_items WHERE price_book_id = $1 ORDER BY item_name ASC`,
      [pbId],
    );
    books.push({
      price_book_id: pbId,
      price_book_name: bookRes.rows[0].name,
      source,
      items: itemsRes.rows.map(mapPriceBookItemRow),
    });
  };

  if (bookIds.length > 0) {
    for (const pbId of bookIds) {
      await loadBook(pbId, 'customer');
    }
    return books;
  }

  const settings = await getTenantPricingSettings(pool, tenantUserId);
  if (settings.default_price_book_id) {
    await loadBook(settings.default_price_book_id, 'company_default');
  }
  return books;
}

export async function resolvePriceBookForCustomer(
  pool: Pool,
  customerId: number | null,
  tenantUserId: number,
): Promise<ResolvedPriceBook> {
  if (customerId) {
    const assigned = await getCustomerPriceBooksSummary(pool, customerId);
    if (assigned.length > 0) {
      return {
        price_book_id: assigned[0].id,
        price_book_name: assigned[0].name,
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
  let bookIds = customerId ? await getCustomerPriceBookIds(pool, customerId) : [];
  if (bookIds.length === 0 && resolved.price_book_id) {
    bookIds = [resolved.price_book_id];
  }
  if (bookIds.length === 0) return;

  let sortOrder = 0;
  for (const pbId of bookIds) {
    const pbItems = await pool.query<{
      item_name: string;
      unit_price: string | number;
      price: string | number;
    }>(
      `SELECT item_name, unit_price, price FROM price_book_items WHERE price_book_id = $1 ORDER BY id ASC`,
      [pbId],
    );
    for (const item of pbItems.rows) {
      const sellPrice = n(item.price) || n(item.unit_price);
      await pool.query(
        `INSERT INTO job_pricing_items (job_id, item_name, time_included, unit_price, vat_rate, quantity, total, sort_order)
         VALUES ($1, $2, 0, $3, 20, 1, $3, $4)`,
        [jobId, item.item_name, sellPrice, sortOrder],
      );
      sortOrder += 1;
    }
  }
}
