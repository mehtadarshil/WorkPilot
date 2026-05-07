import 'package:get/get.dart';

import 'customer_detail_controller.dart';

class CustomerDetailBinding extends Bindings {
  @override
  void dependencies() {
    final raw = Get.arguments;
    int? id;
    int? workAddressId;
    String? tabKey;
    if (raw is int) {
      id = raw;
    } else if (raw is Map) {
      id = (raw['id'] as num?)?.toInt() ?? (raw['customerId'] as num?)?.toInt();
      workAddressId = (raw['work_address_id'] as num?)?.toInt() ?? (raw['workAddressId'] as num?)?.toInt();
      final t = raw['tab'];
      if (t is String && t.trim().isNotEmpty) {
        tabKey = t.trim();
      }
    }
    if (id == null) {
      throw ArgumentError('CustomerDetailBinding requires int id or Map with id / customerId');
    }
    Get.lazyPut<CustomerDetailController>(
      () => CustomerDetailController(
        customerId: id!,
        initialWorkAddressId: workAddressId,
        initialTabKey: tabKey,
      ),
    );
  }
}
