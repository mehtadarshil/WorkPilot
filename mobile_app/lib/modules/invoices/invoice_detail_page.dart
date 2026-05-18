import 'dart:io';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';

import '../../app/routes/app_routes.dart';
import '../../core/network/api_exception.dart';
import '../../core/values/app_colors.dart';
import '../../data/models/open_job_summary.dart';
import '../../data/repositories/invoices_repository.dart';
import 'invoice_helpers.dart';
import 'invoice_notes_tab.dart';
import 'invoice_official_send_sheet.dart';
import 'invoice_print_webview_page.dart';

/// Arguments: invoice id ([int]).
class InvoiceDetailPage extends StatefulWidget {
  const InvoiceDetailPage({super.key});

  @override
  State<InvoiceDetailPage> createState() => _InvoiceDetailPageState();
}

class _InvoiceDetailPageState extends State<InvoiceDetailPage> with SingleTickerProviderStateMixin {
  final _repo = Get.find<InvoicesRepository>();
  late final TabController _tabs;

  late final int _id = () {
    final a = Get.arguments;
    if (a is int) return a;
    throw ArgumentError('InvoiceDetailPage expects Get.arguments to be int, got: $a');
  }();

  bool _loading = true;
  String? _error;
  Map<String, dynamic>? _inv;
  Map<String, dynamic>? _job;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
    _load();
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final inv = await _repo.getInvoice(_id);
      Map<String, dynamic>? job;
      final jid = (inv['job_id'] as num?)?.toInt();
      if (jid != null && jid > 0) {
        try {
          job = await _repo.getJob(jid);
        } catch (_) {}
      }
      setState(() {
        _inv = inv;
        _job = job;
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

  String get _state => (_inv?['state'] as String?) ?? '';

  double get _balanceDue {
    final tot = (_inv?['total_amount'] as num?)?.toDouble() ?? 0;
    final paid = (_inv?['total_paid'] as num?)?.toDouble() ?? 0;
    return (tot - paid).clamp(0, double.infinity);
  }

  int get _remainingCents => (_balanceDue * 100).round();

  Future<void> _openPrintLayout() async {
    if (!mounted) return;
    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (ctx) => InvoicePrintWebViewPage(invoiceId: _id),
      ),
    );
  }

  Future<void> _downloadServerPdf() async {
    try {
      final bytes = await _repo.downloadPdfBytes(_id);
      if (bytes.isEmpty) throw Exception('Empty PDF');
      final dir = await getTemporaryDirectory();
      final safe = (_inv?['invoice_number'] as String?)?.replaceAll(RegExp(r'[^\w.-]+'), '_') ?? 'invoice';
      final f = File('${dir.path}/$safe-server.pdf');
      await f.writeAsBytes(bytes, flush: true);
      await OpenFilex.open(f.path);
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  Future<void> _patchState(String newState) async {
    try {
      await _repo.patchInvoice(_id, {'state': newState});
      await _load();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _issue() async {
    try {
      await _repo.issueInvoice(_id);
      await _load();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _sendEmail() async {
    await showInvoiceOfficialSendSheet(context, invoiceId: _id, onSent: _load);
  }

  Future<void> _delete() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete invoice?'),
        content: const Text('This permanently deletes the invoice and its lines. Payments are removed with it.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.redAccent),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await _repo.deleteInvoice(_id);
      if (mounted) Get.back<void>();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _showPaymentSheet({Map<String, dynamic>? editing}) async {
    final cur = (_inv?['currency'] as String?) ?? 'USD';
    final amountC = TextEditingController(
      text: editing != null ? (editing['amount'] as num?)?.toString() ?? '' : '',
    );
    var method = (editing?['payment_method'] as String?) ?? 'bank_transfer';
    if (!InvoiceHelpers.paymentMethods.any((m) => m['value'] == method)) {
      method = 'other';
    }
    final refC = TextEditingController(text: (editing?['reference_number'] as String?) ?? '');
    var payDate = (editing?['payment_date'] as String?)?.trim() ?? DateTime.now().toIso8601String().split('T').first;
    String? err;

    if (!mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF0f172a),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setS) {
            return Padding(
              padding: EdgeInsets.only(
                left: 16,
                right: 16,
                top: 16,
                bottom: MediaQuery.of(ctx).viewInsets.bottom + 16,
              ),
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      editing == null ? 'Record payment' : 'Edit payment',
                      style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18),
                    ),
                    Text(
                      'Balance due: ${InvoiceHelpers.formatMoney(_balanceDue, cur)}',
                      style: GoogleFonts.inter(color: AppColors.whiteOverlay(0.65), fontSize: 13),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: amountC,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      style: GoogleFonts.inter(color: Colors.white),
                      decoration: const InputDecoration(
                        labelText: 'Amount',
                        labelStyle: TextStyle(color: Colors.white70),
                      ),
                    ),
                    DropdownButtonFormField<String>(
                      key: ValueKey<String>(method),
                      initialValue: method,
                      dropdownColor: const Color(0xFF1e293b),
                      style: GoogleFonts.inter(color: Colors.white),
                      decoration: const InputDecoration(labelText: 'Method', labelStyle: TextStyle(color: Colors.white70)),
                      items: [
                        for (final m in InvoiceHelpers.paymentMethods)
                          DropdownMenuItem(value: m['value'], child: Text(m['label']!)),
                      ],
                      onChanged: (v) => setS(() => method = v ?? method),
                    ),
                    ListTile(
                      title: Text('Payment date', style: GoogleFonts.inter(color: Colors.white70, fontSize: 12)),
                      subtitle: Text(payDate, style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w600)),
                      onTap: () async {
                        final d = await showDatePicker(
                          context: ctx,
                          initialDate: DateTime.tryParse(payDate) ?? DateTime.now(),
                          firstDate: DateTime(2000),
                          lastDate: DateTime(2100),
                        );
                        if (d != null) setS(() => payDate = d.toIso8601String().split('T').first);
                      },
                    ),
                    TextField(
                      controller: refC,
                      style: GoogleFonts.inter(color: Colors.white),
                      decoration: const InputDecoration(
                        labelText: 'Reference (optional)',
                        labelStyle: TextStyle(color: Colors.white70),
                      ),
                    ),
                    if (err != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(err!, style: GoogleFonts.inter(color: Colors.redAccent, fontSize: 13)),
                      ),
                    const SizedBox(height: 12),
                    FilledButton(
                      onPressed: () async {
                        final raw = amountC.text.trim().replaceAll(',', '.');
                        final amt = double.tryParse(raw);
                        if (amt == null || amt < 0.01) {
                          setS(() => err = 'Enter at least 0.01');
                          return;
                        }
                        final cents = (amt * 100).round();
                        final maxCents = editing == null
                            ? _remainingCents
                            : _remainingCents + (((editing['amount'] as num?)?.toDouble() ?? 0) * 100).round();
                        if (cents > maxCents) {
                          setS(() => err = 'Amount exceeds remaining balance.');
                          return;
                        }
                        try {
                          if (editing == null) {
                            await _repo.postPayment(
                              _id,
                              amount: amt,
                              paymentMethod: method,
                              paymentDateIso: payDate,
                              referenceNumber: refC.text.trim().isEmpty ? null : refC.text.trim(),
                            );
                          } else {
                            final pid = (editing['id'] as num?)?.toInt() ?? 0;
                            await _repo.patchPayment(
                              _id,
                              pid,
                              amount: amt,
                              paymentMethod: method,
                              paymentDateIso: payDate,
                              referenceNumber: refC.text.trim().isEmpty ? null : refC.text.trim(),
                            );
                          }
                          if (ctx.mounted) Navigator.pop(ctx);
                          await _load();
                        } on ApiException catch (e) {
                          setS(() => err = e.message);
                        }
                      },
                      child: Text(editing == null ? 'Record' : 'Save'),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && _inv == null) {
      return Scaffold(
        backgroundColor: const Color(0xFF0f172a),
        appBar: AppBar(title: const Text('Invoice')),
        body: const Center(child: CircularProgressIndicator(color: AppColors.primary)),
      );
    }
    if (_error != null || _inv == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Invoice')),
        body: Center(child: Text(_error ?? 'Not found')),
      );
    }
    final inv = _inv!;
    final invNo = (inv['invoice_number'] as String?) ?? 'Invoice';
    final cust = (inv['customer_full_name'] as String?) ?? '';
    final custId = (inv['customer_id'] as num?)?.toInt() ?? 0;
    final jobId = (inv['job_id'] as num?)?.toInt();
    final cur = (inv['currency'] as String?) ?? 'USD';
    final sub = (inv['subtotal'] as num?)?.toDouble() ?? 0;
    final tax = (inv['tax_amount'] as num?)?.toDouble() ?? 0;
    final tot = (inv['total_amount'] as num?)?.toDouble() ?? 0;
    final paid = (inv['total_paid'] as num?)?.toDouble() ?? 0;
    final taxLabel = (inv['settings'] is Map ? (inv['settings'] as Map)['tax_label'] : null) as String? ?? 'Tax';
    final items = inv['line_items'];
    final activities = inv['activities'];
    final activitiesList = activities is List ? activities : <dynamic>[];
    final payments = inv['payments'];
    final paymentsList = payments is List ? payments : <dynamic>[];
    final custEmail = inv['customer_email'] as String?;
    final custPhone = inv['customer_phone'] as String?;

    final now = DateTime.now();
    final dueStr = inv['due_date'] as String?;
    final due = dueStr != null && dueStr.length >= 10 ? DateTime.tryParse(dueStr.substring(0, 10)) : null;
    final overdue = due != null &&
        DateTime(now.year, now.month, now.day).isAfter(DateTime(due.year, due.month, due.day)) &&
        _state != 'paid' &&
        _state != 'cancelled';

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a),
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(invNo, style: GoogleFonts.inter(fontWeight: FontWeight.w800, fontSize: 16)),
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
              if (v == 'pdf') await _downloadServerPdf();
              if (v == 'delete') await _delete();
            },
            itemBuilder: (ctx) => [
              const PopupMenuItem(value: 'pdf', child: Text('Download server PDF (alternate layout)')),
              const PopupMenuItem(value: 'delete', child: Text('Delete', style: TextStyle(color: Colors.redAccent))),
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
                    label: Text(InvoiceHelpers.stateLabel(_state)),
                    backgroundColor: InvoiceHelpers.stateColor(_state).withValues(alpha: 0.25),
                  ),
                  ActionChip(
                    avatar: const Icon(Icons.article_outlined, size: 18),
                    label: const Text('Print layout'),
                    onPressed: _openPrintLayout,
                  ),
                  if (_state == 'draft')
                    ActionChip(
                      avatar: const Icon(Icons.send_rounded, size: 18),
                      label: const Text('Issue'),
                      onPressed: _issue,
                    ),
                  if (_state != 'draft' && _state != 'cancelled')
                    ActionChip(
                      avatar: const Icon(Icons.email_rounded, size: 18),
                      label: const Text('Send email'),
                      onPressed: _sendEmail,
                    ),
                  ActionChip(
                    avatar: const Icon(Icons.edit_rounded, size: 18),
                    label: const Text('Edit'),
                    onPressed: () async {
                      await Get.toNamed(AppRoutes.invoiceForm, arguments: _id);
                      _load();
                    },
                  ),
                  if (custId > 0)
                    ActionChip(
                      avatar: const Icon(Icons.person_outline_rounded, size: 18),
                      label: const Text('Customer'),
                      onPressed: () => Get.toNamed(AppRoutes.customerDetail, arguments: custId),
                    ),
                  if (jobId != null && _job != null)
                    ActionChip(
                      avatar: const Icon(Icons.work_outline_rounded, size: 18),
                      label: const Text('Job'),
                      onPressed: () {
                        final j = _job!;
                        final summary = OpenJobSummary(
                          id: jobId,
                          title: j['title'] as String? ?? 'Job',
                          description: j['description'] as String?,
                          state: j['state'] as String? ?? '',
                          updatedAt: (j['updated_at'] as String?) ?? (j['created_at'] as String?) ?? '',
                        );
                        Get.toNamed(AppRoutes.openJobDetail, arguments: summary);
                      },
                    ),
                ],
              ),
              if (overdue)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.red.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.red.withValues(alpha: 0.35)),
                    ),
                    child: Text(
                      'This invoice is past its due date.',
                      style: GoogleFonts.inter(color: Colors.red.shade200, fontWeight: FontWeight.w600),
                    ),
                  ),
                ),
              const SizedBox(height: 16),
              Text('Status', style: GoogleFonts.inter(color: Colors.white70, fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                key: ValueKey<String>(_state),
                initialValue: invoiceStatesOrdered.contains(_state) ? _state : 'draft',
                dropdownColor: const Color(0xFF1e293b),
                style: GoogleFonts.inter(color: Colors.white),
                decoration: const InputDecoration(
                  filled: true,
                  fillColor: Color(0x22ffffff),
                  border: OutlineInputBorder(borderRadius: BorderRadius.all(Radius.circular(12))),
                ),
                items: [
                  for (final s in invoiceStatesOrdered)
                    DropdownMenuItem(value: s, child: Text(InvoiceHelpers.stateLabel(s))),
                ],
                onChanged: (v) {
                  if (v != null && v != _state) _patchState(v);
                },
              ),
              const SizedBox(height: 16),
              _kv('Invoice date', InvoiceHelpers.formatDateIso(inv['invoice_date'] as String?)),
              _kv('Due date', InvoiceHelpers.formatDateIso(inv['due_date'] as String?)),
              if ((inv['work_site_name'] as String?)?.trim().isNotEmpty == true ||
                  (inv['work_site_address'] as String?)?.trim().isNotEmpty == true) ...[
                const SizedBox(height: 8),
                Text('Work / site', style: GoogleFonts.inter(color: Colors.white70, fontWeight: FontWeight.w700)),
                if ((inv['work_site_name'] as String?)?.trim().isNotEmpty == true)
                  Text(inv['work_site_name'] as String, style: GoogleFonts.inter(color: Colors.white)),
                if ((inv['work_site_address'] as String?)?.trim().isNotEmpty == true)
                  Text(inv['work_site_address'] as String, style: GoogleFonts.inter(color: Colors.white70)),
              ],
              if ((inv['description'] as String?)?.trim().isNotEmpty == true) ...[
                const SizedBox(height: 12),
                Text(inv['description'] as String, style: GoogleFonts.inter(color: Colors.white)),
              ],
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
                    subtitle: Text('$qty × ${InvoiceHelpers.formatMoney(up, cur)}', style: GoogleFonts.inter(color: Colors.white54, fontSize: 12)),
                    trailing: Text(InvoiceHelpers.formatMoney(am, cur), style: GoogleFonts.inter(color: AppColors.primary, fontWeight: FontWeight.w700)),
                  );
                }),
              const Divider(color: Colors.white24),
              _kv('Subtotal', InvoiceHelpers.formatMoney(sub, cur)),
              _kv(taxLabel, InvoiceHelpers.formatMoney(tax, cur)),
              _kv('Total', InvoiceHelpers.formatMoney(tot, cur), bold: true),
              _kv('Paid', InvoiceHelpers.formatMoney(paid, cur)),
              _kv('Balance due', InvoiceHelpers.formatMoney(_balanceDue, cur), bold: true),
              const SizedBox(height: 20),
              Row(
                children: [
                  Text('Payments', style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w800)),
                  const Spacer(),
                  if (_remainingCents > 0 && _state != 'cancelled')
                    TextButton(
                      onPressed: () => _showPaymentSheet(),
                      child: Text('Add payment', style: GoogleFonts.inter(color: AppColors.primary, fontWeight: FontWeight.w700)),
                    ),
                ],
              ),
              if (paymentsList.isEmpty)
                Text('No payments yet.', style: GoogleFonts.inter(color: Colors.white38))
              else
                ...paymentsList.map((e) {
                  if (e is! Map) return const SizedBox.shrink();
                  final p = Map<String, dynamic>.from(e);
                  final amt = (p['amount'] as num?)?.toDouble() ?? 0;
                  final dt = (p['payment_date'] as String?) ?? '';
                  return ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(InvoiceHelpers.formatMoney(amt, cur), style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w600)),
                    subtitle: Text(
                      '${InvoiceHelpers.paymentMethodLabel(p['payment_method'] as String?)} · $dt',
                      style: GoogleFonts.inter(color: Colors.white54, fontSize: 12),
                    ),
                    trailing: _state == 'cancelled'
                        ? null
                        : TextButton(
                            onPressed: () => _showPaymentSheet(editing: p),
                            child: const Text('Edit'),
                          ),
                  );
                }),
              if (_job != null) ...[
                const SizedBox(height: 24),
                Text('Job', style: GoogleFonts.inter(color: Colors.white70, fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                Text(_job!['title'] as String? ?? '', style: GoogleFonts.inter(color: Colors.white)),
              ],
            ],
          ),
          InvoiceNotesTab(
            invoiceId: _id,
            invoiceNumber: invNo,
            customerEmail: custEmail,
            customerPhone: custPhone,
            customerName: cust.isNotEmpty ? cust : null,
            activities: activitiesList,
            currency: cur,
            onRefresh: _load,
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
