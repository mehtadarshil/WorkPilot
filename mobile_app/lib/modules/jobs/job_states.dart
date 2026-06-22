/// Matches web `JOB_STATES` on dashboard jobs.
const kJobStatesOrdered = <String>[
  'draft',
  'created',
  'unscheduled',
  'scheduled',
  'assigned',
  'rescheduled',
  'dispatched',
  'in_progress',
  'paused',
  'completed',
  'need_to_be_rescheduled',
  'closed',
];

String jobStateLabelUi(String s) {
  if (s.isEmpty) return s;
  if (s == 'need_to_be_rescheduled') return 'Need to be rescheduling';
  return s.split('_').map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1)}').join(' ');
}
