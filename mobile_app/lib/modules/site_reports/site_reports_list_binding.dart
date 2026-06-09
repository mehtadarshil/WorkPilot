import 'package:get/get.dart';

import '../../data/repositories/mobile_repository.dart';
import 'site_reports_list_controller.dart';

class SiteReportsListBinding extends Bindings {
  @override
  void dependencies() {
    Get.lazyPut<SiteReportsListController>(
      () => SiteReportsListController(mobile: Get.find<MobileRepository>()),
    );
  }
}
