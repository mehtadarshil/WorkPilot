import 'dart:math' show max;

import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/network/api_exception.dart';
import '../../core/offline/offline_api_support.dart';
import '../../data/models/diary_event_detail.dart';
import '../../data/models/diary_extra_submission.dart';
import '../../data/models/electrical_certificate_models.dart';
import '../../data/models/job_report_history_models.dart';
import '../../data/repositories/jobs_repository.dart';
import '../../data/repositories/mobile_repository.dart';
import '../home/controllers/home_controller.dart';
import '../../core/utils/location_helper.dart';

enum DiaryVisitUiPhase { scheduled, travelling, onSite, completed, cancelled }

DiaryVisitUiPhase visitPhaseFromStatus(String? status) {
  final t = (status ?? '').trim().toLowerCase().replaceAll(RegExp(r'\s+'), '_');
  if (t == 'completed') return DiaryVisitUiPhase.completed;
  if (t == 'cancelled' || t == 'aborted') return DiaryVisitUiPhase.cancelled;
  if (t == 'travelling_to_site' ||
      t == 'travelling' ||
      t == 'traveling_to_site' ||
      t == 'traveling') {
    return DiaryVisitUiPhase.travelling;
  }
  if (t == 'arrived_at_site' ||
      t == 'arrived' ||
      t == 'in_progress' ||
      t == 'on_site' ||
      t == 'onsite' ||
      t == 'working_on_site') {
    return DiaryVisitUiPhase.onSite;
  }
  return DiaryVisitUiPhase.scheduled;
}

class DiaryEventDetailController extends GetxController {
  DiaryEventDetailController({MobileRepository? mobile, JobsRepository? jobs})
    : _mobile = mobile ?? Get.find<MobileRepository>(),
      _jobs = jobs ?? Get.find<JobsRepository>();

  final MobileRepository _mobile;
  final JobsRepository _jobs;

  int diaryId = 0;
  final Rxn<DiaryEventDetail> detail = Rxn<DiaryEventDetail>();
  final RxInt jobReportQuestionCountHint = 0.obs;
  final RxBool loading = true.obs;
  final RxString error = ''.obs;
  final RxBool saving = false.obs;
  final RxBool submittingExtra = false.obs;
  final RxBool submittingTechnicalNote = false.obs;
  final RxList<Map<String, dynamic>> expenses = <Map<String, dynamic>>[].obs;
  final RxBool expensesLoading = false.obs;
  final RxBool postingExpense = false.obs;

  /// True when visit details were loaded from local cache (offline / no connection).
  final RxBool visitDetailFromCache = false.obs;

  final RxList<JobReportHistorySubmission> jobReportHistory =
      <JobReportHistorySubmission>[].obs;
  final RxString jobReportHistoryError = ''.obs;
  final RxBool jobReportHistoryLoaded = false.obs;
  final Rxn<JobCompletionDocuments> completionDocuments = Rxn<JobCompletionDocuments>();
  final RxBool completionDocumentsLoading = false.obs;
  final RxString completionDocumentsError = ''.obs;

  /// Max of API detail count and list/home hint so job report stays available after cold start.
  int get effectiveJobReportQuestionCount => max(
    detail.value?.jobReportQuestionCount ?? 0,
    jobReportQuestionCountHint.value,
  );

  @override
  void onInit() {
    super.onInit();
    final arg = Get.arguments;
    if (arg is Map) {
      final idRaw = arg['diaryId'] ?? arg['diary_id'];
      if (idRaw is int) {
        diaryId = idRaw;
      } else if (idRaw is num) {
        diaryId = idRaw.toInt();
      } else {
        diaryId = int.tryParse(idRaw?.toString() ?? '') ?? 0;
      }
      final qRaw =
          arg['jobReportQuestionCount'] ?? arg['job_report_question_count'];
      if (qRaw is int) {
        jobReportQuestionCountHint.value = qRaw;
      } else if (qRaw is num) {
        jobReportQuestionCountHint.value = qRaw.toInt();
      }
    } else if (arg is int) {
      diaryId = arg;
    } else if (arg is String) {
      diaryId = int.tryParse(arg) ?? 0;
    } else {
      diaryId = 0;
    }
    if (diaryId <= 0) {
      error.value = 'Invalid visit';
      loading.value = false;
      return;
    }
    load();
  }

  DiaryVisitUiPhase get phase =>
      visitPhaseFromStatus(detail.value?.eventStatus);

  Future<void> load({bool silent = false}) async {
    if (!silent) {
      loading.value = true;
    }
    error.value = '';
    visitDetailFromCache.value = false;
    try {
      final prevPendingExtras =
          detail.value?.extraSubmissions
              .where((e) => e.isPendingSync)
              .toList() ??
          [];
      final r = await _mobile.fetchDiaryEventDetail(diaryId);
      final hasQueuedExtra = await _mobile.diaryHasPendingExtraSubmissionOps(
        diaryId,
      );
      if (prevPendingExtras.isNotEmpty && hasQueuedExtra) {
        detail.value = r.detail.copyWith(
          extraSubmissions: [
            ...prevPendingExtras,
            ...r.detail.extraSubmissions,
          ],
        );
      } else {
        detail.value = r.detail;
      }
      if (r.detail.diaryId > 0) {
        diaryId = r.detail.diaryId;
      }
      visitDetailFromCache.value = r.fromCache;
      final n = detail.value?.jobReportQuestionCount ?? 0;
      jobReportQuestionCountHint.value = max(
        jobReportQuestionCountHint.value,
        n,
      );
      final p = visitPhaseFromStatus(detail.value?.eventStatus);
      if ((p == DiaryVisitUiPhase.onSite || p == DiaryVisitUiPhase.completed) &&
          detail.value?.isGeneral != true) {
        jobReportHistoryLoaded.value = false;
        await _loadJobReportHistory();
      } else {
        jobReportHistory.clear();
        jobReportHistoryError.value = '';
        jobReportHistoryLoaded.value = false;
      }
      if (p == DiaryVisitUiPhase.completed &&
          detail.value?.isQuotationVisit != true &&
          (detail.value?.jobId ?? 0) > 0) {
        await _loadCompletionDocuments();
      } else {
        completionDocuments.value = null;
        completionDocumentsError.value = '';
      }
      await _loadJobExpensesIfNeeded();
    } on ApiException catch (e) {
      if (silent) {
        Get.snackbar(
          'Visit',
          e.message,
          snackPosition: SnackPosition.BOTTOM,
          margin: const EdgeInsets.all(16),
          borderRadius: 12,
        );
      } else {
        error.value = e.message;
      }
    } catch (e) {
      if (silent) {
        Get.snackbar(
          'Visit',
          e.toString().replaceFirst('Exception: ', ''),
          snackPosition: SnackPosition.BOTTOM,
          margin: const EdgeInsets.all(16),
          borderRadius: 12,
        );
      } else {
        error.value = e.toString().replaceFirst('Exception: ', '');
      }
    } finally {
      if (!silent) {
        loading.value = false;
      }
    }
  }

  Future<List<String>> loadAbortReasonLabels() async {
    return _mobile.fetchDiaryAbortReasonLabels();
  }

  void applyOptimisticCompletedFromQueuedJobReport({
    required String nextJobState,
  }) {
    final d = detail.value;
    if (d == null) return;
    detail.value = d.copyWith(
      jobReportSubmitted: true,
      jobState: nextJobState,
      updatedAtIso: DateTime.now().toUtc().toIso8601String(),
    );
    jobReportHistoryLoaded.value = false;
  }

  void _applyLocalDetailAfterQueuedPatch(
    String status, {
    String? abortReason,
    double? latitude,
    double? longitude,
    String? timestamp,
  }) {
    final d = detail.value;
    if (d == null) return;
    final t = status.trim().toLowerCase().replaceAll(RegExp(r'\s+'), '_');
    final normalizedStatus = (t == 'cancelled' || t == 'aborted')
        ? 'cancelled'
        : status.trim();

    final newLog = <String, dynamic>{
      'status': normalizedStatus,
      'latitude': latitude,
      'longitude': longitude,
      'timestamp': timestamp ?? DateTime.now().toUtc().toIso8601String(),
    };

    detail.value = d.copyWith(
      eventStatus: normalizedStatus,
      abortReason: abortReason != null && abortReason.trim().isNotEmpty
          ? abortReason.trim()
          : d.abortReason,
      updatedAtIso: DateTime.now().toUtc().toIso8601String(),
      statusLogs: [...d.statusLogs, newLog],
    );
  }

  Future<void> applyStatus(String status, {String? abortReason}) async {
    if (saving.value) return;
    saving.value = true;
    try {
      final loc = await getCurrentLocation();
      final clientTimestamp = DateTime.now().toUtc().toIso8601String();

      final synced = await _mobile.patchDiaryEventStatus(
        diaryId,
        status,
        abortReason: abortReason,
        latitude: loc.latitude,
        longitude: loc.longitude,
        timestamp: clientTimestamp,
      );
      if (synced) {
        await load();
        if (Get.isRegistered<HomeController>()) {
          await Get.find<HomeController>().refreshHome();
        }
        if (status == 'completed') {
          Get.snackbar(
            'Visit',
            'Visit marked complete.',
            snackPosition: SnackPosition.BOTTOM,
            margin: const EdgeInsets.all(16),
            borderRadius: 12,
          );
        }
        if (status == 'cancelled') {
          Get.snackbar(
            'Visit',
            'Visit cancelled.',
            snackPosition: SnackPosition.BOTTOM,
            margin: const EdgeInsets.all(16),
            borderRadius: 12,
          );
        }
      } else {
        _applyLocalDetailAfterQueuedPatch(
          status,
          abortReason: abortReason,
          latitude: loc.latitude,
          longitude: loc.longitude,
          timestamp: clientTimestamp,
        );
        if (Get.isRegistered<HomeController>()) {
          final h = Get.find<HomeController>();
          h.patchDiaryEventInWeekList(
            diaryId,
            status,
            abortReason: abortReason,
          );
          h.applyOptimisticTimesheetFromDiaryStatus(status);
        }
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
        'Visit',
        e.message,
        snackPosition: SnackPosition.BOTTOM,
        margin: const EdgeInsets.all(16),
        borderRadius: 12,
      );
    } finally {
      saving.value = false;
    }
  }

  Future<List<Map<String, dynamic>>> fetchAssignableOfficers() =>
      _jobs.getOfficers(limit: 200);

  /// Admin/scheduling: update visit date/time, duration, notes, and optionally engineers.
  Future<void> rescheduleVisit({
    required DateTime startTime,
    required int durationMinutes,
    String? notes,
    List<int>? officerIds,
  }) async {
    if (saving.value) return;
    saving.value = true;
    try {
      await _mobile.rescheduleDiaryEvent(
        diaryEventId: diaryId,
        startTime: startTime,
        durationMinutes: durationMinutes,
        notes: notes,
        officerIds: officerIds,
      );
      // Reload full detail so all derived fields (endTime, statusLogs, etc.) refresh.
      await load(silent: true);
      if (Get.isRegistered<HomeController>()) {
        await Get.find<HomeController>().refreshHome();
      }
      Get.snackbar(
        'Visit updated',
        'Appointment details have been saved.',
        snackPosition: SnackPosition.BOTTOM,
        margin: const EdgeInsets.all(16),
        borderRadius: 12,
      );
    } on ApiException catch (e) {
      Get.snackbar(
        'Could not update',
        e.message,
        snackPosition: SnackPosition.BOTTOM,
        margin: const EdgeInsets.all(16),
        borderRadius: 12,
      );
    } catch (e) {
      Get.snackbar(
        'Could not update',
        e.toString().replaceFirst('Exception: ', ''),
        snackPosition: SnackPosition.BOTTOM,
        margin: const EdgeInsets.all(16),
        borderRadius: 12,
      );
    } finally {
      saving.value = false;
    }
  }

  Future<void> _loadJobReportHistory() async {
    jobReportHistoryError.value = '';
    try {
      final list = await _mobile.fetchJobReportHistory(diaryId);
      jobReportHistory.assignAll(list);
    } on ApiException catch (e) {
      jobReportHistory.clear();
      jobReportHistoryError.value = apiExceptionLooksLikeNoConnection(e)
          ? 'Unavailable offline — open this visit online once to cache history, or try again when connected.'
          : e.message;
    } catch (e) {
      jobReportHistory.clear();
      jobReportHistoryError.value = e.toString().replaceFirst(
        'Exception: ',
        '',
      );
    } finally {
      jobReportHistoryLoaded.value = true;
    }
  }

  Future<void> _loadCompletionDocuments() async {
    final jobId = detail.value?.jobId ?? 0;
    if (jobId <= 0) return;
    completionDocumentsLoading.value = true;
    completionDocumentsError.value = '';
    try {
      completionDocuments.value = await _mobile.fetchJobCompletionDocuments(jobId);
    } on ApiException catch (e) {
      completionDocuments.value = null;
      completionDocumentsError.value = e.message;
    } catch (e) {
      completionDocuments.value = null;
      completionDocumentsError.value = e.toString().replaceFirst('Exception: ', '');
    } finally {
      completionDocumentsLoading.value = false;
    }
  }

  /// On-site “extra” submissions (notes and/or media), separate from the main job report form.
  Future<void> submitExtraSubmission({
    String? notes,
    required List<Map<String, dynamic>> media,
  }) async {
    if (submittingExtra.value) return;
    final n = notes?.trim() ?? '';
    if (n.isEmpty && media.isEmpty) {
      Get.snackbar(
        'Extra submission',
        'Add a note and/or at least one photo or video.',
        snackPosition: SnackPosition.BOTTOM,
        margin: const EdgeInsets.all(16),
        borderRadius: 12,
      );
      return;
    }
    submittingExtra.value = true;
    try {
      final synced = await _mobile.postDiaryExtraSubmission(
        diaryId,
        notes: n.isEmpty ? null : n,
        media: media,
      );
      if (synced) {
        await load();
        Get.back();
        Get.snackbar(
          'Visit',
          'Extra submission saved.',
          snackPosition: SnackPosition.BOTTOM,
          margin: const EdgeInsets.all(16),
          borderRadius: 12,
        );
      } else {
        Get.back();
        _appendPendingExtraLocally(
          notes: n.isEmpty ? null : n,
          mediaCount: media.length,
        );
        Get.snackbar(
          'Visit',
          'Extra submission saved offline — will sync when you are back online.',
          snackPosition: SnackPosition.BOTTOM,
          margin: const EdgeInsets.all(16),
          borderRadius: 12,
        );
      }
    } on ApiException catch (e) {
      Get.snackbar(
        'Extra submission',
        e.message,
        snackPosition: SnackPosition.BOTTOM,
        margin: const EdgeInsets.all(16),
        borderRadius: 12,
      );
    } catch (e) {
      Get.snackbar(
        'Extra submission',
        e.toString(),
        snackPosition: SnackPosition.BOTTOM,
        margin: const EdgeInsets.all(16),
        borderRadius: 12,
      );
    } finally {
      submittingExtra.value = false;
    }
  }

  void _appendPendingExtraLocally({String? notes, required int mediaCount}) {
    final d = detail.value;
    if (d == null) return;
    final row = DiaryExtraSubmission(
      id: -DateTime.now().millisecondsSinceEpoch,
      notes: notes,
      createdAtIso: DateTime.now().toLocal().toIso8601String(),
      displayName: 'You',
      isPendingSync: true,
      pendingMediaCount: mediaCount,
    );
    detail.value = d.copyWith(extraSubmissions: [...d.extraSubmissions, row]);
  }

  Future<bool> submitTechnicalNote({
    String? notes,
    required List<Map<String, dynamic>> media,
  }) async {
    if (submittingTechnicalNote.value) return false;
    final n = notes?.trim() ?? '';
    if (n.isEmpty && media.isEmpty) {
      Get.snackbar(
        'Technical note',
        'Add a note and/or at least one image.',
        snackPosition: SnackPosition.BOTTOM,
        margin: const EdgeInsets.all(16),
        borderRadius: 12,
      );
      return false;
    }
    submittingTechnicalNote.value = true;
    try {
      final synced = await _mobile.postDiaryTechnicalNote(
        diaryId,
        notes: n.isEmpty ? null : n,
        media: media,
      );
      if (synced) {
        await load();
        Get.back();
        Get.snackbar(
          'Visit',
          'Technical note saved.',
          snackPosition: SnackPosition.BOTTOM,
          margin: const EdgeInsets.all(16),
          borderRadius: 12,
        );
        return true;
      } else {
        Get.back();
        _appendPendingTechnicalNoteLocally(
          notes: n.isEmpty ? null : n,
          mediaCount: media.length,
        );
        Get.snackbar(
          'Visit',
          'Technical note saved offline — will sync when you are back online.',
          snackPosition: SnackPosition.BOTTOM,
          margin: const EdgeInsets.all(16),
          borderRadius: 12,
        );
        return true;
      }
    } on ApiException catch (e) {
      Get.snackbar(
        'Technical note',
        e.message,
        snackPosition: SnackPosition.BOTTOM,
        margin: const EdgeInsets.all(16),
        borderRadius: 12,
      );
      return false;
    } catch (e) {
      Get.snackbar(
        'Technical note',
        e.toString(),
        snackPosition: SnackPosition.BOTTOM,
        margin: const EdgeInsets.all(16),
        borderRadius: 12,
      );
      return false;
    } finally {
      submittingTechnicalNote.value = false;
    }
  }

  void _appendPendingTechnicalNoteLocally({
    String? notes,
    required int mediaCount,
  }) {
    final d = detail.value;
    if (d == null) return;
    final row = DiaryExtraSubmission(
      id: -DateTime.now().millisecondsSinceEpoch,
      notes: notes,
      createdAtIso: DateTime.now().toLocal().toIso8601String(),
      displayName: 'You',
      isPendingSync: true,
      pendingMediaCount: mediaCount,
    );
    detail.value = d.copyWith(technicalNotes: [...d.technicalNotes, row]);
  }

  bool get _canShowJobExpenses {
    final jobId = detail.value?.jobId ?? 0;
    if (jobId <= 0) return false;
    final p = phase;
    if (p == DiaryVisitUiPhase.cancelled) return false;
    return p == DiaryVisitUiPhase.travelling ||
        p == DiaryVisitUiPhase.onSite ||
        p == DiaryVisitUiPhase.completed;
  }

  Future<void> _loadJobExpensesIfNeeded() async {
    if (!_canShowJobExpenses) {
      expenses.clear();
      return;
    }
    final jobId = detail.value?.jobId;
    if (jobId == null || jobId <= 0) return;
    expensesLoading.value = true;
    try {
      final list = await _jobs.getJobExpenses(jobId);
      expenses.assignAll(list);
    } catch (_) {
      expenses.clear();
    } finally {
      expensesLoading.value = false;
    }
  }

  Future<void> postJobExpense({
    required String category,
    required double amount,
    String? description,
    String? expenseDate,
    String? expenseType,
    List<Map<String, dynamic>>? proofFiles,
  }) async {
    if (postingExpense.value) return;
    final jobId = detail.value?.jobId ?? 0;
    if (jobId <= 0) return;
    postingExpense.value = true;
    try {
      await _jobs.postJobExpense(
        jobId,
        category: category,
        amount: amount,
        description: description,
        expenseDate: expenseDate,
        expenseType: expenseType,
        proofFiles: proofFiles,
      );
      await _loadJobExpensesIfNeeded();
      Get.snackbar(
        'Expense',
        'Expense saved.',
        snackPosition: SnackPosition.BOTTOM,
        margin: const EdgeInsets.all(16),
        borderRadius: 12,
      );
    } on ApiException catch (e) {
      Get.snackbar(
        'Expense',
        e.message,
        snackPosition: SnackPosition.BOTTOM,
        margin: const EdgeInsets.all(16),
        borderRadius: 12,
      );
    } catch (e) {
      Get.snackbar(
        'Expense',
        e.toString().replaceFirst('Exception: ', ''),
        snackPosition: SnackPosition.BOTTOM,
        margin: const EdgeInsets.all(16),
        borderRadius: 12,
      );
    } finally {
      postingExpense.value = false;
    }
  }
}
