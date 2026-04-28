/// Row from GET /api/diary-events or nested in /api/mobile/home.
class DiaryEventRow {
  DiaryEventRow({
    required this.diaryId,
    required this.jobId,
    this.officerId,
    required this.startTimeIso,
    this.durationMinutes,
    this.eventStatus,
    this.notes,
    this.title,
    this.location,
    this.customerFullName,
    this.siteContactName,
    this.jobReportQuestionCount = 0,
    this.abortReason,
  });

  factory DiaryEventRow.fromJson(Map<String, dynamic> json) {
    final start = json['start_time'];
    return DiaryEventRow(
      diaryId: (json['diary_id'] as num?)?.toInt() ?? (json['id'] as num?)?.toInt() ?? 0,
      jobId: (json['job_id'] as num?)?.toInt() ?? 0,
      officerId: (json['officer_id'] as num?)?.toInt(),
      startTimeIso: start is String
          ? start
          : start != null
              ? start.toString()
              : '',
      durationMinutes: (json['duration_minutes'] as num?)?.toInt(),
      eventStatus: json['event_status'] as String? ?? json['status'] as String?,
      notes: json['notes'] as String?,
      title: json['title'] as String?,
      location: json['location'] as String?,
      customerFullName: json['customer_full_name'] as String?,
      siteContactName: json['site_contact_name'] as String?,
      jobReportQuestionCount: (json['job_report_question_count'] as num?)?.toInt() ?? 0,
      abortReason: (json['abort_reason'] as String?)?.trim().isNotEmpty == true
          ? (json['abort_reason'] as String).trim()
          : null,
    );
  }

  final int diaryId;
  final int jobId;
  final int? officerId;
  final String startTimeIso;
  final int? durationMinutes;
  final String? eventStatus;
  final String? notes;
  final String? title;
  final String? location;
  final String? customerFullName;
  final String? siteContactName;
  final int jobReportQuestionCount;
  final String? abortReason;

  String get displayContactName {
    final s = siteContactName?.trim();
    if (s != null && s.isNotEmpty) return s;
    return (customerFullName ?? '').trim();
  }

  /// Same instant as the API; wall clock in the device time zone (for display).
  DateTime? get startTime {
    try {
      return DateTime.parse(startTimeIso).toLocal();
    } catch (_) {
      return null;
    }
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
        'diary_id': diaryId,
        'job_id': jobId,
        if (officerId != null) 'officer_id': officerId,
        'start_time': startTimeIso,
        if (durationMinutes != null) 'duration_minutes': durationMinutes,
        if (eventStatus != null) 'event_status': eventStatus,
        if (notes != null) 'notes': notes,
        if (title != null) 'title': title,
        if (location != null) 'location': location,
        if (customerFullName != null) 'customer_full_name': customerFullName,
        if (siteContactName != null) 'site_contact_name': siteContactName,
        'job_report_question_count': jobReportQuestionCount,
        if (abortReason != null) 'abort_reason': abortReason,
      };

  DiaryEventRow copyWith({
    String? eventStatus,
    String? abortReason,
  }) {
    return DiaryEventRow(
      diaryId: diaryId,
      jobId: jobId,
      officerId: officerId,
      startTimeIso: startTimeIso,
      durationMinutes: durationMinutes,
      eventStatus: eventStatus ?? this.eventStatus,
      notes: notes,
      title: title,
      location: location,
      customerFullName: customerFullName,
      siteContactName: siteContactName,
      jobReportQuestionCount: jobReportQuestionCount,
      abortReason: abortReason ?? this.abortReason,
    );
  }
}
