import type { Pool } from 'pg';
import { runJobOfficeTaskReminderEmails, type JobOfficeTaskReminderDeps } from './runJobOfficeTaskReminders';
import { runStaffReminderEmails } from './runStaffReminderEmails';

export type ScheduledReminderDeps = JobOfficeTaskReminderDeps & {
  runServiceCustomerReminders: (pool: Pool) => Promise<{ sent: number; skipped: number; errors: string[] }>;
};

/** Runs service renewal emails, job office-task reminder emails, and staff reminder emails. */
export async function runAllScheduledReminders(pool: Pool, deps: ScheduledReminderDeps) {
  const service_reminders = await deps.runServiceCustomerReminders(pool);
  const job_office_task_reminders = await runJobOfficeTaskReminderEmails(pool, deps);
  const staff_reminders = await runStaffReminderEmails(pool, deps);
  return {
    service_reminders,
    job_office_task_reminders,
    staff_reminders,
  };
}
