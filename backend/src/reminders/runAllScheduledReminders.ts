import type { Pool } from 'pg';
import { runJobOfficeTaskReminderEmails, type JobOfficeTaskReminderDeps } from './runJobOfficeTaskReminders';
import { runStaffReminderEmails } from './runStaffReminderEmails';
import { runSiteReportRenewalReminderEmails } from './runSiteReportRenewalReminderEmails';
import { runPpmContractReminders } from './runPpmContractReminders';
import { runPpmAutoCreateJobs } from '../ppmContracts/service';

export type ScheduledReminderDeps = JobOfficeTaskReminderDeps & {
  runServiceCustomerReminders: (pool: Pool) => Promise<{ sent: number; skipped: number; errors: string[] }>;
};

/** Runs service renewal emails, site report renewal emails, job office-task reminder emails, staff reminder emails, and PPM contract reminders. */
export async function runAllScheduledReminders(pool: Pool, deps: ScheduledReminderDeps) {
  const service_reminders = await deps.runServiceCustomerReminders(pool);
  const site_report_renewals = await runSiteReportRenewalReminderEmails(pool, deps);
  const job_office_task_reminders = await runJobOfficeTaskReminderEmails(pool, deps);
  const staff_reminders = await runStaffReminderEmails(pool, deps);
  const ppm_contract_reminders = await runPpmContractReminders(pool, deps);
  const ppm_auto_jobs = await runPpmAutoCreateJobs(pool);
  return {
    service_reminders,
    site_report_renewals,
    job_office_task_reminders,
    staff_reminders,
    ppm_contract_reminders,
    ppm_auto_jobs,
  };
}
