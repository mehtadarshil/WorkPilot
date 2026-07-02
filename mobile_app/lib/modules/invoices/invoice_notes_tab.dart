import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/network/api_exception.dart';
import '../../core/values/app_colors.dart';
import '../../data/repositories/invoices_repository.dart';
import 'invoice_helpers.dart';
import 'invoice_timeline.dart';

/// Notes & communications — behaviour aligned with web [InvoiceNotesPanel].
class InvoiceNotesTab extends StatefulWidget {
  const InvoiceNotesTab({
    super.key,
    required this.invoiceId,
    required this.invoiceNumber,
    required this.customerEmail,
    required this.customerPhone,
    required this.customerName,
    required this.activities,
    required this.currency,
    required this.onRefresh,
    required this.onOpenPrintLayout,
  });

  final int invoiceId;
  final String invoiceNumber;
  final String? customerEmail;
  final String? customerPhone;
  final String? customerName;
  final List<dynamic> activities;
  final String currency;
  final VoidCallback onRefresh;
  final Future<void> Function() onOpenPrintLayout;

  @override
  State<InvoiceNotesTab> createState() => _InvoiceNotesTabState();
}

class _InvoiceNotesTabState extends State<InvoiceNotesTab> {
  final _repo = Get.find<InvoicesRepository>();
  final _searchC = TextEditingController();
  String _dateFilter = '';
  var _timelineView = true;
  final _filters = <InvoiceCommKind, bool>{
    InvoiceCommKind.note: true,
    InvoiceCommKind.print: true,
    InvoiceCommKind.phone: true,
    InvoiceCommKind.sms: true,
    InvoiceCommKind.email: true,
    InvoiceCommKind.system: true,
  };

  @override
  void dispose() {
    _searchC.dispose();
    super.dispose();
  }

  List<InvoiceTimelineEntry> get _normalized =>
      normalizeInvoiceActivities(widget.activities, widget.invoiceNumber, currency: widget.currency);

  List<InvoiceTimelineEntry> get _filtered {
    final q = _searchC.text;
    return _normalized.where((e) {
      if (!invoiceEntryMatchesFilters(e, _filters)) return false;
      if (!invoiceEntryMatchesSearch(e, q)) return false;
      if (!invoiceEntryMatchesDate(e, _dateFilter)) return false;
      return true;
    }).toList();
  }

  Future<void> _post(Map<String, dynamic> payload) async {
    try {
      await _repo.postCommunication(widget.invoiceId, payload);
      widget.onRefresh();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _exportJson() async {
    final items = _filtered
        .map(
          (e) => {
            'id': e.id,
            'kind': e.kind.name,
            'created_at': e.createdAt,
            'title': e.title,
            'body': e.body,
            'from': e.fromLabel,
            'to': e.toLabel,
            'status': e.statusBadge,
            'attachment': e.attachment,
          },
        )
        .toList();
    final doc = {
      'invoice_number': widget.invoiceNumber,
      'exported_at': DateTime.now().toUtc().toIso8601String(),
      'items': items,
    };
    await Clipboard.setData(ClipboardData(text: const JsonEncoder.withIndent('  ').convert(doc)));
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Communications JSON copied to clipboard.')),
      );
    }
  }

  Future<void> _logPrint() async {
    try {
      await _repo.postCommunication(widget.invoiceId, {'type': 'print'});
    } catch (_) {}
    await widget.onOpenPrintLayout();
    widget.onRefresh();
  }

  Future<void> _dialogNote() async {
    final c = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Add note'),
        content: TextField(controller: c, maxLines: 5, decoration: InputDecoration(hintText: 'Note text')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Save')),
        ],
      ),
    );
    if (ok == true && c.text.trim().isNotEmpty) await _post({'type': 'note', 'text': c.text.trim()});
  }

  Future<void> _dialogLogEmail() async {
    final toC = TextEditingController(text: widget.customerEmail ?? '');
    final subC = TextEditingController();
    final bodyC = TextEditingController();
    final attachC = TextEditingController(text: '${widget.invoiceNumber}.pdf');
    String status = 'sent';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setD) => AlertDialog(
          title: const Text('Log email'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextField(controller: toC, decoration: InputDecoration(labelText: 'To')),
                TextField(controller: subC, decoration: InputDecoration(labelText: 'Subject')),
                TextField(controller: bodyC, maxLines: 4, decoration: InputDecoration(labelText: 'Message')),
                TextField(controller: attachC, decoration: InputDecoration(labelText: 'Attachment name (reference)')),
                DropdownButtonFormField<String>(
                  key: ValueKey<String>(status),
                  initialValue: status,
                  decoration: InputDecoration(labelText: 'Delivery status'),
                  items: const [
                    DropdownMenuItem(value: 'sent', child: Text('Sent')),
                    DropdownMenuItem(value: 'delivered', child: Text('Delivered')),
                    DropdownMenuItem(value: 'clicked', child: Text('Clicked')),
                  ],
                  onChanged: (v) => setD(() => status = v ?? 'sent'),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            FilledButton(
              onPressed: () {
                if (subC.text.trim().isEmpty || bodyC.text.trim().isEmpty) return;
                Navigator.pop(ctx, true);
              },
              child: const Text('Log email'),
            ),
          ],
        ),
      ),
    );
    if (ok != true) return;
    await _post({
      'type': 'email',
      'subject': subC.text.trim(),
      'body': bodyC.text.trim(),
      'to_email': toC.text.trim(),
      'attachment_name': attachC.text.trim(),
      'email_status': status,
    });
  }

  Future<void> _dialogSms() async {
    final toC = TextEditingController(text: widget.customerPhone ?? '');
    final bodyC = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Log SMS'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: toC, decoration: InputDecoration(labelText: 'To (phone)')),
            TextField(controller: bodyC, maxLines: 4, decoration: InputDecoration(labelText: 'Message')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Log SMS')),
        ],
      ),
    );
    if (ok != true || bodyC.text.trim().isEmpty) return;
    await _post({'type': 'sms', 'body': bodyC.text.trim(), 'to_phone': toC.text.trim()});
  }

  Future<void> _dialogPhone() async {
    final sumC = TextEditingController();
    final durC = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Log phone call'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: sumC, maxLines: 4, decoration: InputDecoration(labelText: 'Summary')),
            TextField(
              controller: durC,
              keyboardType: TextInputType.number,
              decoration: InputDecoration(labelText: 'Duration (minutes, optional)'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Save')),
        ],
      ),
    );
    if (ok != true || sumC.text.trim().isEmpty) return;
    final dm = int.tryParse(durC.text.trim());
    await _post({
      'type': 'phone',
      'summary': sumC.text.trim(),
      if (dm != null) 'duration_minutes': dm,
    });
  }

  Map<String, List<InvoiceTimelineEntry>> _groupByDay(List<InvoiceTimelineEntry> list) {
    final m = <String, List<InvoiceTimelineEntry>>{};
    for (final e in list) {
      final k = e.createdAt.length >= 10 ? e.createdAt.substring(0, 10) : e.createdAt;
      m.putIfAbsent(k, () => []).add(e);
    }
    for (final arr in m.values) {
      arr.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    }
    final keys = m.keys.toList()..sort((a, b) => b.compareTo(a));
    return {for (final k in keys) k: m[k]!};
  }

  IconData _icon(InvoiceCommKind k) {
    switch (k) {
      case InvoiceCommKind.email:
        return Icons.mail_outline_rounded;
      case InvoiceCommKind.sms:
        return Icons.sms_outlined;
      case InvoiceCommKind.phone:
        return Icons.phone_in_talk_outlined;
      case InvoiceCommKind.print:
        return Icons.print_outlined;
      case InvoiceCommKind.note:
        return Icons.sticky_note_2_outlined;
      case InvoiceCommKind.system:
        return Icons.info_outline_rounded;
    }
  }

  String _label(InvoiceCommKind k) {
    switch (k) {
      case InvoiceCommKind.note:
        return 'Notes';
      case InvoiceCommKind.print:
        return 'Print';
      case InvoiceCommKind.phone:
        return 'Phone';
      case InvoiceCommKind.sms:
        return 'SMS';
      case InvoiceCommKind.email:
        return 'Email';
      case InvoiceCommKind.system:
        return 'Activity';
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filtered;
    final grouped = _groupByDay(filtered);

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
      children: [
        TextField(
          controller: _searchC,
          onChanged: (_) => setState(() {}),
          style: GoogleFonts.inter(color: AppColors.slate900),
          decoration: InputDecoration(
            hintText: 'Search notes and communications',
            hintStyle: GoogleFonts.inter(color: AppColors.slate400),
            prefixIcon: Icon(Icons.search_rounded, color: AppColors.slate500),
            filled: true,
            fillColor: AppColors.whiteOverlay(0.08),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          ),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: InkWell(
                onTap: () async {
                  final base = _dateFilter.isNotEmpty ? DateTime.tryParse(_dateFilter) : DateTime.now();
                  final d = await showDatePicker(
                    context: context,
                    initialDate: base ?? DateTime.now(),
                    firstDate: DateTime(2000),
                    lastDate: DateTime(2100),
                  );
                  if (d != null) {
                    setState(() => _dateFilter = d.toIso8601String().split('T').first);
                  }
                },
                child: InputDecorator(
                  decoration: InputDecoration(
                    labelText: 'Filter by date',
                    filled: true,
                    fillColor: AppColors.whiteOverlay(0.08),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  child: Text(
                    _dateFilter.isEmpty ? 'Any date' : _dateFilter,
                    style: GoogleFonts.inter(color: AppColors.slate900),
                  ),
                ),
              ),
            ),
            if (_dateFilter.isNotEmpty)
              IconButton(
                onPressed: () => setState(() => _dateFilter = ''),
                icon: Icon(Icons.clear_rounded, color: Colors.white70),
              ),
            FilterChip(
              label: const Text('Timeline'),
              selected: _timelineView,
              onSelected: (v) => setState(() => _timelineView = v),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Text('Filter by type', style: GoogleFonts.inter(color: AppColors.slate500, fontSize: 11, fontWeight: FontWeight.w700)),
        const SizedBox(height: 6),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            for (final e in InvoiceCommKind.values)
              if (e != InvoiceCommKind.system)
                FilterChip(
                  label: Text(_label(e)),
                  selected: _filters[e] ?? true,
                  onSelected: (v) => setState(() => _filters[e] = v),
                ),
            FilterChip(
              label: const Text('Activity'),
              selected: _filters[InvoiceCommKind.system] ?? true,
              onSelected: (v) => setState(() => _filters[InvoiceCommKind.system] = v),
            ),
          ],
        ),
        const SizedBox(height: 14),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            FilledButton.tonal(onPressed: _dialogNote, child: const Text('Add new note')),
            FilledButton.tonal(onPressed: _dialogLogEmail, child: const Text('Log email')),
            FilledButton.tonal(onPressed: _dialogSms, child: const Text('Log SMS')),
            FilledButton.tonal(onPressed: _dialogPhone, child: const Text('Log phone call')),
            IconButton.filledTonal(onPressed: _logPrint, tooltip: 'Print layout', icon: Icon(Icons.print_outlined)),
            IconButton.filledTonal(onPressed: _exportJson, tooltip: 'Copy communications JSON', icon: Icon(Icons.ios_share_rounded)),
          ],
        ),
        const SizedBox(height: 20),
        if (filtered.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 40),
            child: Text(
              'No communications match your filters.',
              textAlign: TextAlign.center,
              style: GoogleFonts.inter(color: AppColors.whiteOverlay(0.5)),
            ),
          )
        else if (_timelineView)
          ...grouped.entries.expand((e) {
            final day = e.key;
            final rows = e.value;
            return [
              Container(
                margin: const EdgeInsets.only(bottom: 8, top: 8),
                padding: const EdgeInsets.symmetric(vertical: 8),
                decoration: BoxDecoration(
                  color: const Color(0xFF334155),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  day,
                  textAlign: TextAlign.center,
                  style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w700),
                ),
              ),
              ...rows.map(_timelineCard),
            ];
          })
        else
          ...filtered.map(_listCard),
      ],
    );
  }

  Widget _timelineCard(InvoiceTimelineEntry e) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Material(
        color: AppColors.whiteOverlay(0.06),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CircleAvatar(
                radius: 18,
                backgroundColor: AppColors.primary.withValues(alpha: 0.2),
                child: Icon(_icon(e.kind), size: 18, color: AppColors.primary),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (e.kind == InvoiceCommKind.email) ...[
                      Text('From: ${e.fromLabel ?? 'Office'}', style: GoogleFonts.inter(color: AppColors.slate600, fontSize: 12)),
                      if ((e.toLabel ?? '').isNotEmpty)
                        Text('To: ${e.toLabel}', style: GoogleFonts.inter(color: AppColors.slate600, fontSize: 12)),
                    ],
                    if (e.kind == InvoiceCommKind.sms && (e.toLabel ?? '').isNotEmpty)
                      Text('To: ${e.toLabel}', style: GoogleFonts.inter(color: AppColors.slate600, fontSize: 12)),
                    Text(e.title, style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w700)),
                    if (e.body.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: SelectableText(
                          e.isHtmlBody ? InvoiceHelpers.stripHtmlToPlain(e.body) : e.body,
                          style: GoogleFonts.inter(color: AppColors.slate700, fontSize: 13),
                        ),
                      ),
                    if ((e.attachment ?? '').isNotEmpty)
                      Text('Attachment: ${e.attachment}', style: GoogleFonts.inter(color: AppColors.primary, fontSize: 12)),
                    const SizedBox(height: 4),
                    Text(e.createdAt, style: GoogleFonts.inter(color: AppColors.whiteOverlay(0.4), fontSize: 11)),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _listCard(InvoiceTimelineEntry e) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: AppColors.whiteOverlay(0.06),
        borderRadius: BorderRadius.circular(12),
        child: ListTile(
          leading: Icon(_icon(e.kind), color: AppColors.primary),
          title: Text(e.title, style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w600)),
          subtitle: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (e.body.isNotEmpty)
                Text(
                  e.isHtmlBody ? InvoiceHelpers.stripHtmlToPlain(e.body) : e.body,
                  style: GoogleFonts.inter(color: AppColors.slate600, fontSize: 12),
                ),
              Text(e.createdAt, style: GoogleFonts.inter(color: AppColors.whiteOverlay(0.4), fontSize: 11)),
            ],
          ),
        ),
      ),
    );
  }
}
