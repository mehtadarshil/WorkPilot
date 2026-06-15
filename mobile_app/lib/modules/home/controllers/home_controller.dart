import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../../../app/routes/app_routes.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/offline/diary_timesheet_sync.dart';
import '../../../core/offline/offline_api_support.dart';
import '../../../core/services/biometric_service.dart';
import '../../../core/services/storage_service.dart';
import '../../../core/services/user_profile_cache.dart';
import '../../../data/models/diary_event_row.dart';
import '../../../data/models/mobile_home_response.dart';
import '../../../data/models/my_office_task_row.dart';
import '../../../data/repositories/mobile_repository.dart';

/// Diary list filter: personal field schedule vs tenant-wide (admin).
enum DiaryListScope { mine, team }

enum DiaryViewMode { list, calendar }

enum DiaryFilter { today, sevenDays, month }

class HomeController extends GetxController with WidgetsBindingObserver {
  HomeController({StorageService? storage, MobileRepository? mobile})
    : _storage = storage ?? Get.find<StorageService>(),
      _mobile = mobile ?? Get.find<MobileRepository>();

  final StorageService _storage;
  final MobileRepository _mobile;

  /// Bottom nav: 0 Home, 1 Diary, [2 Work when enabled], last Profile
  final RxInt navIndex = 0.obs;

  /// Cached `/api/mobile/home` payload.
  final Rxn<MobileHomeResponse> home = Rxn<MobileHomeResponse>();

  final RxBool homeLoading = false.obs;
  final homeError = ''.obs;

  final RxList<DiaryEventRow> diaryEvents = <DiaryEventRow>[].obs;
  final RxBool diaryLoading = false.obs;
  final Rx<DiaryListScope> diaryListScope = DiaryListScope.mine.obs;
  final Rx<DiaryViewMode> diaryViewMode = DiaryViewMode.list.obs;
  final Rx<DiaryFilter> diaryFilter = DiaryFilter.sevenDays.obs;
  final Rx<DateTime> calendarFocusedMonth = DateTime.now().obs;
  final Rx<DateTime> calendarSelectedDate = DateTime.now().obs;

  /// Bump after profile edit so Profile tab reloads photo/summary.
  final RxInt profileRevision = 0.obs;

  void bumpProfileRevision() {
    profileRevision.value++;
    if (Get.isRegistered<UserProfileCache>()) {
      unawaited(Get.find<UserProfileCache>().refresh());
    }
  }

  /// First name for “Hi …”
  final RxString greetingFirstName = 'there'.obs;

  /// e.g. `1.2.3 (45)` shown in Profile → App.
  final RxString appVersionLabel = ''.obs;

  /// True when a status-driven segment is open (travelling or on site).
  final RxBool clockedIn = false.obs;
  final RxString timesheetPhaseLabel = ''.obs;
  final RxInt elapsedSeconds = 0.obs;
  final RxnInt updatingOfficeTaskId = RxnInt();

  Timer? _timesheetTicker;

  DateTime? _pausedAt;

  static const _lockAfterBackgroundDuration = Duration(seconds: 30);

  bool get officerFeatures => home.value?.officerFeatures ?? false;

  /// Personal diary + field actions (linked officer profile).
  bool get canViewMyDiary => officerFeatures;

  /// Tenant-wide diary (admin / staff with jobs or scheduling).
  bool get canViewTeamDiary {
    final h = home.value;
    if (h == null) return false;
    final role = h.role.toUpperCase();
    if (role == 'SUPER_ADMIN' || role == 'ADMIN') return true;
    if (role == 'STAFF') {
      return h.mobilePermissions['jobs'] == true || h.mobilePermissions['scheduling'] == true;
    }
    return false;
  }

  bool get showDiaryScopeTabs => canViewMyDiary && canViewTeamDiary;

  bool get canUseDiaryTab => canViewMyDiary || canViewTeamDiary;

  /// True for ADMIN / SUPER_ADMIN, or STAFF with the 'scheduling' permission.
  /// Mirrors the `requireAdmin + requirePermission('scheduling')` guard on the
  /// backend `PATCH /api/diary-events/:id/reschedule` endpoint.
  bool get canEditBookedJobs {
    final h = home.value;
    if (h == null) return false;
    final role = h.role.toUpperCase();
    if (role == 'SUPER_ADMIN' || role == 'ADMIN') return true;
    if (role == 'STAFF') return h.mobilePermissions['scheduling'] == true;
    return false;
  }

  int? get myOfficerId => home.value?.profile?.id;

  bool isOwnDiaryVisit(DiaryEventRow e) {
    final oid = myOfficerId;
    if (oid == null) return false;
    return e.officerId == oid;
  }

  bool get showWorkHubTab => home.value?.showWorkHubTab ?? false;

  int get tabCount => showWorkHubTab ? 4 : 3;

  int get profileTabIndex => tabCount - 1;

  void clampNavToValidRange() {
    final maxIdx = profileTabIndex;
    if (navIndex.value > maxIdx) navIndex.value = maxIdx;
  }

  @override
  void onInit() {
    super.onInit();
    WidgetsBinding.instance.addObserver(this);
    _loadGreetingName();
    _loadAppVersion();
    refreshHome();
    ever<int>(navIndex, (i) {
      if (i == 1 && canUseDiaryTab) {
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
    if (Get.isRegistered<UserProfileCache>()) {
      unawaited(Get.find<UserProfileCache>().refresh());
    }
    homeLoading.value = true;
    homeError.value = '';
    try {
      final r = await _mobile.fetchHome();
      home.value = r.data;
      clampNavToValidRange();
      if (r.fromCache) {
        homeError.value = 'Offline — showing last synced home data.';
      } else {
        homeError.value = '';
      }
      _applyGreetingFromProfile(r.data);
      _applyHomeToTimesheet(r.data);
      _applyDefaultDiaryScope();
      if (canUseDiaryTab) {
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

  void _applyDefaultDiaryScope() {
    if (!canViewMyDiary && canViewTeamDiary) {
      diaryListScope.value = DiaryListScope.team;
    } else if (canViewMyDiary) {
      diaryListScope.value = DiaryListScope.mine;
    }
  }
  void setDiaryListScope(DiaryListScope scope) {
    if (diaryListScope.value == scope) return;
    diaryListScope.value = scope;
    loadDiaryEvents();
  }

  void setDiaryViewMode(DiaryViewMode mode) {
    if (diaryViewMode.value == mode) return;
    diaryViewMode.value = mode;
    loadDiaryEvents();
  }

  void setDiaryFilter(DiaryFilter filter) {
    if (diaryFilter.value == filter) return;
    diaryFilter.value = filter;
    loadDiaryEvents();
  }

  void selectCalendarDate(DateTime date) {
    calendarSelectedDate.value = date;
    if (date.year != calendarFocusedMonth.value.year || date.month != calendarFocusedMonth.value.month) {
      calendarFocusedMonth.value = DateTime(date.year, date.month, 1);
      loadDiaryEvents();
    }
  }

  void changeCalendarMonth(int delta) {
    final cur = calendarFocusedMonth.value;
    calendarFocusedMonth.value = DateTime(cur.year, cur.month + delta, 1);
    loadDiaryEvents();
  }

  Future<void> loadDiaryWeek() async {
    await loadDiaryEvents();
  }

  Future<void> loadDiaryEvents() async {
    final scope = diaryListScope.value;
    if (scope == DiaryListScope.mine && !canViewMyDiary) return;
    if (scope == DiaryListScope.team && !canViewTeamDiary) return;
    diaryLoading.value = true;

    String rangeStart;
    String rangeEnd;

    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);

    if (scope == DiaryListScope.mine) {
      // Mine view: always default to 7-day upcoming list range
      final firstDay = today.subtract(const Duration(days: 1));
      final endDay = today.add(const Duration(days: 6));
      rangeStart = DateTime(firstDay.year, firstDay.month, firstDay.day, 0, 0, 0, 0).toIso8601String();
      rangeEnd = DateTime(endDay.year, endDay.month, endDay.day, 23, 59, 59, 999).toIso8601String();
    } else {
      // Team view: respect calendar mode and filters
      if (diaryViewMode.value == DiaryViewMode.calendar) {
        final focused = calendarFocusedMonth.value;
        final firstDayOfMonth = DateTime(focused.year, focused.month, 1);
        final lastDayOfMonth = DateTime(focused.year, focused.month + 1, 0);
        final start = firstDayOfMonth.subtract(const Duration(days: 7));
        final end = lastDayOfMonth.add(const Duration(days: 7));
        rangeStart = DateTime(start.year, start.month, start.day, 0, 0, 0, 0).toIso8601String();
        rangeEnd = DateTime(end.year, end.month, end.day, 23, 59, 59, 999).toIso8601String();
      } else {
        switch (diaryFilter.value) {
          case DiaryFilter.today:
            rangeStart = DateTime(today.year, today.month, today.day, 0, 0, 0, 0).toIso8601String();
            rangeEnd = DateTime(today.year, today.month, today.day, 23, 59, 59, 999).toIso8601String();
            break;
          case DiaryFilter.sevenDays:
            final firstDay = today.subtract(const Duration(days: 1));
            final endDay = today.add(const Duration(days: 6));
            rangeStart = DateTime(firstDay.year, firstDay.month, firstDay.day, 0, 0, 0, 0).toIso8601String();
            rangeEnd = DateTime(endDay.year, endDay.month, endDay.day, 23, 59, 59, 999).toIso8601String();
            break;
          case DiaryFilter.month:
            final firstDay = DateTime(today.year, today.month, 1);
            final lastDay = DateTime(today.year, today.month + 1, 0);
            rangeStart = DateTime(firstDay.year, firstDay.month, firstDay.day, 0, 0, 0, 0).toIso8601String();
            rangeEnd = DateTime(lastDay.year, lastDay.month, lastDay.day, 23, 59, 59, 999).toIso8601String();
            break;
        }
      }
    }

    final apiScope = scope == DiaryListScope.team ? 'team' : 'mine';
    try {
      final list = await _mobile.fetchDiaryEvents(
        rangeStart: rangeStart,
        rangeEnd: rangeEnd,
        scope: apiScope,
      );
      diaryEvents.assignAll(list);
    } on ApiException catch (e) {
      if (apiExceptionLooksLikeNoConnection(e)) {
        final cached = _storage.readCachedDiaryEventsIfRangeMatches(
          rangeStart: rangeStart,
          rangeEnd: rangeEnd,
          scope: apiScope,
        );
        if (cached != null && cached.isNotEmpty) {
          diaryEvents.assignAll(
            _safeParseDiaryRows(cached),
          );
        } else if (diaryEvents.isEmpty) {
          diaryEvents.clear();
        }
      } else {
        diaryEvents.clear();
      }
    } catch (_) {
      diaryEvents.clear();
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

  /// Parse cached diary rows one at a time; skip any row that throws so a
  /// single bad entry (e.g., schema drift in stored data) cannot blank the
  /// whole week.
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
    WidgetsBinding.instance.removeObserver(this);
    _timesheetTicker?.cancel();
    super.onClose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused || state == AppLifecycleState.inactive) {
      _pausedAt = DateTime.now();
    } else if (state == AppLifecycleState.resumed) {
      _maybeLockOnResume();
    }
  }

  Future<void> _maybeLockOnResume() async {
    final paused = _pausedAt;
    _pausedAt = null;
    if (paused == null) return;
    final inBackground = DateTime.now().difference(paused);
    if (inBackground < _lockAfterBackgroundDuration) return;

    final biometric = BiometricService();
    final canAuth = await biometric.canAuthenticate();
    final enabled = biometric.isBiometricEnabled;
    if (canAuth && enabled && Get.currentRoute != AppRoutes.biometricLock) {
      Get.toNamed(AppRoutes.biometricLock);
    }
  }
}
