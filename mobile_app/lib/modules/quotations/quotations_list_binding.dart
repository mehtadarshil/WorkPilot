import 'package:get/get.dart';

import 'quotations_list_controller.dart';

class QuotationsListBinding extends Bindings {
  @override
  void dependencies() {
    Get.lazyPut<QuotationsListController>(QuotationsListController.new);
  }
}
