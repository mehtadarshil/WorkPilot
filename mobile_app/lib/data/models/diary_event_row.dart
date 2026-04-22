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

  String get displayContactName {
    final s = siteContactName?.trim();
    if (s != null && s.isNotEmpty) return s;
    return (customerFullName ?? '').trim();
  }

  DateTime? get startTime {
    try {
      return DateTime.parse(startTimeIso);
    } catch (_) {
      return null;
    }
  }
}
