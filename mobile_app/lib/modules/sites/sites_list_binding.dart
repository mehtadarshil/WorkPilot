import 'package:get/get.dart';

import 'sites_list_controller.dart';

class SitesListBinding extends Bindings {
  @override
  void dependencies() {
    Get.lazyPut<SitesListController>(SitesListController.new);
  }
}
