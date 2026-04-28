class TimesheetHistoryEntry {
  TimesheetHistoryEntry({
    required this.id,
    required this.officerId,
    required this.clockInIso,
    this.clockOutIso,
    this.notes,
    this.segmentType,
    this.diaryEventId,
    required this.durationSeconds,
  });

  factory TimesheetHistoryEntry.fromJson(Map<String, dynamic> json) {
    return TimesheetHistoryEntry(
      id: (json['id'] as num).toInt(),
      officerId: (json['officer_id'] as num).toInt(),
      clockInIso: json['clock_in'] as String,
      clockOutIso: json['clock_out'] as String?,
      notes: json['notes'] as String?,
      segmentType: json['segment_type'] as String?,
      diaryEventId: (json['diary_event_id'] as num?)?.toInt(),
      durationSeconds: (json['duration_seconds'] as num?)?.toInt() ?? 0,
    );
  }

  final int id;
  final int officerId;
  final String clockInIso;
  final String? clockOutIso;
  final String? notes;
  final String? segmentType;
  final int? diaryEventId;
  final int durationSeconds;

  DateTime? get clockIn => DateTime.tryParse(clockInIso)?.toLocal();
  DateTime? get clockOut =>
      clockOutIso != null ? DateTime.tryParse(clockOutIso!)?.toLocal() : null;

  bool get isOpen => clockOutIso == null;

  String get segmentLabel {
    switch (segmentType) {
      case 'travelling':
        return 'Travelling';
      case 'on_site':
        return 'On site';
      default:
        return 'Time';
    }
  }
}
