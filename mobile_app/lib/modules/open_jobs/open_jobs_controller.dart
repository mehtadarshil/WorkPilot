import 'package:get/get.dart';

import '../../core/network/api_exception.dart';
import '../../data/models/open_job_summary.dart';
import '../../data/repositories/mobile_repository.dart';

class OpenJobsController extends GetxController {
  OpenJobsController({MobileRepository? mobile})
    : _mobile = mobile ?? Get.find<MobileRepository>();

  final MobileRepository _mobile;

  final RxList<OpenJobSummary> jobs = <OpenJobSummary>[].obs;
  final RxBool loading = false.obs;
  final RxString error = ''.obs;

  @override
  void onInit() {
    super.onInit();
    load();
  }

  Future<void> load() async {
    loading.value = true;
    error.value = '';
    try {
      final list = await _mobile.fetchOpenJobs();
      jobs.assignAll(list);
    } on ApiException catch (e) {
      error.value = e.message;
    } catch (e) {
      error.value = e.toString().replaceFirst('Exception: ', '');
    } finally {
      loading.value = false;
    }
  }
}
