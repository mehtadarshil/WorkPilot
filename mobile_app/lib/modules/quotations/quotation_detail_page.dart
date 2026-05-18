import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app/routes/app_routes.dart';
import '../../core/network/api_exception.dart';
import '../../core/values/app_colors.dart';
import '../../core/values/app_constants.dart';
import '../../data/repositories/quotations_repository.dart';
import 'quotation_helpers.dart';
import 'quotation_notes_tab.dart';
import 'quotation_official_send_sheet.dart';
import 'quotation_print_webview_page.dart';

/// Arguments: quotation id ([int]).
class QuotationDetailPage extends StatefulWidget {
  const QuotationDetailPage({super.key});

  @override
  State<QuotationDetailPage> createState() => _QuotationDetailPageState();
}

class _QuotationDetailPageState extends State<QuotationDetailPage> with SingleTickerProviderStateMixin {
  final _repo = Get.find<QuotationsRepository>();
  late final TabController _tabs;

  /// Snapshot at first use. Do not read `Get.arguments` later: after [Navigator.push],
  /// GetX may expose the child route’s arguments (null), which broke print layout.
  late final int _id = () {
    final a = Get.arguments;
    if (a is int) return a;
    throw ArgumentError('QuotationDetailPage expects Get.arguments to be int, got: $a');
  }();

  bool _loading = true;
  String? _error;
  Map<String, dynamic>? _q;
  final _internalDraft = TextEditingController();
  bool _savingNote = false;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
    _load();
  }

  @override
  void dispose() {
    _tabs.dispose();
    _internalDraft.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final q = await _repo.getQuotation(_id);
      setState(() {
        _q = q;
        _loading = false;
      });
    } on ApiException catch (e) {
      setState(() {
        _loading = false;
        _error = e.message;
      });
    } catch (e) {
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  String get _state => (_q?['state'] as String?) ?? '';

  bool get _canEdit => _state == 'draft' || _state == 'sent';

  bool get _canDelete => _state != 'accepted';

  /// Same visual as web “Print layout” (`/quotation-print/:id?token=…` + [QuotationPrintTemplate]).
  Future<void> _openPrintLayout() async {
    if (!mounted) return;
    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (ctx) => QuotationPrintWebViewPage(quotationId: _id),
      ),
    );
  }

  /// Server pdfkit PDF (different layout from the web template). Kept as optional download only.
  Future<void> _downloadServerPdf() async {
    try {
      final bytes = await _repo.downloadPdfBytes(_id);
      if (bytes.isEmpty) throw Exception('Empty PDF');
      final dir = await getTemporaryDirectory();
      final safe = (_q?['quotation_number'] as String?)?.replaceAll(RegExp(r'[^\w.-]+'), '_') ?? 'quotation';
      final f = File('${dir.path}/$safe-server.pdf');
      await f.writeAsBytes(bytes, flush: true);
      await OpenFilex.open(f.path);
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  Future<void> _accept() async {
    try {
      await _repo.acceptQuotation(_id);
      await _load();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _reject() async {
    try {
      await _repo.rejectQuotation(_id);
      await _load();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _transferInvoice() async {
    try {
      final r = await _repo.transferToInvoice(_id);
      final inv = r['invoice'];
      final invNum = inv is Map ? inv['invoice_number'] as String? : null;
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(invNum != null ? 'Invoice $invNum created.' : 'Invoice created.')),
        );
      }
      await _load();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _delete() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete quotation?'),
        content: const Text('This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await _repo.deleteQuotation(_id);
      Get.back();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _sendEmailSheet() async {
    if (!mounted) return;
    await showQuotationOfficialSendSheet(
      context,
      quotationId: _id,
      onSent: _load,
    );
    if (mounted) await _load();
  }

  Future<void> _openPublic() async {
    final token = (_q?['public_token'] as String?)?.trim();
    if (token == null || token.isEmpty) return;
    final uri = Uri.parse('${AppConstants.resolvedWebAppOrigin}/public/quotations/$token');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  Future<void> _copyPublic() async {
    final token = (_q?['public_token'] as String?)?.trim();
    if (token == null || token.isEmpty) return;
    final url = '${AppConstants.resolvedWebAppOrigin}/public/quotations/$token';
    await Clipboard.setData(ClipboardData(text: url));
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Link copied')));
  }

  Future<void> _saveInternalNote() async {
    final t = _internalDraft.text.trim();
    if (t.isEmpty) return;
    setState(() => _savingNote = true);
    try {
      await _repo.addInternalNote(_id, body: t);
      _internalDraft.clear();
      await _load();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _savingNote = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (_error != null || _q == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Quotation')),
        body: Center(child: Text(_error ?? 'Not found')),
      );
    }
    final q = _q!;
    final qNumber = (q['quotation_number'] as String?) ?? 'Quotation';
    final cust = (q['customer_full_name'] as String?) ?? '';
    final cur = (q['currency'] as String?) ?? 'USD';
    final sub = (q['subtotal'] as num?)?.toDouble() ?? 0;
    final tax = (q['tax_amount'] as num?)?.toDouble() ?? 0;
    final tot = (q['total_amount'] as num?)?.toDouble() ?? 0;
    final taxLabel = (q['settings'] is Map ? (q['settings'] as Map)['tax_label'] : null) as String? ?? 'Tax';
    final custId = (q['customer_id'] as num?)?.toInt() ?? 0;
    final jobId = (q['job_id'] as num?)?.toInt();
    final items = q['line_items'];
    final activities = q['activities'];
    final internal = q['internal_notes'];
    final custEmail = q['customer_email'] as String?;
    final custPhone = q['customer_phone'] as String?;
    final activitiesList = activities is List ? activities : <dynamic>[];

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a),
      appBar: AppBar(
          title: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(qNumber, style: GoogleFonts.inter(fontWeight: FontWeight.w800, fontSize: 16)),
            Text(cust, style: GoogleFonts.inter(fontSize: 12, color: Colors.white70)),
          ],
        ),
        bottom: TabBar(
          controller: _tabs,
          tabs: const [Tab(text: 'Details'), Tab(text: 'Notes & activity')],
        ),
        actions: [
          PopupMenuButton<String>(
            onSelected: (v) async {
              if (v == 'edit' && _canEdit) {
                await Get.toNamed(AppRoutes.quotationForm, arguments: _id);
                _load();
              } else if (v == 'delete' && _canDelete) {
                await _delete();
              } else if (v == 'server_pdf') {
                await _downloadServerPdf();
              }
            },
            itemBuilder: (ctx) => [
              if (_canEdit) const PopupMenuItem(value: 'edit', child: Text('Edit quotation')),
              const PopupMenuItem(
                value: 'server_pdf',
                child: Text('Download server PDF (alternate layout)'),
              ),
              if (_canDelete) const PopupMenuItem(value: 'delete', child: Text('Delete', style: TextStyle(color: Colors.redAccent))),
            ],
          ),
        ],
      ),
      body: TabBarView(
        controller: _tabs,
        children: [
          ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  Chip(
                    label: Text(QuotationHelpers.stateLabel(_state)),
                    backgroundColor: QuotationHelpers.stateColor(_state).withValues(alpha: 0.25),
                  ),
                  ActionChip(
                    avatar: const Icon(Icons.article_outlined, size: 18),
                    label: const Text('Print layout'),
                    onPressed: _openPrintLayout,
                  ),
                  ActionChip(
                    avatar: const Icon(Icons.email_rounded, size: 18),
                    label: const Text('Send'),
                    onPressed: (_state == 'draft' || _state == 'sent') ? _sendEmailSheet : null,
                  ),
                  if (_state == 'sent') ...[
                    ActionChip(label: const Text('Accept'), onPressed: _accept),
                    ActionChip(label: const Text('Reject'), onPressed: _reject),
                  ],
                  if (custId > 0)
                    ActionChip(
                      avatar: const Icon(Icons.person_outline_rounded, size: 18),
                      label: const Text('Customer'),
                      onPressed: () => Get.toNamed(AppRoutes.customerDetail, arguments: custId),
                    ),
                  if (_state == 'accepted') ...[
                    ActionChip(
                      avatar: const Icon(Icons.receipt_long_rounded, size: 18),
                      label: const Text('To invoice'),
                      onPressed: _transferInvoice,
                    ),
                    if (jobId == null)
                      ActionChip(
                        avatar: const Icon(Icons.work_rounded, size: 18),
                        label: const Text('Create job'),
                        onPressed: custId > 0
                            ? () async {
                                final wa = (q['quotation_work_address_id'] as num?)?.toInt();
                                await Get.toNamed(
                                  AppRoutes.customerNewJob,
                                  arguments: <String, dynamic>{
                                    'customerId': custId,
                                    if (wa != null) 'work_address_id': wa,
                                    'from_quotation': _id,
                                  },
                                );
                                _load();
                              }
                            : null,
                      ),
                    if (jobId != null)
                      ActionChip(
                        label: const Text('Open customer'),
                        onPressed: () => Get.toNamed(AppRoutes.customerDetail, arguments: custId),
                      ),
                  ],
                  if ((q['public_token'] as String?)?.trim().isNotEmpty == true) ...[
                    ActionChip(label: const Text('Customer link'), onPressed: _openPublic),
                    ActionChip(label: const Text('Copy link'), onPressed: _copyPublic),
                  ],
                ],
              ),
              const SizedBox(height: 16),
              _kv('Quotation date', QuotationHelpers.formatDateIso(q['quotation_date'] as String?)),
              _kv('Valid until', QuotationHelpers.formatDateIso(q['valid_until'] as String?)),
              if ((q['work_site_name'] as String?)?.trim().isNotEmpty == true)
                _kv('Work site', '${q['work_site_name']}\n${q['work_site_address'] ?? ''}'),
              if ((q['description'] as String?)?.trim().isNotEmpty == true)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(q['description'] as String, style: GoogleFonts.inter(color: Colors.white)),
                ),
              const SizedBox(height: 16),
              Text('Line items', style: GoogleFonts.inter(color: Colors.white70, fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              if (items is List)
                ...items.map((e) {
                  if (e is! Map) return const SizedBox.shrink();
                  final m = Map<String, dynamic>.from(e);
                  final desc = (m['description'] as String?) ?? '';
                  final qty = (m['quantity'] as num?)?.toDouble() ?? 0;
                  final up = (m['unit_price'] as num?)?.toDouble() ?? 0;
                  final am = (m['amount'] as num?)?.toDouble() ?? (qty * up);
                  return ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    title: Text(desc, style: GoogleFonts.inter(color: Colors.white)),
                    subtitle: Text('$qty × ${QuotationHelpers.formatMoney(up, cur)}', style: GoogleFonts.inter(color: Colors.white54, fontSize: 12)),
                    trailing: Text(QuotationHelpers.formatMoney(am, cur), style: GoogleFonts.inter(color: AppColors.primary, fontWeight: FontWeight.w700)),
                  );
                }),
              const Divider(color: Colors.white24),
              _kv('Subtotal', QuotationHelpers.formatMoney(sub, cur)),
              _kv(taxLabel, QuotationHelpers.formatMoney(tax, cur)),
              _kv('Total', QuotationHelpers.formatMoney(tot, cur), bold: true),
              const SizedBox(height: 24),
              Text('Internal notes (team only)', style: GoogleFonts.inter(color: const Color(0xFFFCD34D), fontWeight: FontWeight.w800)),
              const SizedBox(height: 8),
              if (internal is List)
                ...internal.map((e) {
                  if (e is! Map) return const SizedBox.shrink();
                  final m = Map<String, dynamic>.from(e);
                  final nid = (m['id'] as num?)?.toInt();
                  final body = (m['body'] as String?) ?? '';
                  return ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(body, style: GoogleFonts.inter(color: Colors.white)),
                    trailing: nid == null
                        ? null
                        : IconButton(
                            icon: const Icon(Icons.delete_outline, color: Colors.redAccent, size: 20),
                            onPressed: () async {
                              try {
                                await _repo.deleteInternalNote(_id, nid);
                                _load();
                              } on ApiException catch (ex) {
                                if (!context.mounted) return;
                                ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(ex.message)));
                              }
                            },
                          ),
                  );
                }),
              TextField(
                controller: _internalDraft,
                maxLines: 2,
                style: GoogleFonts.inter(color: Colors.white),
                decoration: const InputDecoration(hintText: 'New internal note…', hintStyle: TextStyle(color: Colors.white38)),
              ),
              const SizedBox(height: 8),
              FilledButton(
                onPressed: _savingNote ? null : _saveInternalNote,
                child: _savingNote
                    ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Add internal note'),
              ),
            ],
          ),
          QuotationNotesTab(
            quotationId: _id,
            quotationNumber: qNumber,
            customerEmail: custEmail,
            customerPhone: custPhone,
            customerName: cust.isNotEmpty ? cust : null,
            activities: activitiesList,
            onRefresh: () {
              _load();
            },
            onOpenPrintLayout: _openPrintLayout,
          ),
        ],
      ),
    );
  }

  Widget _kv(String k, String v, {bool bold = false}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 120, child: Text(k, style: GoogleFonts.inter(color: Colors.white54, fontSize: 13))),
          Expanded(child: Text(v, style: GoogleFonts.inter(color: Colors.white, fontWeight: bold ? FontWeight.w800 : FontWeight.w500))),
        ],
      ),
    );
  }
}
