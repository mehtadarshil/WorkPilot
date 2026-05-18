import 'dart:convert';

import 'invoice_helpers.dart';

/// Mirrors web [InvoiceNotesPanel] timeline normalization.
enum InvoiceCommKind { note, print, phone, sms, email, system }

class InvoiceTimelineEntry {
  const InvoiceTimelineEntry({
    required this.id,
    required this.kind,
    required this.action,
    required this.createdAt,
    required this.title,
    required this.body,
    this.fromLabel,
    this.toLabel,
    this.statusBadge,
    this.attachment,
    this.isHtmlBody = false,
  });

  final int id;
  final InvoiceCommKind kind;
  final String action;
  final String createdAt;
  final String title;
  final String body;
  final String? fromLabel;
  final String? toLabel;
  final String? statusBadge;
  final String? attachment;
  final bool isHtmlBody;
}

Map<String, dynamic> _detailsMap(dynamic raw) {
  if (raw is Map<String, dynamic>) return raw;
  if (raw is Map) return Map<String, dynamic>.from(raw);
  return {};
}

String _str(Map<String, dynamic> d, String k) {
  final v = d[k];
  return v is String ? v : '';
}

double? _num(Map<String, dynamic> d, String k) {
  final v = d[k];
  if (v is num) return v.toDouble();
  return null;
}

List<InvoiceTimelineEntry> normalizeInvoiceActivities(
  List<dynamic> activities,
  String invoiceNumber, {
  String currency = 'GBP',
}) {
  final out = <InvoiceTimelineEntry>[];
  for (final raw in activities) {
    if (raw is! Map) continue;
    final a = Map<String, dynamic>.from(raw);
    final id = (a['id'] as num?)?.toInt() ?? 0;
    final action = (a['action'] as String?) ?? '';
    final createdAt = (a['created_at'] as String?) ?? '';
    final d = _detailsMap(a['details']);

    switch (action) {
      case 'comm_note':
        out.add(
          InvoiceTimelineEntry(
            id: id,
            kind: InvoiceCommKind.note,
            action: action,
            createdAt: createdAt,
            title: 'Note',
            body: _str(d, 'text'),
          ),
        );
        break;
      case 'comm_email':
        out.add(
          InvoiceTimelineEntry(
            id: id,
            kind: InvoiceCommKind.email,
            action: action,
            createdAt: createdAt,
            title: _str(d, 'subject').trim().isEmpty ? 'Email' : _str(d, 'subject'),
            body: _str(d, 'body'),
            fromLabel: _str(d, 'from').trim().isEmpty ? 'Office' : _str(d, 'from'),
            toLabel: _str(d, 'to_email').trim().isEmpty ? _str(d, 'to_name') : _str(d, 'to_email'),
            statusBadge: _str(d, 'status').trim().isEmpty ? 'sent' : _str(d, 'status'),
            attachment: _str(d, 'attachment_name').trim().isEmpty ? null : _str(d, 'attachment_name'),
            isHtmlBody: true,
          ),
        );
        break;
      case 'sent_to_client':
        out.add(
          InvoiceTimelineEntry(
            id: id,
            kind: InvoiceCommKind.email,
            action: action,
            createdAt: createdAt,
            title: 'Invoice $invoiceNumber sent to client',
            body: 'Invoice was marked as sent to the client.',
            fromLabel: 'Office',
            toLabel: '',
            statusBadge: 'sent',
            attachment: '$invoiceNumber.pdf',
          ),
        );
        break;
      case 'comm_sms':
        out.add(
          InvoiceTimelineEntry(
            id: id,
            kind: InvoiceCommKind.sms,
            action: action,
            createdAt: createdAt,
            title: 'SMS',
            body: _str(d, 'body'),
            toLabel: _str(d, 'to_phone').trim().isEmpty ? _str(d, 'to_name') : _str(d, 'to_phone'),
          ),
        );
        break;
      case 'comm_phone':
        final dur = _num(d, 'duration_minutes')?.round();
        final summary = _str(d, 'summary');
        final body = dur != null ? '$summary\nDuration: $dur minutes' : summary;
        out.add(
          InvoiceTimelineEntry(
            id: id,
            kind: InvoiceCommKind.phone,
            action: action,
            createdAt: createdAt,
            title: 'Phone call',
            body: body,
          ),
        );
        break;
      case 'comm_print':
        out.add(
          InvoiceTimelineEntry(
            id: id,
            kind: InvoiceCommKind.print,
            action: action,
            createdAt: createdAt,
            title: _str(d, 'label').trim().isEmpty ? 'Print' : _str(d, 'label'),
            body: 'Invoice ${_str(d, 'invoice_number').trim().isEmpty ? invoiceNumber : _str(d, 'invoice_number')} printed or saved.',
          ),
        );
        break;
      case 'payment_recorded':
        final amt = d['amount'];
        final method = _str(d, 'payment_method');
        final amtStr = amt is num ? InvoiceHelpers.formatMoney(amt.toDouble(), currency) : 'Payment recorded';
        out.add(
          InvoiceTimelineEntry(
            id: id,
            kind: InvoiceCommKind.system,
            action: action,
            createdAt: createdAt,
            title: 'Payment recorded',
            body: method.isEmpty ? amtStr : '$amtStr · ${method.replaceAll('_', ' ')}',
          ),
        );
        break;
      case 'payment_updated':
        final amt = d['amount'];
        final method = _str(d, 'payment_method');
        final amtStr = amt is num ? InvoiceHelpers.formatMoney(amt.toDouble(), currency) : 'Payment line was updated';
        out.add(
          InvoiceTimelineEntry(
            id: id,
            kind: InvoiceCommKind.system,
            action: action,
            createdAt: createdAt,
            title: 'Payment updated',
            body: method.isEmpty ? amtStr : '$amtStr · ${method.replaceAll('_', ' ')}',
          ),
        );
        break;
      case 'created':
        out.add(
          InvoiceTimelineEntry(
            id: id,
            kind: InvoiceCommKind.system,
            action: action,
            createdAt: createdAt,
            title: 'Invoice created',
            body: '',
          ),
        );
        break;
      case 'issued':
        out.add(
          InvoiceTimelineEntry(
            id: id,
            kind: InvoiceCommKind.system,
            action: action,
            createdAt: createdAt,
            title: 'Invoice issued',
            body: '',
          ),
        );
        break;
      case 'updated':
        out.add(
          InvoiceTimelineEntry(
            id: id,
            kind: InvoiceCommKind.system,
            action: action,
            createdAt: createdAt,
            title: 'Invoice updated',
            body: '',
          ),
        );
        break;
      default:
        out.add(
          InvoiceTimelineEntry(
            id: id,
            kind: InvoiceCommKind.system,
            action: action,
            createdAt: createdAt,
            title: action.replaceAll('_', ' '),
            body: d.isEmpty ? '' : jsonEncode(d),
          ),
        );
    }
  }
  return out;
}

bool invoiceEntryMatchesFilters(
  InvoiceTimelineEntry e,
  Map<InvoiceCommKind, bool> filters,
) {
  if (e.kind == InvoiceCommKind.system) return filters[InvoiceCommKind.system] ?? true;
  return filters[e.kind] ?? true;
}

bool invoiceEntryMatchesSearch(InvoiceTimelineEntry e, String q) {
  if (q.trim().isEmpty) return true;
  final hay = '${e.title} ${e.body} ${e.fromLabel ?? ''} ${e.toLabel ?? ''} ${e.attachment ?? ''}'
      .toLowerCase();
  return hay.contains(q.trim().toLowerCase());
}

bool invoiceEntryMatchesDate(InvoiceTimelineEntry e, String yyyyMmDd) {
  if (yyyyMmDd.trim().isEmpty) return true;
  final raw = e.createdAt.trim();
  if (raw.length < 10) return false;
  return raw.substring(0, 10) == yyyyMmDd;
}
