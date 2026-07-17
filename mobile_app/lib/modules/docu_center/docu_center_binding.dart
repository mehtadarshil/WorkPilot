import 'package:get/get.dart';

import 'docu_center_controller.dart';

class DocuCenterBinding extends Bindings {
  @override
  void dependencies() {
    Get.lazyPut<DocuCenterController>(DocuCenterController.new, fenix: true);
  }
}
