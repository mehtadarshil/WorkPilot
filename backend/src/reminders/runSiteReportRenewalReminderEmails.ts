import type { Pool } from 'pg';
import {
  applyTemplateVars,
  wrapEmailHtml,
  formatFromHeader,
  createMailTransport,
  type EmailSettingsPayload,
} from '../emailHelpers';
import { ensureCustomerSiteReportCertificateNumber } from '../siteReportPrintHtml';
import {
  utcDateOnlyFromDate,
  addCalendarInterval,
  resolveServiceReminderRecipientEmail,
  SERVICE_REMINDER_RECIPIENT_MODES,
} from './serviceReminderHelpers';

export type SiteReportRenewalReminderDeps = {
  loadEmailSettingsPayload: (userId: number) => Promise<Record<string, unknown>>;
  sendUserEmail: (pool: Pool, userId: number, emailCfg: Record<string, unknown>, opts: Record<string, unknown>) => Promise<void>;
};

/** Ensures row exists for tenants created before this template was added (matches server defaults). */
async function ensureSiteReportRenewalTemplateRow(pool: Pool, userId: number): Promise<void> {
  const subject = '{{company_name}} — Report renewal ({{report_title}})';
  const body =
    '<p>Hi {{customer_name}},</p><p>This is a {{phase_label}} for your <strong>{{report_title}}</strong> (certificate {{certificate_number}}).</p><p>Next renewal due: <strong>{{due_date}}</strong></p><p>Property / site: {{site_address}}</p><p>Billing address: {{customer_address}}</p><p>{{job_line}}</p><p>Please contact us to book your reassessment.</p><p>Kind regards,<br/>{{company_name}}</p>';
  await pool.query(
    `INSERT INTO email_templates (created_by, template_key, name, subject, body_html)
     VALUES ($1, 'site_report_renewal', $2, $3, $4)
     ON CONFLICT (created_by, template_key) DO NOTHING`,
    [userId, 'Site report renewal reminder', subject, body],
  );
}

function formatJoinedAddressLines(parts: (string | null | undefined)[]): string {
  return parts
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter((s) => s.length > 0)
    .join(', ');
}

function dateOnlyFromPg(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getUTCFullYear();
    const m = value.getUTCMonth() + 1;
    const d = value.getUTCDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return null;
}

function siteAddressVars(wa: {
  wa_name: string | null;
  wa_branch_name: string | null;
  wa_line1: string | null;
  wa_line2: string | null;
  wa_line3: string | null;
  wa_town: string | null;
  wa_county: string | null;
  wa_postcode: string | null;
}): Record<string, string> {
  const street = formatJoinedAddressLines([
    wa.wa_line1,
    wa.wa_line2,
    wa.wa_line3,
    wa.wa_town,
    wa.wa_county,
    wa.wa_postcode,
  ]);
  const siteName = (wa.wa_name || '').trim();
  const branch = (wa.wa_branch_name || '').trim();
  const namePart = siteName ? (branch ? `${siteName} (${branch})` : siteName) : '';
  const workAddressLine = namePart && street ? `${namePart} — ${street}` : namePart || street || '';
  return {
    work_address_name: siteName,
    work_address_branch: branch,
    work_address_line_1: (wa.wa_line1 || '').trim(),
    work_address_line_2: (wa.wa_line2 || '').trim(),
    work_address_line_3: (wa.wa_line3 || '').trim(),
    work_address_town: (wa.wa_town || '').trim(),
    work_address_county: (wa.wa_county || '').trim(),
    work_address_postcode: (wa.wa_postcode || '').trim(),
    work_address: workAddressLine,
    site_address: workAddressLine,
  };
}

/** Automated renewal emails for customer site reports (FRA etc.), independent of service jobs. */
export async function runSiteReportRenewalReminderEmails(
  pool: Pool,
  deps: SiteReportRenewalReminderDeps,
): Promise<{ sent: number; skipped: number; errors: string[] }> {
  const today = utcDateOnlyFromDate(new Date());
  const errors: string[] = [];
  let sent = 0;
  let skipped = 0;

  const tenantRows = await pool.query<{ created_by: number }>(
    `SELECT DISTINCT c.created_by AS created_by
     FROM customer_site_reports csr
     INNER JOIN customers c ON c.id = csr.customer_id
     WHERE csr.renewal_reminder_enabled = true
       AND csr.renewal_anchor_date IS NOT NULL
       AND c.created_by IS NOT NULL`,
  );

  for (const { created_by: tenantUserId } of tenantRows.rows) {
    if (!tenantUserId) continue;

    const settingsRes = await pool.query<{
      automated_enabled: boolean;
      recipient_mode: string;
    }>(
      `SELECT automated_enabled, recipient_mode FROM service_reminder_settings WHERE created_by = $1`,
      [tenantUserId],
    );
    const settingsRow = settingsRes.rows[0];
    const automatedEnabled = settingsRow ? settingsRow.automated_enabled !== false : true;
    if (!automatedEnabled) {
      skipped += 1;
      continue;
    }
    const recipientMode = SERVICE_REMINDER_RECIPIENT_MODES.has(settingsRow?.recipient_mode || '')
      ? (settingsRow!.recipient_mode as string)
      : 'customer_account';

    const emailCfg = (await deps.loadEmailSettingsPayload(tenantUserId)) as EmailSettingsPayload;
    const canSend =
      !!String(emailCfg.from_email ?? '').trim() &&
      (!!emailCfg.oauth_provider || (emailCfg.smtp_enabled && !!createMailTransport(emailCfg)));
    if (!canSend) {
      skipped += 1;
      continue;
    }

    await ensureSiteReportRenewalTemplateRow(pool, tenantUserId);

    const tpl = await pool.query<{ subject: string; body_html: string }>(
      `SELECT subject, body_html FROM email_templates WHERE created_by = $1 AND template_key = 'site_report_renewal'`,
      [tenantUserId],
    );
    const tplRow = tpl.rows[0];
    if (!tplRow) {
      errors.push(`tenant ${tenantUserId}: missing site_report_renewal template`);
      continue;
    }

    const invRes = await pool.query<{ company_name: string | null }>(
      `SELECT company_name FROM invoice_settings WHERE created_by = $1`,
      [tenantUserId],
    );
    const companyName = (invRes.rows[0]?.company_name || '').trim() || 'WorkPilot';

    const reportsRes = await pool.query<{
      report_id: number;
      customer_id: number;
      renewal_anchor_date: unknown;
      renewal_interval_years: number | null;
      renewal_early_days: number | null;
      renewal_job_id: number | null;
      report_title: string | null;
      customer_name: string | null;
      customer_email: string | null;
      service_reminders_enabled: boolean;
      service_reminder_custom_email: string | null;
      service_reminder_recipient_mode: string | null;
      customer_phone: string | null;
      customer_landline: string | null;
      customer_contact_mobile: string | null;
      customer_address_line_1: string | null;
      customer_address_line_2: string | null;
      customer_address_line_3: string | null;
      customer_town: string | null;
      customer_county: string | null;
      customer_postcode: string | null;
      customer_contact_surname: string | null;
      wa_name: string | null;
      wa_branch_name: string | null;
      wa_line1: string | null;
      wa_line2: string | null;
      wa_line3: string | null;
      wa_town: string | null;
      wa_county: string | null;
      wa_postcode: string | null;
      job_contact_id: number | null;
      job_title: string | null;
      job_contact_first_name: string | null;
      job_contact_surname: string | null;
    }>(
      `SELECT csr.id AS report_id, csr.customer_id,
              csr.renewal_anchor_date, csr.renewal_interval_years, csr.renewal_early_days, csr.renewal_job_id,
              csr.report_title,
              c.full_name AS customer_name, c.email AS customer_email,
              COALESCE(c.service_reminders_enabled, true) AS service_reminders_enabled,
              c.service_reminder_custom_email,
              c.service_reminder_recipient_mode,
              c.phone AS customer_phone,
              c.landline AS customer_landline,
              c.contact_mobile AS customer_contact_mobile,
              c.address_line_1 AS customer_address_line_1,
              c.address_line_2 AS customer_address_line_2,
              c.address_line_3 AS customer_address_line_3,
              c.town AS customer_town,
              c.county AS customer_county,
              c.postcode AS customer_postcode,
              c.contact_surname AS customer_contact_surname,
              wa.name AS wa_name,
              wa.branch_name AS wa_branch_name,
              wa.address_line_1 AS wa_line1,
              wa.address_line_2 AS wa_line2,
              wa.address_line_3 AS wa_line3,
              wa.town AS wa_town,
              wa.county AS wa_county,
              wa.postcode AS wa_postcode,
              j.job_contact_id AS job_contact_id,
              j.title AS job_title,
              jcc.first_name AS job_contact_first_name,
              jcc.surname AS job_contact_surname
       FROM customer_site_reports csr
       INNER JOIN customers c ON c.id = csr.customer_id
       LEFT JOIN customer_work_addresses wa ON wa.id = csr.work_address_id AND wa.customer_id = csr.customer_id
       LEFT JOIN jobs j ON j.id = csr.renewal_job_id AND j.customer_id = csr.customer_id
       LEFT JOIN customer_contacts jcc ON jcc.id = j.job_contact_id AND jcc.customer_id = csr.customer_id
       WHERE c.created_by = $1
         AND csr.renewal_reminder_enabled = true
         AND csr.renewal_anchor_date IS NOT NULL`,
      [tenantUserId],
    );

    for (const row of reportsRes.rows) {
      if (row.service_reminders_enabled === false) continue;

      const anchorYmd = dateOnlyFromPg(row.renewal_anchor_date);
      if (!anchorYmd) continue;

      let intervalYears =
        row.renewal_interval_years != null ? Math.trunc(Number(row.renewal_interval_years)) : 1;
      if (!Number.isFinite(intervalYears) || intervalYears < 1) intervalYears = 1;
      if (intervalYears > 10) intervalYears = 10;

      let earlyDays = row.renewal_early_days != null ? Math.trunc(Number(row.renewal_early_days)) : 14;
      if (!Number.isFinite(earlyDays) || earlyDays < 1) earlyDays = 14;
      if (earlyDays > 120) earlyDays = 120;

      const anchorDay = new Date(`${anchorYmd}T00:00:00.000Z`);
      if (Number.isNaN(anchorDay.getTime())) continue;

      let nextDue = addCalendarInterval(anchorDay, intervalYears, 'years');
      const todayD = new Date(`${today}T00:00:00.000Z`);
      while (nextDue.getTime() < todayD.getTime()) {
        nextDue = addCalendarInterval(nextDue, intervalYears, 'years');
      }
      const renewalYmd = utcDateOnlyFromDate(nextDue);
      const earlyStart = addCalendarInterval(nextDue, -earlyDays, 'days');
      const earlyStartYmd = utcDateOnlyFromDate(earlyStart);

      const inEarlyWindow = today >= earlyStartYmd && today < renewalYmd;
      const inDueWindow = today >= renewalYmd;
      let phase: 'early' | 'due' | null = null;
      if (inEarlyWindow) phase = 'early';
      else if (inDueWindow) phase = 'due';
      if (!phase) continue;

      const dup = await pool.query(
        `SELECT 1 FROM customer_site_report_renewal_sent
         WHERE report_id = $1 AND phase = $2 AND renewal_due_date = $3`,
        [row.report_id, phase, renewalYmd],
      );
      if ((dup.rowCount ?? 0) > 0) continue;

      const modeRaw = (row.service_reminder_recipient_mode ?? '').trim();
      const effectiveRecipientMode = SERVICE_REMINDER_RECIPIENT_MODES.has(modeRaw) ? modeRaw : recipientMode;

      const jobContactForResolve = row.job_contact_id != null ? row.job_contact_id : null;

      let toEmail = (row.service_reminder_custom_email ?? '').trim();
      if (!toEmail) {
        toEmail =
          (await resolveServiceReminderRecipientEmail(
            pool,
            row.customer_id,
            row.customer_email,
            jobContactForResolve,
            effectiveRecipientMode,
          )) || '';
      }
      if (!toEmail) continue;

      const phaseLabel =
        phase === 'early' ? 'friendly reminder' : 'reminder that your site report renewal is now due';
      const dueDisplay = nextDue.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      });
      const nameWords = (row.customer_name || '').trim().split(/\s+/).filter(Boolean);
      const customerSurname =
        (row.customer_contact_surname || '').trim() ||
        (nameWords.length > 1 ? nameWords[nameWords.length - 1]! : '');
      const jobContactDisplay = [row.job_contact_first_name, row.job_contact_surname]
        .map((x) => (x ?? '').trim())
        .filter(Boolean)
        .join(' ');
      const customerTel =
        (row.customer_landline || '').trim() || (row.customer_phone || '').trim() || (row.customer_contact_mobile || '').trim();
      const customerMobile = (row.customer_contact_mobile || '').trim() || (row.customer_phone || '').trim();
      const bookingPortal = (process.env.WORKPILOT_CUSTOMER_PORTAL_URL || '').trim();
      const customerAddressLine = formatJoinedAddressLines([
        row.customer_address_line_1,
        row.customer_address_line_2,
        row.customer_address_line_3,
        row.customer_town,
        row.customer_county,
        row.customer_postcode,
      ]);
      const siteVars = siteAddressVars(row);
      const reportTitle = (row.report_title || '').trim() || 'Site report';
      const cert = (await ensureCustomerSiteReportCertificateNumber(pool, row.report_id)).trim();
      const jobTitleTrim = (row.job_title || '').trim();
      const jobLine =
        row.renewal_job_id != null && (jobTitleTrim || row.renewal_job_id)
          ? `Linked job: ${jobTitleTrim || 'Job'} (#${row.renewal_job_id}).`
          : '';

      const vars: Record<string, string> = {
        company_name: companyName,
        customer_name: (row.customer_name || 'there').trim(),
        customer_surname: customerSurname,
        customer_account_no: String(row.customer_id),
        customer_email: (row.customer_email || '').trim(),
        customer_telephone: customerTel,
        customer_mobile: customerMobile,
        customer_address: customerAddressLine,
        customer_address_line_1: (row.customer_address_line_1 || '').trim(),
        customer_address_line_2: (row.customer_address_line_2 || '').trim(),
        customer_address_line_3: (row.customer_address_line_3 || '').trim(),
        customer_town: (row.customer_town || '').trim(),
        customer_county: (row.customer_county || '').trim(),
        customer_postcode: (row.customer_postcode || '').trim(),
        customer_advertising: '',
        service_name: reportTitle,
        service_reminder_name: reportTitle,
        service_contact: jobContactDisplay,
        service_reminder_booking_portal_url: bookingPortal,
        job_title: jobTitleTrim,
        job_id: row.renewal_job_id != null ? String(row.renewal_job_id) : '',
        job_line: jobLine,
        due_date: dueDisplay,
        service_due_date: dueDisplay,
        phase_label: phaseLabel,
        report_title: reportTitle,
        certificate_number: cert,
        ...siteVars,
      };

      const subject = applyTemplateVars(tplRow.subject, vars);
      const bodyInner = applyTemplateVars(tplRow.body_html, vars);
      const html = wrapEmailHtml(bodyInner, (emailCfg.default_signature_html as string) || '');
      const from = formatFromHeader(String(emailCfg.from_name ?? ''), String(emailCfg.from_email ?? ''));

      try {
        await deps.sendUserEmail(pool, tenantUserId, emailCfg, {
          from,
          to: toEmail,
          subject,
          html,
          replyTo: emailCfg.reply_to,
        });
        await pool.query(
          `INSERT INTO customer_site_report_renewal_sent (report_id, phase, renewal_due_date, tenant_user_id)
           VALUES ($1, $2, $3, $4)`,
          [row.report_id, phase, renewalYmd, tenantUserId],
        );
        const commObjectType = row.renewal_job_id != null ? 'job' : 'customer';
        const commObjectId = row.renewal_job_id != null ? row.renewal_job_id : row.customer_id;
        await pool.query(
          `INSERT INTO customer_communications
            (customer_id, record_type, subject, message, status, to_value, object_type, object_id, created_by)
           VALUES ($1, 'email', $2, $3, 'sent', $4, $5, $6, $7)`,
          [row.customer_id, subject, bodyInner, toEmail, commObjectType, commObjectId, tenantUserId],
        );
        sent += 1;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`site report ${row.report_id} / ${phase}: ${msg}`);
      }
    }
  }

  return { sent, skipped, errors };
}
