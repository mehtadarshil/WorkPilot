import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/network/api_exception.dart';
import '../../data/repositories/mobile_repository.dart';

class CrmListController extends GetxController {
  CrmListController({MobileRepository? mobile})
    : _mobile = mobile ?? Get.find<MobileRepository>();

  final MobileRepository _mobile;

  late final String module;

  final RxList<Map<String, dynamic>> items = <Map<String, dynamic>>[].obs;
  final RxBool loading = false.obs;
  final RxString error = ''.obs;
  final TextEditingController searchController = TextEditingController();

  int _page = 1;
  int? _totalPages;
  Timer? _searchDebounce;

  final RxString listFilter = ''.obs;

  String get title => switch (module) {
    'customers' => 'Customers',
    'jobs' => 'Jobs',
    'quotations' => 'Quotations',
    'invoices' => 'Invoices',
    'parts_catalog' => 'Part catalog',
    'certifications' => 'Certificates',
    'quotation_visits' => 'Quotation Visits',
    _ => 'List',
  };

  bool get _paginated =>
      module == 'customers' ||
      module == 'jobs' ||
      module == 'quotations' ||
      module == 'invoices' ||
      module == 'quotation_visits' ||
      module == 'certifications';

  bool get hasMore {
    if (!_paginated || _totalPages == null) return false;
    return _page < _totalPages!;
  }

  @override
  void onInit() {
    module = Get.arguments as String? ?? 'customers';
    super.onInit();
    reloadFromStart();
  }

  void setListFilter(String value) {
    listFilter.value = value;
    reloadFromStart();
  }

  Future<void> reloadFromStart() async {
    _page = 1;
    items.clear();
    await _fetch(append: false);
  }

  void setSearch(String value) {
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 350), reloadFromStart);
  }

  Future<void> loadMore() async {
    if (!hasMore || loading.value) return;
    _page++;
    await _fetch(append: true);
  }

  Future<void> _fetch({required bool append}) async {
    loading.value = true;
    error.value = '';
    try {
      final r = await _mobile.fetchCrmListPage(
        module: module,
        page: _page,
        search: (module == 'jobs' || module == 'quotation_visits') ? searchController.text : null,
        filter: module == 'certifications' ? listFilter.value : null,
      );
      if (append) {
        items.addAll(r.items);
      } else {
        items.assignAll(r.items);
      }
      _totalPages = r.totalPages;
    } on ApiException catch (e) {
      error.value = e.message;
      if (append && _page > 1) _page--;
    } catch (e) {
      error.value = e.toString();
      if (append && _page > 1) _page--;
    } finally {
      loading.value = false;
    }
  }

  @override
  void onClose() {
    _searchDebounce?.cancel();
    searchController.dispose();
    super.onClose();
  }
}
