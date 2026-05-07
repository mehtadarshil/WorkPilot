import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/network/api_exception.dart';
import '../../data/repositories/customers_repository.dart';

/// Create (`id == null`) or edit customer — same core fields as web list modal + PATCH body.
class CustomerFormController extends GetxController {
  CustomerFormController({this.customerId, CustomersRepository? repo})
    : _repo = repo ?? Get.find<CustomersRepository>();

  final int? customerId;
  final CustomersRepository _repo;

  final saving = false.obs;
  final error = ''.obs;
  final customerTypes = <Map<String, dynamic>>[].obs;

  final formKey = GlobalKey<FormState>();
  final fullName = TextEditingController();
  final email = TextEditingController();
  final phone = TextEditingController();
  final company = TextEditingController();
  final address = TextEditingController();
  final city = TextEditingController();
  final region = TextEditingController();
  final country = TextEditingController();
  final notes = TextEditingController();
  final status = 'LEAD'.obs;
  final customerTypeId = Rxn<int>();

  bool get isEdit => customerId != null;

  @override
  void onInit() {
    super.onInit();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    customerTypes.assignAll(await _repo.getCustomerTypes());
    if (customerId != null) {
      try {
        final c = await _repo.getCustomer(customerId!);
        fullName.text = '${c['full_name'] ?? ''}';
        email.text = '${c['email'] ?? ''}';
        phone.text = '${c['phone'] ?? ''}';
        company.text = '${c['company'] ?? ''}';
        address.text = '${c['address'] ?? ''}';
        city.text = '${c['city'] ?? ''}';
        region.text = '${c['region'] ?? ''}';
        country.text = '${c['country'] ?? ''}';
        notes.text = '${c['notes'] ?? ''}';
        status.value = '${c['status'] ?? 'LEAD'}';
        final tid = c['customer_type_id'];
        customerTypeId.value = tid is num ? tid.toInt() : null;
      } on ApiException catch (e) {
        error.value = e.message;
      }
    }
  }

  @override
  void onClose() {
    fullName.dispose();
    email.dispose();
    phone.dispose();
    company.dispose();
    address.dispose();
    city.dispose();
    region.dispose();
    country.dispose();
    notes.dispose();
    super.onClose();
  }

  Map<String, dynamic> _payload() {
    return <String, dynamic>{
      'full_name': fullName.text.trim(),
      'email': email.text.trim().toLowerCase(),
      if (phone.text.trim().isNotEmpty) 'phone': phone.text.trim(),
      if (company.text.trim().isNotEmpty) 'company': company.text.trim(),
      if (address.text.trim().isNotEmpty) 'address': address.text.trim(),
      if (city.text.trim().isNotEmpty) 'city': city.text.trim(),
      if (region.text.trim().isNotEmpty) 'region': region.text.trim(),
      if (country.text.trim().isNotEmpty) 'country': country.text.trim(),
      if (notes.text.trim().isNotEmpty) 'notes': notes.text.trim(),
      'status': status.value,
      'customer_type_id': customerTypeId.value,
    };
  }

  Future<void> submit() async {
    if (!(formKey.currentState?.validate() ?? false)) return;
    saving.value = true;
    error.value = '';
    try {
      if (isEdit) {
        await _repo.updateCustomer(customerId!, _payload());
      } else {
        await _repo.createCustomer(_payload());
      }
      Get.back(result: true);
    } on ApiException catch (e) {
      error.value = e.message;
    } catch (e) {
      error.value = e.toString();
    } finally {
      saving.value = false;
    }
  }
}
