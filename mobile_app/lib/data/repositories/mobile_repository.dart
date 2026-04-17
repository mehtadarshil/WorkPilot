import '../models/diary_event_row.dart';
import '../models/mobile_home_response.dart';
import '../models/open_job_summary.dart';
import '../models/timesheet_history_entry.dart';
import 'base_repository.dart';

class MobileRepository extends BaseRepository {
  MobileRepository(super.api);

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

  Future<MobileHomeResponse> fetchHome() async {
    final res = await api.get<Map<String, dynamic>>('/mobile/home');
    final data = res.data;
    if (data == null) {
      throw Exception('Empty response');
    }
    return MobileHomeResponse.fromJson(Map<String, dynamic>.from(data as Map));
  }

  Future<List<DiaryEventRow>> fetchDiaryEvents({
    required String from,
    required String to,
  }) async {
    final res = await api.get<Map<String, dynamic>>(
      '/diary-events',
      queryParameters: <String, dynamic>{'from': from, 'to': to},
    );
    final data = res.data;
    if (data == null) return [];
    final raw = data['events'];
    if (raw is! List) return [];
    return raw
        .map((e) => DiaryEventRow.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
  }

  Future<ActiveTimesheetClockIn> clockIn({String? notes}) async {
    final res = await api.post<Map<String, dynamic>>(
      '/timesheet/clock-in',
      data: notes != null && notes.isNotEmpty
          ? <String, dynamic>{'notes': notes}
          : <String, dynamic>{},
    );
    final data = res.data;
    if (data == null) throw Exception('Empty response');
    final entry = data['entry'] as Map<String, dynamic>?;
    if (entry == null) throw Exception('Invalid clock-in response');
    return ActiveTimesheetClockIn.fromJson(Map<String, dynamic>.from(entry));
  }

  Future<void> clockOut({String? notes}) async {
    await api.post<Map<String, dynamic>>(
      '/timesheet/clock-out',
      data: notes != null && notes.isNotEmpty
          ? <String, dynamic>{'notes': notes}
          : <String, dynamic>{},
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

/// Subset of clock-in API response.
class ActiveTimesheetClockIn {
  ActiveTimesheetClockIn({required this.id, required this.clockInIso});

  factory ActiveTimesheetClockIn.fromJson(Map<String, dynamic> json) {
    return ActiveTimesheetClockIn(
      id: (json['id'] as num).toInt(),
      clockInIso: json['clock_in'] as String,
    );
  }

  final int id;
  final String clockInIso;
}
