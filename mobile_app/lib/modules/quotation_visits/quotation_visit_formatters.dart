/// Date/time and status formatting aligned with web quotation visit detail.
abstract class QuotationVisitFormatters {
  static String formatDateTime(String? iso) {
    if (iso == null || iso.trim().isEmpty) return '—';
    final dt = DateTime.tryParse(iso);
    if (dt == null) return '—';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    final local = dt.toLocal();
    final h = local.hour.toString().padLeft(2, '0');
    final m = local.minute.toString().padLeft(2, '0');
    return '${local.day} ${months[local.month - 1]} ${local.year} at $h:$m';
  }

  static String formatDurationSeconds(int seconds) {
    final h = seconds ~/ 3600;
    final m = (seconds % 3600) ~/ 60;
    if (h > 0) return '${h}h ${m}m';
    return '${m}m';
  }

  static String formatStatus(String? raw) {
    final s = (raw ?? '').trim();
    if (s.isEmpty || s.toLowerCase() == 'no status') return 'Scheduled';
    return s
        .replaceAll('_', ' ')
        .split(' ')
        .where((w) => w.isNotEmpty)
        .map((w) => '${w[0].toUpperCase()}${w.substring(1).toLowerCase()}')
        .join(' ');
  }

  static String formatSegmentType(String? raw) {
    final s = (raw ?? '').trim();
    if (s.isEmpty) return 'time';
    return s.replaceAll('_', ' ');
  }

  static bool isVisitReadyForQuotation(String status) {
    final s = status.toLowerCase();
    return s == 'completed' ||
        s == 'arrived_at_site' ||
        s == 'arrived' ||
        s == 'on_site';
  }
}
