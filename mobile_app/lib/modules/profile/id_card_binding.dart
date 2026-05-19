import 'package:get/get.dart';

import 'id_card_controller.dart';

class IdCardBinding extends Bindings {
  @override
  void dependencies() {
    Get.lazyPut<IdCardController>(IdCardController.new);
  }
}
