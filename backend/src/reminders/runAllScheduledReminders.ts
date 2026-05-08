import type { Pool } from 'pg';
import { runJobOfficeTaskReminderEmails, type JobOfficeTaskReminderDeps } from './runJobOfficeTaskReminders';
import { runStaffReminderEmails } from './runStaffReminderEmails';
import { runSiteReportRenewalReminderEmails } from './runSiteReportRenewalReminderEmails';

export type ScheduledReminderDeps = JobOfficeTaskReminderDeps & {
  runServiceCustomerReminders: (pool: Pool) => Promise<{ sent: number; skipped: number; errors: string[] }>;
};

/** Runs service renewal emails, site report renewal emails, job office-task reminder emails, and staff reminder emails. */
export async function runAllScheduledReminders(pool: Pool, deps: ScheduledReminderDeps) {
  const service_reminders = await deps.runServiceCustomerReminders(pool);
  const site_report_renewals = await runSiteReportRenewalReminderEmails(pool, deps);
  const job_office_task_reminders = await runJobOfficeTaskReminderEmails(pool, deps);
  const staff_reminders = await runStaffReminderEmails(pool, deps);
  return {
    service_reminders,
    site_report_renewals,
    job_office_task_reminders,
    staff_reminders,
  };
}
