import '../../data/models/open_job_summary.dart';

String formatJobSchedule(OpenJobSummary j) {
  final iso = j.scheduleStart;
  if (iso == null || iso.isEmpty) return 'Not scheduled';
  final d = DateTime.tryParse(iso);
  if (d == null) return iso;
  final local = d.toLocal();
  final dd = local.day.toString().padLeft(2, '0');
  final mm = local.month.toString().padLeft(2, '0');
  final yyyy = local.year;
  final hh = local.hour.toString().padLeft(2, '0');
  final min = local.minute.toString().padLeft(2, '0');
  return '$dd/$mm/$yyyy · $hh:$min';
}

String formatJobState(String state) {
  if (state.isEmpty) return state;
  return state
      .split('_')
      .map(
        (w) => w.isEmpty
            ? w
            : '${w[0].toUpperCase()}${w.substring(1).toLowerCase()}',
      )
      .join(' ');
}

String? formatDurationMinutes(int? m) {
  if (m == null || m <= 0) return null;
  if (m < 60) return '${m}m';
  final h = m ~/ 60;
  final r = m % 60;
  if (r == 0) return '${h}h';
  return '${h}h ${r}m';
}
