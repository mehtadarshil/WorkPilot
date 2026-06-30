import type { Pool } from 'pg';
import {
  applyTemplateVars,
  wrapEmailHtml,
  formatFromHeader,
  createMailTransport,
} from '../emailHelpers';

export type OverdueInvoiceReminderDeps = {
  loadEmailSettingsPayload: (userId: number) => Promise<Record<string, unknown>>;
  sendUserEmail: (pool: Pool, userId: number, emailCfg: Record<string, unknown>, opts: Record<string, unknown>) => Promise<void>;
  buildInvoiceEmailTemplateVars: (
    inv: Record<string, unknown>,
    invSettings: { company_name?: string | null },
  ) => Promise<Record<string, string>>;
  getInvoiceSettings: (userId: number) => Promise<{ company_name?: string | null }>;
};

const REMINDER_PHASES = [
  { phase: 1, daysOverdue: 1, label: 'Payment reminder' },
  { phase: 7, daysOverdue: 7, label: 'Second payment reminder' },
  { phase: 14, daysOverdue: 14, label: 'Final payment reminder' },
] as const;

const RECURRING_REMINDER_INTERVAL_DAYS = 7;
const FIRST_RECURRING_PHASE = 21;

function utcToday(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function dateOnlyFromPg(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return null;
}

function daysBetween(earlierYmd: string, laterYmd: string): number {
  const a = Date.parse(`${earlierYmd}T00:00:00Z`);
  const b = Date.parse(`${laterYmd}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.floor((b - a) / 86_400_000);
}

async function ensureInvoiceReminderTemplateRow(pool: Pool, userId: number): Promise<void> {
  const subject = '{{company_name}} — Payment reminder for invoice {{invoice_number}}';
  const body =
    '<p>Hi {{customer_name}},</p><p>This is a friendly reminder that invoice <strong>{{invoice_number}}</strong> for <strong>{{currency}} {{invoice_total}}</strong> was due on <strong>{{due_date}}</strong> and remains outstanding.</p><p>Billing address: {{customer_address}}</p><p>{{work_address}}</p><p>You can view the invoice here: {{invoice_link}}</p><p>Please arrange payment at your earliest convenience. If you have already paid, please disregard this message.</p><p>Kind regards,<br/>{{company_name}}</p>';
  await pool.query(
    `INSERT INTO email_templates (created_by, template_key, name, subject, body_html)
     VALUES ($1, 'invoice_reminder', $2, $3, $4)
     ON CONFLICT (created_by, template_key) DO NOTHING`,
    [userId, 'Invoice payment reminder', subject, body],
  );
}

/** Automated payment-chase emails for overdue unpaid invoices. Logs to customer communications. */
export async function runOverdueInvoiceReminderEmails(
  pool: Pool,
  deps: OverdueInvoiceReminderDeps,
): Promise<{ sent: number; skipped: number; errors: string[] }> {
  const today = utcToday();
  const errors: string[] = [];
  let sent = 0;
  let skipped = 0;

  const tenantRows = await pool.query<{ created_by: number }>(
    `SELECT DISTINCT COALESCE(i.created_by, c.created_by) AS created_by
     FROM invoices i
     JOIN customers c ON c.id = i.customer_id
     WHERE COALESCE(i.created_by, c.created_by) IS NOT NULL`,
  );

  for (const tenant of tenantRows.rows) {
    const tenantUserId = Number(tenant.created_by);
    if (!Number.isFinite(tenantUserId)) continue;

    let emailCfg: Record<string, unknown>;
    try {
      emailCfg = await deps.loadEmailSettingsPayload(tenantUserId);
    } catch (e) {
      errors.push(`tenant ${tenantUserId}: email settings: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    const canSend = emailCfg.oauth_provider || (emailCfg.smtp_enabled && createMailTransport(emailCfg as never));
    if (!canSend || !String(emailCfg.from_email ?? '').trim()) {
      skipped += 1;
      continue;
    }

    await ensureInvoiceReminderTemplateRow(pool, tenantUserId);
    const tplRow = await pool.query<{ subject: string; body_html: string }>(
      `SELECT subject, body_html FROM email_templates WHERE created_by = $1 AND template_key = 'invoice_reminder'`,
      [tenantUserId],
    );
    if ((tplRow.rowCount ?? 0) === 0) {
      errors.push(`tenant ${tenantUserId}: missing invoice_reminder template`);
      continue;
    }
    const invSettings = await deps.getInvoiceSettings(tenantUserId);

    const candidates = await pool.query<{
      id: number;
      customer_id: number;
      job_id: number | null;
      invoice_work_address_id: number | null;
      invoice_number: string;
      due_date: Date;
      total_amount: string;
      total_paid: string;
      currency: string;
      state: string;
      customer_email: string | null;
      customer_full_name: string | null;
      invoice_reminders_enabled: boolean;
      cust_addr_line_1: string | null;
      cust_addr_line_2: string | null;
      cust_addr_line_3: string | null;
      cust_town: string | null;
      cust_county: string | null;
      cust_postcode: string | null;
      public_token: string | null;
    }>(
      `SELECT i.id, i.customer_id, i.job_id, i.invoice_work_address_id, i.invoice_number, i.due_date,
              i.total_amount, i.total_paid, i.currency, i.state, i.public_token,
              c.email AS customer_email, c.full_name AS customer_full_name,
              COALESCE(c.invoice_reminders_enabled, true) AS invoice_reminders_enabled,
              c.address_line_1 AS cust_addr_line_1, c.address_line_2 AS cust_addr_line_2,
              c.address_line_3 AS cust_addr_line_3, c.town AS cust_town, c.county AS cust_county,
              c.postcode AS cust_postcode
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       WHERE COALESCE(i.created_by, c.created_by) = $1
         AND i.state NOT IN ('draft', 'paid', 'cancelled')
         AND (i.total_amount - i.total_paid) > 0.005
         AND i.due_date < $2::date
         AND COALESCE(c.invoice_reminders_enabled, true) = true
         AND NULLIF(TRIM(c.email), '') IS NOT NULL`,
      [tenantUserId, today],
    );

    for (const inv of candidates.rows) {
      const dueYmd = dateOnlyFromPg(inv.due_date);
      if (!dueYmd) {
        skipped += 1;
        continue;
      }
      const daysOverdue = daysBetween(dueYmd, today);

      let phase: number;
      let label: string;

      const fixedPhase = REMINDER_PHASES.find((p) => p.daysOverdue === daysOverdue);
      if (fixedPhase) {
        phase = fixedPhase.phase;
        label = fixedPhase.label;
      } else if (daysOverdue >= FIRST_RECURRING_PHASE) {
        const intervalsSinceFirstRecurring = Math.floor((daysOverdue - FIRST_RECURRING_PHASE) / RECURRING_REMINDER_INTERVAL_DAYS);
        phase = FIRST_RECURRING_PHASE + intervalsSinceFirstRecurring * RECURRING_REMINDER_INTERVAL_DAYS;
        label = 'Payment follow-up reminder';
      } else {
        skipped += 1;
        continue;
      }

      const alreadyToday = await pool.query(
        `SELECT 1 FROM invoice_reminder_sent WHERE invoice_id = $1 AND sent_on = $2::date`,
        [inv.id, today],
      );
      if ((alreadyToday.rowCount ?? 0) > 0) {
        skipped += 1;
        continue;
      }

      const alreadyPhase = await pool.query(
        `SELECT 1 FROM invoice_reminder_sent WHERE invoice_id = $1 AND phase = $2`,
        [inv.id, phase],
      );
      if ((alreadyPhase.rowCount ?? 0) > 0) {
        skipped += 1;
        continue;
      }

      const toEmail = String(inv.customer_email ?? '').trim();
      if (!toEmail) {
        skipped += 1;
        continue;
      }

      try {
        const vars = await deps.buildInvoiceEmailTemplateVars(inv as Record<string, unknown>, invSettings);
        vars.phase_label = label;
        vars.days_overdue = String(daysOverdue);
        const balanceDue = Math.max(0, parseFloat(inv.total_amount) - parseFloat(inv.total_paid));
        vars.balance_due = balanceDue.toFixed(2);

        const subject = applyTemplateVars(tplRow.rows[0].subject, vars);
        const bodyInner = applyTemplateVars(tplRow.rows[0].body_html, vars);
        const html = wrapEmailHtml(bodyInner, (emailCfg.default_signature_html as string | null) ?? null);
        const from = formatFromHeader(String(emailCfg.from_name ?? ''), String(emailCfg.from_email ?? ''));

        await deps.sendUserEmail(pool, tenantUserId, emailCfg, {
          from,
          to: toEmail,
          subject,
          html,
          replyTo: emailCfg.reply_to,
        });

        await pool.query(
          `INSERT INTO invoice_reminder_sent (invoice_id, phase, sent_on, tenant_user_id)
           VALUES ($1, $2, $3::date, $4)`,
          [inv.id, phase, today, tenantUserId],
        );

        let workAddressId: number | null = inv.invoice_work_address_id;
        if (workAddressId == null && inv.job_id != null) {
          const wa = await pool.query<{ work_address_id: number | null }>(
            'SELECT work_address_id FROM jobs WHERE id = $1',
            [inv.job_id],
          );
          workAddressId = wa.rows[0]?.work_address_id ?? null;
        }

        await pool.query(
          `INSERT INTO customer_communications
            (customer_id, work_address_id, record_type, subject, message, status, to_value, object_type, object_id, created_by)
           VALUES ($1, $2, 'email', $3, $4, 'sent', $5, 'invoice', $6, $7)`,
          [inv.customer_id, workAddressId, subject, bodyInner, toEmail, inv.id, tenantUserId],
        );

        sent += 1;
      } catch (e) {
        errors.push(`invoice ${inv.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  return { sent, skipped, errors };
}
