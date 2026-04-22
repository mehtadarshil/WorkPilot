class ActiveTimesheet {
  ActiveTimesheet({
    required this.id,
    required this.clockInIso,
    this.notes,
    this.segmentType,
    this.diaryEventId,
  });

  factory ActiveTimesheet.fromJson(Map<String, dynamic> json) {
    return ActiveTimesheet(
      id: (json['id'] as num).toInt(),
      clockInIso: json['clock_in'] as String,
      notes: json['notes'] as String?,
      segmentType: json['segment_type'] as String?,
      diaryEventId: (json['diary_event_id'] as num?)?.toInt(),
    );
  }

  final int id;
  final String clockInIso;
  final String? notes;
  /// Backend: `travelling` or `on_site` for status-driven timesheet segments.
  final String? segmentType;
  final int? diaryEventId;

  DateTime get clockInUtc => DateTime.parse(clockInIso).toUtc();

  String get segmentLabel {
    switch (segmentType) {
      case 'travelling':
        return 'Travelling to site';
      case 'on_site':
        return 'On site';
      default:
        return 'Active';
    }
  }
}
