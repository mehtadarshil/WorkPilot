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
  'closed',
];

String jobStateLabelUi(String s) {
  if (s.isEmpty) return s;
  return s.split('_').map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1)}').join(' ');
}
