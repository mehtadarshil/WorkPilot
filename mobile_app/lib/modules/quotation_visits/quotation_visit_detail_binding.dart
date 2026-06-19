import 'package:get/get.dart';

import 'quotation_visit_detail_controller.dart';

class QuotationVisitDetailBinding extends Bindings {
  @override
  void dependencies() {
    Get.lazyPut<QuotationVisitDetailController>(QuotationVisitDetailController.new);
  }
}
