/// Row from GET /api/diary-events or nested in /api/mobile/home.
class DiaryEventRow {
  DiaryEventRow({
    required this.diaryId,
    this.jobId,
    this.isGeneral = false,
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
    this.officerFullName,
    this.officers = const [],
    this.isQuotationVisit = false,
    this.jobNumber,
    this.description,
    this.chargeType,
  });

  factory DiaryEventRow.fromJson(Map<String, dynamic> json) {
    final start = json['start_time'];
    return DiaryEventRow(
      diaryId: (json['diary_id'] as num?)?.toInt() ?? (json['id'] as num?)?.toInt() ?? 0,
      jobId: (json['job_id'] as num?)?.toInt(),
      isGeneral: json['is_general'] == true || json['job_id'] == null,
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
      officerFullName: json['officer_full_name'] as String?,
      officers: _parseOfficers(json['officers']),
      isQuotationVisit: json['is_quotation_visit'] == true,
      jobNumber: json['job_number'] as String?,
      description: json['description'] as String?,
      chargeType: json['charge_type'] as String?,
    );
  }

  final int diaryId;
  final int? jobId;
  final bool isGeneral;
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
  final String? officerFullName;
  final List<Map<String, dynamic>> officers;
  final bool isQuotationVisit;
  final String? jobNumber;
  final String? description;
  final String? chargeType;

  String get listTitle {
    if (isGeneral) {
      final t = title?.trim();
      if (t != null && t.isNotEmpty) return t;
      return 'General event';
    }
    final t = title?.trim();
    if (t != null && t.isNotEmpty) return t;
    return 'Job';
  }

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
        if (jobId != null) 'job_id': jobId,
        'is_general': isGeneral,
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
        if (officerFullName != null) 'officer_full_name': officerFullName,
        'officers': officers,
        'is_quotation_visit': isQuotationVisit,
        if (jobNumber != null) 'job_number': jobNumber,
        if (description != null) 'description': description,
        if (chargeType != null) 'charge_type': chargeType,
      };

  DiaryEventRow copyWith({
    String? eventStatus,
    String? abortReason,
  }) {
    return DiaryEventRow(
      diaryId: diaryId,
      jobId: jobId,
      isGeneral: isGeneral,
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
      officerFullName: officerFullName,
      officers: officers,
      isQuotationVisit: isQuotationVisit,
      jobNumber: jobNumber,
      description: description,
      chargeType: chargeType ?? this.chargeType,
    );
  }
}

List<Map<String, dynamic>> _parseOfficers(dynamic raw) {
  final list = <Map<String, dynamic>>[];
  if (raw is List) {
    for (final o in raw) {
      if (o is Map) {
        list.add(Map<String, dynamic>.from(o));
      }
    }
  }
  return list;
}
