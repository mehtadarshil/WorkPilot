import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:image_picker/image_picker.dart';
import 'package:signature/signature.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';

import '../../app/routes/app_routes.dart';
import '../../core/network/api_exception.dart';
import '../../core/services/storage_service.dart';
import '../../core/services/user_profile_cache.dart';
import '../../data/models/job_completion_context.dart';
import '../../data/models/job_report_models.dart';
import '../../data/repositories/mobile_profile_repository.dart';
import '../../data/repositories/mobile_repository.dart';
import '../diary_event/diary_event_detail_controller.dart';
import '../home/controllers/home_controller.dart';
import '../../core/utils/location_helper.dart';
import '../../core/utils/text_formatters.dart';

class JobReportController extends GetxController {
  JobReportController({MobileRepository? mobile})
    : _mobile = mobile ?? Get.find<MobileRepository>();

  final MobileRepository _mobile;

  late int diaryId;
  final RxList<JobReportQuestion> questions = <JobReportQuestion>[].obs;
  final RxBool loading = true.obs;
  final RxString errorMessage = ''.obs;
  final RxBool submitting = false.obs;
  /// When true, opened from a completed visit — read-only answers, no submit.
  final RxBool readonlyMode = false.obs;
  /// 0 = answer form, 1 = change job stage, 2 = optional completion docs.
  final RxInt flowStep = 0.obs;
  final RxString selectedNextJobState = 'completed'.obs;
  final RxBool showCompletionActions = false.obs;
  final RxBool submittedOffline = false.obs;
  final RxInt currentPage = 0.obs;
  final Rxn<JobReportBundle> reportBundle = Rxn<JobReportBundle>();

  JobCompletionContext get jobCompletionContext =>
      reportBundle.value?.jobCompletionContext ?? JobCompletionContext.empty();
  final RxBool loadingSiteReportTemplates = false.obs;
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

  bool _isEngineerNamePrompt(String prompt) {
    final p = prompt.trim().toLowerCase().replaceAll(RegExp(r'\s+'), ' ');
    return p == 'engineer name' ||
        p == 'engineer’s name' ||
        p == "engineer's name" ||
        p == 'engineers name' ||
        (p.contains('engineer') && p.contains('name'));
  }

  String? _nameFromStoredUser() {
    try {
      if (!Get.isRegistered<StorageService>()) return null;
      final raw = Get.find<StorageService>().userJson;
      if (raw == null || raw.isEmpty) return null;
      final m = jsonDecode(raw) as Map<String, dynamic>;
      for (final key in ['full_name', 'fullName', 'name']) {
        final n = (m[key] as String?)?.trim();
        if (n != null && n.isNotEmpty) return n;
      }
    } catch (_) {
      /* ignore */
    }
    return null;
  }

  String? _nameFromCompletionContext(JobCompletionContext ctx) {
    for (final s in ctx.siblings) {
      if (s.isCurrentVisit) {
        final n = s.officerFullName?.trim();
        if (n != null && n.isNotEmpty) return n;
      }
    }
    return null;
  }

  String? _loggedInEngineerName(JobReportBundle bundle) {
    final fromApi = bundle.actingOfficerFullName?.trim();
    if (fromApi != null && fromApi.isNotEmpty) return fromApi;

    final fromCtx = _nameFromCompletionContext(bundle.jobCompletionContext);
    if (fromCtx != null && fromCtx.isNotEmpty) return fromCtx;

    try {
      if (Get.isRegistered<UserProfileCache>()) {
        final n = Get.find<UserProfileCache>().profile.value?.fullName.trim();
        if (n != null && n.isNotEmpty) return n;
      }
    } catch (_) {
      /* ignore */
    }

    try {
      if (Get.isRegistered<HomeController>()) {
        final home = Get.find<HomeController>();
        final n = home.home.value?.profile?.fullName?.trim();
        if (n != null && n.isNotEmpty) return n;
        final diary = home.diaryById(diaryId);
        final dn = diary?.officerFullName?.trim();
        if (dn != null && dn.isNotEmpty) return dn;
      }
    } catch (_) {
      /* HomeController may not be registered in some flows */
    }

    return _nameFromStoredUser();
  }

  Future<String?> _resolveEngineerName(JobReportBundle bundle) async {
    final cached = _loggedInEngineerName(bundle);
    if (cached != null && cached.isNotEmpty) return cached;

    try {
      if (Get.isRegistered<UserProfileCache>()) {
        final cache = Get.find<UserProfileCache>();
        await cache.refresh();
        final n = cache.profile.value?.fullName.trim();
        if (n != null && n.isNotEmpty) return n;
      }
      if (Get.isRegistered<MobileProfileRepository>()) {
        final p = await Get.find<MobileProfileRepository>().getProfile();
        final n = p.fullName.trim();
        if (n.isNotEmpty) return n;
      }
    } catch (_) {
      /* profile fetch is best-effort */
    }
    return null;
  }

  void _applyEngineerNameAutofill(String engineerName) {
    for (final q in questions) {
      if (!_isTextQuestion(q.questionType) || !_isEngineerNamePrompt(q.prompt)) {
        continue;
      }
      final existing = (textControllers[q.id]?.text ?? textByQuestionId[q.id] ?? '').trim();
      if (existing.isNotEmpty) continue;
      textByQuestionId[q.id] = engineerName;
      final tc = textControllers[q.id];
      if (tc != null) {
        tc.text = engineerName;
      }
    }
    textByQuestionId.refresh();
  }

  Future<void> _load() async {
    loading.value = true;
    errorMessage.value = '';
    try {
      final bundle = await _mobile.fetchDiaryJobReport(diaryId);
      // Backend may remap to this engineer's own visit when 2+ engineers share a job.
      if (bundle.diaryEventId > 0 && bundle.diaryEventId != diaryId) {
        diaryId = bundle.diaryEventId;
      }
      reportBundle.value = bundle;
      questions.assignAll(bundle.questions);
      currentPage.value = 0;
      var engineerName = readonlyMode.value ? null : _loggedInEngineerName(bundle);
      if (engineerName == null && !readonlyMode.value) {
        engineerName = await _resolveEngineerName(bundle);
      }
      for (final q in bundle.questions) {
        final existing = bundle.answersByQuestionId[q.id];
        if (existing != null && existing.trim().isNotEmpty) {
          if (q.questionType == 'before_photo' ||
              q.questionType == 'after_photo' ||
              q.questionType == 'customer_signature' ||
              q.questionType == 'officer_signature') {
            imageByQuestionId[q.id] = existing;
          } else {
            final value = _isEngineerNamePrompt(q.prompt)
                ? existing
                : capitalizeSentences(existing);
            textByQuestionId[q.id] = value;
          }
        } else if (engineerName != null &&
            _isTextQuestion(q.questionType) &&
            _isEngineerNamePrompt(q.prompt)) {
          textByQuestionId[q.id] = engineerName;
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
      if (engineerName != null && !readonlyMode.value) {
        _applyEngineerNameAutofill(engineerName);
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
    final bytes = await FlutterImageCompress.compressWithFile(
      file.path,
      minWidth: 1400,
      minHeight: 1400,
      quality: 80,
      format: CompressFormat.jpeg,
    );
    if (bytes == null) return;
    const mime = 'image/jpeg';
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
      if (q.questionType == 'page_break') continue;
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
      if (q.questionType == 'page_break') continue;
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
      final loc = await getCurrentLocation();
      final clientTimestamp = DateTime.now().toUtc().toIso8601String();
      await _flushDraftSave();
      final answers = await _buildAnswersPayload();
      final synced = await _mobile.submitDiaryJobReport(
        diaryId,
        answers,
        nextJobState: selectedNextJobState.value,
        latitude: loc.latitude,
        longitude: loc.longitude,
        timestamp: clientTimestamp,
      );
      if (synced) {
        if (Get.isRegistered<HomeController>()) {
          await Get.find<HomeController>().refreshHome();
        }
        if (Get.isRegistered<DiaryEventDetailController>()) {
          await Get.find<DiaryEventDetailController>().load();
        }
        if (_shouldOfferCompletionActions()) {
          submittedOffline.value = false;
          showCompletionActions.value = true;
          flowStep.value = 2;
          Get.snackbar(
            'Visit',
            jobCompletionContext.hasMultipleEngineers
                ? 'Job report saved. Complete your visit when ready — the job stage applies after all engineers finish.'
                : 'Job report saved. Complete your visit when ready.',
            snackPosition: SnackPosition.BOTTOM,
            margin: const EdgeInsets.all(16),
            borderRadius: 12,
          );
        } else {
          Get.back();
          Get.snackbar(
            'Visit',
            jobCompletionContext.hasMultipleEngineers
                ? 'Job report saved. The job stage applies after all engineers complete their visits.'
                : 'Job report saved.',
            snackPosition: SnackPosition.BOTTOM,
            margin: const EdgeInsets.all(16),
            borderRadius: 12,
          );
        }
      } else {
        if (Get.isRegistered<DiaryEventDetailController>()) {
          final dc = Get.find<DiaryEventDetailController>();
          if (dc.diaryId == diaryId) {
            dc.applyOptimisticCompletedFromQueuedJobReport(
              nextJobState: selectedNextJobState.value,
            );
          }
        }
        if (_shouldOfferCompletionActions()) {
          submittedOffline.value = true;
          showCompletionActions.value = true;
          flowStep.value = 2;
        } else {
          Get.back();
        }
        Get.snackbar(
          'Visit',
          submittedOffline.value
              ? 'Job report saved offline — sync before generating certificates or site reports.'
              : 'Job report saved offline — will sync when you are back online.',
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
    return type == 'text' || type == 'textarea';
  }

  TextEditingController? textControllerFor(int questionId) => textControllers[questionId];

  bool _shouldOfferCompletionActions() {
    if (selectedNextJobState.value != 'completed') return false;
    final bundle = reportBundle.value;
    if (bundle?.isQuotationVisit == true) return false;
    final customerId = bundle?.customerId;
    return customerId != null && customerId > 0 && bundle!.jobId > 0;
  }

  Map<String, dynamic> completionContextArgs() {
    final bundle = reportBundle.value;
    return <String, dynamic>{
      'customerId': bundle?.customerId,
      'workAddressId': bundle?.workAddressId,
      'jobId': bundle?.jobId,
      'jobNumber': bundle?.jobNumber,
      'customerName': bundle?.customerFullName,
      'jobTitle': bundle?.jobTitle,
    };
  }

  void finishCompletionFlow() {
    Get.back();
  }

  Future<void> openCertificatePicker() async {
    if (submittedOffline.value) {
      Get.snackbar(
        'Offline',
        'Sync your job report before generating a certificate.',
        snackPosition: SnackPosition.BOTTOM,
        margin: const EdgeInsets.all(16),
        borderRadius: 12,
      );
      return;
    }
    final args = completionContextArgs();
    if (args['customerId'] == null) return;
    await Get.toNamed(AppRoutes.certificateTypePicker, arguments: args);
  }

  Future<List<Map<String, dynamic>>> loadSiteReportTemplates() async {
    loadingSiteReportTemplates.value = true;
    try {
      return await _mobile.fetchMobileSiteReportTemplates();
    } finally {
      loadingSiteReportTemplates.value = false;
    }
  }

  Future<void> createSiteReportWithTemplate(int templateId) async {
    if (submittedOffline.value) {
      Get.snackbar(
        'Offline',
        'Sync your job report before generating a site report.',
        snackPosition: SnackPosition.BOTTOM,
        margin: const EdgeInsets.all(16),
        borderRadius: 12,
      );
      return;
    }
    final bundle = reportBundle.value;
    final customerId = bundle?.customerId;
    if (customerId == null || customerId <= 0) return;
    try {
      final res = await _mobile.createSiteReport(
        customerId: customerId,
        templateId: templateId,
        workAddressId: bundle?.workAddressId,
        jobId: bundle?.jobId,
      );
      final report = res['report'];
      final reportMap = report is Map ? Map<String, dynamic>.from(report) : null;
      final reportId = reportMap?['id'];
      final rid = reportId is int ? reportId : (reportId is num ? reportId.toInt() : null);
      if (rid == null) {
        throw Exception('Site report was created but no id was returned.');
      }
      await Get.toNamed(
        AppRoutes.siteReportEditor,
        arguments: <String, dynamic>{
          'customer_id': customerId,
          'work_address_id': bundle?.workAddressId,
          'report_id': rid,
        },
      );
    } on ApiException catch (e) {
      Get.snackbar(
        'Site report',
        e.message,
        snackPosition: SnackPosition.BOTTOM,
        margin: const EdgeInsets.all(16),
        borderRadius: 12,
      );
    } catch (e) {
      Get.snackbar(
        'Site report',
        e.toString(),
        snackPosition: SnackPosition.BOTTOM,
        margin: const EdgeInsets.all(16),
        borderRadius: 12,
      );
    }
  }
}
