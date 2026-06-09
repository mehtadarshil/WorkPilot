import '../../data/models/open_job_summary.dart';

String formatJobSchedule(OpenJobSummary j) {
  final iso = j.scheduleStart;
  if (iso != null && iso.isNotEmpty) {
    final d = DateTime.tryParse(iso);
    if (d != null) {
      final local = d.toLocal();
      final dd = local.day.toString().padLeft(2, '0');
      final mm = local.month.toString().padLeft(2, '0');
      final yyyy = local.year;
      final hh = local.hour.toString().padLeft(2, '0');
      final min = local.minute.toString().padLeft(2, '0');
      return '$dd/$mm/$yyyy · $hh:$min';
    }
  }

  final sdIso = j.startDate;
  final dlIso = j.deadline;
  String? sdStr;
  String? dlStr;
  if (sdIso != null && sdIso.isNotEmpty) {
    final d = DateTime.tryParse(sdIso);
    if (d != null) {
      final local = d.toLocal();
      sdStr = '${local.day.toString().padLeft(2, '0')}/${local.month.toString().padLeft(2, '0')}/${local.year}';
    }
  }
  if (dlIso != null && dlIso.isNotEmpty) {
    final d = DateTime.tryParse(dlIso);
    if (d != null) {
      final local = d.toLocal();
      dlStr = '${local.day.toString().padLeft(2, '0')}/${local.month.toString().padLeft(2, '0')}/${local.year}';
    }
  }
  if (sdStr != null && dlStr != null) {
    return 'Start: $sdStr · Deadline: $dlStr';
  } else if (sdStr != null) {
    return 'Start: $sdStr';
  } else if (dlStr != null) {
    return 'Deadline: $dlStr';
  }
  return 'Not scheduled';
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
