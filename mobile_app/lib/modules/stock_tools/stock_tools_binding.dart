import 'package:get/get.dart';

import '../../data/repositories/stock_tools_repository.dart';
import 'stock_tools_controller.dart';

class StockToolsBinding extends Bindings {
  @override
  void dependencies() {
    Get.lazyPut<StockToolsRepository>(
      () => StockToolsRepository(Get.find()),
      fenix: true,
    );
    Get.lazyPut<StockToolsController>(
      () => StockToolsController(
        repository: Get.find<StockToolsRepository>(),
      ),
      fenix: true,
    );
  }
}
