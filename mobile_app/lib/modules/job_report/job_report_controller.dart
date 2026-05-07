import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:image_picker/image_picker.dart';
import 'package:signature/signature.dart';

import '../../core/network/api_exception.dart';
import '../../data/models/job_report_models.dart';
import '../../data/repositories/mobile_repository.dart';
import '../diary_event/diary_event_detail_controller.dart';
import '../home/controllers/home_controller.dart';

class JobReportController extends GetxController {
  JobReportController({MobileRepository? mobile})
    : _mobile = mobile ?? Get.find<MobileRepository>();

  final MobileRepository _mobile;

  late final int diaryId;
  final RxList<JobReportQuestion> questions = <JobReportQuestion>[].obs;
  final RxBool loading = true.obs;
  final RxString errorMessage = ''.obs;
  final RxBool submitting = false.obs;
  /// When true, opened from a completed visit — read-only answers, no submit.
  final RxBool readonlyMode = false.obs;
  /// 0 = answer form, 1 = change job stage (then confirm submit).
  final RxInt flowStep = 0.obs;
  final RxString selectedNextJobState = 'completed'.obs;
  final RxMap<int, String> textByQuestionId = <int, String>{}.obs;
  final RxMap<int, String> imageByQuestionId = <int, String>{}.obs;
  final Map<int, SignatureController> signatureControllers = {};
  final Map<int, TextEditingController> textControllers = {};
  Timer? _draftSaveTimer;

  void _scheduleDraftSave() {
    if (readonlyMode.value || diaryId <= 0) return;
    _draftSaveTimer?.cancel();
    _draftSaveTimer = Timer(const Duration(seconds: 2), () {
      unawaited(_flushDraftSave());
    });
  }

  Future<void> _flushDraftSave() async {
    if (readonlyMode.value || diaryId <= 0) return;
    try {
      final answers = await _buildAnswersPayload();
      await _mobile.saveDiaryJobReportDraftIfOnline(diaryId, answers);
    } catch (_) {
      /* drafts are best-effort */
    }
  }

  @override
  void onClose() {
    _draftSaveTimer?.cancel();
    for (final c in textControllers.values) {
      c.dispose();
    }
    textControllers.clear();
    super.onClose();
  }

  @override
  void onInit() {
    super.onInit();
    final raw = Get.arguments;
    int parsedId = 0;
    if (raw is Map) {
      final idRaw = raw['diaryId'] ?? raw['diary_id'];
      if (idRaw is int) {
        parsedId = idRaw;
      } else if (idRaw is num) {
        parsedId = idRaw.toInt();
      } else {
        parsedId = int.tryParse(idRaw?.toString() ?? '') ?? 0;
      }
      readonlyMode.value = raw['readonly'] == true;
    } else if (raw is int) {
      parsedId = raw;
    } else if (raw is String) {
      parsedId = int.tryParse(raw) ?? 0;
    }
    diaryId = parsedId;
    if (diaryId <= 0) {
      errorMessage.value = 'Invalid visit';
      loading.value = false;
      return;
    }
    _load();
  }

  SignatureController signatureFor(int questionId) {
    return signatureControllers.putIfAbsent(
      questionId,
      () => SignatureController(
        penStrokeWidth: 2.5,
        penColor: Colors.black87,
        exportBackgroundColor: Colors.white,
      ),
    );
  }

  Future<void> _load() async {
    loading.value = true;
    errorMessage.value = '';
    try {
      final bundle = await _mobile.fetchDiaryJobReport(diaryId);
      questions.assignAll(bundle.questions);
      for (final q in bundle.questions) {
        final existing = bundle.answersByQuestionId[q.id];
        if (existing != null && existing.trim().isNotEmpty) {
          if (q.questionType == 'before_photo' ||
              q.questionType == 'after_photo' ||
              q.questionType == 'customer_signature' ||
              q.questionType == 'officer_signature') {
            imageByQuestionId[q.id] = existing;
          } else {
            textByQuestionId[q.id] = existing;
          }
        }
      }
      imageByQuestionId.refresh();
      textByQuestionId.refresh();
      for (final c in textControllers.values) {
        c.dispose();
      }
      textControllers.clear();
      for (final q in questions) {
        if (_isTextQuestion(q.questionType)) {
          final c = TextEditingController(text: textByQuestionId[q.id] ?? '');
          c.addListener(() {
            textByQuestionId[q.id] = c.text;
            _scheduleDraftSave();
          });
          textControllers[q.id] = c;
        }
      }
    } on ApiException catch (e) {
      errorMessage.value = e.message;
    } catch (e) {
      errorMessage.value = e.toString();
    } finally {
      loading.value = false;
    }
  }

  Future<void> pickPhoto(int questionId, ImageSource source) async {
    if (readonlyMode.value) return;
    final picker = ImagePicker();
    final file = await picker.pickImage(
      source: source,
      maxWidth: 2000,
      imageQuality: 82,
    );
    if (file == null) return;
    final bytes = await file.readAsBytes();
    final path = file.path.toLowerCase();
    final mime = path.endsWith('.png') ? 'image/png' : 'image/jpeg';
    imageByQuestionId[questionId] = 'data:$mime;base64,${base64Encode(bytes)}';
    imageByQuestionId.refresh();
    _scheduleDraftSave();
  }

  bool _answerValuePresent(String questionType, int questionId, String value) {
    final t = value.trim();
    if (questionType == 'customer_signature' || questionType == 'officer_signature') {
      final c = signatureControllers[questionId];
      return c != null && c.isNotEmpty;
    }
    return t.length >= 4;
  }

  bool validateRequiredAnswers() {
    for (final q in questions) {
      if (!q.required) continue;
      String value;
      switch (q.questionType) {
        case 'customer_signature':
        case 'officer_signature':
          final c = signatureControllers[q.id];
          value = (c != null && c.isNotEmpty) ? 'x' : '';
          break;
        case 'before_photo':
        case 'after_photo':
          value = imageByQuestionId[q.id] ?? '';
          break;
        default:
          value = textControllers[q.id]?.text ?? textByQuestionId[q.id] ?? '';
      }
      if (!_answerValuePresent(q.questionType, q.id, value)) {
        return false;
      }
    }
    return true;
  }

  Future<List<Map<String, dynamic>>> _buildAnswersPayload() async {
    final answers = <Map<String, dynamic>>[];
    for (final q in questions) {
      String value;
      switch (q.questionType) {
        case 'customer_signature':
        case 'officer_signature':
          final c = signatureControllers[q.id];
          if (c == null || c.isEmpty) {
            value = '';
          } else {
            final bytes = await c.toPngBytes();
            value = bytes == null ? '' : 'data:image/png;base64,${base64Encode(bytes)}';
          }
          break;
        case 'before_photo':
        case 'after_photo':
          value = imageByQuestionId[q.id] ?? '';
          break;
        default:
          value = textControllers[q.id]?.text ?? textByQuestionId[q.id] ?? '';
      }
      answers.add(<String, dynamic>{'question_id': q.id, 'value': value});
    }
    return answers;
  }

  void continueToJobStageStep() {
    if (readonlyMode.value) return;
    if (!validateRequiredAnswers()) {
      Get.snackbar(
        'Job report',
        'Please complete all required fields before continuing.',
        snackPosition: SnackPosition.BOTTOM,
        margin: const EdgeInsets.all(16),
        borderRadius: 12,
      );
      return;
    }
    flowStep.value = 1;
  }

  Future<void> submitWithSelectedJobState() async {
    if (readonlyMode.value) return;
    if (submitting.value) return;
    if (!validateRequiredAnswers()) {
      Get.snackbar(
        'Job report',
        'Please complete all required fields.',
        snackPosition: SnackPosition.BOTTOM,
        margin: const EdgeInsets.all(16),
        borderRadius: 12,
      );
      return;
    }
    submitting.value = true;
    try {
      await _flushDraftSave();
      final answers = await _buildAnswersPayload();
      final synced = await _mobile.submitDiaryJobReport(
        diaryId,
        answers,
        nextJobState: selectedNextJobState.value,
      );
      if (synced) {
        if (Get.isRegistered<HomeController>()) {
          await Get.find<HomeController>().refreshHome();
        }
        if (Get.isRegistered<DiaryEventDetailController>()) {
          await Get.find<DiaryEventDetailController>().load();
        }
        Get.back();
        Get.snackbar(
          'Visit',
          'Job report submitted and job stage updated.',
          snackPosition: SnackPosition.BOTTOM,
          margin: const EdgeInsets.all(16),
          borderRadius: 12,
        );
      } else {
        if (Get.isRegistered<DiaryEventDetailController>()) {
          final dc = Get.find<DiaryEventDetailController>();
          if (dc.diaryId == diaryId) {
            dc.applyOptimisticCompletedFromQueuedJobReport(
              nextJobState: selectedNextJobState.value,
            );
          }
        }
        if (Get.isRegistered<HomeController>()) {
          final h = Get.find<HomeController>();
          h.patchDiaryEventInWeekList(diaryId, 'completed');
          h.applyOptimisticTimesheetFromDiaryStatus('completed');
        }
        Get.back();
        Get.snackbar(
          'Visit',
          'Job report saved offline — will sync when you are back online.',
          snackPosition: SnackPosition.BOTTOM,
          margin: const EdgeInsets.all(16),
          borderRadius: 12,
        );
      }
    } on ApiException catch (e) {
      Get.snackbar(
        'Job report',
        e.message,
        snackPosition: SnackPosition.BOTTOM,
        margin: const EdgeInsets.all(16),
        borderRadius: 12,
      );
    } catch (e) {
      Get.snackbar(
        'Job report',
        e.toString(),
        snackPosition: SnackPosition.BOTTOM,
        margin: const EdgeInsets.all(16),
        borderRadius: 12,
      );
    } finally {
      submitting.value = false;
    }
  }

  bool _isTextQuestion(String type) {
    return type == 'text' ||
        type == 'textarea' ||
        (type != 'customer_signature' &&
            type != 'officer_signature' &&
            type != 'before_photo' &&
            type != 'after_photo');
  }

  TextEditingController? textControllerFor(int questionId) => textControllers[questionId];
}
