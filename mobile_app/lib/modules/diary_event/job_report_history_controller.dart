import 'package:get/get.dart';

import '../../core/network/api_exception.dart';
import '../../data/models/job_report_history_models.dart';
import '../../data/repositories/mobile_repository.dart';

class JobReportHistoryController extends GetxController {
  JobReportHistoryController({MobileRepository? mobile})
    : _mobile = mobile ?? Get.find<MobileRepository>();

  final MobileRepository _mobile;

  late final int diaryId;
  final RxBool historyLoaded = false.obs;
  final RxString historyError = ''.obs;
  final RxList<JobReportHistorySubmission> historyItems =
      <JobReportHistorySubmission>[].obs;

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
    } else if (arg is int) {
      diaryId = arg;
    } else if (arg is String) {
      diaryId = int.tryParse(arg) ?? 0;
    } else {
      diaryId = 0;
    }
    if (diaryId > 0) {
      load();
    } else {
      historyError.value = 'Invalid visit';
      historyLoaded.value = true;
    }
  }

  Future<void> load() async {
    historyLoaded.value = false;
    historyError.value = '';
    try {
      final list = await _mobile.fetchJobReportHistory(diaryId);
      historyItems.assignAll(list);
    } on ApiException catch (e) {
      historyItems.clear();
      historyError.value = e.message;
    } catch (e) {
      historyItems.clear();
      historyError.value = e.toString().replaceFirst('Exception: ', '');
    } finally {
      historyLoaded.value = true;
    }
  }
}
