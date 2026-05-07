import 'package:get/get.dart';

import '../../core/network/api_exception.dart';
import '../../data/repositories/customers_repository.dart';

/// Customer detail + optional work-address drill-down (matches web `?work_address_id=`).
class CustomerDetailController extends GetxController {
  CustomerDetailController({
    required this.customerId,
    this.initialWorkAddressId,
    this.initialTabKey,
    CustomersRepository? repo,
  }) : _repo = repo ?? Get.find<CustomersRepository>();

  final int customerId;
  final int? initialWorkAddressId;
  /// Web `tab` query value, e.g. `Invoices`, `All works`.
  final String? initialTabKey;

  final CustomersRepository _repo;

  final customer = Rxn<Map<String, dynamic>>();
  final loading = true.obs;
  final error = ''.obs;

  final scopedWorkAddressId = Rxn<int>();
  final workAddressPreview = Rxn<Map<String, dynamic>>();
  final selectedTabIndex = 0.obs;

  bool _initialTabApplied = false;

  @override
  void onInit() {
    super.onInit();
    if (initialWorkAddressId != null) {
      scopedWorkAddressId.value = initialWorkAddressId;
      _fetchWorkAddressPreview();
    }
    refreshCustomer();
  }

  Future<void> _fetchWorkAddressPreview() async {
    final wid = scopedWorkAddressId.value;
    if (wid == null) {
      workAddressPreview.value = null;
      return;
    }
    try {
      workAddressPreview.value = await _repo.getWorkAddress(customerId, wid);
    } catch (_) {
      workAddressPreview.value = null;
    }
  }

  Future<void> enterWorkAddressScope(int workAddressId) async {
    scopedWorkAddressId.value = workAddressId;
    selectedTabIndex.value = 0;
    await _fetchWorkAddressPreview();
  }

  Future<void> exitWorkAddressScope() async {
    scopedWorkAddressId.value = null;
    workAddressPreview.value = null;
    selectedTabIndex.value = 0;
    await refreshCustomer();
  }

  void clampTabIndex(int tabCount) {
    if (tabCount <= 0) return;
    if (selectedTabIndex.value >= tabCount) {
      selectedTabIndex.value = tabCount - 1;
    }
    if (selectedTabIndex.value < 0) {
      selectedTabIndex.value = 0;
    }
  }

  /// Call after [customer] is loaded to honour [initialTabKey] once (web `?tab=`).
  void applyInitialTabIfNeeded(List<String> orderedInternalKeys) {
    if (_initialTabApplied) return;
    if (orderedInternalKeys.isEmpty) return;
    _initialTabApplied = true;
    final key = initialTabKey;
    if (key == null || key.isEmpty) return;
    const webToInternal = <String, String>{
      'All works': 'all_works',
      'Communications': 'communications',
      'Contacts': 'contacts',
      'Invoices': 'invoices',
      'Branches': 'branches',
      'Work address': 'work_address',
      'Assets': 'assets',
      'Files': 'files',
    };
    final internal = webToInternal[key];
    if (internal == null) return;
    final i = orderedInternalKeys.indexOf(internal);
    if (i >= 0) {
      selectedTabIndex.value = i;
    }
  }

  Future<void> refreshCustomer() async {
    loading.value = true;
    error.value = '';
    try {
      customer.value = await _repo.getCustomer(customerId);
    } on ApiException catch (e) {
      error.value = e.message;
      customer.value = null;
    } catch (e) {
      error.value = e.toString();
      customer.value = null;
    } finally {
      loading.value = false;
    }
  }

  String? str(String k) {
    final v = customer.value?[k];
    if (v == null) return null;
    if (v is String) return v.isEmpty ? null : v;
    return v.toString();
  }
}
