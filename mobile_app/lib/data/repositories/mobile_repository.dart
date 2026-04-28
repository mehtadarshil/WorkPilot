import 'dart:convert';

import 'package:get/get.dart';

import '../../core/offline/connectivity_service.dart';
import '../../core/offline/offline_api_support.dart';
import '../../core/offline/offline_queue_service.dart';
import '../../core/network/api_exception.dart';
import '../../core/services/storage_service.dart';
import '../models/diary_event_detail.dart';
import '../models/diary_event_row.dart';
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
  Future<List<DiaryEventRow>> fetchDiaryEvents({
    required String rangeStart,
    required String rangeEnd,
  }) async {
    if (_connectivitySaysOffline()) {
      final cached = _storage.readCachedDiaryEventsIfRangeMatches(
        rangeStart: rangeStart,
        rangeEnd: rangeEnd,
      );
      if (cached != null) {
        return cached.map(DiaryEventRow.fromJson).toList();
      }
    }
    try {
      final res = await api.get<Map<String, dynamic>>(
        '/diary-events',
        queryParameters: <String, dynamic>{
          'range_start': rangeStart,
          'range_end': rangeEnd,
        },
      );
      final data = res.data;
      if (data == null) return [];
      final raw = data['events'];
      if (raw is! List) return [];
      final list = raw
          .map(
            (e) => DiaryEventRow.fromJson(Map<String, dynamic>.from(e as Map)),
          )
          .toList();
      await _storage.writeCachedDiaryEnvelope(
        rangeStart: rangeStart,
        rangeEnd: rangeEnd,
        events: list.map((e) => e.toJson()).toList(),
      );
      return list;
    } on ApiException catch (e) {
      if (apiExceptionLooksLikeNoConnection(e)) {
        final cached = _storage.readCachedDiaryEventsIfRangeMatches(
          rangeStart: rangeStart,
          rangeEnd: rangeEnd,
        );
        if (cached != null) {
          return cached.map(DiaryEventRow.fromJson).toList();
        }
      }
      rethrow;
    }
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
}
