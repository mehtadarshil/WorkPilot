import '../models/diary_event_detail.dart';
import '../models/diary_event_row.dart';
import '../models/job_report_models.dart';
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

  Future<DiaryEventDetail> fetchDiaryEventDetail(int diaryEventId) async {
    final res = await api.get<Map<String, dynamic>>('/diary-events/$diaryEventId');
    final data = res.data;
    if (data == null) throw Exception('Empty response');
    return DiaryEventDetail.fromJson(Map<String, dynamic>.from(data as Map));
  }

  /// Updates diary visit status; server starts/stops timesheet segments automatically.
  Future<void> patchDiaryEventStatus(int diaryEventId, String status) async {
    await api.patch<Map<String, dynamic>>(
      '/diary-events/$diaryEventId',
      data: <String, dynamic>{'status': status},
    );
  }

  Future<JobReportBundle> fetchDiaryJobReport(int diaryEventId) async {
    final res = await api.get<Map<String, dynamic>>('/diary-events/$diaryEventId/job-report');
    final data = res.data;
    if (data == null) throw Exception('Empty response');
    return JobReportBundle.fromJson(Map<String, dynamic>.from(data as Map));
  }

  Future<void> submitDiaryJobReport(
    int diaryEventId,
    List<Map<String, dynamic>> answers, {
    required String nextJobState,
  }) async {
    await api.post<Map<String, dynamic>>(
      '/diary-events/$diaryEventId/job-report/submit',
      data: <String, dynamic>{
        'answers': answers,
        'next_job_state': nextJobState,
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
