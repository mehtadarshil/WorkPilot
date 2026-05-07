import type { Pool } from 'pg';

export const SERVICE_REMINDER_INTERVAL_UNITS = new Set(['days', 'weeks', 'months', 'years']);
export const SERVICE_REMINDER_EARLY_UNITS = new Set(['days', 'weeks']);
export const SERVICE_REMINDER_RECIPIENT_MODES = new Set(['customer_account', 'job_contact', 'primary_contact']);

/** Normalizes job.completed_service_items: legacy string[] or { name, remind_email? }[]. */
export function normalizeCompletedServiceItemsForDb(raw: unknown): { name: string; remind_email: boolean }[] {
  if (!Array.isArray(raw)) return [];
  const out: { name: string; remind_email: boolean }[] = [];
  const seen = new Set<string>();
  for (const el of raw) {
    if (typeof el === 'string') {
      const n = el.trim();
      if (!n || seen.has(n)) continue;
      seen.add(n);
      out.push({ name: n, remind_email: true });
      continue;
    }
    if (el && typeof el === 'object' && typeof (el as { name: unknown }).name === 'string') {
      const name = String((el as { name: string }).name).trim();
      if (!name || seen.has(name)) continue;
      const remind = (el as { remind_email?: unknown }).remind_email;
      seen.add(name);
      out.push({ name, remind_email: remind !== false });
    }
  }
  return out;
}

export function utcDateOnlyFromDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addCalendarInterval(d: Date, n: number, unit: string): Date {
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth();
  const da = d.getUTCDate();
  const x = new Date(Date.UTC(y, mo, da));
  const u = (unit || 'years').toLowerCase();
  const steps = Number.isFinite(n) && n > 0 ? Math.trunc(n) : 1;
  if (u === 'days') x.setUTCDate(x.getUTCDate() + steps);
  else if (u === 'weeks') x.setUTCDate(x.getUTCDate() + steps * 7);
  else if (u === 'months') x.setUTCMonth(x.getUTCMonth() + steps);
  else if (u === 'years') x.setUTCFullYear(x.getUTCFullYear() + steps);
  else x.setUTCFullYear(x.getUTCFullYear() + steps);
  return x;
}

export async function resolveServiceReminderRecipientEmail(
  pool: Pool,
  customerId: number,
  customerAccountEmail: string | null,
  jobContactId: number | null,
  mode: string,
): Promise<string | null> {
  const m = mode || 'customer_account';
  if (m === 'customer_account') {
    const e = (customerAccountEmail ?? '').trim();
    return e || null;
  }
  if (m === 'job_contact' && jobContactId != null) {
    const r = await pool.query<{ email: string | null }>(
      `SELECT email FROM customer_contacts WHERE id = $1 AND customer_id = $2`,
      [jobContactId, customerId],
    );
    const e = (r.rows[0]?.email ?? '').trim();
    return e || null;
  }
  if (m === 'primary_contact') {
    const r = await pool.query<{ email: string | null }>(
      `SELECT email FROM customer_contacts
       WHERE customer_id = $1 AND COALESCE(TRIM(email), '') <> ''
       ORDER BY is_primary DESC, created_at ASC
       LIMIT 1`,
      [customerId],
    );
    const e = (r.rows[0]?.email ?? '').trim();
    if (e) return e;
    const fb = (customerAccountEmail ?? '').trim();
    return fb || null;
  }
  const e = (customerAccountEmail ?? '').trim();
  return e || null;
}
