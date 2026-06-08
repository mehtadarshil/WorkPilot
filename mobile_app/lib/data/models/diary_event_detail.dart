import 'customer_specific_note.dart';
import 'diary_extra_submission.dart';

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
    this.siteAddressLine1,
    this.siteAddressLine2,
    this.siteAddressLine3,
    this.siteTown,
    this.siteCounty,
    this.sitePostcode,
    this.officerFullName,
    this.jobReportQuestionCount = 0,
    this.siteContactName,
    this.siteContactEmail,
    this.siteContactPhone,
    this.extraSubmissions = const [],
    this.technicalNotes = const [],
    this.customerSpecificNotes = const [],
    this.abortReason,
    this.officers = const [],
  });

  factory DiaryEventDetail.fromJson(Map<String, dynamic> json) {
    final e = json['event'];
    if (e is! Map<String, dynamic>) {
      throw const FormatException('Missing event object');
    }
    final m = Map<String, dynamic>.from(e);
    final extraRaw = json['extra_submissions'];
    final extraList = <DiaryExtraSubmission>[];
    if (extraRaw is List) {
      for (final x in extraRaw) {
        if (x is Map<String, dynamic>) {
          extraList.add(DiaryExtraSubmission.fromJson(x));
        }
      }
    }
    final notesRaw =
        json['customer_specific_notes'] ?? m['customer_specific_notes'];
    final technicalRaw = json['technical_notes'];
    final technicalList = <DiaryExtraSubmission>[];
    if (technicalRaw is List) {
      for (final x in technicalRaw) {
        if (x is Map<String, dynamic>) {
          technicalList.add(DiaryExtraSubmission.fromJson(x));
        }
      }
    }
    final specificNotes = <CustomerSpecificNote>[];
    if (notesRaw is List) {
      for (final x in notesRaw) {
        if (x is Map) {
          try {
            final n = CustomerSpecificNote.fromJson(
              Map<String, dynamic>.from(x),
            );
            if (n.id > 0 && (n.title.isNotEmpty || n.description.isNotEmpty)) {
              specificNotes.add(n);
            }
          } catch (_) {
            /* skip malformed row */
          }
        }
      }
    }
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
      siteAddressLine1: m['site_address_line_1'] as String?,
      siteAddressLine2: m['site_address_line_2'] as String?,
      siteAddressLine3: m['site_address_line_3'] as String?,
      siteTown: m['site_town'] as String?,
      siteCounty: m['site_county'] as String?,
      sitePostcode: m['site_postcode'] as String?,
      officerFullName: m['officer_full_name'] as String?,
      jobReportQuestionCount:
          (m['job_report_question_count'] as num?)?.toInt() ?? 0,
      siteContactName: m['site_contact_name'] as String?,
      siteContactEmail: m['site_contact_email'] as String?,
      siteContactPhone: m['site_contact_phone'] as String?,
      extraSubmissions: extraList,
      technicalNotes: technicalList,
      customerSpecificNotes: specificNotes,
      abortReason: (m['abort_reason'] as String?)?.trim().isNotEmpty == true
          ? (m['abort_reason'] as String).trim()
          : null,
      officers: _parseOfficers(json['officers'] ?? m['officers']),
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
  final String? siteAddressLine1;
  final String? siteAddressLine2;
  final String? siteAddressLine3;
  final String? siteTown;
  final String? siteCounty;
  final String? sitePostcode;
  final String? officerFullName;
  final int jobReportQuestionCount;
  final String? siteContactName;
  final String? siteContactEmail;
  final String? siteContactPhone;
  final List<DiaryExtraSubmission> extraSubmissions;
  final List<DiaryExtraSubmission> technicalNotes;
  final List<CustomerSpecificNote> customerSpecificNotes;
  final String? abortReason;
  final List<Map<String, dynamic>> officers;

  String? get primaryOfficerName {
    for (final o in officers) {
      if (o['is_primary'] == true) return o['full_name'] as String?;
    }
    return officerFullName;
  }

  DateTime? get startTime => DateTime.tryParse(startTimeIso)?.toLocal();
  DateTime? get endTime {
    final s = startTime;
    if (s == null) return null;
    return s.add(Duration(minutes: durationMinutes));
  }

  String get fullSiteAddress {
    final parts = <String>[
      if (siteAddressLine1 != null && siteAddressLine1!.trim().isNotEmpty) siteAddressLine1!.trim(),
      if (siteAddressLine2 != null && siteAddressLine2!.trim().isNotEmpty) siteAddressLine2!.trim(),
      if (siteAddressLine3 != null && siteAddressLine3!.trim().isNotEmpty) siteAddressLine3!.trim(),
      if (siteTown != null && siteTown!.trim().isNotEmpty) siteTown!.trim(),
      if (siteCounty != null && siteCounty!.trim().isNotEmpty) siteCounty!.trim(),
      if (sitePostcode != null && sitePostcode!.trim().isNotEmpty) sitePostcode!.trim(),
    ];
    if (parts.isNotEmpty) return parts.join(', ');
    if (siteAddress != null && siteAddress!.trim().isNotEmpty) return siteAddress!.trim();
    if (location != null && location!.trim().isNotEmpty) return location!.trim();
    return '—';
  }

  DiaryEventDetail copyWith({
    String? eventStatus,
    String? jobState,
    String? abortReason,
    String? updatedAtIso,
    List<DiaryExtraSubmission>? extraSubmissions,
    List<DiaryExtraSubmission>? technicalNotes,
  }) {
    return DiaryEventDetail(
      diaryId: diaryId,
      jobId: jobId,
      officerId: officerId,
      startTimeIso: startTimeIso,
      durationMinutes: durationMinutes,
      eventStatus: eventStatus ?? this.eventStatus,
      notes: notes,
      createdByName: createdByName,
      createdAtIso: createdAtIso,
      updatedAtIso: updatedAtIso ?? this.updatedAtIso,
      title: title,
      description: description,
      location: location,
      jobState: jobState ?? this.jobState,
      jobNotes: jobNotes,
      quotedAmount: quotedAmount,
      customerReference: customerReference,
      customerId: customerId,
      customerFullName: customerFullName,
      customerEmail: customerEmail,
      customerPhone: customerPhone,
      siteAddress: siteAddress,
      siteAddressLine1: siteAddressLine1,
      siteAddressLine2: siteAddressLine2,
      siteAddressLine3: siteAddressLine3,
      siteTown: siteTown,
      siteCounty: siteCounty,
      sitePostcode: sitePostcode,
      officerFullName: officerFullName,
      jobReportQuestionCount: jobReportQuestionCount,
      siteContactName: siteContactName,
      siteContactEmail: siteContactEmail,
      siteContactPhone: siteContactPhone,
      extraSubmissions: extraSubmissions ?? this.extraSubmissions,
      technicalNotes: technicalNotes ?? this.technicalNotes,
      customerSpecificNotes: customerSpecificNotes,
      abortReason: abortReason ?? this.abortReason,
      officers: officers,
    );
  }
}
