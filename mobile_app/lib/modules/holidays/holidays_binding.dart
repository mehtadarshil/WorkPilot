import 'package:get/get.dart';

import 'holidays_controller.dart';

class HolidaysBinding extends Bindings {
  @override
  void dependencies() {
    Get.lazyPut<HolidaysController>(HolidaysController.new, fenix: true);
  }
}
