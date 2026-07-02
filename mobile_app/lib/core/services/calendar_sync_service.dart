import 'dart:convert';

import 'package:device_calendar/device_calendar.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:get/get.dart';
import 'package:get_storage/get_storage.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

import '../../data/models/diary_event_row.dart';
import '../../data/repositories/mobile_repository.dart';
import '../values/app_constants.dart';

/// Outcome of a sync run, surfaced to the UI.
class CalendarSyncResult {
  const CalendarSyncResult({
    this.created = 0,
    this.updated = 0,
    this.deleted = 0,
    this.error,
  });

  final int created;
  final int updated;
  final int deleted;
  final String? error;

  bool get ok => error == null;
  int get total => created + updated;
}

/// Syncs WorkPilot diary events and holidays into the device's native calendar
/// (Apple Calendar / Google Calendar / whatever is installed), so users get
/// native reminders. This is a per-device, per-user preference stored locally.
class CalendarSyncService extends GetxService {
  CalendarSyncService({MobileRepository? repository, GetStorage? box})
      : _repo = repository ?? Get.find<MobileRepository>(),
        _box = box ?? GetStorage();

  final MobileRepository _repo;
  final GetStorage _box;
  final DeviceCalendarPlugin _plugin = DeviceCalendarPlugin();

  bool _tzReady = false;
  final RxBool syncing = false.obs;

  // ---- Preferences ---------------------------------------------------------

  bool get enabled => _box.read(AppConstants.storageCalendarSyncEnabled) == true;
  Future<void> setEnabled(bool value) =>
      _box.write(AppConstants.storageCalendarSyncEnabled, value);

  String? get calendarId {
    final v = _box.read(AppConstants.storageCalendarSyncCalendarId);
    return (v is String && v.isNotEmpty) ? v : null;
  }

  Future<void> setCalendarId(String? id) =>
      _box.write(AppConstants.storageCalendarSyncCalendarId, id ?? '');

  bool get syncDiary =>
      _box.read(AppConstants.storageCalendarSyncDiary) != false; // default on
  Future<void> setSyncDiary(bool value) =>
      _box.write(AppConstants.storageCalendarSyncDiary, value);

  bool get syncHolidays =>
      _box.read(AppConstants.storageCalendarSyncHolidays) != false; // default on
  Future<void> setSyncHolidays(bool value) =>
      _box.write(AppConstants.storageCalendarSyncHolidays, value);

  int get reminderMinutes {
    final v = _box.read(AppConstants.storageCalendarSyncReminderMinutes);
    return (v is num) ? v.toInt() : 30;
  }

  Future<void> setReminderMinutes(int value) =>
      _box.write(AppConstants.storageCalendarSyncReminderMinutes, value);

  DateTime? get lastSyncedAt {
    final v = _box.read(AppConstants.storageCalendarSyncLastSyncedAt);
    return (v is String) ? DateTime.tryParse(v) : null;
  }

  Map<String, String> _readIdMap() {
    final raw = _box.read(AppConstants.storageCalendarSyncIdMap);
    if (raw is String && raw.isNotEmpty) {
      try {
        final decoded = jsonDecode(raw) as Map<String, dynamic>;
        return decoded.map((k, v) => MapEntry(k, v.toString()));
      } catch (_) {}
    }
    return <String, String>{};
  }

  Future<void> _writeIdMap(Map<String, String> map) =>
      _box.write(AppConstants.storageCalendarSyncIdMap, jsonEncode(map));

  // ---- Permissions & calendars --------------------------------------------

  Future<bool> ensurePermissions() async {
    final has = await _plugin.hasPermissions();
    if (has.isSuccess && has.data == true) return true;
    final req = await _plugin.requestPermissions();
    return req.isSuccess && req.data == true;
  }

  /// Writable calendars available on the device (Google, iCloud, local, etc.).
  Future<List<Calendar>> writableCalendars() async {
    if (!await ensurePermissions()) return [];
    final res = await _plugin.retrieveCalendars();
    if (!res.isSuccess || res.data == null) return [];
    return res.data!.where((c) => c.isReadOnly != true).toList();
  }

  Future<void> _ensureTimezone() async {
    if (_tzReady) return;
    tzdata.initializeTimeZones();
    try {
      final info = await FlutterTimezone.getLocalTimezone();
      tz.setLocalLocation(tz.getLocation(info.identifier));
    } catch (_) {
      // Fall back to UTC if the platform channel is unavailable.
    }
    _tzReady = true;
  }

  // ---- Public sync entrypoints --------------------------------------------

  /// Called on app/home load. Silently does nothing unless configured.
  Future<void> syncIfEnabled() async {
    if (!enabled || calendarId == null) return;
    await syncNow();
  }

  /// Runs a full reconciliation of WorkPilot events against the target calendar.
  Future<CalendarSyncResult> syncNow() async {
    if (calendarId == null) {
      return const CalendarSyncResult(error: 'No calendar selected.');
    }
    if (syncing.value) {
      return const CalendarSyncResult(error: 'Sync already in progress.');
    }
    syncing.value = true;
    try {
      if (!await ensurePermissions()) {
        return const CalendarSyncResult(error: 'Calendar permission denied.');
      }
      await _ensureTimezone();

      final desired = await _buildDesiredEvents();
      final existing = _readIdMap();
      final nextMap = <String, String>{};

      var created = 0;
      var updated = 0;
      var deleted = 0;

      for (final entry in desired.entries) {
        final key = entry.key;
        final spec = entry.value;
        final priorId = existing[key];
        final savedId = await _upsert(spec, priorId);
        if (savedId != null) {
          nextMap[key] = savedId;
          if (priorId != null) {
            updated++;
          } else {
            created++;
          }
        }
      }

      // Remove events we previously created that are no longer desired.
      for (final entry in existing.entries) {
        if (desired.containsKey(entry.key)) continue;
        final ok = await _deleteEvent(entry.value);
        if (ok) deleted++;
      }

      await _writeIdMap(nextMap);
      await _box.write(
        AppConstants.storageCalendarSyncLastSyncedAt,
        DateTime.now().toIso8601String(),
      );
      return CalendarSyncResult(
          created: created, updated: updated, deleted: deleted);
    } catch (e) {
      return CalendarSyncResult(error: e.toString());
    } finally {
      syncing.value = false;
    }
  }

  /// Turns off syncing and removes every event WorkPilot created.
  Future<void> disableAndClear() async {
    final existing = _readIdMap();
    for (final id in existing.values) {
      await _deleteEvent(id);
    }
    await _writeIdMap(<String, String>{});
    await setEnabled(false);
  }

  // ---- Event building ------------------------------------------------------

  Future<Map<String, _EventSpec>> _buildDesiredEvents() async {
    final specs = <String, _EventSpec>{};
    final calId = calendarId!;

    if (syncDiary) {
      final now = DateTime.now();
      final start = now.subtract(const Duration(days: 7));
      final end = now.add(const Duration(days: 120));
      List<DiaryEventRow> rows = [];
      try {
        rows = await _repo.fetchDiaryEvents(
          rangeStart: _dayIso(start),
          rangeEnd: _dayIso(end),
          scope: 'mine',
        );
      } catch (_) {}
      for (final r in rows) {
        final s = r.startTime;
        if (s == null) continue;
        final status = (r.eventStatus ?? '').toLowerCase();
        if (status == 'cancelled' || status == 'canceled') continue;
        final duration = (r.durationMinutes ?? 60).clamp(5, 24 * 60);
        final tzStart = tz.TZDateTime.from(s, tz.local);
        final tzEnd = tzStart.add(Duration(minutes: duration));
        final contact = r.displayContactName.trim();
        final title = contact.isNotEmpty
            ? '${r.listTitle} · $contact'
            : r.listTitle;
        specs['diary:${r.diaryId}'] = _EventSpec(
          calendarId: calId,
          title: title,
          start: tzStart,
          end: tzEnd,
          location: r.location?.trim().isNotEmpty == true ? r.location : null,
          description: _diaryNotes(r),
          allDay: false,
          reminderMinutes: reminderMinutes,
        );
      }
    }

    if (syncHolidays) {
      await _addHolidayRequests(specs, calId);
      await _addCompanyHolidays(specs, calId);
    }

    return specs;
  }

  Future<void> _addHolidayRequests(
      Map<String, _EventSpec> specs, String calId) async {
    try {
      final res = await _repo.api
          .get<Map<String, dynamic>>('/holiday-requests');
      final list = (res.data?['requests'] as List<dynamic>?) ?? [];
      for (final raw in list) {
        if (raw is! Map) continue;
        final m = Map<String, dynamic>.from(raw);
        final id = (m['id'] as num?)?.toInt();
        final status = (m['status'] as String? ?? 'pending').toLowerCase();
        if (id == null || status == 'rejected' || status == 'cancelled') {
          continue;
        }
        final startD = _parseDate(m['start_date']);
        final endD = _parseDate(m['end_date']) ?? startD;
        if (startD == null || endD == null) continue;
        final type = (m['leave_type'] as String? ?? 'annual');
        final title = 'Leave: ${_titleCase(type)}'
            '${status == 'pending' ? ' (pending)' : ''}';
        specs['holreq:$id'] = _allDaySpec(
          calId: calId,
          title: title,
          startDate: startD,
          endDate: endD,
          description: (m['reason'] as String?)?.trim(),
        );
      }
    } catch (_) {}
  }

  Future<void> _addCompanyHolidays(
      Map<String, _EventSpec> specs, String calId) async {
    try {
      final res = await _repo.api.get<Map<String, dynamic>>('/holidays');
      final list = (res.data?['holidays'] as List<dynamic>?) ?? [];
      for (final raw in list) {
        if (raw is! Map) continue;
        final m = Map<String, dynamic>.from(raw);
        final id = (m['id'] as num?)?.toInt();
        final date = _parseDate(m['holiday_date']);
        if (id == null || date == null) continue;
        specs['holco:$id'] = _allDaySpec(
          calId: calId,
          title: (m['title'] as String?)?.trim().isNotEmpty == true
              ? m['title'] as String
              : 'Company holiday',
          startDate: date,
          endDate: date,
          description: (m['description'] as String?)?.trim(),
        );
      }
    } catch (_) {}
  }

  _EventSpec _allDaySpec({
    required String calId,
    required String title,
    required DateTime startDate,
    required DateTime endDate,
    String? description,
  }) {
    final s = tz.TZDateTime(tz.local, startDate.year, startDate.month, startDate.day);
    // End date is inclusive on the WorkPilot side; give it the whole day.
    final e = tz.TZDateTime(tz.local, endDate.year, endDate.month, endDate.day, 23, 59);
    return _EventSpec(
      calendarId: calId,
      title: title,
      start: s,
      end: e,
      description: description,
      allDay: true,
      reminderMinutes: reminderMinutes,
    );
  }

  // ---- Plugin helpers ------------------------------------------------------

  Future<String?> _upsert(_EventSpec spec, String? existingId) async {
    final saved = await _createOrUpdate(spec.toEvent(eventId: existingId));
    if (saved != null) return saved;
    // The prior event may have been deleted by the user; retry as a new event.
    if (existingId != null) {
      return _createOrUpdate(spec.toEvent(eventId: null));
    }
    return null;
  }

  Future<String?> _createOrUpdate(Event event) async {
    try {
      final res = await _plugin.createOrUpdateEvent(event);
      if (res != null && res.isSuccess) return res.data;
    } catch (_) {}
    return null;
  }

  Future<bool> _deleteEvent(String eventId) async {
    final calId = calendarId;
    if (calId == null) return false;
    try {
      final res = await _plugin.deleteEvent(calId, eventId);
      return res.isSuccess;
    } catch (_) {
      return false;
    }
  }

  // ---- Small utils ---------------------------------------------------------

  String _dayIso(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  DateTime? _parseDate(dynamic v) {
    if (v == null) return null;
    final s = v.toString().trim();
    if (s.isEmpty) return null;
    final parsed = DateTime.tryParse(s);
    if (parsed != null) return DateTime(parsed.year, parsed.month, parsed.day);
    return null;
  }

  String? _diaryNotes(DiaryEventRow r) {
    final parts = <String>[];
    if (r.jobNumber?.trim().isNotEmpty == true) parts.add('Job ${r.jobNumber}');
    if (r.notes?.trim().isNotEmpty == true) parts.add(r.notes!.trim());
    if (r.description?.trim().isNotEmpty == true) parts.add(r.description!.trim());
    parts.add('Synced from WorkPilot');
    return parts.join('\n');
  }

  String _titleCase(String s) {
    if (s.isEmpty) return s;
    return s
        .split(RegExp(r'[_\s]+'))
        .where((w) => w.isNotEmpty)
        .map((w) => w[0].toUpperCase() + w.substring(1))
        .join(' ');
  }
}

class _EventSpec {
  _EventSpec({
    required this.calendarId,
    required this.title,
    required this.start,
    required this.end,
    this.location,
    this.description,
    this.allDay = false,
    this.reminderMinutes = 30,
  });

  final String calendarId;
  final String title;
  final tz.TZDateTime start;
  final tz.TZDateTime end;
  final String? location;
  final String? description;
  final bool allDay;
  final int reminderMinutes;

  Event toEvent({String? eventId}) {
    final event = Event(
      calendarId,
      eventId: eventId,
      title: title,
      start: start,
      end: end,
      startTimeZone: start.location.name,
      endTimeZone: end.location.name,
      description: description,
      allDay: allDay,
      reminders: [Reminder(minutes: reminderMinutes)],
    );
    event.location = location;
    return event;
  }
}
