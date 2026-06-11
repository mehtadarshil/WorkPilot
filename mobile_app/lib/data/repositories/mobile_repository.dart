import 'dart:convert';

import 'package:get/get.dart';

import '../../core/offline/connectivity_service.dart';
import '../../core/offline/offline_api_support.dart';
import '../../core/offline/offline_queue_service.dart';
import '../../core/network/api_exception.dart';
import '../../core/services/storage_service.dart';
import '../models/diary_event_detail.dart';
import '../models/diary_event_row.dart';
import '../models/electrical_certificate_models.dart';
import '../models/job_report_history_models.dart';
import '../models/job_report_models.dart';
import '../models/mobile_home_response.dart';
import '../models/open_job_summary.dart';
import '../models/timesheet_history_entry.dart';
import 'base_repository.dart';

class MobileRepository extends BaseRepository {
  MobileRepository(super.api);

  StorageService get _storage => Get.find<StorageService>();

  bool _connectivitySaysOffline() {
    return Get.isRegistered<ConnectivityService>() &&
        !Get.find<ConnectivityService>().isOnline.value;
  }

  /// Returns `true` if the request ran against the API now; `false` if it was queued for later sync.
  Future<bool> _enqueueOrRun({
    required Future<void> Function() runOnline,
    required Future<void> Function() enqueue,
  }) async {
    if (_connectivitySaysOffline()) {
      await enqueue();
      return false;
    }
    try {
      await runOnline();
      return true;
    } on ApiException catch (e) {
      if (Get.isRegistered<OfflineQueueService>() &&
          apiExceptionLooksLikeNoConnection(e)) {
        await enqueue();
        return false;
      }
      rethrow;
    }
  }

  Future<List<OpenJobSummary>> fetchOpenJobs() async {
    final res = await api.get<Map<String, dynamic>>('/mobile/open-jobs');
    final data = res.data;
    if (data == null) return [];
    final raw = data['jobs'];
    if (raw is! List) return [];
    return raw
        .map(
          (e) => OpenJobSummary.fromJson(Map<String, dynamic>.from(e as Map)),
        )
        .toList();
  }

  /// [fromCache] is true when returning stored data because the device is offline or unreachable.
  Future<({MobileHomeResponse data, bool fromCache})> fetchHome() async {
    if (_connectivitySaysOffline()) {
      final j = _storage.readCachedMobileHomeJson();
      if (j != null && j.isNotEmpty) {
        final map = jsonDecode(j) as Map<String, dynamic>;
        return (
          data: MobileHomeResponse.fromJson(Map<String, dynamic>.from(map)),
          fromCache: true,
        );
      }
    }
    try {
      final res = await api.get<Map<String, dynamic>>('/mobile/home');
      final data = res.data;
      if (data == null) {
        throw Exception('Empty response');
      }
      final map = Map<String, dynamic>.from(data as Map);
      await _storage.writeCachedMobileHomeJson(jsonEncode(map));
      return (data: MobileHomeResponse.fromJson(map), fromCache: false);
    } on ApiException catch (e) {
      if (apiExceptionLooksLikeNoConnection(e)) {
        final j = _storage.readCachedMobileHomeJson();
        if (j != null && j.isNotEmpty) {
          final map = jsonDecode(j) as Map<String, dynamic>;
          return (
            data: MobileHomeResponse.fromJson(Map<String, dynamic>.from(map)),
            fromCache: true,
          );
        }
      }
      rethrow;
    }
  }

  /// Mark an office task as complete (only when assigned to the current officer).
  Future<bool> completeMyOfficeTask({
    required int jobId,
    required int taskId,
  }) async {
    return _enqueueOrRun(
      runOnline: () async {
        await api.patch<Map<String, dynamic>>(
          '/mobile/jobs/$jobId/office-tasks/$taskId',
          data: <String, dynamic>{'completed': true},
        );
      },
      enqueue: () async {
        await Get.find<OfflineQueueService>().enqueueOfficeTaskComplete(
          jobId: jobId,
          taskId: taskId,
        );
      },
    );
  }

  /// [rangeStart] / [rangeEnd] are inclusive local-day bounds as ISO-8601 (with offset),
  /// matching the web so filtering is correct in every time zone.
  /// [scope] `mine` = assigned to linked officer; `team` = tenant-wide (admin scheduling view).
  Future<List<DiaryEventRow>> fetchDiaryEvents({
    required String rangeStart,
    required String rangeEnd,
    String scope = 'mine',
  }) async {
    final apiScope = scope == 'team' ? 'team' : 'mine';
    if (_connectivitySaysOffline()) {
      final cached = _storage.readCachedDiaryEventsIfRangeMatches(
        rangeStart: rangeStart,
        rangeEnd: rangeEnd,
        scope: apiScope,
      );
      if (cached != null) {
        return _safeParseDiaryRows(cached);
      }
    }
    try {
      final res = await api.get<Map<String, dynamic>>(
        '/diary-events',
        queryParameters: <String, dynamic>{
          'range_start': rangeStart,
          'range_end': rangeEnd,
          if (apiScope == 'team') 'scope': 'team',
        },
      );
      final data = res.data;
      if (data == null) return [];
      final raw = data['events'];
      if (raw is! List) return [];
      final list = _safeParseDiaryRows(
        raw.map((e) => Map<String, dynamic>.from(e as Map)).toList(),
      );
      await _storage.writeCachedDiaryEnvelope(
        rangeStart: rangeStart,
        rangeEnd: rangeEnd,
        scope: apiScope,
        events: list.map((e) => e.toJson()).toList(),
      );
      return list;
    } on ApiException catch (e) {
      if (apiExceptionLooksLikeNoConnection(e)) {
        final cached = _storage.readCachedDiaryEventsIfRangeMatches(
          rangeStart: rangeStart,
          rangeEnd: rangeEnd,
          scope: apiScope,
        );
        if (cached != null) {
          return cached.map(DiaryEventRow.fromJson).toList();
        }
      }
      rethrow;
    }
  }

  /// Parse diary rows defensively: a single malformed row (e.g., a field the
  /// backend started returning as an object instead of a number) must not blank
  /// the whole week. The bad row is skipped silently.
  List<DiaryEventRow> _safeParseDiaryRows(List<Map<String, dynamic>> raw) {
    final out = <DiaryEventRow>[];
    for (final m in raw) {
      try {
        out.add(DiaryEventRow.fromJson(m));
      } catch (_) {
        // skip malformed row
      }
    }
    return out;
  }

  /// [fromCache] is true when using last saved visit payload (offline / connection error).
  Future<({DiaryEventDetail detail, bool fromCache})> fetchDiaryEventDetail(
    int diaryEventId,
  ) async {
    if (_connectivitySaysOffline()) {
      final raw = _storage.readCachedDiaryDetailRaw(diaryEventId);
      if (raw != null) {
        return (
          detail: DiaryEventDetail.fromJson(Map<String, dynamic>.from(raw)),
          fromCache: true,
        );
      }
      throw ApiException(
        'No internet — open this visit once while online to use it offline.',
      );
    }
    try {
      final res = await api.get<Map<String, dynamic>>(
        '/diary-events/$diaryEventId',
      );
      final data = res.data;
      if (data == null) throw Exception('Empty response');
      final map = Map<String, dynamic>.from(data as Map);
      await _storage.writeCachedDiaryDetailRaw(diaryEventId, map);
      return (detail: DiaryEventDetail.fromJson(map), fromCache: false);
    } on ApiException catch (e) {
      if (apiExceptionLooksLikeNoConnection(e)) {
        final raw = _storage.readCachedDiaryDetailRaw(diaryEventId);
        if (raw != null) {
          return (
            detail: DiaryEventDetail.fromJson(Map<String, dynamic>.from(raw)),
            fromCache: true,
          );
        }
      }
      rethrow;
    }
  }

  /// True while an [extra_submission] for this diary is still in the offline queue.
  Future<bool> diaryHasPendingExtraSubmissionOps(int diaryId) async {
    if (!Get.isRegistered<OfflineQueueService>()) return false;
    return Get.find<OfflineQueueService>().diaryHasPendingExtraSubmissionOps(
      diaryId,
    );
  }

  /// Updates diary visit status; server starts/stops timesheet segments automatically.
  /// When [status] is `cancelled`, [abortReason] must match a row from [fetchDiaryAbortReasonLabels].
  Future<bool> patchDiaryEventStatus(
    int diaryEventId,
    String status, {
    String? abortReason,
  }) async {
    final data = <String, dynamic>{'status': status};
    final ar = abortReason?.trim();
    if (ar != null && ar.isNotEmpty) {
      data['abort_reason'] = ar;
    }
    return _enqueueOrRun(
      runOnline: () async {
        await api.patch<Map<String, dynamic>>(
          '/diary-events/$diaryEventId',
          data: data,
        );
      },
      enqueue: () async {
        await Get.find<OfflineQueueService>().enqueueDiaryPatch(
          diaryId: diaryEventId,
          status: status,
          abortReason: ar,
        );
      },
    );
  }

  /// Labels from Settings → Visit abort reasons (same list officers see when aborting).
  Future<List<String>> fetchDiaryAbortReasonLabels() async {
    if (_connectivitySaysOffline()) {
      final c = _storage.readCachedAbortReasonLabels();
      if (c != null && c.isNotEmpty) return c;
    }
    try {
      final res = await api.get<Map<String, dynamic>>('/diary-abort-reasons');
      final raw = res.data?['reasons'];
      if (raw is! List) return [];
      final out = <String>[];
      for (final e in raw) {
        if (e is Map && e['label'] is String) {
          final s = (e['label'] as String).trim();
          if (s.isNotEmpty) out.add(s);
        }
      }
      if (out.isNotEmpty) {
        await _storage.writeCachedAbortReasonLabels(out);
      }
      return out;
    } on ApiException catch (e) {
      if (apiExceptionLooksLikeNoConnection(e)) {
        final c = _storage.readCachedAbortReasonLabels();
        if (c != null && c.isNotEmpty) return c;
      }
      rethrow;
    }
  }

  Future<JobReportBundle> fetchDiaryJobReport(int diaryEventId) async {
    final res = await api.get<Map<String, dynamic>>(
      '/diary-events/$diaryEventId/job-report',
    );
    final data = res.data;
    if (data == null) throw Exception('Empty response');
    return JobReportBundle.fromJson(Map<String, dynamic>.from(data as Map));
  }

  /// Prior completed visits on the same job (answers only; signature questions omitted server-side).
  Future<List<JobReportHistorySubmission>> fetchJobReportHistory(
    int diaryEventId,
  ) async {
    final res = await api.get<Map<String, dynamic>>(
      '/diary-events/$diaryEventId/job-report-history',
    );
    final data = res.data;
    if (data == null) return [];
    final raw = data['submissions'];
    if (raw is! List) return [];
    return raw
        .map(
          (e) => JobReportHistorySubmission.fromJson(
            Map<String, dynamic>.from(e as Map),
          ),
        )
        .toList();
  }

  Future<bool> submitDiaryJobReport(
    int diaryEventId,
    List<Map<String, dynamic>> answers, {
    required String nextJobState,
  }) async {
    return _enqueueOrRun(
      runOnline: () async {
        await api.post<Map<String, dynamic>>(
          '/diary-events/$diaryEventId/job-report/submit',
          data: <String, dynamic>{
            'answers': answers,
            'next_job_state': nextJobState,
          },
        );
      },
      enqueue: () async {
        await Get.find<OfflineQueueService>().enqueueJobReportSubmit(
          diaryId: diaryEventId,
          answers: answers,
          nextJobState: nextJobState,
        );
      },
    );
  }

  /// Best-effort partial save while filling the job report (online only; skipped when offline).
  Future<void> saveDiaryJobReportDraftIfOnline(
    int diaryEventId,
    List<Map<String, dynamic>> answers,
  ) async {
    if (_connectivitySaysOffline()) return;
    try {
      await api.post<Map<String, dynamic>>(
        '/diary-events/$diaryEventId/job-report/draft',
        data: <String, dynamic>{'answers': answers},
      );
    } on ApiException catch (e) {
      if (apiExceptionLooksLikeNoConnection(e)) return;
      rethrow;
    } catch (_) {
      /* ignore transient errors for background draft */
    }
  }

  /// Extra visit submissions (compressed photos/videos + optional notes), separate from the main job report.
  Future<bool> postDiaryExtraSubmission(
    int diaryEventId, {
    String? notes,
    List<Map<String, dynamic>> media = const [],
  }) async {
    return _enqueueOrRun(
      runOnline: () async {
        final body = <String, dynamic>{};
        if (notes != null && notes.trim().isNotEmpty) {
          body['notes'] = notes.trim();
        }
        if (media.isNotEmpty) {
          body['media'] = media;
        }
        await api.post<Map<String, dynamic>>(
          '/diary-events/$diaryEventId/extra-submissions',
          data: body,
        );
      },
      enqueue: () async {
        await Get.find<OfflineQueueService>().enqueueExtraSubmission(
          diaryId: diaryEventId,
          notes: notes,
          media: media,
        );
      },
    );
  }

  /// Technical notes for a visit (image-only uploads + optional text note).
  Future<bool> postDiaryTechnicalNote(
    int diaryEventId, {
    String? notes,
    List<Map<String, dynamic>> media = const [],
  }) async {
    return _enqueueOrRun(
      runOnline: () async {
        final body = <String, dynamic>{};
        if (notes != null && notes.trim().isNotEmpty) {
          body['notes'] = notes.trim();
        }
        if (media.isNotEmpty) {
          body['media'] = media;
        }
        await api.post<Map<String, dynamic>>(
          '/diary-events/$diaryEventId/technical-notes',
          data: body,
        );
      },
      enqueue: () async {
        await Get.find<OfflineQueueService>().enqueueTechnicalNote(
          diaryId: diaryEventId,
          notes: notes,
          media: media,
        );
      },
    );
  }

  Future<List<TimesheetHistoryEntry>> fetchTimesheetHistory({
    String? from,
    String? to,
    int limit = 50,
  }) async {
    final res = await api.get<Map<String, dynamic>>(
      '/timesheet/history',
      queryParameters: <String, dynamic>{
        if (from != null) 'from': from,
        if (to != null) 'to': to,
        'limit': limit,
      },
    );
    final data = res.data;
    if (data == null) return [];
    final raw = data['entries'];
    if (raw is! List) return [];
    return raw
        .map(
          (e) => TimesheetHistoryEntry.fromJson(
            Map<String, dynamic>.from(e as Map),
          ),
        )
        .toList();
  }

  /// Settings: invoice (includes company branding fields).
  Future<Map<String, dynamic>> fetchInvoiceSettings() async {
    final res = await api.get<Map<String, dynamic>>('/settings/invoice');
    final data = res.data;
    if (data == null) throw Exception('Empty response');
    return Map<String, dynamic>.from(data['settings'] as Map? ?? {});
  }

  /// Settings: patch invoice settings.
  Future<void> patchInvoiceSettings(Map<String, dynamic> payload) async {
    await api.patch<Map<String, dynamic>>(
      '/settings/invoice',
      data: payload,
    );
  }

  /// Settings: quotation.
  Future<Map<String, dynamic>> fetchQuotationSettings() async {
    final res = await api.get<Map<String, dynamic>>('/settings/quotation');
    final data = res.data;
    if (data == null) throw Exception('Empty response');
    return Map<String, dynamic>.from(data['settings'] as Map? ?? {});
  }

  Future<void> patchQuotationSettings(Map<String, dynamic> payload) async {
    await api.patch<Map<String, dynamic>>(
      '/settings/quotation',
      data: payload,
    );
  }

  /// Same list endpoints as the web CRM (`/customers`, `/jobs`, …). Server enforces permissions.
  Future<({List<Map<String, dynamic>> items, int page, int? totalPages})> fetchCrmListPage({
    required String module,
    int page = 1,
    String? search,
  }) async {
    List<Map<String, dynamic>> parseList(dynamic raw) {
      if (raw is! List) return [];
      return raw
          .map((e) => e is Map ? Map<String, dynamic>.from(e) : <String, dynamic>{})
          .toList();
    }

    final trimmed = search?.trim();
    final q = <String, dynamic>{'page': page};
    if (trimmed != null && trimmed.isNotEmpty) {
      q['search'] = trimmed;
    }

    switch (module) {
      case 'customers':
        q['limit'] = 30;
        final res = await api.get<Map<String, dynamic>>(
          '/customers',
          queryParameters: q,
        );
        final data = res.data;
        return (
          items: parseList(data?['customers']),
          page: page,
          totalPages: (data?['totalPages'] as num?)?.toInt(),
        );
      case 'jobs':
        q['limit'] = 25;
        final res = await api.get<Map<String, dynamic>>(
          '/jobs',
          queryParameters: q,
        );
        final data = res.data;
        return (
          items: parseList(data?['jobs']),
          page: page,
          totalPages: (data?['totalPages'] as num?)?.toInt(),
        );
      case 'quotations':
        q['limit'] = 25;
        final res = await api.get<Map<String, dynamic>>(
          '/quotations',
          queryParameters: q,
        );
        final data = res.data;
        return (
          items: parseList(data?['quotations']),
          page: page,
          totalPages: (data?['totalPages'] as num?)?.toInt(),
        );
      case 'invoices':
        q['limit'] = 25;
        final res = await api.get<Map<String, dynamic>>(
          '/invoices',
          queryParameters: q,
        );
        final data = res.data;
        return (
          items: parseList(data?['invoices']),
          page: page,
          totalPages: (data?['totalPages'] as num?)?.toInt(),
        );
      case 'parts_catalog':
        final res = await api.get<Map<String, dynamic>>(
          '/part-catalog',
          queryParameters: <String, dynamic>{
            if (trimmed != null && trimmed.isNotEmpty) 'search': trimmed,
            'limit': 100,
          },
        );
        final data = res.data;
        return (
          items: parseList(data?['parts']),
          page: 1,
          totalPages: 1,
        );
      case 'certifications':
        final res = await api.get<Map<String, dynamic>>('/certifications');
        final data = res.data;
        return (
          items: parseList(data?['certifications']),
          page: 1,
          totalPages: 1,
        );
      default:
        throw ApiException('Unknown CRM module: $module');
    }
  }

  Future<({List<Map<String, dynamic>> items, int page, int? totalPages})> fetchSiteReports({
    int page = 1,
  }) async {
    final res = await api.get<Map<String, dynamic>>(
      '/site-reports',
      queryParameters: <String, dynamic>{'page': page, 'limit': 25},
    );
    final data = res.data;
    final raw = data?['reports'];
    final list = raw is List
        ? raw.map((e) => e is Map ? Map<String, dynamic>.from(e) : <String, dynamic>{}).toList()
        : <Map<String, dynamic>>[];
    return (
      items: list,
      page: page,
      totalPages: (data?['totalPages'] as num?)?.toInt(),
    );
  }

  // ─── Settings: Email ───
  Future<Map<String, dynamic>> fetchEmailSettings() async {
    final res = await api.get<Map<String, dynamic>>('/settings/email');
    final data = res.data;
    if (data == null) throw Exception('Empty response');
    return Map<String, dynamic>.from(data['settings'] as Map? ?? {});
  }

  Future<void> patchEmailSettings(Map<String, dynamic> payload) async {
    await api.patch<Map<String, dynamic>>('/settings/email', data: payload);
  }

  Future<List<Map<String, dynamic>>> fetchEmailTemplates() async {
    final res = await api.get<Map<String, dynamic>>('/settings/email-templates');
    final raw = res.data?['templates'];
    if (raw is! List) return [];
    return raw.map((e) => e is Map ? Map<String, dynamic>.from(e) : <String, dynamic>{}).toList();
  }

  Future<void> postEmailTemplate(Map<String, dynamic> payload) async {
    await api.post<Map<String, dynamic>>('/settings/email-templates', data: payload);
  }

  Future<void> patchEmailTemplate(String key, Map<String, dynamic> payload) async {
    await api.patch<Map<String, dynamic>>('/settings/email-templates/${Uri.encodeComponent(key)}', data: payload);
  }

  Future<void> deleteEmailTemplate(String key) async {
    await api.delete<Map<String, dynamic>>('/settings/email-templates/${Uri.encodeComponent(key)}');
  }

  Future<void> postEmailTest(String to) async {
    await api.post<Map<String, dynamic>>('/settings/email/test', data: {'to': to});
  }

  // ─── Settings: Service Reminders ───
  Future<Map<String, dynamic>> fetchServiceReminders() async {
    final res = await api.get<Map<String, dynamic>>('/settings/service-reminders');
    final data = res.data;
    if (data == null) throw Exception('Empty response');
    return Map<String, dynamic>.from(data['settings'] as Map? ?? {});
  }

  Future<void> patchServiceReminders(Map<String, dynamic> payload) async {
    await api.patch<Map<String, dynamic>>('/settings/service-reminders', data: payload);
  }

  Future<Map<String, dynamic>> postRunServiceReminders() async {
    final res = await api.post<Map<String, dynamic>>('/settings/service-reminders/run-now', data: {});
    return Map<String, dynamic>.from(res.data ?? {});
  }

  // ─── Settings: Customer Types ───
  Future<List<Map<String, dynamic>>> fetchCustomerTypes() async {
    final res = await api.get<Map<String, dynamic>>('/settings/customer-types');
    final raw = res.data?['customerTypes'];
    if (raw is! List) return [];
    return raw.map((e) => e is Map ? Map<String, dynamic>.from(e) : <String, dynamic>{}).toList();
  }

  Future<void> postCustomerType(Map<String, dynamic> payload) async {
    await api.post<Map<String, dynamic>>('/settings/customer-types', data: payload);
  }

  Future<void> patchCustomerType(int id, Map<String, dynamic> payload) async {
    await api.patch<Map<String, dynamic>>('/settings/customer-types/$id', data: payload);
  }

  Future<void> deleteCustomerType(int id) async {
    await api.delete<Map<String, dynamic>>('/settings/customer-types/$id');
  }

  // ─── Settings: Price Books ───
  Future<List<Map<String, dynamic>>> fetchPriceBooks() async {
    final res = await api.get<dynamic>('/settings/price-books');
    final raw = res.data;
    if (raw is! List) return [];
    return raw.map((e) => e is Map ? Map<String, dynamic>.from(e) : <String, dynamic>{}).toList();
  }

  Future<void> postPriceBook(Map<String, dynamic> payload) async {
    await api.post<Map<String, dynamic>>('/settings/price-books', data: payload);
  }

  Future<void> patchPriceBook(int id, Map<String, dynamic> payload) async {
    await api.patch<Map<String, dynamic>>('/settings/price-books/$id', data: payload);
  }

  Future<void> deletePriceBook(int id) async {
    await api.delete<Map<String, dynamic>>('/settings/price-books/$id');
  }

  // ─── Settings: Job Descriptions ───
  Future<List<Map<String, dynamic>>> fetchJobDescriptions() async {
    final res = await api.get<dynamic>('/settings/job-descriptions');
    final raw = res.data;
    if (raw is! List) return [];
    return raw.map((e) => e is Map ? Map<String, dynamic>.from(e) : <String, dynamic>{}).toList();
  }

  Future<void> postJobDescription(Map<String, dynamic> payload) async {
    await api.post<Map<String, dynamic>>('/settings/job-descriptions', data: payload);
  }

  Future<void> patchJobDescription(int id, Map<String, dynamic> payload) async {
    await api.patch<Map<String, dynamic>>('/settings/job-descriptions/$id', data: payload);
  }

  Future<void> deleteJobDescription(int id) async {
    await api.delete<Map<String, dynamic>>('/settings/job-descriptions/$id');
  }

  // ─── Settings: Job Report Template ───
  Future<Map<String, dynamic>> fetchJobReportTemplate() async {
    final res = await api.get<Map<String, dynamic>>('/settings/job-report-template');
    final data = res.data;
    if (data == null) throw Exception('Empty response');
    return Map<String, dynamic>.from(data['template'] as Map? ?? {});
  }

  Future<void> patchJobReportTemplate(Map<String, dynamic> payload) async {
    await api.patch<Map<String, dynamic>>('/settings/job-report-template', data: payload);
  }

  // ─── Settings: Site Report Templates ───
  Future<List<Map<String, dynamic>>> fetchSiteReportTemplates() async {
    final res = await api.get<Map<String, dynamic>>('/settings/site-report-templates');
    final raw = res.data?['templates'];
    if (raw is! List) return [];
    return raw.map((e) => e is Map ? Map<String, dynamic>.from(e) : <String, dynamic>{}).toList();
  }

  Future<Map<String, dynamic>> fetchSiteReportTemplate(int id) async {
    final res = await api.get<Map<String, dynamic>>('/settings/site-report-templates/$id');
    final data = res.data;
    if (data == null) throw Exception('Empty response');
    return Map<String, dynamic>.from(data['template'] as Map? ?? {});
  }

  Future<Map<String, dynamic>> createSiteReport({
    required int customerId,
    required int templateId,
    int? workAddressId,
    int? jobId,
    String? reportTitle,
  }) async {
    final res = await api.post<Map<String, dynamic>>(
      '/customers/$customerId/site-reports',
      data: <String, dynamic>{
        'template_id': templateId,
        if (workAddressId != null) 'work_address_id': workAddressId,
        if (jobId != null) 'job_id': jobId,
        if (reportTitle != null && reportTitle.trim().isNotEmpty)
          'report_title': reportTitle.trim(),
      },
    );
    return Map<String, dynamic>.from(res.data ?? {});
  }

  // ─── Electrical certificates (job completion) ───
  Future<ElectricalCertificate> createElectricalCertificate({
    required int customerId,
    required String typeSlug,
    int? workAddressId,
    int? jobId,
    String? jobNumber,
  }) async {
    final res = await api.post<Map<String, dynamic>>(
      '/electrical-certificates',
      data: <String, dynamic>{
        'customer_id': customerId,
        'type_slug': typeSlug,
        if (workAddressId != null) 'work_address_id': workAddressId,
        if (jobId != null) 'job_id': jobId,
        if (jobNumber != null && jobNumber.trim().isNotEmpty) 'job_number': jobNumber.trim(),
      },
    );
    return ElectricalCertificate.fromJson(Map<String, dynamic>.from(res.data ?? {}));
  }

  Future<ElectricalCertificate> fetchElectricalCertificate(int id) async {
    final res = await api.get<Map<String, dynamic>>('/electrical-certificates/$id');
    return ElectricalCertificate.fromJson(Map<String, dynamic>.from(res.data ?? {}));
  }

  Future<ElectricalCertificate> patchElectricalCertificate(
    int id, {
    Map<String, dynamic>? document,
    String? status,
  }) async {
    final res = await api.patch<Map<String, dynamic>>(
      '/electrical-certificates/$id',
      data: <String, dynamic>{
        if (document != null) 'document': document,
        if (status != null) 'status': status,
      },
    );
    return ElectricalCertificate.fromJson(Map<String, dynamic>.from(res.data ?? {}));
  }

  Future<List<ValidationIssue>> validateElectricalCertificate(int id) async {
    final res = await api.post<Map<String, dynamic>>(
      '/electrical-certificates/$id/validate',
      data: const <String, dynamic>{},
    );
    final raw = res.data?['issues'];
    if (raw is! List) return [];
    return raw
        .whereType<Map>()
        .map((e) => ValidationIssue.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<List<int>> fetchElectricalCertificatePdf(int id) async {
    final res = await api.getBytes('/electrical-certificates/$id/pdf');
    return res.data ?? [];
  }

  Future<List<Map<String, dynamic>>> fetchCertificateEngineers() async {
    final res = await api.get<Map<String, dynamic>>('/electrical-certificates/engineers');
    final raw = res.data?['engineers'];
    if (raw is! List) return [];
    return raw.map((e) => e is Map ? Map<String, dynamic>.from(e) : <String, dynamic>{}).toList();
  }

  Future<Map<String, dynamic>> fetchCertificateBranding() async {
    try {
      final res = await api.get<Map<String, dynamic>>('/electrical-certificates/branding');
      final raw = res.data?['branding'];
      if (raw is Map) return Map<String, dynamic>.from(raw);
    } catch (_) {}
    return const {};
  }

  Future<List<Map<String, dynamic>>> fetchMobileSiteReportTemplates() async {
    final res = await api.get<Map<String, dynamic>>('/mobile/site-report-templates');
    final raw = res.data?['templates'];
    if (raw is! List) return [];
    return raw.map((e) => e is Map ? Map<String, dynamic>.from(e) : <String, dynamic>{}).toList();
  }

  Future<JobCompletionDocuments> fetchJobCompletionDocuments(int jobId) async {
    final res = await api.get<Map<String, dynamic>>('/mobile/jobs/$jobId/completion-documents');
    return JobCompletionDocuments.fromJson(Map<String, dynamic>.from(res.data ?? {}));
  }

  Future<void> postSiteReportTemplate(Map<String, dynamic> payload) async {
    await api.post<Map<String, dynamic>>('/settings/site-report-templates', data: payload);
  }

  Future<void> putSiteReportTemplate(int id, Map<String, dynamic> payload) async {
    await api.put<Map<String, dynamic>>('/settings/site-report-templates/$id', data: payload);
  }

  Future<void> deleteSiteReportTemplate(int id) async {
    await api.delete<Map<String, dynamic>>('/settings/site-report-templates/$id');
  }

  Future<Map<String, dynamic>> postResetFraTemplate() async {
    final res = await api.post<Map<String, dynamic>>('/settings/site-report-templates/fra/reset', data: {});
    return Map<String, dynamic>.from(res.data?['template'] as Map? ?? {});
  }

  // ─── Settings: Abort Reasons ───
  Future<List<Map<String, dynamic>>> fetchAbortReasons() async {
    final res = await api.get<Map<String, dynamic>>('/diary-abort-reasons');
    final raw = res.data?['reasons'];
    if (raw is! List) return [];
    return raw.map((e) => e is Map ? Map<String, dynamic>.from(e) : <String, dynamic>{}).toList();
  }

  Future<void> putAbortReasons(List<Map<String, dynamic>> reasons) async {
    await api.put<Map<String, dynamic>>('/settings/diary-abort-reasons', data: {'reasons': reasons});
  }

  // ─── Settings: Business Units ───
  Future<List<Map<String, dynamic>>> fetchBusinessUnits() async {
    final res = await api.get<Map<String, dynamic>>('/settings/business-units');
    final raw = res.data?['units'];
    if (raw is! List) return [];
    return raw.map((e) => e is Map ? Map<String, dynamic>.from(e) : <String, dynamic>{}).toList();
  }

  Future<void> postBusinessUnit(Map<String, dynamic> payload) async {
    await api.post<Map<String, dynamic>>('/settings/business-units', data: payload);
  }

  Future<void> deleteBusinessUnit(int id) async {
    await api.delete<Map<String, dynamic>>('/settings/business-units/$id');
  }

  // ─── Settings: User Groups ───
  Future<List<Map<String, dynamic>>> fetchUserGroups() async {
    final res = await api.get<Map<String, dynamic>>('/settings/user-groups');
    final raw = res.data?['groups'];
    if (raw is! List) return [];
    return raw.map((e) => e is Map ? Map<String, dynamic>.from(e) : <String, dynamic>{}).toList();
  }

  Future<void> postUserGroup(Map<String, dynamic> payload) async {
    await api.post<Map<String, dynamic>>('/settings/user-groups', data: payload);
  }

  Future<void> deleteUserGroup(int id) async {
    await api.delete<Map<String, dynamic>>('/settings/user-groups/$id');
  }

  // ─── Settings: Users (officers) ───
  Future<Map<String, dynamic>> fetchOfficers({int page = 1, int limit = 50, String? search, String? state}) async {
    final q = <String, dynamic>{'page': page, 'limit': limit};
    if (search != null && search.isNotEmpty) q['search'] = search;
    if (state != null && state.isNotEmpty) q['state'] = state;
    final res = await api.get<Map<String, dynamic>>('/officers', queryParameters: q);
    return Map<String, dynamic>.from(res.data ?? {});
  }

  Future<void> postOfficer(Map<String, dynamic> payload) async {
    await api.post<Map<String, dynamic>>('/officers', data: payload);
  }

  Future<void> patchOfficer(int id, Map<String, dynamic> payload) async {
    await api.patch<Map<String, dynamic>>('/officers/$id', data: payload);
  }

  Future<void> deleteOfficer(int id) async {
    await api.delete<Map<String, dynamic>>('/officers/$id');
  }

  // ─── Settings: Import ───
  Future<Map<String, dynamic>> postImportCustomersSites(List<Map<String, dynamic>> rows) async {
    final res = await api.post<Map<String, dynamic>>('/import/customers-sites', data: {'rows': rows});
    return Map<String, dynamic>.from(res.data ?? {});
  }
}
