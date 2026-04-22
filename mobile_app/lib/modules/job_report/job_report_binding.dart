import 'package:get/get.dart';

import 'job_report_controller.dart';

class JobReportBinding extends Bindings {
  @override
  void dependencies() {
    Get.put<JobReportController>(JobReportController(), permanent: false);
  }
}
