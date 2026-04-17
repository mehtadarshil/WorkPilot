import 'package:get/get.dart';

import 'timesheet_history_controller.dart';

class TimesheetHistoryBinding extends Bindings {
  @override
  void dependencies() {
    Get.lazyPut<TimesheetHistoryController>(TimesheetHistoryController.new, fenix: true);
  }
}
