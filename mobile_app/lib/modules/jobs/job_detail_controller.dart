import 'package:get/get.dart';

import '../../app/routes/app_routes.dart';
import '../../core/network/api_exception.dart';
import '../../data/repositories/invoices_repository.dart';
import '../../data/repositories/jobs_repository.dart';

/// [Get.arguments] must be the job id ([int] or [num]).
class JobDetailController extends GetxController {
  JobDetailController({
    JobsRepository? jobs,
    InvoicesRepository? invoices,
  })  : _jobs = jobs ?? Get.find<JobsRepository>(),
        _invoices = invoices ?? Get.find<InvoicesRepository>();

  final JobsRepository _jobs;
  final InvoicesRepository _invoices;

  late final int jobId = _parseJobId(Get.arguments);

  final Rxn<Map<String, dynamic>> job = Rxn<Map<String, dynamic>>();
  final RxList<Map<String, dynamic>> diaryEvents = <Map<String, dynamic>>[].obs;
  final RxList<Map<String, dynamic>> invoices = <Map<String, dynamic>>[].obs;
  final RxList<Map<String, dynamic>> officeTasks = <Map<String, dynamic>>[].obs;
  final RxList<Map<String, dynamic>> officers = <Map<String, dynamic>>[].obs;
  final RxList<Map<String, dynamic>> expenses = <Map<String, dynamic>>[].obs;
  final RxList<Map<String, dynamic>> jobTools = <Map<String, dynamic>>[].obs;

  final RxBool loading = true.obs;
  final RxString error = ''.obs;
  final RxBool patchingState = false.obs;

  static int _parseJobId(dynamic a) {
    if (a is int) return a;
    if (a is num) return a.toInt();
    throw ArgumentError('JobDetailController expects int job id in Get.arguments, got: $a');
  }

  @override
  void onInit() {
    super.onInit();
    refreshAll();
  }

  /// Alias for pull-to-refresh / legacy callers.
  Future<void> load() => refreshAll();

  Future<void> refreshAll() async {
    loading.value = true;
    error.value = '';
    try {
      final j = await _jobs.getJob(jobId);
      if (j['is_quotation_visit'] == true) {
        loading.value = false;
        await Get.offNamed(AppRoutes.quotationVisitDetail, arguments: jobId);
        return;
      }
      job.value = j;
      final invRes = await _invoices.listInvoices(jobId: jobId, page: 1, limit: 100);
      final invRaw = invRes['invoices'];
      invoices.assignAll(invRaw is List ? invRaw.map((e) => Map<String, dynamic>.from(e as Map)).toList() : []);

      List<Map<String, dynamic>> ev = [];
      List<Map<String, dynamic>> tasks = [];
      List<Map<String, dynamic>> offs = [];
      List<Map<String, dynamic>> exp = [];
      List<Map<String, dynamic>> tls = [];
      try {
        ev = await _jobs.getJobDiaryEvents(jobId);
      } catch (_) {}
      try {
        tasks = await _jobs.getOfficeTasks(jobId);
      } catch (_) {}
      try {
        offs = await _jobs.getOfficers(limit: 100);
      } catch (_) {}
      try {
        exp = await _jobs.getJobExpenses(jobId);
      } catch (_) {}
      try {
        tls = await _jobs.getJobTools(jobId);
      } catch (_) {}
      diaryEvents.assignAll(ev);
      officeTasks.assignAll(tasks);
      officers.assignAll(offs);
      expenses.assignAll(exp);
      jobTools.assignAll(tls);
    } on ApiException catch (e) {
      error.value = e.message;
      job.value = null;
    } catch (e) {
      error.value = e.toString();
      job.value = null;
    } finally {
      loading.value = false;
    }
  }

  Future<void> patchJobState(String newState) async {
    if (job.value == null) return;
    patchingState.value = true;
    try {
      await _jobs.patchJob(jobId, <String, dynamic>{'state': newState});
      await refreshAll();
    } on ApiException catch (e) {
      error.value = e.message;
    } finally {
      patchingState.value = false;
    }
  }

  Future<bool> updateJob(Map<String, dynamic> fields) async {
    if (job.value == null) return false;
    loading.value = true;
    try {
      await _jobs.patchJob(jobId, fields);
      await refreshAll();
      return true;
    } on ApiException catch (e) {
      error.value = e.message;
      return false;
    } catch (e) {
      error.value = e.toString();
      return false;
    } finally {
      loading.value = false;
    }
  }

  Future<void> postDiaryVisit({
    List<int>? officerIds,
    required DateTime start,
    int durationMinutes = 60,
    String? notes,
  }) async {
    await _jobs.postJobDiaryEvent(
      jobId,
      officerIds: officerIds,
      startTimeIso: start.toUtc().toIso8601String(),
      durationMinutes: durationMinutes,
      notes: notes,
    );
    await refreshAll();
  }

  Future<void> postExpense({
    required String category,
    required double amount,
    String? description,
    String? expenseDate,
    String? expenseType,
    List<Map<String, dynamic>>? proofFiles,
  }) async {
    await _jobs.postJobExpense(
      jobId,
      category: category,
      amount: amount,
      description: description,
      expenseDate: expenseDate,
      expenseType: expenseType,
      proofFiles: proofFiles,
    );
    await refreshAll();
  }

  Future<void> deleteDiaryVisit(int diaryEventId) async {
    await _jobs.deleteDiaryEvent(diaryEventId);
    await refreshAll();
  }

  Future<void> sendDiaryReminder(int diaryEventId, String kind) async {
    await _jobs.postDiarySendReminder(diaryEventId, kind);
    await refreshAll();
  }
}
