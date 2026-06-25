/** Allowed `jobs.state` after diary job report submit — must match backend POST_REPORT_NEXT_JOB_STATES. */
export const POST_REPORT_JOB_STAGES = [
  {
    state: 'unscheduled',
    label: 'Needs scheduling',
    description: 'Job goes back to the scheduling queue for a new date.',
  },
  {
    state: 'scheduled',
    label: 'Scheduled',
    description: 'Job stays on the calendar as scheduled for follow-up work.',
  },
  {
    state: 'rescheduled',
    label: 'Needs rescheduling',
    description: 'Office will pick a new appointment time.',
  },
  {
    state: 'paused',
    label: 'Parts required',
    description: 'Job is paused while parts are ordered or collected.',
  },
  {
    state: 'created',
    label: 'Follow up quote required',
    description: 'Returned to office for pricing or a revised quote.',
  },
  {
    state: 'in_progress',
    label: 'Schedule second visit',
    description: 'More work is needed on site; office can book another visit.',
  },
  {
    state: 'completed',
    label: 'Ready for invoicing',
    description: 'Job is finished; a draft invoice is created when possible.',
  },
  {
    state: 'need_to_be_rescheduled',
    label: 'Need to be rescheduling',
    description: 'Office will pick a new appointment time.',
  },
  {
    state: 'parts_need_ordering',
    label: 'Parts need ordering',
    description: 'Job is paused as parts need to be ordered.',
  },
  {
    state: 'awaiting_parts_delivery',
    label: 'Awaiting parts delivery',
    description: 'Job is waiting for the delivery of ordered parts.',
  },
] as const;

export type PostReportJobState = (typeof POST_REPORT_JOB_STAGES)[number]['state'];
