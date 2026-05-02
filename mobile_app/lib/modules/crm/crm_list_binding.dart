import 'package:get/get.dart';

import 'crm_list_controller.dart';

class CrmListBinding extends Bindings {
  @override
  void dependencies() {
    Get.lazyPut<CrmListController>(CrmListController.new);
  }
}
