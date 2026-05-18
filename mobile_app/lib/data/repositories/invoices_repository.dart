import 'package:get/get.dart';

import '../../core/network/api_exception.dart';
import '../providers/api_provider.dart';

/// Same `/api/invoices` surface as the web dashboard.
class InvoicesRepository extends GetxService {
  InvoicesRepository(this._api);

  final ApiProvider _api;

  Map<String, dynamic> _asMap(dynamic data) {
    if (data is Map<String, dynamic>) return data;
    if (data is Map) return Map<String, dynamic>.from(data);
    return {};
  }

  Future<Map<String, dynamic>> listInvoices({
    int page = 1,
    int limit = 25,
    String? search,
    String? state,
    int? customerId,
    int? jobId,
    int? invoiceWorkAddressId,
  }) async {
    final res = await _api.get<Map<String, dynamic>>(
      '/invoices',
      queryParameters: <String, dynamic>{
        'page': page,
        'limit': limit,
        if (search != null && search.trim().isNotEmpty) 'search': search.trim(),
        if (state != null && state.trim().isNotEmpty) 'state': state.trim(),
        if (customerId != null) 'customer_id': customerId,
        if (jobId != null) 'job_id': jobId,
        if (invoiceWorkAddressId != null) 'invoice_work_address_id': invoiceWorkAddressId,
      },
    );
    return _asMap(res.data);
  }

  Future<Map<String, dynamic>> getInvoice(int id) async {
    final res = await _api.get<Map<String, dynamic>>('/invoices/$id');
    final d = _asMap(res.data);
    final inv = d['invoice'];
    if (inv is Map) return Map<String, dynamic>.from(inv);
    return d;
  }

  Future<Map<String, dynamic>> getInvoiceSettings() async {
    try {
      final res = await _api.get<Map<String, dynamic>>('/settings/invoice');
      final s = res.data?['settings'];
      if (s is Map) return Map<String, dynamic>.from(s);
    } on ApiException {
      return {};
    } catch (_) {}
    return {};
  }

  Future<Map<String, dynamic>> createInvoice(Map<String, dynamic> body) async {
    final res = await _api.post<Map<String, dynamic>>('/invoices', data: body);
    final d = _asMap(res.data);
    final inv = d['invoice'];
    if (inv is Map) return Map<String, dynamic>.from(inv);
    return d;
  }

  Future<Map<String, dynamic>> patchInvoice(int id, Map<String, dynamic> body) async {
    final res = await _api.patch<Map<String, dynamic>>('/invoices/$id', data: body);
    final d = _asMap(res.data);
    final inv = d['invoice'];
    if (inv is Map) return Map<String, dynamic>.from(inv);
    return d;
  }

  Future<void> deleteInvoice(int id) async {
    await _api.delete<void>('/invoices/$id');
  }

  /// Completed / closed jobs for linking on new invoices (same idea as web list filter).
  Future<List<Map<String, dynamic>>> listJobsForPicker() async {
    final res = await _api.get<Map<String, dynamic>>(
      '/jobs',
      queryParameters: <String, dynamic>{'page': 1, 'limit': 200},
    );
    final raw = res.data?['jobs'];
    if (raw is! List) return [];
    final out = <Map<String, dynamic>>[];
    for (final e in raw) {
      if (e is! Map) continue;
      final m = Map<String, dynamic>.from(e);
      final st = (m['state'] as String?) ?? '';
      if (st == 'completed' || st == 'closed') {
        out.add(m);
      }
    }
    return out;
  }

  Future<void> issueInvoice(int id) async {
    await _api.post<void>('/invoices/$id/issue', data: <String, dynamic>{});
  }

  Future<Map<String, dynamic>> getJob(int jobId) async {
    final res = await _api.get<Map<String, dynamic>>('/jobs/$jobId');
    final d = _asMap(res.data);
    final j = d['job'];
    if (j is Map) return Map<String, dynamic>.from(j);
    return d;
  }

  Future<void> postPayment(
    int invoiceId, {
    required double amount,
    required String paymentMethod,
    required String paymentDateIso,
    String? referenceNumber,
  }) async {
    await _api.post<void>(
      '/invoices/$invoiceId/payments',
      data: <String, dynamic>{
        'amount': amount,
        'payment_method': paymentMethod,
        'payment_date': paymentDateIso,
        if (referenceNumber != null && referenceNumber.trim().isNotEmpty) 'reference_number': referenceNumber.trim(),
      },
    );
  }

  Future<void> patchPayment(
    int invoiceId,
    int paymentId, {
    required double amount,
    required String paymentMethod,
    required String paymentDateIso,
    String? referenceNumber,
  }) async {
    await _api.patch<void>(
      '/invoices/$invoiceId/payments/$paymentId',
      data: <String, dynamic>{
        'amount': amount,
        'payment_method': paymentMethod,
        'payment_date': paymentDateIso,
        if (referenceNumber != null && referenceNumber.trim().isNotEmpty) 'reference_number': referenceNumber.trim(),
      },
    );
  }

  Future<Map<String, dynamic>> getEmailComposeDraft(int id) async {
    final res = await _api.get<Map<String, dynamic>>('/invoices/$id/email-compose');
    return _asMap(res.data);
  }

  Future<void> sendInvoiceEmail(
    int id, {
    required String to,
    String? cc,
    String? bcc,
    required String subject,
    required String bodyHtml,
    bool appendSignature = true,
    List<Map<String, dynamic>>? attachments,
  }) async {
    await _api.post<void>(
      '/invoices/$id/send-email',
      data: <String, dynamic>{
        'to': to,
        if (cc != null && cc.trim().isNotEmpty) 'cc': cc.trim(),
        if (bcc != null && bcc.trim().isNotEmpty) 'bcc': bcc.trim(),
        'subject': subject,
        'body_html': bodyHtml,
        'append_signature': appendSignature,
        if (attachments != null && attachments.isNotEmpty) 'attachments': attachments,
      },
    );
  }

  Future<void> postCommunication(int invoiceId, Map<String, dynamic> payload) async {
    await _api.post<void>('/invoices/$invoiceId/communications', data: payload);
  }

  Future<List<int>> downloadPdfBytes(int id) async {
    final res = await _api.getBytes('/invoices/$id/pdf');
    return res.data ?? [];
  }
}
