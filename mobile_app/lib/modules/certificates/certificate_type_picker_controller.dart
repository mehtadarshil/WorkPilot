import 'package:get/get.dart';

import '../../app/routes/app_routes.dart';
import '../../core/network/api_exception.dart';
import '../../data/repositories/customers_repository.dart';
import '../../data/repositories/mobile_repository.dart';
import '../../widgets/searchable_select_field.dart';
import 'certificate_catalog.dart';

class CertificateTypePickerController extends GetxController {
  CertificateTypePickerController({MobileRepository? mobile, CustomersRepository? customers})
    : _mobile = mobile ?? Get.find<MobileRepository>(),
      _customersRepo = customers ?? Get.find<CustomersRepository>();

  final MobileRepository _mobile;
  final CustomersRepository _customersRepo;

  final RxBool creating = false.obs;
  final RxString selectedTypeSlug = certificateTypeCatalog.first.slug.obs;
  final RxString errorMessage = ''.obs;

  final RxInt customerId = 0.obs;
  final Rxn<int> workAddressId = Rxn<int>();
  int? jobId;
  String? jobNumber;
  final RxString customerName = ''.obs;
  String? jobTitle;
  bool customerLocked = false;

  final RxBool loadingCustomers = false.obs;
  final RxList<SelectOption<int>> customerOptions = <SelectOption<int>>[].obs;
  final RxList<SelectOption<int>> workAddressOptions = <SelectOption<int>>[].obs;
  final RxList<Map<String, dynamic>> rawWorkAddresses = <Map<String, dynamic>>[].obs;

  @override
  void onInit() {
    super.onInit();
    final args = Get.arguments;
    final map = args is Map
        ? Map<String, dynamic>.from(args)
        : <String, dynamic>{};
    final pId = _readInt(map['customerId'] ?? map['customer_id']) ?? 0;
    customerId.value = pId;
    customerLocked = pId > 0;
    workAddressId.value = _readInt(map['workAddressId'] ?? map['work_address_id']);
    jobId = _readInt(map['jobId'] ?? map['job_id']);
    jobNumber = map['jobNumber']?.toString() ?? map['job_number']?.toString();
    customerName.value =
        map['customerName']?.toString() ?? map['customer_name']?.toString() ?? '';
    jobTitle = map['jobTitle']?.toString() ?? map['job_title']?.toString();

    if (customerId.value == 0) {
      _loadCustomers();
    } else {
      _loadWorkAddresses(customerId.value);
    }
  }

  Future<void> _loadCustomers() async {
    loadingCustomers.value = true;
    try {
      final res = await _customersRepo.listCustomers(page: 1, limit: 5000);
      final raw = res['customers'];
      if (raw is List) {
        final opts = <SelectOption<int>>[];
        for (final item in raw) {
          if (item is Map) {
            final id = _readInt(item['id']) ?? 0;
            final name = (item['full_name'] as String?)?.trim() ?? '';
            if (id > 0 && name.isNotEmpty) {
              opts.add(SelectOption(value: id, label: name));
            }
          }
        }
        customerOptions.assignAll(opts);
      }
    } catch (e) {
      errorMessage.value = 'Failed to load customers: $e';
    } finally {
      loadingCustomers.value = false;
    }
  }

  Future<void> _loadWorkAddresses(int custId) async {
    try {
      final list = await _customersRepo.getWorkAddresses(custId);
      rawWorkAddresses.assignAll(list);
      final opts = list.map((item) {
        final id = _readInt(item['id']) ?? 0;
        final name = (item['name'] as String?)?.trim() ?? '';
        final line1 = (item['address_line_1'] as String?)?.trim() ?? '';
        final town = (item['town'] as String?)?.trim() ?? '';
        final pc = (item['postcode'] as String?)?.trim() ?? '';
        final parts = [line1, town, pc].where((e) => e.isNotEmpty).join(', ');
        final label = [name, parts].where((e) => e.isNotEmpty).join(' — ');
        return SelectOption(value: id, label: label);
      }).toList();
      workAddressOptions.assignAll(opts);
    } catch (e) {
      errorMessage.value = 'Failed to load sites: $e';
    }
  }

  void onCustomerChanged(int? id) {
    customerId.value = id ?? 0;
    workAddressId.value = null;
    workAddressOptions.clear();
    rawWorkAddresses.clear();
    if (id != null && id > 0) {
      final opt = customerOptions.firstWhereOrNull((o) => o.value == id);
      customerName.value = opt?.label ?? '';
      _loadWorkAddresses(id);
    } else {
      customerName.value = '';
    }
  }

  void onWorkAddressChanged(int? id) {
    workAddressId.value = id;
  }

  Future<void> createSelectedCertificate() async {
    if (customerId.value <= 0) {
      errorMessage.value = 'Please choose a customer first.';
      return;
    }
    if (creating.value) return;
    creating.value = true;
    errorMessage.value = '';
    try {
      final cert = await _mobile.createElectricalCertificate(
        customerId: customerId.value,
        workAddressId: workAddressId.value,
        jobId: jobId,
        jobNumber: jobNumber,
        typeSlug: selectedTypeSlug.value,
      );
      await Get.offNamed(
        AppRoutes.certificateEditor,
        arguments: {'id': cert.id},
      );
    } on ApiException catch (e) {
      errorMessage.value = e.message;
    } catch (e) {
      errorMessage.value = e.toString();
    } finally {
      creating.value = false;
    }
  }

  int? _readInt(dynamic value) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    return int.tryParse(value?.toString() ?? '');
  }
}
