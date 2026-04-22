/// Maps UI labels to `jobs.state` after job report submit (aligned with web PATCH job state).
class PostReportJobStage {
  const PostReportJobStage({
    required this.label,
    required this.state,
    required this.description,
  });

  final String label;
  final String state;
  final String description;
}

const List<PostReportJobStage> kPostReportJobStages = [
  PostReportJobStage(
    label: 'Needs scheduling',
    state: 'unscheduled',
    description: 'Job goes back to the scheduling queue for a new date.',
  ),
  PostReportJobStage(
    label: 'Scheduled',
    state: 'scheduled',
    description: 'Job stays on the calendar as scheduled for follow-up work.',
  ),
  PostReportJobStage(
    label: 'Needs rescheduling',
    state: 'rescheduled',
    description: 'Office will pick a new appointment time.',
  ),
  PostReportJobStage(
    label: 'Parts required',
    state: 'paused',
    description: 'Job is paused while parts are ordered or collected.',
  ),
  PostReportJobStage(
    label: 'Follow up quote required',
    state: 'created',
    description: 'Returned to office for pricing or a revised quote.',
  ),
  PostReportJobStage(
    label: 'Schedule second visit',
    state: 'in_progress',
    description: 'More work is needed on site; office can book another visit.',
  ),
  PostReportJobStage(
    label: 'Ready for invoicing',
    state: 'completed',
    description: 'Job is finished; a draft invoice is created when possible.',
  ),
];
