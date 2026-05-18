/// Mirrors web `serviceJobCompletedItems.formatCompletedServicesForJobDetail`.
String formatCompletedServicesForJobDetail(dynamic raw) {
  if (raw is! List || raw.isEmpty) return 'None selected';
  final parts = <String>[];
  for (final el in raw) {
    if (el is String) {
      final n = el.trim();
      if (n.isNotEmpty) parts.add(n);
    } else if (el is Map) {
      final m = Map<String, dynamic>.from(el);
      final name = (m['name'] as String?)?.trim();
      if (name == null || name.isEmpty) continue;
      final email = m['remind_email'] != false;
      parts.add(email ? name : '$name (no reminder email)');
    }
  }
  return parts.isEmpty ? 'None selected' : parts.join(', ');
}

String diaryStatusNorm(String? s) =>
    (s ?? '').trim().toLowerCase().replaceAll(RegExp(r'\s+'), '_');

bool diaryVisitIsCompleted(String? s) => diaryStatusNorm(s) == 'completed';

bool diaryVisitIsCancelled(String? s) {
  final t = diaryStatusNorm(s);
  return t == 'cancelled' || t == 'aborted';
}

bool diaryVisitIsPositiveProgress(String? s) {
  final t = diaryStatusNorm(s);
  return t == 'completed' ||
      t == 'arrived_at_site' ||
      t == 'arrived' ||
      t == 'travelling_to_site' ||
      t == 'travelling' ||
      t == 'traveling' ||
      t == 'traveling_to_site';
}

bool diaryVisitAllowsDelete(String? s) {
  final t = diaryStatusNorm(s);
  if (t == 'completed') return false;
  if (t == 'cancelled' || t == 'aborted') return true;
  if (t == 'travelling_to_site' ||
      t == 'travelling' ||
      t == 'traveling_to_site' ||
      t == 'traveling' ||
      t == 'arrived_at_site' ||
      t == 'arrived' ||
      t == 'on_site') {
    return false;
  }
  return true;
}
