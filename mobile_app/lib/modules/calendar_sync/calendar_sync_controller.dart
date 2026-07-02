import 'package:device_calendar/device_calendar.dart';
import 'package:get/get.dart';

import '../../core/services/calendar_sync_service.dart';

class CalendarSyncController extends GetxController {
  CalendarSyncController({CalendarSyncService? service})
      : _service = service ?? Get.find<CalendarSyncService>();

  final CalendarSyncService _service;

  final RxBool loading = false.obs;
  final RxBool permissionDenied = false.obs;
  final RxList<Calendar> calendars = <Calendar>[].obs;

  final RxBool enabled = false.obs;
  final RxnString calendarId = RxnString();
  final RxBool syncDiary = true.obs;
  final RxBool syncHolidays = true.obs;
  final RxInt reminderMinutes = 30.obs;
  final Rxn<DateTime> lastSyncedAt = Rxn<DateTime>();
  final RxString status = ''.obs;

  RxBool get syncing => _service.syncing;

  static const reminderOptions = <int>[0, 10, 15, 30, 60, 120, 1440];

  @override
  void onInit() {
    super.onInit();
    _readPrefs();
    loadCalendars();
  }

  void _readPrefs() {
    enabled.value = _service.enabled;
    calendarId.value = _service.calendarId;
    syncDiary.value = _service.syncDiary;
    syncHolidays.value = _service.syncHolidays;
    reminderMinutes.value = _service.reminderMinutes;
    lastSyncedAt.value = _service.lastSyncedAt;
  }

  Future<void> loadCalendars() async {
    loading.value = true;
    permissionDenied.value = false;
    try {
      final granted = await _service.ensurePermissions();
      if (!granted) {
        permissionDenied.value = true;
        return;
      }
      final list = await _service.writableCalendars();
      calendars.assignAll(list);
      // Default to the device's default calendar if none picked yet.
      if (calendarId.value == null && list.isNotEmpty) {
        final def = list.firstWhereOrNull((c) => c.isDefault == true) ?? list.first;
        calendarId.value = def.id;
        await _service.setCalendarId(def.id);
      }
    } finally {
      loading.value = false;
    }
  }

  Future<void> setEnabled(bool value) async {
    if (value) {
      final granted = await _service.ensurePermissions();
      if (!granted) {
        permissionDenied.value = true;
        enabled.value = false;
        return;
      }
      if (calendars.isEmpty) await loadCalendars();
      if (calendarId.value == null) {
        status.value = 'Pick a calendar to sync into first.';
        enabled.value = false;
        return;
      }
      await _service.setEnabled(true);
      enabled.value = true;
      await runSync();
    } else {
      await _service.disableAndClear();
      enabled.value = false;
      lastSyncedAt.value = null;
      status.value = 'Sync turned off and WorkPilot events removed.';
    }
  }

  Future<void> selectCalendar(String? id) async {
    if (id == null) return;
    calendarId.value = id;
    await _service.setCalendarId(id);
    if (enabled.value) await runSync();
  }

  Future<void> setSyncDiary(bool value) async {
    syncDiary.value = value;
    await _service.setSyncDiary(value);
    if (enabled.value) await runSync();
  }

  Future<void> setSyncHolidays(bool value) async {
    syncHolidays.value = value;
    await _service.setSyncHolidays(value);
    if (enabled.value) await runSync();
  }

  Future<void> setReminderMinutes(int value) async {
    reminderMinutes.value = value;
    await _service.setReminderMinutes(value);
    if (enabled.value) await runSync();
  }

  Future<void> runSync() async {
    status.value = '';
    final result = await _service.syncNow();
    lastSyncedAt.value = _service.lastSyncedAt;
    if (!result.ok) {
      status.value = result.error ?? 'Sync failed.';
    } else {
      status.value =
          'Synced ${result.total} event${result.total == 1 ? '' : 's'}'
          '${result.deleted > 0 ? ' · removed ${result.deleted}' : ''}.';
    }
  }

  String calendarLabel(Calendar c) {
    final name = (c.name ?? 'Calendar').trim();
    final account = (c.accountName ?? '').trim();
    if (account.isEmpty || account == name) return name;
    return '$name · $account';
  }
}
