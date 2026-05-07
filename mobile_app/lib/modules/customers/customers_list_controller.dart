import 'dart:async';

import 'package:get/get.dart';

import '../../core/network/api_exception.dart';
import '../../data/repositories/customers_repository.dart';

class CustomersListController extends GetxController {
  CustomersListController({CustomersRepository? repo})
    : _repo = repo ?? Get.find<CustomersRepository>();

  final CustomersRepository _repo;

  final items = <Map<String, dynamic>>[].obs;
  final loading = false.obs;
  final error = ''.obs;
  final searchQuery = ''.obs;
  final statusFilter = ''.obs;

  int page = 1;
  int totalPages = 1;
  int total = 0;
  int totalActive = 0;
  int totalLeads = 0;
  int totalInactive = 0;

  Timer? _debounce;

  static const statuses = <String>['', 'ACTIVE', 'LEAD', 'INACTIVE'];
  static const statusLabels = <String, String>{
    '': 'All',
    'ACTIVE': 'Active',
    'LEAD': 'Lead',
    'INACTIVE': 'Inactive',
  };

  @override
  void onInit() {
    super.onInit();
    load(reset: true);
  }

  @override
  void onClose() {
    _debounce?.cancel();
    super.onClose();
  }

  void scheduleSearchReload() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      load(reset: true);
    });
  }

  Future<void> load({bool reset = false}) async {
    if (reset) page = 1;
    loading.value = true;
    error.value = '';
    try {
      final data = await _repo.listCustomers(
        page: page,
        limit: 15,
        search: searchQuery.value.trim().isEmpty ? null : searchQuery.value,
        status: statusFilter.value.isEmpty ? null : statusFilter.value,
      );
      final list = data['customers'];
      if (list is List) {
        items.assignAll(
          list.map((e) => e is Map ? Map<String, dynamic>.from(e) : <String, dynamic>{}),
        );
      } else {
        items.clear();
      }
      totalPages = (data['totalPages'] as num?)?.toInt() ?? 1;
      total = (data['total'] as num?)?.toInt() ?? 0;
      totalActive = (data['totalActive'] as num?)?.toInt() ?? 0;
      totalLeads = (data['totalLeads'] as num?)?.toInt() ?? 0;
      totalInactive = (data['totalInactive'] as num?)?.toInt() ?? 0;
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

  Future<void> nextPage() async {
    if (page >= totalPages || loading.value) return;
    page++;
    await load(reset: false);
  }

  Future<void> prevPage() async {
    if (page <= 1 || loading.value) return;
    page--;
    await load(reset: false);
  }

  void setStatus(String s) {
    statusFilter.value = s;
    load(reset: true);
  }
}
