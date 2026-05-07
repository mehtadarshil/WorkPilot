import type { Pool } from 'pg';
import {
  normalizeCompletedServiceItemsForDb,
  utcDateOnlyFromDate,
  addCalendarInterval,
  SERVICE_REMINDER_INTERVAL_UNITS,
  SERVICE_REMINDER_EARLY_UNITS,
  resolveServiceReminderRecipientEmail,
  SERVICE_REMINDER_RECIPIENT_MODES,
} from './serviceReminderHelpers';

type ChecklistRow = {
  name: string;
  reminder_interval_n: number | null;
  reminder_interval_unit: string | null;
  reminder_early_n: number | null;
  reminder_early_unit: string | null;
  customer_reminder_weeks_before: number | null;
};

export type CustomerServiceReminderScheduleLine = {
  job_id: number;
  job_title: string | null;
  job_state: string;
  service_name: string;
  remind_email: boolean;
  checklist_matched: boolean;
  next_renewal_due_date: string | null;
  early_window_starts: string | null;
  active_phase: 'none' | 'early' | 'due';
  early_reminder_sent: boolean;
  due_reminder_sent: boolean;
  would_send_today: boolean;
  recipient_preview: string | null;
  block_reason: string | null;
};

export type CustomerServiceReminderScheduleResponse = {
  customer_id: number;
  customer_reminders_enabled: boolean;
  tenant_automated_enabled: boolean;
  tenant_recipient_mode: string;
  customer_recipient_mode: string | null;
  customer_custom_reminder_email: string | null;
  lines: CustomerServiceReminderScheduleLine[];
  open_service_jobs: { id: number; title: string | null; state: string }[];
  hints: string[];
};

export async function getCustomerServiceReminderSchedule(
  pool: Pool,
  opts: { customerId: number; tenantUserId: number },
): Promise<CustomerServiceReminderScheduleResponse | null> {
  const { customerId, tenantUserId } = opts;

  const cust = await pool.query<{
    id: number;
    service_reminders_enabled: boolean | null;
    email: string | null;
    service_reminder_custom_email: string | null;
    service_reminder_recipient_mode: string | null;
  }>(
    `SELECT id, service_reminders_enabled, email, service_reminder_custom_email, service_reminder_recipient_mode
     FROM customers WHERE id = $1 AND created_by = $2`,
    [customerId, tenantUserId],
  );
  if ((cust.rowCount ?? 0) === 0) return null;
  const c = cust.rows[0]!;

  const settingsRes = await pool.query<{ automated_enabled: boolean; recipient_mode: string | null }>(
    `SELECT automated_enabled, recipient_mode FROM service_reminder_settings WHERE created_by = $1`,
    [tenantUserId],
  );
  const settingsRow = settingsRes.rows[0];
  const tenantAutomated = settingsRow ? settingsRow.automated_enabled !== false : true;
  const tenantMode = SERVICE_REMINDER_RECIPIENT_MODES.has(settingsRow?.recipient_mode || '')
    ? settingsRow!.recipient_mode!
    : 'customer_account';

  const checklistRes = await pool.query<ChecklistRow>(
    `SELECT name, reminder_interval_n, reminder_interval_unit, reminder_early_n, reminder_early_unit,
            customer_reminder_weeks_before
     FROM service_checklist_items WHERE created_by = $1 AND is_active = true`,
    [tenantUserId],
  );
  const checklistByKey = new Map<string, ChecklistRow>();
  for (const row of checklistRes.rows) {
    checklistByKey.set(row.name.trim().toLowerCase(), row);
  }

  const today = utcDateOnlyFromDate(new Date());

  const jobsRes = await pool.query<{
    id: number;
    title: string | null;
    state: string;
    expected_completion: Date;
    completed_service_items: unknown;
    job_contact_id: number | null;
  }>(
    `SELECT j.id, j.title, j.state, j.expected_completion, j.completed_service_items, j.job_contact_id
     FROM jobs j
     WHERE j.customer_id = $1 AND j.created_by = $2
       AND j.is_service_job = true
       AND j.expected_completion IS NOT NULL
       AND j.state IN ('completed', 'closed')
     ORDER BY j.expected_completion DESC`,
    [customerId, tenantUserId],
  );

  const openRes = await pool.query<{ id: number; title: string | null; state: string }>(
    `SELECT id, title, state FROM jobs
     WHERE customer_id = $1 AND created_by = $2 AND is_service_job = true
       AND state NOT IN ('completed', 'closed')
     ORDER BY id DESC LIMIT 8`,
    [customerId, tenantUserId],
  );

  const lines: CustomerServiceReminderScheduleLine[] = [];
  const hints: string[] = [];

  if (checklistByKey.size === 0) {
    hints.push(
      'No active service types are configured. Add them under Settings → Job descriptions → Service checklist.',
    );
  }
  if (c.service_reminders_enabled === false) {
    hints.push(
      'This customer has "Service renewal reminders" turned off — no automated emails are sent for them.',
    );
  }
  if (!tenantAutomated) {
    hints.push('Your organisation has switched off automated service reminder emails (Settings → Service renewal reminders).');
  }

  const customTrim = (c.service_reminder_custom_email ?? '').trim() || null;

  for (const job of jobsRes.rows) {
    const items = normalizeCompletedServiceItemsForDb(job.completed_service_items);
    const anchor = new Date(job.expected_completion);
    if (Number.isNaN(anchor.getTime())) continue;

    for (const svc of items) {
      if (!svc.remind_email) {
        lines.push({
          job_id: job.id,
          job_title: job.title,
          job_state: job.state,
          service_name: svc.name,
          remind_email: false,
          checklist_matched: false,
          next_renewal_due_date: null,
          early_window_starts: null,
          active_phase: 'none',
          early_reminder_sent: false,
          due_reminder_sent: false,
          would_send_today: false,
          recipient_preview: null,
          block_reason: 'Remind by email is off for this service on the completed job.',
        });
        continue;
      }

      const ck = checklistByKey.get(svc.name.trim().toLowerCase());
      if (!ck) {
        lines.push({
          job_id: job.id,
          job_title: job.title,
          job_state: job.state,
          service_name: svc.name,
          remind_email: true,
          checklist_matched: false,
          next_renewal_due_date: null,
          early_window_starts: null,
          active_phase: 'none',
          early_reminder_sent: false,
          due_reminder_sent: false,
          would_send_today: false,
          recipient_preview: null,
          block_reason: `No checklist row named "${svc.name}". The name must match exactly (Settings → Job descriptions).`,
        });
        continue;
      }

      let intervalN = ck.reminder_interval_n != null ? Math.trunc(Number(ck.reminder_interval_n)) : 1;
      let intervalU = (ck.reminder_interval_unit || 'years').trim().toLowerCase();
      if (!Number.isFinite(intervalN) || intervalN < 1) intervalN = 1;
      if (!SERVICE_REMINDER_INTERVAL_UNITS.has(intervalU)) intervalU = 'years';

      let earlyN = ck.reminder_early_n != null ? Math.trunc(Number(ck.reminder_early_n)) : 14;
      let earlyU = (ck.reminder_early_unit || 'days').trim().toLowerCase();
      if (!Number.isFinite(earlyN) || earlyN < 1) earlyN = 14;
      if (!SERVICE_REMINDER_EARLY_UNITS.has(earlyU)) earlyU = 'days';

      const anchorDay = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate()));
      let nextDue = addCalendarInterval(anchorDay, intervalN, intervalU);
      const todayD = new Date(`${today}T00:00:00.000Z`);
      while (nextDue.getTime() < todayD.getTime()) {
        nextDue = addCalendarInterval(nextDue, intervalN, intervalU);
      }
      const renewalYmd = utcDateOnlyFromDate(nextDue);
      const weeksBefore =
        ck.customer_reminder_weeks_before != null ? Math.trunc(Number(ck.customer_reminder_weeks_before)) : NaN;
      const earlyStart =
        Number.isFinite(weeksBefore) && weeksBefore >= 1 && weeksBefore <= 52
          ? addCalendarInterval(nextDue, -weeksBefore, 'weeks')
          : addCalendarInterval(nextDue, -earlyN, earlyU);
      const earlyStartYmd = utcDateOnlyFromDate(earlyStart);

      const inEarlyWindow = today >= earlyStartYmd && today < renewalYmd;
      const inDueWindow = today >= renewalYmd;

      let phase: 'early' | 'due' | null = null;
      if (inEarlyWindow) phase = 'early';
      else if (inDueWindow) phase = 'due';

      const sentEarly = await pool.query(
        `SELECT 1 FROM service_reminder_sent
         WHERE job_id = $1 AND service_name = $2 AND phase = 'early' AND renewal_due_date = $3`,
        [job.id, svc.name, renewalYmd],
      );
      const sentDue = await pool.query(
        `SELECT 1 FROM service_reminder_sent
         WHERE job_id = $1 AND service_name = $2 AND phase = 'due' AND renewal_due_date = $3`,
        [job.id, svc.name, renewalYmd],
      );

      const early_reminder_sent = (sentEarly.rowCount ?? 0) > 0;
      const due_reminder_sent = (sentDue.rowCount ?? 0) > 0;

      const modeRaw = (c.service_reminder_recipient_mode ?? '').trim();
      const effectiveMode = SERVICE_REMINDER_RECIPIENT_MODES.has(modeRaw) ? modeRaw : tenantMode;

      const recipient_preview =
        customTrim ||
        (await resolveServiceReminderRecipientEmail(
          pool,
          customerId,
          c.email,
          job.job_contact_id,
          effectiveMode,
        ));

      let block_reason: string | null = null;
      let would_send_today = false;
      if (c.service_reminders_enabled === false) block_reason = 'Customer opted out of service reminders.';
      else if (!tenantAutomated) block_reason = 'Organisation automation is off.';
      else if (!phase) block_reason = `Next window opens ${earlyStartYmd} (early) or on/after ${renewalYmd} (due).`;
      else if (phase === 'early' && early_reminder_sent) block_reason = 'Early reminder for this renewal cycle was already sent.';
      else if (phase === 'due' && due_reminder_sent) block_reason = 'Due reminder for this renewal cycle was already sent.';
      else if (!recipient_preview)
        block_reason =
          'No recipient email (set account email, job contact, primary contact, or a custom reminder address on this customer).';
      else {
        would_send_today = true;
        block_reason = null;
      }

      lines.push({
        job_id: job.id,
        job_title: job.title,
        job_state: job.state,
        service_name: svc.name,
        remind_email: true,
        checklist_matched: true,
        next_renewal_due_date: renewalYmd,
        early_window_starts: earlyStartYmd,
        active_phase: phase ?? 'none',
        early_reminder_sent,
        due_reminder_sent,
        would_send_today,
        recipient_preview,
        block_reason,
      });
    }
  }

  return {
    customer_id: customerId,
    customer_reminders_enabled: c.service_reminders_enabled !== false,
    tenant_automated_enabled: tenantAutomated,
    tenant_recipient_mode: tenantMode,
    customer_recipient_mode: c.service_reminder_recipient_mode,
    customer_custom_reminder_email: customTrim,
    lines,
    open_service_jobs: openRes.rows,
    hints,
  };
}
