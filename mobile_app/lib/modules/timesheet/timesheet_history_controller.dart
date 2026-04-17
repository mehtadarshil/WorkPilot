import 'package:get/get.dart';

import '../../core/network/api_exception.dart';
import '../../data/models/timesheet_history_entry.dart';
import '../../data/repositories/mobile_repository.dart';

class TimesheetHistoryController extends GetxController {
  TimesheetHistoryController({MobileRepository? mobile})
    : _mobile = mobile ?? Get.find<MobileRepository>();

  final MobileRepository _mobile;

  final RxList<TimesheetHistoryEntry> entries = <TimesheetHistoryEntry>[].obs;
  final RxBool loading = true.obs;
  final error = ''.obs;

  @override
  void onInit() {
    super.onInit();
    load();
  }

  Future<void> load() async {
    loading.value = true;
    error.value = '';
    try {
      entries.assignAll(await _mobile.fetchTimesheetHistory(limit: 100));
    } on ApiException catch (e) {
      error.value = e.message;
    } catch (e) {
      error.value = e.toString();
    } finally {
      loading.value = false;
    }
  }
}
