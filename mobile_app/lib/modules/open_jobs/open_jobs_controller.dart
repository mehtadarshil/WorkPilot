import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/network/api_exception.dart';
import '../../data/models/open_job_summary.dart';
import '../../data/repositories/mobile_repository.dart';

class OpenJobsController extends GetxController {
  OpenJobsController({MobileRepository? mobile})
    : _mobile = mobile ?? Get.find<MobileRepository>();

  final MobileRepository _mobile;

  final RxList<OpenJobSummary> _allJobs = <OpenJobSummary>[].obs;
  final RxList<OpenJobSummary> jobs = <OpenJobSummary>[].obs;
  final RxBool loading = false.obs;
  final RxString error = ''.obs;
  final TextEditingController searchController = TextEditingController();

  bool get hasSearch => searchController.text.trim().isNotEmpty;
  bool get hasLoadedJobs => _allJobs.isNotEmpty;

  @override
  void onInit() {
    super.onInit();
    load();
  }

  Future<void> load() async {
    loading.value = true;
    error.value = '';
    try {
      final list = await _mobile.fetchOpenJobs();
      _allJobs.assignAll(list);
      _applySearch();
    } on ApiException catch (e) {
      error.value = e.message;
    } catch (e) {
      error.value = e.toString().replaceFirst('Exception: ', '');
    } finally {
      loading.value = false;
    }
  }

  void setSearch(String value) {
    _applySearch();
  }

  void _applySearch() {
    final q = searchController.text.trim().toLowerCase();
    if (q.isEmpty) {
      jobs.assignAll(_allJobs);
      return;
    }
    jobs.assignAll(
      _allJobs.where((j) {
        final haystack = [
          j.jobNumber,
          j.title,
          j.customerFullName,
          j.location,
          j.state,
          j.priority,
        ].whereType<String>().join(' ').toLowerCase();
        return haystack.contains(q);
      }),
    );
  }

  @override
  void onClose() {
    searchController.dispose();
    super.onClose();
  }
}
