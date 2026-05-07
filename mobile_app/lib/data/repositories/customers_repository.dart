import 'dart:convert';
import 'dart:typed_data';

import 'package:get/get.dart';

import '../../core/network/api_exception.dart';
import '../providers/api_provider.dart';

/// Native CRM: same `/api/customers` surface as the web dashboard (no WebView).
class CustomersRepository extends GetxService {
  CustomersRepository(this._api);

  final ApiProvider _api;

  Map<String, dynamic> _asMap(dynamic data) {
    if (data is Map<String, dynamic>) return data;
    if (data is Map) return Map<String, dynamic>.from(data);
    return {};
  }

  /// `GET /customers` — list + dashboard stats fields.
  Future<Map<String, dynamic>> listCustomers({
    int page = 1,
    int limit = 15,
    String? search,
    String? status,
  }) async {
    final res = await _api.get<Map<String, dynamic>>(
      '/customers',
      queryParameters: <String, dynamic>{
        'page': page,
        'limit': limit,
        if (search != null && search.trim().isNotEmpty) 'search': search.trim(),
        if (status != null && status.trim().isNotEmpty) 'status': status.trim(),
      },
    );
    return _asMap(res.data);
  }

  Future<Map<String, dynamic>> getCustomer(int id) async {
    final res = await _api.get<Map<String, dynamic>>('/customers/$id');
    return _asMap(res.data);
  }

  Future<Map<String, dynamic>> createCustomer(Map<String, dynamic> body) async {
    final res = await _api.post<Map<String, dynamic>>('/customers', data: body);
    final d = _asMap(res.data);
    final c = d['customer'];
    if (c is Map) return Map<String, dynamic>.from(c);
    return d;
  }

  Future<Map<String, dynamic>> updateCustomer(int id, Map<String, dynamic> body) async {
    final res = await _api.patch<Map<String, dynamic>>('/customers/$id', data: body);
    final d = _asMap(res.data);
    final c = d['customer'];
    if (c is Map) return Map<String, dynamic>.from(c);
    return d;
  }

  Future<void> deleteCustomer(int id) async {
    await _api.delete<void>('/customers/$id');
  }

  Future<List<Map<String, dynamic>>> getCustomerTypes() async {
    try {
      final res = await _api.get<Map<String, dynamic>>('/settings/customer-types');
      final raw = res.data?['customerTypes'];
      if (raw is! List) return [];
      return raw
          .map((e) => e is Map ? Map<String, dynamic>.from(e) : <String, dynamic>{})
          .toList();
    } on ApiException {
      return [];
    }
  }

  Future<List<Map<String, dynamic>>> getPriceBooks() async {
    try {
      final res = await _api.get<List<dynamic>>('/settings/price-books');
      final raw = res.data;
      if (raw is! List) return [];
      return raw
          .map((e) => e is Map ? Map<String, dynamic>.from(e) : <String, dynamic>{})
          .toList();
    } on ApiException {
      return [];
    }
  }

  Future<List<Map<String, dynamic>>> getCustomerJobs(
    int customerId, {
    int? workAddressId,
  }) async {
    final qp = <String, dynamic>{};
    if (workAddressId != null) qp['work_address_id'] = workAddressId;
    final res = await _api.get<List<dynamic>>(
      '/customers/$customerId/jobs',
      queryParameters: qp.isEmpty ? null : qp,
    );
    final raw = res.data;
    if (raw is! List) return [];
    return raw
        .map((e) => e is Map ? Map<String, dynamic>.from(e) : <String, dynamic>{})
        .toList();
  }

  Future<Map<String, dynamic>> createCustomerJob(
    int customerId,
    Map<String, dynamic> body,
  ) async {
    final res = await _api.post<Map<String, dynamic>>(
      '/customers/$customerId/jobs',
      data: body,
    );
    final d = _asMap(res.data);
    final j = d['job'];
    if (j is Map) return Map<String, dynamic>.from(j);
    return d;
  }

  /// Same `/settings/job-descriptions` list as the web add-job page (requires Settings permission when enforced).
  Future<List<Map<String, dynamic>>> listJobDescriptions() async {
    try {
      final res = await _api.get<List<dynamic>>('/settings/job-descriptions');
      final raw = res.data;
      if (raw is! List) return [];
      return raw
          .map((e) => e is Map ? Map<String, dynamic>.from(e) : <String, dynamic>{})
          .toList();
    } on ApiException {
      return [];
    }
  }

  /// Job description + template `pricing_items` (same as web `GET …/job-descriptions/:id`).
  Future<Map<String, dynamic>> getJobDescription(int id) async {
    final res = await _api.get<Map<String, dynamic>>('/settings/job-descriptions/$id');
    return _asMap(res.data);
  }

  Future<List<Map<String, dynamic>>> listBusinessUnits() async {
    try {
      final res = await _api.get<Map<String, dynamic>>('/settings/business-units');
      final raw = res.data?['units'];
      if (raw is! List) return [];
      return raw
          .map((e) => e is Map ? Map<String, dynamic>.from(e) : <String, dynamic>{})
          .toList();
    } on ApiException {
      return [];
    }
  }

  Future<List<Map<String, dynamic>>> listUserGroups() async {
    try {
      final res = await _api.get<Map<String, dynamic>>('/settings/user-groups');
      final raw = res.data?['groups'];
      if (raw is! List) return [];
      return raw
          .map((e) => e is Map ? Map<String, dynamic>.from(e) : <String, dynamic>{})
          .toList();
    } on ApiException {
      return [];
    }
  }

  Future<List<Map<String, dynamic>>> listServiceChecklistItems() async {
    try {
      final res = await _api.get<Map<String, dynamic>>('/settings/service-checklist');
      final raw = res.data?['items'];
      if (raw is! List) return [];
      return raw
          .map((e) => e is Map ? Map<String, dynamic>.from(e) : <String, dynamic>{})
          .toList();
    } on ApiException {
      return [];
    }
  }

  Future<List<Map<String, dynamic>>> getContacts(
    int customerId, {
    String? search,
    int? workAddressId,
  }) async {
    final res = await _api.get<Map<String, dynamic>>(
      '/customers/$customerId/contacts',
      queryParameters: <String, dynamic>{
        if (search != null && search!.trim().isNotEmpty) 'search': search!.trim(),
        if (workAddressId != null) 'work_address_id': workAddressId,
      },
    );
    final raw = res.data?['contacts'];
    if (raw is! List) return [];
    return raw
        .map((e) => e is Map ? Map<String, dynamic>.from(e) : <String, dynamic>{})
        .toList();
  }

  Future<void> createContact(int customerId, Map<String, dynamic> body) async {
    await _api.post<Map<String, dynamic>>('/customers/$customerId/contacts', data: body);
  }

  Future<void> updateContact(
    int customerId,
    int contactId,
    Map<String, dynamic> body,
  ) async {
    await _api.patch<Map<String, dynamic>>(
      '/customers/$customerId/contacts/$contactId',
      data: body,
    );
  }

  Future<List<Map<String, dynamic>>> getBranches(
    int customerId, {
    String? search,
  }) async {
    final res = await _api.get<Map<String, dynamic>>(
      '/customers/$customerId/branches',
      queryParameters: <String, dynamic>{
        if (search != null && search!.trim().isNotEmpty) 'search': search!.trim(),
      },
    );
    final raw = res.data?['branches'];
    if (raw is! List) return [];
    return raw
        .map((e) => e is Map ? Map<String, dynamic>.from(e) : <String, dynamic>{})
        .toList();
  }

  Future<void> createBranch(int customerId, Map<String, dynamic> body) async {
    await _api.post<Map<String, dynamic>>('/customers/$customerId/branches', data: body);
  }

  Future<void> updateBranch(
    int customerId,
    int branchId,
    Map<String, dynamic> body,
  ) async {
    await _api.patch<Map<String, dynamic>>(
      '/customers/$customerId/branches/$branchId',
      data: body,
    );
  }

  Future<void> deleteBranch(int customerId, int branchId) async {
    await _api.delete<void>('/customers/$customerId/branches/$branchId');
  }

  Future<List<Map<String, dynamic>>> getWorkAddresses(
    int customerId, {
    String? status,
    String? search,
  }) async {
    final res = await _api.get<Map<String, dynamic>>(
      '/customers/$customerId/work-addresses',
      queryParameters: <String, dynamic>{
        if (status != null && status!.trim().isNotEmpty) 'status': status!.trim(),
        if (search != null && search!.trim().isNotEmpty) 'search': search!.trim(),
      },
    );
    final raw = res.data?['work_addresses'];
    if (raw is! List) return [];
    return raw
        .map((e) => e is Map ? Map<String, dynamic>.from(e) : <String, dynamic>{})
        .toList();
  }

  Future<void> createWorkAddress(int customerId, Map<String, dynamic> body) async {
    await _api.post<Map<String, dynamic>>(
      '/customers/$customerId/work-addresses',
      data: body,
    );
  }

  Future<void> updateWorkAddress(
    int customerId,
    int workAddressId,
    Map<String, dynamic> body,
  ) async {
    await _api.patch<Map<String, dynamic>>(
      '/customers/$customerId/work-addresses/$workAddressId',
      data: body,
    );
  }

  Future<void> deleteWorkAddress(int customerId, int workAddressId) async {
    await _api.delete<void>(
      '/customers/$customerId/work-addresses/$workAddressId',
    );
  }

  Future<Map<String, dynamic>> getWorkAddress(int customerId, int workAddressId) async {
    final res = await _api.get<Map<String, dynamic>>(
      '/customers/$customerId/work-addresses/$workAddressId',
    );
    final wa = res.data?['work_address'];
    if (wa is Map) return Map<String, dynamic>.from(wa);
    return {};
  }

  Future<List<Map<String, dynamic>>> getAssets(
    int customerId, {
    int? workAddressId,
  }) async {
    final res = await _api.get<Map<String, dynamic>>(
      '/customers/$customerId/assets',
      queryParameters: <String, dynamic>{
        if (workAddressId != null) 'work_address_id': workAddressId,
      },
    );
    final raw = res.data?['assets'];
    if (raw is! List) return [];
    return raw
        .map((e) => e is Map ? Map<String, dynamic>.from(e) : <String, dynamic>{})
        .toList();
  }

  Future<Map<String, dynamic>> getAsset(int customerId, int assetId) async {
    final res = await _api.get<Map<String, dynamic>>('/customers/$customerId/assets/$assetId');
    final a = res.data?['asset'];
    if (a is Map) return Map<String, dynamic>.from(a);
    return {};
  }

  Future<void> createAsset(int customerId, Map<String, dynamic> body) async {
    await _api.post<Map<String, dynamic>>('/customers/$customerId/assets', data: body);
  }

  Future<void> updateAsset(
    int customerId,
    int assetId,
    Map<String, dynamic> body,
  ) async {
    await _api.patch<Map<String, dynamic>>(
      '/customers/$customerId/assets/$assetId',
      data: body,
    );
  }

  Future<void> deleteAsset(int customerId, int assetId) async {
    await _api.delete<void>('/customers/$customerId/assets/$assetId');
  }

  Future<List<Map<String, dynamic>>> getFiles(
    int customerId, {
    int? workAddressId,
  }) async {
    final res = await _api.get<Map<String, dynamic>>(
      '/customers/$customerId/files',
      queryParameters: <String, dynamic>{
        if (workAddressId != null) 'work_address_id': workAddressId,
      },
    );
    final raw = res.data?['files'];
    if (raw is! List) return [];
    return raw
        .map((e) => e is Map ? Map<String, dynamic>.from(e) : <String, dynamic>{})
        .toList();
  }

  Future<void> uploadCustomerFile(
    int customerId, {
    required String filename,
    required String contentType,
    required List<int> bytes,
    int? workAddressId,
  }) async {
    await _api.post<Map<String, dynamic>>(
      '/customers/$customerId/files',
      data: <String, dynamic>{
        'filename': filename,
        'content_type': contentType.trim().isEmpty ? null : contentType.trim(),
        'content_base64': base64Encode(bytes),
        if (workAddressId != null) 'work_address_id': workAddressId,
      },
    );
  }

  Future<void> deleteCustomerFile(int customerId, int fileId) async {
    await _api.delete<void>('/customers/$customerId/files/$fileId');
  }

  Future<Uint8List> getCustomerFileBytes(int customerId, int fileId) async {
    final res = await _api.getBytes('/customers/$customerId/files/$fileId/content');
    final d = res.data;
    if (d == null) return Uint8List(0);
    if (d is Uint8List) return d;
    return Uint8List.fromList(List<int>.from(d));
  }

  Future<Map<String, dynamic>> getCommunications(
    int customerId, {
    String? search,
    String? type,
    String? fromDate,
    String? toDate,
    int? workAddressId,
  }) async {
    final res = await _api.get<Map<String, dynamic>>(
      '/customers/$customerId/communications',
      queryParameters: <String, dynamic>{
        if (search != null && search!.trim().isNotEmpty) 'search': search!.trim(),
        if (type != null && type!.trim().isNotEmpty) 'type': type!.trim(),
        if (fromDate != null && fromDate!.trim().isNotEmpty) 'from_date': fromDate!.trim(),
        if (toDate != null && toDate!.trim().isNotEmpty) 'to_date': toDate!.trim(),
        if (workAddressId != null) 'work_address_id': workAddressId,
      },
    );
    return _asMap(res.data);
  }

  Future<void> postCommunication(int customerId, Map<String, dynamic> body) async {
    await _api.post<Map<String, dynamic>>(
      '/customers/$customerId/communications',
      data: body,
    );
  }

  Future<Map<String, dynamic>> createInvoice(Map<String, dynamic> body) async {
    final res = await _api.post<Map<String, dynamic>>('/invoices', data: body);
    return _asMap(res.data);
  }

  Future<Map<String, dynamic>> listInvoicesForCustomer(
    int customerId, {
    int? invoiceWorkAddressId,
  }) async {
    final res = await _api.get<Map<String, dynamic>>(
      '/invoices',
      queryParameters: <String, dynamic>{
        'customer_id': customerId,
        'limit': 500,
        'page': 1,
        if (invoiceWorkAddressId != null) 'invoice_work_address_id': invoiceWorkAddressId,
      },
    );
    return _asMap(res.data);
  }

  Future<Map<String, dynamic>> createSpecificNote(
    int customerId,
    Map<String, dynamic> body,
  ) async {
    final res = await _api.post<Map<String, dynamic>>(
      '/customers/$customerId/specific-notes',
      data: body,
    );
    return _asMap(res.data);
  }

  Future<Map<String, dynamic>> updateSpecificNote(
    int customerId,
    int noteId,
    Map<String, dynamic> body,
  ) async {
    final res = await _api.patch<Map<String, dynamic>>(
      '/customers/$customerId/specific-notes/$noteId',
      data: body,
    );
    return _asMap(res.data);
  }

  Future<void> deleteSpecificNote(int customerId, int noteId) async {
    await _api.delete<void>('/customers/$customerId/specific-notes/$noteId');
  }
}
