import type { Pool } from 'pg';
import { wrapEmailHtml, formatFromHeader, createMailTransport } from '../emailHelpers';

export type JobOfficeTaskReminderDeps = {
  loadEmailSettingsPayload: (userId: number) => Promise<Record<string, unknown>>;
  sendUserEmail: (pool: Pool, userId: number, emailCfg: Record<string, unknown>, opts: Record<string, unknown>) => Promise<void>;
};

/** Email assignees when a job office task reminder date is due (UTC date). One send per task (reminder_sent_at). */
export async function runJobOfficeTaskReminderEmails(
  pool: Pool,
  deps: JobOfficeTaskReminderDeps,
): Promise<{ sent: number; errors: string[] }> {
  const errors: string[] = [];
  let sent = 0;

  const rows = await pool.query<{
    id: number;
    job_id: number;
    description: string;
    reminder_at: Date;
    tenant_user_id: number | null;
    job_title: string | null;
    assignee_email: string | null;
    assignee_name: string | null;
  }>(
    `SELECT ot.id, ot.job_id, ot.description, ot.reminder_at,
            j.created_by AS tenant_user_id, j.title AS job_title,
            TRIM(o.email) AS assignee_email, o.full_name AS assignee_name
     FROM office_tasks ot
     INNER JOIN jobs j ON j.id = ot.job_id
     INNER JOIN officers o ON o.id = ot.assignee_officer_id
     WHERE ot.completed = false
       AND ot.reminder_at IS NOT NULL
       AND ot.reminder_sent_at IS NULL
       AND (ot.reminder_at AT TIME ZONE 'UTC')::date <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date
       AND COALESCE(TRIM(o.email), '') <> ''
       AND j.created_by IS NOT NULL`,
  );

  const seenTenant = new Set<number>();
  const emailCfgCache = new Map<number, Record<string, unknown>>();

  for (const row of rows.rows) {
    const tenantId = row.tenant_user_id;
    if (tenantId == null) continue;
    try {
      let emailCfg = emailCfgCache.get(tenantId);
      if (!seenTenant.has(tenantId)) {
        emailCfg = await deps.loadEmailSettingsPayload(tenantId);
        emailCfgCache.set(tenantId, emailCfg);
        seenTenant.add(tenantId);
      } else {
        emailCfg = emailCfgCache.get(tenantId)!;
      }
      const fromEmail = typeof emailCfg.from_email === 'string' ? emailCfg.from_email.trim() : '';
      const canSend =
        !!fromEmail &&
        (!!emailCfg.oauth_provider || (!!emailCfg.smtp_enabled && !!createMailTransport(emailCfg as never)));
      if (!canSend) continue;

      const to = (row.assignee_email ?? '').trim();
      if (!to) continue;

      const who = (row.assignee_name || 'there').trim();
      const jobTitle = (row.job_title || 'Job').trim();
      const subject = `Reminder: ${jobTitle} (#${row.job_id})`;
      const bodyInner = `<p>Hi ${who},</p><p>You have a job reminder:</p><p><strong>${escapeHtml(row.description)}</strong></p><p>Job: ${escapeHtml(jobTitle)} (#${row.job_id})<br/>Reminder date: ${row.reminder_at.toISOString().slice(0, 10)} (UTC)</p>`;
      const html = wrapEmailHtml(bodyInner, (emailCfg.default_signature_html as string | null) ?? null);
      const from = formatFromHeader(
        (emailCfg.from_name as string | null) ?? null,
        (emailCfg.from_email as string | null) ?? '',
      );

      const replyRaw = emailCfg.reply_to;
      const replyTo = typeof replyRaw === 'string' && replyRaw.trim() ? replyRaw.trim() : undefined;
      await deps.sendUserEmail(pool, tenantId, emailCfg, {
        from,
        to,
        subject,
        html,
        replyTo,
      });

      await pool.query(`UPDATE office_tasks SET reminder_sent_at = NOW(), updated_at = NOW() WHERE id = $1`, [row.id]);
      sent += 1;
    } catch (e) {
      errors.push(`office_task ${row.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { sent, errors };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
