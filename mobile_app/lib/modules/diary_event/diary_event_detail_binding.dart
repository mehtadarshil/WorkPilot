import 'package:get/get.dart';

import 'diary_event_detail_controller.dart';

class DiaryEventDetailBinding extends Bindings {
  @override
  void dependencies() {
    Get.lazyPut<DiaryEventDetailController>(
      DiaryEventDetailController.new,
      fenix: true,
    );
  }
}
