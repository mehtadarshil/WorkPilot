import 'package:get/get.dart';

import 'todos_controller.dart';

class TodosBinding extends Bindings {
  @override
  void dependencies() {
    Get.lazyPut<TodosController>(TodosController.new, fenix: true);
  }
}
