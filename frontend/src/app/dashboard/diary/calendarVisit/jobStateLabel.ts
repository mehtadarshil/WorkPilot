import { POST_REPORT_JOB_STAGES } from '../../jobs/postReportJobStages';

const JOB_STATE_LABELS: Record<string, string> = {
  draft: 'Draft',
  created: 'Created',
  unscheduled: 'Unscheduled',
  scheduled: 'Scheduled',
  assigned: 'Assigned',
  rescheduled: 'Rescheduled',
  dispatched: 'Dispatched',
  in_progress: 'In progress',
  paused: 'Paused',
  completed: 'Completed',
  need_to_be_rescheduled: 'Need rescheduling',
  parts_need_ordering: 'Parts need ordering',
  awaiting_parts_delivery: 'Awaiting parts delivery',
  closed: 'Closed',
};

/** Human-readable job pipeline status for calendar chips. */
export function formatJobStateLabel(state: string | null | undefined): string {
  const raw = (state ?? '').trim().toLowerCase();
  if (!raw) return 'Unknown';
  const post = POST_REPORT_JOB_STAGES.find((p) => p.state === raw);
  if (post) return post.label;
  return JOB_STATE_LABELS[raw] ?? raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
