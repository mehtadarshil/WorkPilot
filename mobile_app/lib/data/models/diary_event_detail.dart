/// Payload from GET /api/diary-events/:id
class DiaryEventDetail {
  DiaryEventDetail({
    required this.diaryId,
    required this.jobId,
    this.officerId,
    required this.startTimeIso,
    required this.durationMinutes,
    this.eventStatus,
    this.notes,
    this.createdByName,
    required this.createdAtIso,
    required this.updatedAtIso,
    this.title,
    this.description,
    this.location,
    this.jobState,
    this.jobNotes,
    this.quotedAmount,
    this.customerReference,
    this.customerId,
    this.customerFullName,
    this.customerEmail,
    this.customerPhone,
    this.siteAddress,
    this.officerFullName,
    this.jobReportQuestionCount = 0,
    this.siteContactName,
    this.siteContactEmail,
    this.siteContactPhone,
  });

  factory DiaryEventDetail.fromJson(Map<String, dynamic> json) {
    final e = json['event'];
    if (e is! Map<String, dynamic>) {
      throw const FormatException('Missing event object');
    }
    final m = Map<String, dynamic>.from(e);
    return DiaryEventDetail(
      diaryId: (m['diary_id'] as num).toInt(),
      jobId: (m['job_id'] as num).toInt(),
      officerId: (m['officer_id'] as num?)?.toInt(),
      startTimeIso: m['start_time'] as String,
      durationMinutes: (m['duration_minutes'] as num?)?.toInt() ?? 60,
      eventStatus: m['event_status'] as String?,
      notes: m['notes'] as String?,
      createdByName: m['created_by_name'] as String?,
      createdAtIso: m['created_at'] as String? ?? '',
      updatedAtIso: m['updated_at'] as String? ?? '',
      title: m['title'] as String?,
      description: m['description'] as String?,
      location: m['location'] as String?,
      jobState: m['job_state'] as String?,
      jobNotes: m['job_notes'] as String?,
      quotedAmount: m['quoted_amount'] != null
          ? (m['quoted_amount'] is num
                ? (m['quoted_amount'] as num).toDouble()
                : double.tryParse(m['quoted_amount'].toString()))
          : null,
      customerReference: m['customer_reference'] as String?,
      customerId: (m['customer_id'] as num?)?.toInt(),
      customerFullName: m['customer_full_name'] as String?,
      customerEmail: m['customer_email'] as String?,
      customerPhone: m['customer_phone'] as String?,
      siteAddress: m['site_address'] as String?,
      officerFullName: m['officer_full_name'] as String?,
      jobReportQuestionCount: (m['job_report_question_count'] as num?)?.toInt() ?? 0,
      siteContactName: m['site_contact_name'] as String?,
      siteContactEmail: m['site_contact_email'] as String?,
      siteContactPhone: m['site_contact_phone'] as String?,
    );
  }

  final int diaryId;
  final int jobId;
  final int? officerId;
  final String startTimeIso;
  final int durationMinutes;
  final String? eventStatus;
  final String? notes;
  final String? createdByName;
  final String createdAtIso;
  final String updatedAtIso;
  final String? title;
  final String? description;
  final String? location;
  final String? jobState;
  final String? jobNotes;
  final double? quotedAmount;
  final String? customerReference;
  final int? customerId;
  final String? customerFullName;
  final String? customerEmail;
  final String? customerPhone;
  final String? siteAddress;
  final String? officerFullName;
  final int jobReportQuestionCount;
  final String? siteContactName;
  final String? siteContactEmail;
  final String? siteContactPhone;

  DateTime? get startTime => DateTime.tryParse(startTimeIso);
  DateTime? get endTime {
    final s = startTime;
    if (s == null) return null;
    return s.add(Duration(minutes: durationMinutes));
  }
}
