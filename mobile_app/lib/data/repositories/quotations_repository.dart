import 'package:get/get.dart';

import '../../core/network/api_exception.dart';
import '../providers/api_provider.dart';

/// Same `/api/quotations` surface as the web dashboard.
class QuotationsRepository extends GetxService {
  QuotationsRepository(this._api);

  final ApiProvider _api;

  Map<String, dynamic> _asMap(dynamic data) {
    if (data is Map<String, dynamic>) return data;
    if (data is Map) return Map<String, dynamic>.from(data);
    return {};
  }

  Future<Map<String, dynamic>> listQuotations({
    int page = 1,
    int limit = 25,
    String? search,
    String? state,
  }) async {
    final res = await _api.get<Map<String, dynamic>>(
      '/quotations',
      queryParameters: <String, dynamic>{
        'page': page,
        'limit': limit,
        if (search != null && search.trim().isNotEmpty) 'search': search.trim(),
        if (state != null && state.trim().isNotEmpty) 'state': state.trim(),
      },
    );
    return _asMap(res.data);
  }

  Future<Map<String, dynamic>> getQuotation(int id) async {
    final res = await _api.get<Map<String, dynamic>>('/quotations/$id');
    final d = _asMap(res.data);
    final q = d['quotation'];
    if (q is Map) return Map<String, dynamic>.from(q);
    return d;
  }

  /// Optional defaults for new quotations (admin-only on server; returns {} on 403).
  Future<Map<String, dynamic>> getQuotationSettings() async {
    try {
      final res = await _api.get<Map<String, dynamic>>('/settings/quotation');
      final s = res.data?['settings'];
      if (s is Map) return Map<String, dynamic>.from(s);
    } on ApiException {
      return {};
    } catch (_) {
      return {};
    }
    return {};
  }

  Future<Map<String, dynamic>> createQuotation(Map<String, dynamic> body) async {
    final res = await _api.post<Map<String, dynamic>>('/quotations', data: body);
    final d = _asMap(res.data);
    final q = d['quotation'];
    if (q is Map) return Map<String, dynamic>.from(q);
    return d;
  }

  Future<Map<String, dynamic>> patchQuotation(int id, Map<String, dynamic> body) async {
    final res = await _api.patch<Map<String, dynamic>>('/quotations/$id', data: body);
    final d = _asMap(res.data);
    final q = d['quotation'];
    if (q is Map) return Map<String, dynamic>.from(q);
    return d;
  }

  Future<void> deleteQuotation(int id) async {
    await _api.delete<void>('/quotations/$id');
  }

  Future<void> acceptQuotation(int id) async {
    await _api.post<void>('/quotations/$id/accept', data: <String, dynamic>{});
  }

  Future<void> rejectQuotation(int id) async {
    await _api.post<void>('/quotations/$id/reject', data: <String, dynamic>{});
  }

  Future<Map<String, dynamic>> transferToInvoice(int id) async {
    final res = await _api.post<Map<String, dynamic>>(
      '/quotations/$id/transfer-to-invoice',
      data: <String, dynamic>{},
    );
    return _asMap(res.data);
  }

  Future<void> linkJobToQuotation(int quotationId, int jobId) async {
    await _api.post<void>(
      '/quotations/$quotationId/link-job',
      data: <String, dynamic>{'job_id': jobId},
    );
  }

  Future<Map<String, dynamic>> getEmailComposeDraft(int id) async {
    final res = await _api.get<Map<String, dynamic>>('/quotations/$id/email-compose');
    return _asMap(res.data);
  }

  Future<void> sendQuotationEmail(
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
      '/quotations/$id/send-email',
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

  Future<Map<String, dynamic>> addInternalNote(
    int quotationId, {
    required String body,
    List<Map<String, dynamic>> media = const [],
  }) async {
    final res = await _api.post<Map<String, dynamic>>(
      '/quotations/$quotationId/internal-notes',
      data: <String, dynamic>{'body': body, 'media': media},
    );
    final d = _asMap(res.data);
    final n = d['note'];
    if (n is Map) return Map<String, dynamic>.from(n);
    return d;
  }

  Future<void> deleteInternalNote(int quotationId, int noteId) async {
    await _api.delete<void>('/quotations/$quotationId/internal-notes/$noteId');
  }

  Future<void> postCommunication(int quotationId, Map<String, dynamic> payload) async {
    await _api.post<void>('/quotations/$quotationId/communications', data: payload);
  }

  /// Authenticated PDF bytes (same document as web server-side PDF).
  Future<List<int>> downloadPdfBytes(int id) async {
    final res = await _api.getBytes('/quotations/$id/pdf');
    return res.data ?? [];
  }
}
