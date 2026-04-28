import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../../../app/routes/app_routes.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/offline/diary_timesheet_sync.dart';
import '../../../core/offline/offline_api_support.dart';
import '../../../core/services/storage_service.dart';
import '../../../data/models/diary_event_row.dart';
import '../../../data/models/mobile_home_response.dart';
import '../../../data/models/my_office_task_row.dart';
import '../../../data/repositories/mobile_repository.dart';

class HomeController extends GetxController {
  HomeController({StorageService? storage, MobileRepository? mobile})
    : _storage = storage ?? Get.find<StorageService>(),
      _mobile = mobile ?? Get.find<MobileRepository>();

  final StorageService _storage;
  final MobileRepository _mobile;

  /// Bottom nav: 0 Home, 1 Diary, 2 Profile
  final RxInt navIndex = 0.obs;

  /// Cached `/api/mobile/home` payload.
  final Rxn<MobileHomeResponse> home = Rxn<MobileHomeResponse>();

  final RxBool homeLoading = false.obs;
  final homeError = ''.obs;

  final RxList<DiaryEventRow> diaryEvents = <DiaryEventRow>[].obs;
  final RxBool diaryLoading = false.obs;

  /// First name for “Hi …”
  final RxString greetingFirstName = 'there'.obs;

  /// e.g. `1.2.3 (45)` shown in Profile → App.
  final RxString appVersionLabel = ''.obs;

  /// True when a status-driven segment is open (travelling or on site).
  final RxBool clockedIn = false.obs;
  final RxString timesheetPhaseLabel = ''.obs;
  final RxInt elapsedSeconds = 0.obs;
  final RxnInt updatingDiaryEventId = RxnInt();
  final RxnInt updatingOfficeTaskId = RxnInt();

  Timer? _timesheetTicker;

  bool get officerFeatures => home.value?.officerFeatures ?? false;

  @override
  void onInit() {
    super.onInit();
    _loadGreetingName();
    _loadAppVersion();
    refreshHome();
    ever<int>(navIndex, (i) {
      if (i == 1 && officerFeatures) {
        loadDiaryWeek();
      }
    });
  }

  Future<void> _loadAppVersion() async {
    try {
      final p = await PackageInfo.fromPlatform();
      final v = p.version.trim();
      final b = p.buildNumber.trim();
      if (v.isEmpty && b.isEmpty) return;
      appVersionLabel.value = b.isNotEmpty ? '$v ($b)' : v;
    } catch (_) {
      /* ignore on unsupported platforms */
    }
  }

  Future<void> refreshHome() async {
    homeLoading.value = true;
    homeError.value = '';
    try {
      final r = await _mobile.fetchHome();
      home.value = r.data;
      if (r.fromCache) {
        homeError.value = 'Offline — showing last synced home data.';
      } else {
        homeError.value = '';
      }
      _applyGreetingFromProfile(r.data);
      _applyHomeToTimesheet(r.data);
      if (r.data.officerFeatures) {
        await loadDiaryWeek();
      } else {
        diaryEvents.clear();
      }
    } on ApiException catch (e) {
      if (apiExceptionLooksLikeNoConnection(e) && home.value != null) {
        homeError.value = 'Offline — showing last synced home data.';
      } else {
        homeError.value = e.message;
      }
    } catch (e) {
      homeError.value = e.toString();
    } finally {
      homeLoading.value = false;
    }
  }

  void _applyGreetingFromProfile(MobileHomeResponse h) {
    final raw =
        h.profile?.fullName ??
        h.profile?.email ??
        h.email ??
        _nameFromStoredUser() ??
        '';
    greetingFirstName.value = _firstNameFrom(raw.isEmpty ? 'there' : raw);
  }

  String? _nameFromStoredUser() {
    final raw = _storage.userJson;
    if (raw == null || raw.isEmpty) return null;
    try {
      final map = jsonDecode(raw) as Map<String, dynamic>;
      return map['full_name'] as String? ??
          map['name'] as String? ??
          map['email'] as String?;
    } catch (_) {
      return null;
    }
  }

  void _applyHomeToTimesheet(MobileHomeResponse h) {
    _timesheetTicker?.cancel();
    _timesheetTicker = null;
    if (!h.officerFeatures) {
      clockedIn.value = false;
      timesheetPhaseLabel.value = '';
      elapsedSeconds.value = 0;
      return;
    }
    final active = h.activeTimesheet;
    if (active != null) {
      clockedIn.value = true;
      timesheetPhaseLabel.value = active.segmentLabel;
      final start = active.clockInUtc;
      final now = DateTime.now().toUtc();
      elapsedSeconds.value = now.difference(start).inSeconds.clamp(0, 1 << 30);
      _startTimesheetTicker();
    } else {
      clockedIn.value = false;
      timesheetPhaseLabel.value = '';
      elapsedSeconds.value = 0;
    }
  }

  void _startTimesheetTicker() {
    _timesheetTicker?.cancel();
    _timesheetTicker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!clockedIn.value) return;
      elapsedSeconds.value++;
    });
  }

  Future<void> loadDiaryWeek() async {
    if (!officerFeatures) return;
    diaryLoading.value = true;
    // Home "next" uses start+duration>now, so a visit that started *yesterday*
    // can still be upcoming. Align diary list with (yesterday 00:00)…(+6d) to match
    // the same 8 local calendar days that were [today..today+7] end, but shifted
    // back by one so yesterday's visits are included.
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final firstDay = today.subtract(const Duration(days: 1));
    final endDay = today.add(const Duration(days: 6));
    final rangeStart = DateTime(
      firstDay.year,
      firstDay.month,
      firstDay.day,
      0,
      0,
      0,
      0,
    ).toIso8601String();
    final rangeEnd = DateTime(
      endDay.year,
      endDay.month,
      endDay.day,
      23,
      59,
      59,
      999,
    ).toIso8601String();
    try {
      final list = await _mobile.fetchDiaryEvents(
        rangeStart: rangeStart,
        rangeEnd: rangeEnd,
      );
      diaryEvents.assignAll(list);
    } on ApiException catch (e) {
      if (apiExceptionLooksLikeNoConnection(e)) {
        final cached = _storage.readCachedDiaryEventsIfRangeMatches(
          rangeStart: rangeStart,
          rangeEnd: rangeEnd,
        );
        if (cached != null && cached.isNotEmpty) {
          diaryEvents.assignAll(cached.map(DiaryEventRow.fromJson).toList());
        } else if (diaryEvents.isEmpty) {
          diaryEvents.clear();
        }
      } else {
        diaryEvents.clear();
      }
    } finally {
      diaryLoading.value = false;
    }
  }

  void patchDiaryEventInWeekList(
    int diaryId,
    String status, {
    String? abortReason,
  }) {
    final i = diaryEvents.indexWhere((e) => e.diaryId == diaryId);
    if (i < 0) return;
    final cur = diaryEvents[i];
    diaryEvents[i] = cur.copyWith(
      eventStatus: status,
      abortReason: abortReason ?? cur.abortReason,
    );
    diaryEvents.refresh();
  }

  void applyOptimisticTimesheetFromDiaryStatus(String status) {
    if (diaryStatusClosesTimesheet(status)) {
      _timesheetTicker?.cancel();
      _timesheetTicker = null;
      clockedIn.value = false;
      timesheetPhaseLabel.value = '';
      elapsedSeconds.value = 0;
      return;
    }
    if (diaryStatusOpensTravelling(status)) {
      _timesheetTicker?.cancel();
      clockedIn.value = true;
      timesheetPhaseLabel.value = optimisticSegmentLabelForDiaryStatus(status);
      elapsedSeconds.value = 0;
      _startTimesheetTicker();
      return;
    }
    if (diaryStatusOpensOnSite(status)) {
      _timesheetTicker?.cancel();
      clockedIn.value = true;
      timesheetPhaseLabel.value = optimisticSegmentLabelForDiaryStatus(status);
      elapsedSeconds.value = 0;
      _startTimesheetTicker();
    }
  }

  void removeOfficeTaskFromCache(int taskId) {
    final h = home.value;
    if (h == null) return;
    home.value = h.copyWith(
      myOfficeTasksOpen: h.myOfficeTasksOpen
          .where((t) => t.id != taskId)
          .toList(),
    );
  }

  /// Best-effort local lookup for a diary event (used for showing “where” in timesheet).
  DiaryEventRow? diaryById(int diaryEventId) {
    if (diaryEventId <= 0) return null;
    final i = diaryEvents.indexWhere((e) => e.diaryId == diaryEventId);
    if (i >= 0) return diaryEvents[i];
    final next = home.value?.nextDiaryEvent;
    if (next != null && next.diaryId == diaryEventId) return next;
    for (final e in home.value?.upcomingDiary ?? const <DiaryEventRow>[]) {
      if (e.diaryId == diaryEventId) return e;
    }
    return null;
  }

  void _loadGreetingName() {
    final raw = _storage.userJson;
    if (raw == null || raw.isEmpty) {
      greetingFirstName.value = 'there';
      return;
    }
    try {
      final map = jsonDecode(raw) as Map<String, dynamic>;
      final name =
          map['name'] as String? ??
          map['full_name'] as String? ??
          map['fullName'] as String? ??
          map['email'] as String? ??
          '';
      greetingFirstName.value = _firstNameFrom(name);
    } catch (_) {
      greetingFirstName.value = 'there';
    }
  }

  String _firstNameFrom(String raw) {
    var s = raw.trim();
    if (s.isEmpty) return 'there';
    if (s.contains('@')) {
      final local = s.split('@').first;
      final part = local
          .split(RegExp(r'[._]'))
          .firstWhere((e) => e.isNotEmpty, orElse: () => 'there');
      return _capitalize(part);
    }
    return _capitalize(s.split(RegExp(r'\s+')).first);
  }

  String _capitalize(String s) {
    if (s.isEmpty) return s;
    return s[0].toUpperCase() + s.substring(1).toLowerCase();
  }

  void goToDiary() => navIndex.value = 1;

  void goToOpenJobs() => Get.toNamed(AppRoutes.openJobs);

  void openJobFromTask(MyOfficeTaskRow task) {
    Get.toNamed(AppRoutes.openJobDetail, arguments: task.toOpenJobSummary());
  }

  /// Completes an office task assigned to this officer (dashboard "@" assignee).
  Future<void> completeMyOfficeTask(MyOfficeTaskRow task) async {
    if (!officerFeatures) return;
    updatingOfficeTaskId.value = task.id;
    try {
      final synced = await _mobile.completeMyOfficeTask(
        jobId: task.jobId,
        taskId: task.id,
      );
      if (synced) {
        await refreshHome();
      } else {
        removeOfficeTaskFromCache(task.id);
        Get.snackbar(
          'Office task',
          'Saved offline — will sync when you are back online.',
          snackPosition: SnackPosition.BOTTOM,
          margin: const EdgeInsets.all(16),
          borderRadius: 12,
        );
      }
    } on ApiException catch (e) {
      Get.snackbar(
        'Office task',
        e.message,
        snackPosition: SnackPosition.BOTTOM,
        margin: const EdgeInsets.all(16),
        borderRadius: 12,
      );
    } finally {
      updatingOfficeTaskId.value = null;
    }
  }

  /// Diary API canonical statuses: `travelling_to_site`, `arrived_at_site`, `completed`.
  Future<void> updateDiaryVisitStatus(int diaryEventId, String status) async {
    if (!officerFeatures) return;
    updatingDiaryEventId.value = diaryEventId;
    try {
      final synced = await _mobile.patchDiaryEventStatus(diaryEventId, status);
      if (synced) {
        await refreshHome();
      } else {
        patchDiaryEventInWeekList(diaryEventId, status);
        applyOptimisticTimesheetFromDiaryStatus(status);
        Get.snackbar(
          'Visit',
          'Saved offline — will sync when you are back online.',
          snackPosition: SnackPosition.BOTTOM,
          margin: const EdgeInsets.all(16),
          borderRadius: 12,
        );
      }
    } on ApiException catch (e) {
      Get.snackbar(
        'Visit status',
        e.message,
        snackPosition: SnackPosition.BOTTOM,
        margin: const EdgeInsets.all(16),
        borderRadius: 12,
      );
    } finally {
      updatingDiaryEventId.value = null;
    }
  }

  void openTimesheetHistory() {
    Get.toNamed(AppRoutes.timesheetHistory);
  }

  String get formattedElapsed {
    final s = elapsedSeconds.value;
    final h = s ~/ 3600;
    final m = (s % 3600) ~/ 60;
    final sec = s % 60;
    return '${h.toString().padLeft(2, '0')} : ${m.toString().padLeft(2, '0')} : ${sec.toString().padLeft(2, '0')}';
  }

  @override
  void onClose() {
    _timesheetTicker?.cancel();
    super.onClose();
  }
}
