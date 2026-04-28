/// Mirrors backend [normalizeDiaryStatusForTimesheet] for optimistic timesheet UI when offline.
String? normalizedDiaryTimesheetStatus(String? raw) {
  final s = (raw ?? '').trim().toLowerCase().replaceAll(RegExp(r'\s+'), '_');
  if (s.isEmpty) return null;
  if (s == 'completed') return 'completed';
  if (s == 'cancelled' || s == 'aborted') return 'cancelled';
  if (s == 'travelling_to_site' ||
      s == 'travelling' ||
      s == 'traveling_to_site' ||
      s == 'traveling') {
    return 'travelling_to_site';
  }
  if (s == 'arrived_at_site' || s == 'arrived') return 'arrived_at_site';
  return null;
}

/// Human label for the active segment after a diary status change (matches [ActiveTimesheet.segmentLabel]).
String optimisticSegmentLabelForDiaryStatus(String? rawStatus) {
  final n = normalizedDiaryTimesheetStatus(rawStatus);
  switch (n) {
    case 'travelling_to_site':
      return 'Travelling to site';
    case 'arrived_at_site':
      return 'On site';
    default:
      return '';
  }
}

bool diaryStatusClosesTimesheet(String? rawStatus) {
  final n = normalizedDiaryTimesheetStatus(rawStatus);
  return n == 'completed' || n == 'cancelled';
}

bool diaryStatusOpensTravelling(String? rawStatus) =>
    normalizedDiaryTimesheetStatus(rawStatus) == 'travelling_to_site';

bool diaryStatusOpensOnSite(String? rawStatus) =>
    normalizedDiaryTimesheetStatus(rawStatus) == 'arrived_at_site';
