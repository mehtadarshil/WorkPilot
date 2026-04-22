import 'dart:math' show max;

import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/network/api_exception.dart';
import '../../data/models/diary_event_detail.dart';
import '../../data/repositories/mobile_repository.dart';
import '../home/controllers/home_controller.dart';

enum DiaryVisitUiPhase {
  scheduled,
  travelling,
  onSite,
  completed,
  cancelled,
}

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
  DiaryEventDetailController({MobileRepository? mobile})
    : _mobile = mobile ?? Get.find<MobileRepository>();

  final MobileRepository _mobile;

  late final int diaryId;
  final Rxn<DiaryEventDetail> detail = Rxn<DiaryEventDetail>();
  final RxInt jobReportQuestionCountHint = 0.obs;
  final RxBool loading = true.obs;
  final RxString error = ''.obs;
  final RxBool saving = false.obs;

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
      final qRaw = arg['jobReportQuestionCount'] ?? arg['job_report_question_count'];
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

  Future<void> load() async {
    loading.value = true;
    error.value = '';
    try {
      detail.value = await _mobile.fetchDiaryEventDetail(diaryId);
      final n = detail.value?.jobReportQuestionCount ?? 0;
      jobReportQuestionCountHint.value = max(jobReportQuestionCountHint.value, n);
    } on ApiException catch (e) {
      error.value = e.message;
    } catch (e) {
      error.value = e.toString().replaceFirst('Exception: ', '');
    } finally {
      loading.value = false;
    }
  }

  Future<void> applyStatus(String status) async {
    if (saving.value) return;
    saving.value = true;
    try {
      await _mobile.patchDiaryEventStatus(diaryId, status);
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
}
