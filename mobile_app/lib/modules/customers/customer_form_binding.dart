import 'package:get/get.dart';

import 'customer_form_controller.dart';

class CustomerFormBinding extends Bindings {
  @override
  void dependencies() {
    final raw = Get.arguments;
    final id = raw is int
        ? raw
        : raw is Map
            ? raw['id'] as int?
            : null;
    Get.lazyPut<CustomerFormController>(
      () => CustomerFormController(customerId: id),
    );
  }
}
