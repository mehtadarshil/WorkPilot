import 'dart:convert';

import 'package:get/get.dart';
import 'package:get_storage/get_storage.dart';

import '../offline/offline_queue_service.dart';
import '../values/app_constants.dart';

/// Key-value persistence (tokens, flags). Initialized in [main] via `GetStorage.init()`.
class StorageService extends GetxService {
  final GetStorage _box = GetStorage();

  String? get authToken => _box.read(AppConstants.storageAuthToken) as String?;

  Future<void> setAuthToken(String? value) async {
    if (value == null || value.isEmpty) {
      await _box.remove(AppConstants.storageAuthToken);
    } else {
      await _box.write(AppConstants.storageAuthToken, value);
    }
  }

  String? get userJson => _box.read(AppConstants.storageUserJson) as String?;

  Future<void> setUserJson(String? value) async {
    if (value == null || value.isEmpty) {
      await _box.remove(AppConstants.storageUserJson);
    } else {
      await _box.write(AppConstants.storageUserJson, value);
    }
  }

  Future<void> clearSession() async {
    await _box.remove(AppConstants.storageAuthToken);
    await _box.remove(AppConstants.storageUserJson);
    await clearOfflineCaches();
    if (Get.isRegistered<OfflineQueueService>()) {
      await Get.find<OfflineQueueService>().clearAllPending();
    }
  }

  static const _cacheAbortReasons = 'cache_abort_reasons_labels';
  static const _cacheDiaryWeek = 'cache_diary_week_json';
  static const _cacheMobileHome = 'cache_mobile_home_v1';
  static const _cacheDiaryDetailsMap = 'cache_diary_details_v1';

  List<String>? readCachedAbortReasonLabels() {
    final raw = _box.read(_cacheAbortReasons);
    if (raw is! List) return null;
    return raw
        .map((e) => e.toString())
        .where((s) => s.trim().isNotEmpty)
        .toList();
  }

  Future<void> writeCachedAbortReasonLabels(List<String> labels) async {
    await _box.write(_cacheAbortReasons, labels);
  }

  /// Last successful diary list for the week range (offline fallback).
  String? readCachedDiaryWeekJson() => _box.read(_cacheDiaryWeek) as String?;

  Future<void> writeCachedDiaryWeekJson(String json) async {
    await _box.write(_cacheDiaryWeek, json);
  }

  String? readCachedMobileHomeJson() => _box.read(_cacheMobileHome) as String?;

  Future<void> writeCachedMobileHomeJson(String json) async {
    await _box.write(_cacheMobileHome, json);
  }

  Map<String, dynamic>? readCachedDiaryDetailRaw(int diaryEventId) {
    final raw = _box.read(_cacheDiaryDetailsMap);
    if (raw is! Map) return null;
    final s = raw['$diaryEventId'];
    if (s is! String || s.isEmpty) return null;
    try {
      return jsonDecode(s) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  Future<void> writeCachedDiaryDetailRaw(
    int diaryEventId,
    Map<String, dynamic> apiBody,
  ) async {
    final raw = _box.read(_cacheDiaryDetailsMap);
    final map = raw is Map
        ? Map<String, dynamic>.from(raw)
        : <String, dynamic>{};
    map['$diaryEventId'] = jsonEncode(apiBody);
    await _box.write(_cacheDiaryDetailsMap, map);
  }

  Future<void> clearOfflineCaches() async {
    await _box.remove(_cacheAbortReasons);
    await _box.remove(_cacheDiaryWeek);
    await _box.remove(_cacheMobileHome);
    await _box.remove(_cacheDiaryDetailsMap);
  }

  /// Returns cached events if [rangeStart] and [rangeEnd] match the cached envelope.
  List<Map<String, dynamic>>? readCachedDiaryEventsIfRangeMatches({
    required String rangeStart,
    required String rangeEnd,
  }) {
    final raw = readCachedDiaryWeekJson();
    if (raw == null || raw.isEmpty) return null;
    try {
      final m = jsonDecode(raw) as Map<String, dynamic>;
      if (m['range_start'] != rangeStart || m['range_end'] != rangeEnd) {
        return null;
      }
      final ev = m['events'];
      if (ev is! List) return null;
      return ev.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    } catch (_) {
      return null;
    }
  }

  Future<void> writeCachedDiaryEnvelope({
    required String rangeStart,
    required String rangeEnd,
    required List<Map<String, dynamic>> events,
  }) async {
    await writeCachedDiaryWeekJson(
      jsonEncode(<String, dynamic>{
        'range_start': rangeStart,
        'range_end': rangeEnd,
        'events': events,
      }),
    );
  }
}
