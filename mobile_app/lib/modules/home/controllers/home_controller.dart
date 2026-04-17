import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../../app/routes/app_routes.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/services/storage_service.dart';
import '../../../data/models/diary_event_row.dart';
import '../../../data/models/mobile_home_response.dart';
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

  final RxBool clockedIn = false.obs;
  final RxBool onBreak = false.obs;
  final RxInt elapsedSeconds = 0.obs;

  Timer? _timesheetTicker;

  bool get officerFeatures => home.value?.officerFeatures ?? false;

  @override
  void onInit() {
    super.onInit();
    _loadGreetingName();
    refreshHome();
    ever<int>(navIndex, (i) {
      if (i == 1 && officerFeatures) {
        loadDiaryWeek();
      }
    });
  }

  Future<void> refreshHome() async {
    homeLoading.value = true;
    homeError.value = '';
    try {
      final h = await _mobile.fetchHome();
      home.value = h;
      _applyGreetingFromProfile(h);
      _applyHomeToTimesheet(h);
      if (h.officerFeatures) {
        await loadDiaryWeek();
      } else {
        diaryEvents.clear();
      }
    } on ApiException catch (e) {
      homeError.value = e.message;
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
      onBreak.value = false;
      elapsedSeconds.value = 0;
      return;
    }
    final active = h.activeTimesheet;
    if (active != null) {
      clockedIn.value = true;
      onBreak.value = false;
      final start = active.clockInUtc;
      final now = DateTime.now().toUtc();
      elapsedSeconds.value = now.difference(start).inSeconds.clamp(0, 1 << 30);
      _startTimesheetTicker();
    } else {
      clockedIn.value = false;
      onBreak.value = false;
      elapsedSeconds.value = 0;
    }
  }

  void _startTimesheetTicker() {
    _timesheetTicker?.cancel();
    _timesheetTicker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!clockedIn.value) return;
      if (onBreak.value) return;
      elapsedSeconds.value++;
    });
  }

  Future<void> loadDiaryWeek() async {
    if (!officerFeatures) return;
    diaryLoading.value = true;
    try {
      final now = DateTime.now();
      final from = DateTime(now.year, now.month, now.day);
      final to = from.add(const Duration(days: 7));
      String iso(DateTime d) =>
          '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
      final list = await _mobile.fetchDiaryEvents(from: iso(from), to: iso(to));
      diaryEvents.assignAll(list);
    } on ApiException catch (_) {
      diaryEvents.clear();
    } finally {
      diaryLoading.value = false;
    }
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

  Future<void> clockIn() async {
    if (!officerFeatures) {
      Get.snackbar(
        'Timesheet',
        'Timesheet is available for field officer accounts.',
        snackPosition: SnackPosition.BOTTOM,
        margin: const EdgeInsets.all(16),
        borderRadius: 12,
      );
      return;
    }
    try {
      await _mobile.clockIn();
      await refreshHome();
    } on ApiException catch (e) {
      Get.snackbar(
        'Clock in',
        e.message,
        snackPosition: SnackPosition.BOTTOM,
        margin: const EdgeInsets.all(16),
      );
    }
  }

  void toggleBreak() {
    if (!clockedIn.value) return;
    onBreak.value = !onBreak.value;
  }

  Future<void> clockOut() async {
    if (!officerFeatures) return;
    if (!clockedIn.value) return;
    try {
      await _mobile.clockOut();
      await refreshHome();
    } on ApiException catch (e) {
      Get.snackbar(
        'Clock out',
        e.message,
        snackPosition: SnackPosition.BOTTOM,
        margin: const EdgeInsets.all(16),
      );
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
