import type { Pool } from 'pg';
import {
  applyTemplateVars,
  wrapEmailHtml,
  formatFromHeader,
} from '../emailHelpers';
import { utcDateOnlyFromDate } from '../reminders/serviceReminderHelpers';
import { daysBetween } from '../ppmContracts/dateUtils';

export type PpmContractReminderDeps = {
  loadEmailSettingsPayload: (userId: number) => Promise<Record<string, unknown>>;
  sendUserEmail: (pool: Pool, userId: number, emailCfg: Record<string, unknown>, opts: Record<string, unknown>) => Promise<void>;
};

async function ensurePpmRenewalTemplate(pool: Pool, userId: number): Promise<void> {
  const subject = '{{company_name}} — PPM contract renewal ({{contract_title}})';
  const body =
    '<p>Hi {{customer_name}},</p><p>This is a {{phase_label}} for your maintenance contract <strong>{{contract_title}}</strong> (ref {{contract_reference}}).</p><p>Contract expires: <strong>{{end_date}}</strong></p><p>Site: {{site_address}}</p><p>Please contact us to discuss renewal.</p><p>Kind regards,<br/>{{company_name}}</p>';
  await pool.query(
    `INSERT INTO email_templates (created_by, template_key, name, subject, body_html)
     VALUES ($1, 'ppm_contract_renewal', $2, $3, $4)
     ON CONFLICT (created_by, template_key) DO NOTHING`,
    [userId, 'PPM contract renewal reminder', subject, body],
  );
}

/** Contract expiry renewal emails + task due reminders from communications_json offsets. */
export async function runPpmContractReminders(
  pool: Pool,
  deps: PpmContractReminderDeps,
): Promise<{ contract_renewals: { sent: number; skipped: number }; task_reminders: { sent: number; skipped: number }; errors: string[] }> {
  const today = utcDateOnlyFromDate(new Date());
  const errors: string[] = [];
  let renewalSent = 0;
  let renewalSkipped = 0;
  let taskSent = 0;
  let taskSkipped = 0;

  const contracts = await pool.query<{
    id: number;
    created_by: number;
    title: string;
    reference: string | null;
    end_date: string | null;
    renewal_notice_days: number;
    customer_id: number;
    customer_name: string;
    customer_email: string | null;
    work_address_name: string | null;
    communications_json: Record<string, unknown>;
  }>(
    `SELECT c.id, c.created_by, c.title, c.reference, c.end_date::text, c.renewal_notice_days,
            c.customer_id, cu.full_name AS customer_name, cu.email AS customer_email,
            wa.name AS work_address_name, c.communications_json
     FROM ppm_contracts c
     JOIN customers cu ON cu.id = c.customer_id
     LEFT JOIN customer_work_addresses wa ON wa.id = c.work_address_id
     WHERE c.status = 'active' AND c.end_date IS NOT NULL`,
  );

  for (const row of contracts.rows) {
    const endDate = row.end_date?.slice(0, 10);
    if (!endDate || !row.created_by) {
      renewalSkipped++;
      continue;
    }
    const daysLeft = daysBetween(new Date(`${today}T12:00:00.000Z`), new Date(`${endDate}T12:00:00.000Z`));
    const notice = row.renewal_notice_days ?? 60;
    const phases: { phase: string; days: number; label: string }[] = [
      { phase: '60d', days: 60, label: '60-day renewal notice' },
      { phase: '30d', days: 30, label: '30-day renewal notice' },
      { phase: '7d', days: 7, label: '7-day renewal notice' },
    ].filter((p) => p.days <= notice);

    for (const ph of phases) {
      if (daysLeft !== ph.days) continue;
      const sentCheck = await pool.query(
        `SELECT 1 FROM ppm_contract_renewal_sent WHERE contract_id = $1 AND phase = $2 AND target_date = $3`,
        [row.id, ph.phase, endDate],
      );
      if ((sentCheck.rowCount ?? 0) > 0) {
        renewalSkipped++;
        continue;
      }
      const email = row.customer_email?.trim();
      if (!email) {
        renewalSkipped++;
        continue;
      }
      try {
        await ensurePpmRenewalTemplate(pool, row.created_by);
        const emailCfg = await deps.loadEmailSettingsPayload(row.created_by);
        const tpl = await pool.query<{ subject: string; body_html: string }>(
          `SELECT subject, body_html FROM email_templates WHERE created_by = $1 AND template_key = 'ppm_contract_renewal'`,
          [row.created_by],
        );
        const vars = {
          customer_name: row.customer_name,
          contract_title: row.title,
          contract_reference: row.reference || '',
          end_date: endDate,
          phase_label: ph.label,
          site_address: row.work_address_name || '',
          company_name: String(emailCfg.company_name || 'WorkPilot'),
        };
        const subject = applyTemplateVars(tpl.rows[0]?.subject || vars.company_name, vars);
        const html = wrapEmailHtml(applyTemplateVars(tpl.rows[0]?.body_html || '', vars), null);
        const from = formatFromHeader(String(emailCfg.from_name ?? ''), String(emailCfg.from_email ?? ''));
        await deps.sendUserEmail(pool, row.created_by, emailCfg, {
          to: email,
          subject,
          html,
          from,
        });
        await pool.query(
          `INSERT INTO ppm_contract_renewal_sent (contract_id, phase, target_date) VALUES ($1, $2, $3)`,
          [row.id, ph.phase, endDate],
        );
        renewalSent++;
      } catch (e) {
        errors.push(`renewal contract ${row.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  const taskRows = await pool.query<{
    task_id: number;
    task_name: string;
    next_due_date: string;
    contract_id: number;
    created_by: number;
    customer_name: string;
    customer_email: string | null;
    contract_title: string;
    communications_json: Record<string, unknown>;
  }>(
    `SELECT t.id AS task_id, t.name AS task_name, t.next_due_date::text,
            c.id AS contract_id, c.created_by, cu.full_name AS customer_name, cu.email AS customer_email,
            c.title AS contract_title, c.communications_json
     FROM ppm_contract_tasks t
     JOIN ppm_contracts c ON c.id = t.contract_id
     JOIN customers cu ON cu.id = c.customer_id
     WHERE c.status = 'active' AND t.is_active = true`,
  );

  for (const row of taskRows.rows) {
    const comms = row.communications_json && typeof row.communications_json === 'object'
      ? row.communications_json
      : {};
    if (comms.email_enabled === false) {
      taskSkipped++;
      continue;
    }
    const offsets = Array.isArray(comms.reminder_days_before)
      ? comms.reminder_days_before.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0)
      : [60, 30, 7];
    const due = row.next_due_date.slice(0, 10);
    const daysLeft = daysBetween(new Date(`${today}T12:00:00.000Z`), new Date(`${due}T12:00:00.000Z`));
    if (!offsets.includes(daysLeft)) {
      taskSkipped++;
      continue;
    }
    const phase = `task_${daysLeft}d`;
    const sentCheck = await pool.query(
      `SELECT 1 FROM ppm_contract_renewal_sent WHERE contract_id = $1 AND phase = $2 AND target_date = $3`,
      [row.contract_id, phase, due],
    );
    if ((sentCheck.rowCount ?? 0) > 0) {
      taskSkipped++;
      continue;
    }
    const email = row.customer_email?.trim();
    if (!email || !row.created_by) {
      taskSkipped++;
      continue;
    }
    try {
      const emailCfg = await deps.loadEmailSettingsPayload(row.created_by);
      const subject = `${emailCfg.company_name || 'WorkPilot'} — PPM due soon: ${row.task_name}`;
      const html = wrapEmailHtml(
        `<p>Hi ${row.customer_name},</p><p>Your scheduled maintenance <strong>${row.task_name}</strong> under contract <strong>${row.contract_title}</strong> is due on <strong>${due}</strong> (${daysLeft} days).</p><p>Please contact us to schedule.</p>`,
        null,
      );
      const from = formatFromHeader(String(emailCfg.from_name ?? ''), String(emailCfg.from_email ?? ''));
      await deps.sendUserEmail(pool, row.created_by, emailCfg, {
        to: email,
        subject,
        html,
        from,
      });
      await pool.query(
        `INSERT INTO ppm_contract_renewal_sent (contract_id, phase, target_date) VALUES ($1, $2, $3)`,
        [row.contract_id, phase, due],
      );
      taskSent++;
    } catch (e) {
      errors.push(`task ${row.task_id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    contract_renewals: { sent: renewalSent, skipped: renewalSkipped },
    task_reminders: { sent: taskSent, skipped: taskSkipped },
    errors,
  };
}
