import 'package:get/get.dart';

import 'job_report_history_controller.dart';

class JobReportHistoryBinding extends Bindings {
  @override
  void dependencies() {
    Get.lazyPut<JobReportHistoryController>(JobReportHistoryController.new);
  }
}
