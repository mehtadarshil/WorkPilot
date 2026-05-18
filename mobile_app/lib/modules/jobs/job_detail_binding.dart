import 'package:get/get.dart';

import 'job_detail_controller.dart';

class JobDetailBinding extends Bindings {
  @override
  void dependencies() {
    Get.lazyPut<JobDetailController>(JobDetailController.new);
  }
}
