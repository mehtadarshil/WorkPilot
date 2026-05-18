import 'package:get/get.dart';

import 'invoices_list_controller.dart';

class InvoicesListBinding extends Bindings {
  @override
  void dependencies() {
    Get.lazyPut<InvoicesListController>(InvoicesListController.new);
  }
}
