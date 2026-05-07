import type { Pool } from 'pg';
import type { EmailSettingsPayload } from '../emailHelpers';
import { wrapEmailHtml, formatFromHeader, createMailTransport } from '../emailHelpers';
import type { JobOfficeTaskReminderDeps } from './runJobOfficeTaskReminders';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function collectTenantAdminEmails(pool: Pool, tenantUserId: number): Promise<string[]> {
  const r = await pool.query<{ email: string }>(
    `SELECT DISTINCT TRIM(email) AS email FROM users
     WHERE role = 'ADMIN'
       AND (id = $1 OR tenant_admin_id = $1)
       AND COALESCE(TRIM(email), '') <> ''`,
    [tenantUserId],
  );
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of r.rows) {
    const e = (row.email ?? '').trim();
    if (!e) continue;
    const k = e.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

function parseExtraEmails(raw: string | null | undefined): string[] {
  if (!raw || !String(raw).trim()) return [];
  const parts = String(raw).split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    if (!p.includes('@')) continue;
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

/** Email all tenant ADMIN users (+ optional extras) when officer_staff_reminders.notify_at is due. */
export async function runStaffReminderEmails(
  pool: Pool,
  deps: JobOfficeTaskReminderDeps,
): Promise<{ sent: number; errors: string[] }> {
  const errors: string[] = [];
  let sent = 0;

  const rows = await pool.query<{
    id: number;
    officer_id: number;
    reminder_message: string;
    due_date: string;
    notify_at: string;
    extra_notify_emails: string | null;
    created_by: number | null;
    officer_name: string | null;
  }>(
    `SELECT sr.id, sr.officer_id, sr.reminder_message, sr.due_date::text AS due_date, sr.notify_at::text AS notify_at,
            sr.extra_notify_emails, sr.created_by, o.full_name AS officer_name
     FROM officer_staff_reminders sr
     INNER JOIN officers o ON o.id = sr.officer_id
     WHERE sr.last_notified_at IS NULL
       AND sr.notify_at <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date
       AND sr.created_by IS NOT NULL`,
  );

  const emailCfgCache = new Map<number, Record<string, unknown>>();

  for (const row of rows.rows) {
    const tenantId = row.created_by;
    if (tenantId == null) continue;
    try {
      let emailCfg = emailCfgCache.get(tenantId);
      if (!emailCfg) {
        emailCfg = await deps.loadEmailSettingsPayload(tenantId);
        emailCfgCache.set(tenantId, emailCfg);
      }
      const cfg = emailCfg as EmailSettingsPayload & { smtp_password_set?: boolean };
      const fromEmail = typeof cfg.from_email === 'string' ? cfg.from_email.trim() : '';
      const canSend =
        !!fromEmail &&
        (!!cfg.oauth_provider || (!!cfg.smtp_enabled && !!createMailTransport(cfg)));
      if (!canSend) {
        errors.push(`staff_reminder ${row.id}: no email config for tenant`);
        continue;
      }

      const admins = await collectTenantAdminEmails(pool, tenantId);
      const extras = parseExtraEmails(row.extra_notify_emails);
      const recipients = [...admins];
      for (const x of extras) {
        if (!recipients.some((e) => e.toLowerCase() === x.toLowerCase())) recipients.push(x);
      }
      if (recipients.length === 0) {
        errors.push(`staff_reminder ${row.id}: no recipient emails`);
        continue;
      }

      const officerName = (row.officer_name || 'Team member').trim();
      const subject = `Staff reminder: ${officerName}`;
      const bodyInner = `<p>This is a reminder about <strong>${escapeHtml(officerName)}</strong> (not an email for them unless they were added as extra recipients).</p><p><strong>Message</strong></p><p>${escapeHtml(row.reminder_message).replace(/\n/g, '<br/>')}</p><p><strong>Due date</strong>: ${escapeHtml(row.due_date)}<br/><strong>Notification date</strong>: ${escapeHtml(row.notify_at)}</p>`;
      const html = wrapEmailHtml(bodyInner, (cfg.default_signature_html as string | null) ?? null);
      const from = formatFromHeader(cfg.from_name, cfg.from_email);
      const replyRaw = cfg.reply_to;
      const replyTo = typeof replyRaw === 'string' && replyRaw.trim() ? replyRaw.trim() : undefined;

      const to = recipients[0];
      const bcc = recipients.length > 1 ? recipients.slice(1).join(', ') : undefined;

      await deps.sendUserEmail(pool, tenantId, emailCfg as Record<string, unknown>, {
        from,
        to,
        bcc,
        subject,
        html,
        replyTo,
      });

      await pool.query(
        `UPDATE officer_staff_reminders SET last_notified_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [row.id],
      );
      sent += 1;
    } catch (e) {
      errors.push(`staff_reminder ${row.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { sent, errors };
}
