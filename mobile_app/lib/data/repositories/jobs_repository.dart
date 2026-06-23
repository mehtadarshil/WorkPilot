import '../../core/network/api_exception.dart';
import 'base_repository.dart';

/// Dashboard job APIs — mirrors web `src/app/dashboard/jobs/**` and `/api/jobs/*`.
class JobsRepository extends BaseRepository {
  JobsRepository(super.api);

  Map<String, dynamic> _asMap(dynamic data) {
    if (data is Map<String, dynamic>) return data;
    if (data is Map) return Map<String, dynamic>.from(data);
    return {};
  }

  List<Map<String, dynamic>> _listOfMap(dynamic raw) {
    if (raw is! List) return [];
    return raw.map((e) => e is Map ? Map<String, dynamic>.from(e) : <String, dynamic>{}).toList();
  }

  Future<Map<String, dynamic>> getJob(int id) async {
    final res = await api.get<Map<String, dynamic>>('/jobs/$id');
    final d = _asMap(res.data);
    final j = d['job'];
    if (j is! Map) throw ApiException('Invalid job response');
    return Map<String, dynamic>.from(j);
  }

  Future<void> patchJob(int id, Map<String, dynamic> body) async {
    await api.patch<void>('/jobs/$id', data: body);
  }

  Future<Map<String, dynamic>> convertToWorkJob(int id, Map<String, dynamic> body) async {
    final res = await api.post<Map<String, dynamic>>('/jobs/$id/convert-to-work-job', data: body);
    final d = _asMap(res.data);
    final j = d['job'];
    if (j is Map) return Map<String, dynamic>.from(j);
    return d;
  }

  Future<void> deleteJob(int id) async {
    await api.delete<void>('/jobs/$id');
  }

  Future<List<Map<String, dynamic>>> getJobDiaryEvents(int jobId) async {
    final res = await api.get<Map<String, dynamic>>('/jobs/$jobId/diary-events');
    final raw = _asMap(res.data)['events'];
    return _listOfMap(raw);
  }

  Future<Map<String, dynamic>> postJobDiaryEvent(
    int jobId, {
    List<int>? officerIds,
    required String startTimeIso,
    int durationMinutes = 60,
    String? notes,
  }) async {
    final res = await api.post<Map<String, dynamic>>(
      '/jobs/$jobId/diary-events',
      data: <String, dynamic>{
        if (officerIds != null && officerIds.isNotEmpty) 'officer_ids': officerIds,
        'start_time': startTimeIso,
        'duration_minutes': durationMinutes,
        if (notes != null && notes.trim().isNotEmpty) 'notes': notes.trim(),
      },
    );
    final d = _asMap(res.data);
    final ev = d['event'];
    if (ev is Map) return Map<String, dynamic>.from(ev);
    return d;
  }

  Future<void> deleteDiaryEvent(int diaryEventId) async {
    await api.delete<void>('/diary-events/$diaryEventId');
  }

  Future<void> postDiarySendReminder(int diaryEventId, String kind) async {
    await api.post<void>(
      '/diary-events/$diaryEventId/send-reminder',
      data: <String, dynamic>{'kind': kind},
    );
  }

  Future<List<Map<String, dynamic>>> getJobExpenses(int jobId) async {
    final res = await api.get<Map<String, dynamic>>('/jobs/$jobId/expenses');
    final raw = _asMap(res.data)['expenses'];
    return _listOfMap(raw);
  }

  Future<Map<String, dynamic>> postJobExpense(
    int jobId, {
    required String category,
    required double amount,
    String? description,
    String? expenseDate,
    String? expenseType,
    List<Map<String, dynamic>>? proofFiles,
  }) async {
    final res = await api.post<Map<String, dynamic>>(
      '/jobs/$jobId/expenses',
      data: <String, dynamic>{
        'category': category,
        'amount': amount,
        if (description != null && description.trim().isNotEmpty) 'description': description.trim(),
        if (expenseDate != null && expenseDate.trim().isNotEmpty) 'expense_date': expenseDate.trim(),
        if (expenseType != null && expenseType.trim().isNotEmpty) 'expense_type': expenseType.trim(),
        if (proofFiles != null && proofFiles.isNotEmpty) 'proof_files': proofFiles,
      },
    );
    final d = _asMap(res.data);
    final expense = d['expense'];
    if (expense is Map) return Map<String, dynamic>.from(expense);
    return d;
  }

  Future<List<Map<String, dynamic>>> getOfficeTasks(int jobId) async {
    final res = await api.get<Map<String, dynamic>>('/jobs/$jobId/office-tasks');
    final raw = _asMap(res.data)['tasks'];
    return _listOfMap(raw);
  }

  Future<Map<String, dynamic>> postOfficeTask(
    int jobId, {
    required String description,
    int? assigneeOfficerId,
    String? reminderAtIso,
  }) async {
    final res = await api.post<Map<String, dynamic>>(
      '/jobs/$jobId/office-tasks',
      data: <String, dynamic>{
        'description': description,
        if (assigneeOfficerId != null) 'assignee_officer_id': assigneeOfficerId,
        if (reminderAtIso != null) 'reminder_at': reminderAtIso,
      },
    );
    final d = _asMap(res.data);
    final t = d['task'];
    if (t is Map) return Map<String, dynamic>.from(t);
    return d;
  }

  Future<void> patchOfficeTask(int jobId, int taskId, Map<String, dynamic> body) async {
    await api.patch<void>('/jobs/$jobId/office-tasks/$taskId', data: body);
  }

  Future<void> deleteOfficeTask(int jobId, int taskId) async {
    await api.delete<void>('/jobs/$jobId/office-tasks/$taskId');
  }

  Future<List<Map<String, dynamic>>> getOfficers({int limit = 100}) async {
    final res = await api.get<Map<String, dynamic>>(
      '/officers',
      queryParameters: <String, dynamic>{'limit': limit},
    );
    final raw = _asMap(res.data)['officers'];
    return _listOfMap(raw);
  }

  Future<Map<String, dynamic>> getJobParts(
    int jobId, {
    int limit = 25,
    int offset = 0,
    String? search,
    String? status,
  }) async {
    final q = <String, dynamic>{
      'limit': limit,
      'offset': offset,
      if (search != null && search.trim().isNotEmpty) 'search': search.trim(),
      if (status != null && status.trim().isNotEmpty) 'status': status.trim(),
    };
    final res = await api.get<Map<String, dynamic>>('/jobs/$jobId/parts', queryParameters: q);
    return _asMap(res.data);
  }

  Future<void> postJobPart(int jobId, Map<String, dynamic> body) async {
    await api.post<void>('/jobs/$jobId/parts', data: body);
  }

  Future<void> postJobPartsFromKit(int jobId, int kitId) async {
    await api.post<void>('/jobs/$jobId/parts/from-kit', data: <String, dynamic>{'kit_id': kitId});
  }

  Future<void> patchJobPart(int jobId, int partId, Map<String, dynamic> body) async {
    await api.patch<void>('/jobs/$jobId/parts/$partId', data: body);
  }

  Future<void> deleteJobPart(int jobId, int partId) async {
    await api.delete<void>('/jobs/$jobId/parts/$partId');
  }

  Future<List<Map<String, dynamic>>> getPartCatalog({int limit = 200}) async {
    final res = await api.get<Map<String, dynamic>>(
      '/part-catalog',
      queryParameters: <String, dynamic>{'limit': limit},
    );
    final raw = _asMap(res.data)['parts'];
    return _listOfMap(raw);
  }

  Future<List<Map<String, dynamic>>> getPartKits() async {
    final res = await api.get<Map<String, dynamic>>('/part-kits');
    final raw = _asMap(res.data)['kits'];
    return _listOfMap(raw);
  }

  Future<List<Map<String, dynamic>>> getPartKitLines(int kitId) async {
    final res = await api.get<Map<String, dynamic>>('/part-kits/$kitId');
    final d = _asMap(res.data);
    final kit = d['kit'];
    if (kit is Map) {
      final raw = kit['items'];
      return _listOfMap(raw);
    }
    return [];
  }

  Future<Map<String, dynamic>> getJobFilesManifest(int jobId) async {
    final res = await api.get<Map<String, dynamic>>('/jobs/$jobId/files');
    return _asMap(res.data);
  }

  Future<Map<String, dynamic>> getJobCosts(int jobId) async {
    final res = await api.get<Map<String, dynamic>>('/jobs/$jobId/costs');
    return _asMap(res.data);
  }

  Future<void> postJobCost(int jobId, Map<String, dynamic> body) async {
    await api.post<void>('/jobs/$jobId/costs', data: body);
  }

  Future<List<Map<String, dynamic>>> getJobReportQuestions(int jobId) async {
    final res = await api.get<Map<String, dynamic>>('/jobs/$jobId/job-report-questions');
    final raw = _asMap(res.data)['questions'];
    return _listOfMap(raw);
  }

  Future<void> putJobReportQuestions(int jobId, List<Map<String, dynamic>> questions) async {
    await api.put<void>(
      '/jobs/$jobId/job-report-questions',
      data: <String, dynamic>{'questions': questions},
    );
  }

  Future<List<Map<String, dynamic>>> getJobReportHistory(int jobId) async {
    final res = await api.get<Map<String, dynamic>>('/jobs/$jobId/job-report-history');
    final raw = _asMap(res.data)['submissions'];
    return _listOfMap(raw);
  }

  Future<Map<String, dynamic>> getJobEmailCompose(int jobId) async {
    final res = await api.get<Map<String, dynamic>>('/jobs/$jobId/email-compose');
    return _asMap(res.data);
  }

  Future<void> sendJobEmail(int jobId, Map<String, dynamic> body) async {
    await api.post<void>('/jobs/$jobId/send-email', data: body);
  }

  Future<String?> ensureClientPortalToken(int jobId, {bool rotate = false}) async {
    final res = await api.post<Map<String, dynamic>>(
      '/jobs/$jobId/client-portal-token',
      queryParameters: <String, dynamic>{if (rotate) 'rotate': '1'},
    );
    final t = _asMap(res.data)['client_portal_token'];
    return t is String ? t : t?.toString();
  }

  Future<List<Map<String, dynamic>>> getClientSubmissions(int jobId) async {
    final res = await api.get<Map<String, dynamic>>('/jobs/$jobId/client-submissions');
    final raw = _asMap(res.data)['submissions'];
    return _listOfMap(raw);
  }

  Future<Map<String, dynamic>> getClientShareOptions(int jobId, int diaryEventId) async {
    final res = await api.get<Map<String, dynamic>>(
      '/jobs/$jobId/diary-events/$diaryEventId/client-share-options',
    );
    return _asMap(res.data);
  }

  Future<Map<String, dynamic>> postClientShare(
    int jobId,
    int diaryEventId,
    Map<String, dynamic> body,
  ) async {
    final res = await api.post<Map<String, dynamic>>(
      '/jobs/$jobId/diary-events/$diaryEventId/client-share',
      data: body,
    );
    return _asMap(res.data);
  }

  Future<Map<String, dynamic>> getCustomerSiteReport(int customerId, {int? workAddressId, int? reportId}) async {
    final res = await api.get<Map<String, dynamic>>(
      '/customers/$customerId/site-report',
      queryParameters: <String, dynamic>{
        if (workAddressId != null) 'work_address_id': workAddressId,
        if (reportId != null) 'report_id': reportId,
      },
    );
    return _asMap(res.data);
  }

  Future<Map<String, dynamic>> putCustomerSiteReport(int customerId, Map<String, dynamic> body) async {
    final res = await api.put<Map<String, dynamic>>('/customers/$customerId/site-report', data: body);
    return _asMap(res.data);
  }

  Future<List<int>> getCustomerSiteReportPdf(int customerId, int reportId) async {
    final res = await api.getBytes('/customers/$customerId/site-report/$reportId/pdf');
    final b = res.data;
    return b ?? [];
  }

  /* ---------- Job dynamic reports ---------- */

  Future<List<Map<String, dynamic>>> getJobReports(int jobId) async {
    final res = await api.get<Map<String, dynamic>>('/jobs/$jobId/reports');
    final raw = _asMap(res.data)['reports'];
    return _listOfMap(raw);
  }

  Future<Map<String, dynamic>> postJobReport(int jobId, Map<String, dynamic> body) async {
    final res = await api.post<Map<String, dynamic>>('/jobs/$jobId/reports', data: body);
    final d = _asMap(res.data);
    final r = d['report'];
    if (r is Map) return Map<String, dynamic>.from(r);
    return d;
  }

  Future<void> patchJobReport(int jobId, int reportId, Map<String, dynamic> body) async {
    await api.patch<void>('/jobs/$jobId/reports/$reportId', data: body);
  }

  Future<void> deleteJobReport(int jobId, int reportId) async {
    await api.delete<void>('/jobs/$jobId/reports/$reportId');
  }

  Future<Map<String, dynamic>> postJobReportItem(int jobId, int reportId, Map<String, dynamic> body) async {
    final res = await api.post<Map<String, dynamic>>('/jobs/$jobId/reports/$reportId/items', data: body);
    final d = _asMap(res.data);
    final it = d['item'];
    if (it is Map) return Map<String, dynamic>.from(it);
    return d;
  }

  Future<void> patchJobReportItem(int jobId, int reportId, int itemId, Map<String, dynamic> body) async {
    await api.put<void>('/jobs/$jobId/reports/$reportId/items/$itemId', data: body);
  }

  Future<void> deleteJobReportItem(int jobId, int reportId, int itemId) async {
    await api.delete<void>('/jobs/$jobId/reports/$reportId/items/$itemId');
  }

  Future<Map<String, dynamic>> postCustomerSiteReportImage(
    int customerId,
    int reportId, {
    required String filename,
    required String contentType,
    required String contentBase64,
  }) async {
    final res = await api.post<Map<String, dynamic>>(
      '/customers/$customerId/site-report/$reportId/images',
      data: <String, dynamic>{
        'filename': filename,
        'content_type': contentType,
        'content_base64': contentBase64,
      },
    );
    return _asMap(res.data);
  }

  Future<void> deleteCustomerSiteReportImage(int customerId, int reportId, int imageId) async {
    await api.delete<void>('/customers/$customerId/site-report/$reportId/images/$imageId');
  }

  Future<List<int>> getCustomerSiteReportImageBytes(int customerId, int reportId, int imageId) async {
    final res = await api.getBytes('/customers/$customerId/site-report/$reportId/images/$imageId/content');
    return res.data ?? [];
  }

  Future<List<Map<String, dynamic>>> getJobTools(int jobId) async {
    final res = await api.get<List<dynamic>>('/jobs/$jobId/tools');
    final raw = res.data;
    return raw is List ? _listOfMap(raw) : [];
  }
}

