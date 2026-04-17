import 'package:get/get.dart';

import 'open_jobs_controller.dart';

class OpenJobsBinding extends Bindings {
  @override
  void dependencies() {
    Get.lazyPut<OpenJobsController>(OpenJobsController.new, fenix: true);
  }
}
