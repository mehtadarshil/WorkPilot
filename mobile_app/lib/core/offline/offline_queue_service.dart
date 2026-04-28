import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:get_storage/get_storage.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../network/api_exception.dart';
import '../../data/providers/api_provider.dart';
import '../../modules/home/controllers/home_controller.dart';
import 'connectivity_service.dart';

/// Max JSON length kept inline in storage; larger payloads are written to a support-dir file.
const int _kPayloadInlineMaxChars = 550000;

const String _offlineQueueBoxName = 'wp_offline_queue';
const String _opsKey = 'pending_ops_v1';

class OfflineQueueService extends GetxService {
  OfflineQueueService(this._api);

  final ApiProvider _api;

  late final GetStorage _box;
  Future<void>? _boxInitFuture;

  final RxInt pendingCount = 0.obs;

  /// True while [processQueue] is actively sending requests.
  final RxBool isProcessingQueue = false.obs;

  /// User-visible sync issue (cleared when the queue drains or sync succeeds).
  final RxnString queueErrorMessage = RxnString();

  /// True when the first queued item failed with a non-transient API error (e.g. validation).
  final RxBool queueErrorBlocksProgress = false.obs;

  bool _processing = false;

  /// Call after connectivity returns or from the "Retry sync" control.
  Future<void> retrySync() => processQueue();

  /// Whether an unsynced extra submission for [diaryId] is still queued.
  Future<bool> diaryHasPendingExtraSubmissionOps(int diaryId) async {
    await _ensureBox();
    for (final o in _readOps()) {
      if (o['kind'] != 'extra_submission') continue;
      try {
        final stored = o['payload'] as String;
        final payload = await _decodePayload(stored);
        if ((payload['diaryId'] as num?)?.toInt() == diaryId) return true;
      } catch (_) {
        /* skip malformed */
      }
    }
    return false;
  }

  Future<void> _ensureBox() async {
    _boxInitFuture ??= _initBox();
    await _boxInitFuture;
  }

  Future<void> _initBox() async {
    await GetStorage.init(_offlineQueueBoxName);
    _box = GetStorage(_offlineQueueBoxName);
    await _refreshCount();
  }

  Future<void> _refreshCount() async {
    final list = _readOps();
    pendingCount.value = list.length;
  }

  List<Map<String, dynamic>> _readOps() {
    final raw = _box.read(_opsKey);
    if (raw is! List) return [];
    return raw.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<void> _writeOps(List<Map<String, dynamic>> ops) async {
    await _box.write(_opsKey, ops);
    pendingCount.value = ops.length;
  }

  @override
  void onInit() {
    super.onInit();
    Future<void>(() async {
      await _ensureBox();
      if (Get.isRegistered<ConnectivityService>() &&
          Get.find<ConnectivityService>().isOnline.value) {
        await processQueue();
      }
    });
  }

  Future<String> _payloadDir() async {
    final root = await getApplicationSupportDirectory();
    final dir = Directory(p.join(root.path, 'offline_payloads'));
    if (!await dir.exists()) {
      await dir.create(recursive: true);
    }
    return dir.path;
  }

  Future<String> _persistLargeJsonIfNeeded(String jsonStr) async {
    if (jsonStr.length <= _kPayloadInlineMaxChars) return jsonStr;
    final dir = await _payloadDir();
    final name = 'q_${DateTime.now().microsecondsSinceEpoch}.json';
    final file = File(p.join(dir, name));
    await file.writeAsString(jsonStr, flush: true);
    return jsonEncode(<String, dynamic>{'__file': file.path});
  }

  Future<Map<String, dynamic>> _decodePayload(String stored) async {
    final first = jsonDecode(stored) as Map<String, dynamic>;
    final fp = first['__file'];
    if (fp is String && fp.isNotEmpty) {
      final file = File(fp);
      if (await file.exists()) {
        final inner = await file.readAsString();
        return jsonDecode(inner) as Map<String, dynamic>;
      }
      throw StateError('Missing offline payload file');
    }
    return first;
  }

  Future<void> _deletePayloadFileIfAny(String stored) async {
    try {
      final m = jsonDecode(stored);
      if (m is Map && m['__file'] is String) {
        final f = File(m['__file'] as String);
        if (await f.exists()) await f.delete();
      }
    } catch (_) {
      /* ignore */
    }
  }

  Future<void> _appendOp(String kind, Map<String, dynamic> payload) async {
    await _ensureBox();
    final ops = _readOps();
    final inline = await _persistLargeJsonIfNeeded(jsonEncode(payload));
    ops.add(<String, dynamic>{
      'id': DateTime.now().microsecondsSinceEpoch,
      'kind': kind,
      'payload': inline,
      'created_at': DateTime.now().millisecondsSinceEpoch,
    });
    await _writeOps(ops);
  }

  Future<void> enqueueDiaryPatch({
    required int diaryId,
    required String status,
    String? abortReason,
  }) async {
    await _appendOp('diary_patch', <String, dynamic>{
      'diaryId': diaryId,
      'status': status,
      if (abortReason != null && abortReason.trim().isNotEmpty)
        'abortReason': abortReason.trim(),
    });
  }

  Future<void> enqueueJobReportSubmit({
    required int diaryId,
    required List<Map<String, dynamic>> answers,
    required String nextJobState,
  }) async {
    await _appendOp('job_report_submit', <String, dynamic>{
      'diaryId': diaryId,
      'answers': answers,
      'nextJobState': nextJobState,
    });
  }

  Future<void> enqueueExtraSubmission({
    required int diaryId,
    String? notes,
    required List<Map<String, dynamic>> media,
  }) async {
    await _appendOp('extra_submission', <String, dynamic>{
      'diaryId': diaryId,
      if (notes != null && notes.trim().isNotEmpty) 'notes': notes.trim(),
      'media': media,
    });
  }

  Future<void> enqueueTechnicalNote({
    required int diaryId,
    String? notes,
    required List<Map<String, dynamic>> media,
  }) async {
    await _appendOp('technical_note', <String, dynamic>{
      'diaryId': diaryId,
      if (notes != null && notes.trim().isNotEmpty) 'notes': notes.trim(),
      'media': media,
    });
  }

  Future<void> enqueueOfficeTaskComplete({
    required int jobId,
    required int taskId,
  }) async {
    await _appendOp('office_task_complete', <String, dynamic>{
      'jobId': jobId,
      'taskId': taskId,
    });
  }

  Future<void> _executeOne(String kind, Map<String, dynamic> payload) async {
    switch (kind) {
      case 'diary_patch':
        final data = <String, dynamic>{'status': payload['status'] as String};
        final ar = payload['abortReason'];
        if (ar is String && ar.trim().isNotEmpty) {
          data['abort_reason'] = ar.trim();
        }
        await _api.patch<Map<String, dynamic>>(
          '/diary-events/${payload['diaryId']}',
          data: data,
        );
        return;
      case 'job_report_submit':
        await _api.post<Map<String, dynamic>>(
          '/diary-events/${payload['diaryId']}/job-report/submit',
          data: <String, dynamic>{
            'answers': payload['answers'],
            'next_job_state': payload['nextJobState'],
          },
        );
        return;
      case 'extra_submission':
        final body = <String, dynamic>{};
        final n = payload['notes'];
        if (n is String && n.trim().isNotEmpty) body['notes'] = n.trim();
        final media = payload['media'];
        if (media is List && media.isNotEmpty) body['media'] = media;
        await _api.post<Map<String, dynamic>>(
          '/diary-events/${payload['diaryId']}/extra-submissions',
          data: body,
        );
        return;
      case 'office_task_complete':
        await _api.patch<Map<String, dynamic>>(
          '/mobile/jobs/${payload['jobId']}/office-tasks/${payload['taskId']}',
          data: <String, dynamic>{'completed': true},
        );
        return;
      case 'technical_note':
        final body = <String, dynamic>{};
        final n = payload['notes'];
        if (n is String && n.trim().isNotEmpty) body['notes'] = n.trim();
        final media = payload['media'];
        if (media is List && media.isNotEmpty) body['media'] = media;
        await _api.post<Map<String, dynamic>>(
          '/diary-events/${payload['diaryId']}/technical-notes',
          data: body,
        );
        return;
      default:
        throw UnsupportedError('Unknown offline op: $kind');
    }
  }

  /// Clears queued mutations (e.g. after logout).
  Future<void> clearAllPending() async {
    await _ensureBox();
    await _box.remove(_opsKey);
    pendingCount.value = 0;
    queueErrorMessage.value = null;
    queueErrorBlocksProgress.value = false;
  }

  void dismissQueueError() {
    queueErrorMessage.value = null;
    queueErrorBlocksProgress.value = false;
  }

  /// Flushes queued API calls in order. Refreshes home when the queue finishes or pauses on error.
  Future<void> processQueue() async {
    if (_processing) return;
    if (!Get.isRegistered<ConnectivityService>() ||
        !Get.find<ConnectivityService>().isOnline.value) {
      return;
    }
    _processing = true;
    isProcessingQueue.value = true;
    queueErrorMessage.value = null;
    queueErrorBlocksProgress.value = false;
    var didPopAny = false;
    try {
      await _ensureBox();
      while (Get.find<ConnectivityService>().isOnline.value) {
        final ops = _readOps();
        if (ops.isEmpty) break;
        final row = ops.first;
        final kind = row['kind'] as String;
        final stored = row['payload'] as String;
        try {
          final payload = await _decodePayload(stored);
          await _executeOne(kind, payload);
          await _deletePayloadFileIfAny(stored);
          ops.removeAt(0);
          await _writeOps(ops);
          didPopAny = true;
        } catch (e) {
          queueErrorMessage.value = _humanizeQueueError(e);
          if (e is ApiException && !_isLikelyTransient(e)) {
            queueErrorBlocksProgress.value = true;
          } else {
            queueErrorBlocksProgress.value = false;
          }
          break;
        }
      }
    } finally {
      _processing = false;
      isProcessingQueue.value = false;
      if (_readOps().isEmpty) {
        queueErrorMessage.value = null;
        queueErrorBlocksProgress.value = false;
      }
      await _refreshCount();
      if (Get.isRegistered<HomeController>()) {
        try {
          await Get.find<HomeController>().refreshHome();
        } catch (_) {
          /* ignore */
        }
      }
      if (didPopAny && _readOps().isEmpty) {
        try {
          Get.snackbar(
            'Synced',
            'All pending changes were sent successfully.',
            snackPosition: SnackPosition.BOTTOM,
            margin: const EdgeInsets.all(16),
            borderRadius: 12,
            duration: const Duration(seconds: 3),
          );
        } catch (_) {
          /* no overlay */
        }
      }
    }
  }

  String _humanizeQueueError(Object e) {
    if (e is ApiException) {
      return e.message;
    }
    return e.toString().replaceFirst('Exception: ', '');
  }

  bool _isLikelyTransient(ApiException e) {
    final code = e.statusCode;
    if (code != null && code >= 500) {
      return true;
    }
    final m = e.message.toLowerCase();
    if (m.contains('internet') ||
        m.contains('timed out') ||
        m.contains('connection')) {
      return true;
    }
    final orig = e.original;
    if (orig is DioException) {
      return orig.type == DioExceptionType.connectionError ||
          orig.type == DioExceptionType.connectionTimeout ||
          orig.type == DioExceptionType.sendTimeout ||
          orig.type == DioExceptionType.receiveTimeout;
    }
    return false;
  }
}
