import 'dart:async';

import 'package:get/get.dart';

import '../../core/network/api_exception.dart';
import '../../data/repositories/customers_repository.dart';

class SitesListController extends GetxController {
  SitesListController({CustomersRepository? repo})
    : _repo = repo ?? Get.find<CustomersRepository>();

  final CustomersRepository _repo;

  final items = <Map<String, dynamic>>[].obs;
  final loading = false.obs;
  final error = ''.obs;
  final searchQuery = ''.obs;

  Timer? _debounce;

  @override
  void onInit() {
    super.onInit();
    load();
  }

  @override
  void onClose() {
    _debounce?.cancel();
    super.onClose();
  }

  void scheduleSearchReload() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      load();
    });
  }

  Future<void> load() async {
    loading.value = true;
    error.value = '';
    try {
      final list = await _repo.listAllSites(
        search: searchQuery.value.trim().isEmpty ? null : searchQuery.value,
      );
      items.assignAll(list);
    } on ApiException catch (e) {
      error.value = e.message;
      items.clear();
    } catch (e) {
      error.value = e.toString();
      items.clear();
    } finally {
      loading.value = false;
    }
  }
}
