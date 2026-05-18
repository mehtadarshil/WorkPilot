import 'dart:convert';

/// Mirrors web [QuotationNotesPanel] `CommKind` / timeline normalization.
enum QuotationCommKind { note, print, phone, sms, email, system }

class QuotationTimelineEntry {
  const QuotationTimelineEntry({
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
  final QuotationCommKind kind;
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

/// Same mapping as web `normalizeActivities`.
List<QuotationTimelineEntry> normalizeQuotationActivities(
  List<dynamic> activities,
  String quotationNumber,
) {
  final out = <QuotationTimelineEntry>[];
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
          QuotationTimelineEntry(
            id: id,
            kind: QuotationCommKind.note,
            action: action,
            createdAt: createdAt,
            title: 'Note',
            body: _str(d, 'text'),
          ),
        );
        break;
      case 'comm_email':
        out.add(
          QuotationTimelineEntry(
            id: id,
            kind: QuotationCommKind.email,
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
          QuotationTimelineEntry(
            id: id,
            kind: QuotationCommKind.email,
            action: action,
            createdAt: createdAt,
            title: 'Quotation $quotationNumber sent to client',
            body: 'Quotation was marked as sent to the client.',
            fromLabel: 'Office',
            toLabel: '',
            statusBadge: 'sent',
            attachment: '$quotationNumber.pdf',
          ),
        );
        break;
      case 'comm_sms':
        out.add(
          QuotationTimelineEntry(
            id: id,
            kind: QuotationCommKind.sms,
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
          QuotationTimelineEntry(
            id: id,
            kind: QuotationCommKind.phone,
            action: action,
            createdAt: createdAt,
            title: 'Phone call',
            body: body,
          ),
        );
        break;
      case 'comm_print':
        out.add(
          QuotationTimelineEntry(
            id: id,
            kind: QuotationCommKind.print,
            action: action,
            createdAt: createdAt,
            title: _str(d, 'label').trim().isEmpty ? 'Print' : _str(d, 'label'),
            body: 'Quotation ${_str(d, 'quotation_number').trim().isEmpty ? quotationNumber : _str(d, 'quotation_number')} printed or saved.',
          ),
        );
        break;
      case 'created':
        out.add(
          QuotationTimelineEntry(
            id: id,
            kind: QuotationCommKind.system,
            action: action,
            createdAt: createdAt,
            title: 'Quotation created',
            body: '',
          ),
        );
        break;
      case 'accepted':
        out.add(
          QuotationTimelineEntry(
            id: id,
            kind: QuotationCommKind.system,
            action: action,
            createdAt: createdAt,
            title: 'Quotation accepted',
            body: '',
          ),
        );
        break;
      case 'rejected':
        out.add(
          QuotationTimelineEntry(
            id: id,
            kind: QuotationCommKind.system,
            action: action,
            createdAt: createdAt,
            title: 'Quotation rejected',
            body: '',
          ),
        );
        break;
      case 'transferred_to_invoice':
        out.add(
          QuotationTimelineEntry(
            id: id,
            kind: QuotationCommKind.system,
            action: action,
            createdAt: createdAt,
            title: 'Transferred to invoice',
            body: '',
          ),
        );
        break;
      case 'linked_job':
      case 'converted_to_job':
        final jid = d['job_id'];
        final jobStr = jid == null ? '' : '$jid';
        out.add(
          QuotationTimelineEntry(
            id: id,
            kind: QuotationCommKind.system,
            action: action,
            createdAt: createdAt,
            title: action == 'linked_job' ? 'Linked to job' : 'Converted to job',
            body: jobStr.isEmpty ? '' : 'Job #$jobStr',
          ),
        );
        break;
      default:
        out.add(
          QuotationTimelineEntry(
            id: id,
            kind: QuotationCommKind.system,
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

bool entryMatchesFilters(
  QuotationTimelineEntry e,
  Map<QuotationCommKind, bool> filters,
) {
  if (e.kind == QuotationCommKind.system) return filters[QuotationCommKind.system] ?? true;
  return filters[e.kind] ?? true;
}

bool entryMatchesSearch(QuotationTimelineEntry e, String q) {
  if (q.trim().isEmpty) return true;
  final hay = '${e.title} ${e.body} ${e.fromLabel ?? ''} ${e.toLabel ?? ''} ${e.attachment ?? ''}'
      .toLowerCase();
  return hay.contains(q.trim().toLowerCase());
}

bool entryMatchesDate(QuotationTimelineEntry e, String yyyyMmDd) {
  if (yyyyMmDd.trim().isEmpty) return true;
  final raw = e.createdAt.trim();
  if (raw.length < 10) return false;
  return raw.substring(0, 10) == yyyyMmDd;
}
