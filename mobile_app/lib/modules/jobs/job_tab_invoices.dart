import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../app/routes/app_routes.dart';
import '../../core/network/api_exception.dart';
import '../../core/values/app_colors.dart';
import '../../data/repositories/invoices_repository.dart';
import 'job_detail_controller.dart';

class JobTabInvoices extends StatelessWidget {
  const JobTabInvoices({super.key});

  double _num(dynamic v) => v is num ? v.toDouble() : double.tryParse('$v') ?? 0;

  String _money(dynamic v) => '£${_num(v).toStringAsFixed(2)}';

  Color _stateColor(String state) {
    switch (state) {
      case 'draft':
        return AppColors.primary;
      case 'issued':
        return const Color(0xFF60A5FA);
      case 'paid':
        return const Color(0xFF34D399);
      case 'overdue':
        return const Color(0xFFFCA5A5);
      case 'cancelled':
        return AppColors.slate500;
      default:
        return AppColors.slate400;
    }
  }

  String _stateLabel(String? state) {
    if (state == null || state.isEmpty) return 'Draft';
    return state[0].toUpperCase() + state.substring(1);
  }

  Future<void> _issueInvoice(int id, JobDetailController c) async {
    try {
      await Get.find<InvoicesRepository>().issueInvoice(id);
      await c.refreshAll();
      Get.snackbar('Invoice', 'Invoice issued successfully.');
    } on ApiException catch (e) {
      Get.snackbar('Error', e.message);
    }
  }

  Future<void> _deleteInvoice(int id, JobDetailController c) async {
    final go = await Get.dialog<bool>(
      AlertDialog(
        backgroundColor: const Color(0xFF0f172a),
        title: const Text('Delete this draft invoice?'),
        content: const Text('This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Get.back(result: false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.redAccent),
            onPressed: () => Get.back(result: true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (go != true) return;
    try {
      await Get.find<InvoicesRepository>().deleteInvoice(id);
      await c.refreshAll();
      Get.snackbar('Invoice', 'Invoice deleted.');
    } on ApiException catch (e) {
      Get.snackbar('Error', e.message);
    }
  }

  void _navigateToInvoice(int? id, {bool edit = false}) {
    if (id == null) return;
    if (edit) {
      Get.toNamed(AppRoutes.invoiceForm, arguments: id);
    } else {
      Get.toNamed(AppRoutes.invoiceDetail, arguments: id);
    }
  }

  Future<void> _addNewInvoice(JobDetailController c) async {
    final job = c.job.value;
    final cid = (job?['customer_id'] as num?)?.toInt();
    if (cid == null) return;
    final wa = job?['work_address'];
    final waId = (job?['work_address_id'] as num?)?.toInt() ?? (wa is Map ? (wa['id'] as num?)?.toInt() : null);
    final ok = await Get.toNamed<dynamic>(
      AppRoutes.invoiceForm,
      arguments: <String, dynamic>{
        'customer_id': cid,
        'job_id': c.jobId,
        if (waId != null) 'work_address_id': waId,
      },
    );
    if (ok != null) await c.refreshAll();
  }

  Future<void> _generateFromJobItems(JobDetailController c) async {
    final job = c.job.value;
    final cid = (job?['customer_id'] as num?)?.toInt();
    if (cid == null) return;
    final wa = job?['work_address'];
    final waId = (job?['work_address_id'] as num?)?.toInt() ?? (wa is Map ? (wa['id'] as num?)?.toInt() : null);
    final pricingItems = job?['pricing_items'];
    final ok = await Get.toNamed<dynamic>(
      AppRoutes.invoiceForm,
      arguments: <String, dynamic>{
        'customer_id': cid,
        'job_id': c.jobId,
        if (waId != null) 'work_address_id': waId,
        if (pricingItems is List && pricingItems.isNotEmpty) 'pricing_items': pricingItems,
      },
    );
    if (ok != null) await c.refreshAll();
  }

  @override
  Widget build(BuildContext context) {
    final c = Get.find<JobDetailController>();
    return Obx(() {
      final finalized = c.invoices.where((i) => (i['state'] as String?) != 'draft').toList();
      final drafts = c.invoices.where((i) => (i['state'] as String?) == 'draft').toList();
      final finalizedTotal = finalized.fold<double>(0, (sum, inv) => sum + _num(inv['total_amount']));
      final totalPaid = c.invoices.fold<double>(0, (sum, inv) => sum + _num(inv['total_paid']));
      final outstanding = finalizedTotal - totalPaid;

      final job = c.job.value;
      final pricingItems = job?['pricing_items'];
      final hasPricingItems = pricingItems is List && pricingItems.isNotEmpty;
      final hasDrafts = drafts.isNotEmpty;

      return ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          // Action buttons
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              if (hasPricingItems && !hasDrafts)
                FilledButton.icon(
                  onPressed: () => _generateFromJobItems(c),
                  icon: const Icon(Icons.auto_fix_high_rounded, size: 18),
                  label: const Text('Generate from job items'),
                ),
              if (hasPricingItems && !hasDrafts) const SizedBox(width: 10),
              FilledButton.icon(
                onPressed: () => _addNewInvoice(c),
                icon: const Icon(Icons.add_rounded, size: 18),
                label: const Text('Add new invoice'),
              ),
            ],
          ),
          const SizedBox(height: 12),
          _summaryRow(
            finalizedTotal: finalizedTotal,
            totalPaid: totalPaid,
            outstanding: outstanding,
          ),
          const SizedBox(height: 16),
          Text('Invoices', style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16)),
          const SizedBox(height: 8),
          if (finalized.isEmpty)
            _panel(child: Text('No finalized invoices.', style: GoogleFonts.inter(color: AppColors.slate400)))
          else
            ...finalized.map((inv) => _invoiceTile(inv, controller: c)),
          const SizedBox(height: 20),
          Text('Draft invoices', style: GoogleFonts.inter(color: AppColors.slate400, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          if (drafts.isEmpty)
            _panel(child: Text('No draft invoices.', style: GoogleFonts.inter(color: AppColors.slate500, fontSize: 13)))
          else
            ...drafts.map((inv) => _invoiceTile(inv, controller: c, draft: true)),
        ],
      );
    });
  }

  Widget _panel({required Widget child}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: AppColors.whiteOverlay(0.08),
        borderRadius: BorderRadius.circular(16),
        child: Padding(padding: const EdgeInsets.all(16), child: child),
      ),
    );
  }

  Widget _summaryRow({
    required double finalizedTotal,
    required double totalPaid,
    required double outstanding,
  }) {
    return _panel(
      child: Row(
        children: [
          Expanded(child: _summaryMetric('Total invoiced', finalizedTotal)),
          Expanded(child: _summaryMetric('Paid', totalPaid, color: const Color(0xFF34D399))),
          Expanded(child: _summaryMetric('Outstanding', outstanding, color: const Color(0xFFFCA5A5))),
        ],
      ),
    );
  }

  Widget _summaryMetric(String label, double value, {Color? color}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label.toUpperCase(),
          style: GoogleFonts.inter(
            color: AppColors.slate500,
            fontSize: 9,
            letterSpacing: 0.8,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          _money(value),
          style: GoogleFonts.inter(color: color ?? Colors.white, fontWeight: FontWeight.w900, fontSize: 14),
        ),
      ],
    );
  }

  Widget _invoiceTile(Map<String, dynamic> inv, {required JobDetailController controller, bool draft = false}) {
    final id = (inv['id'] as num?)?.toInt();
    final invoiceNum = (inv['invoice_number'] as String?) ?? '';
    final date = (inv['invoice_date'] as String?) ?? '';
    final total = inv['total_amount'];
    final sub = inv['subtotal'];
    final tax = inv['tax_amount'];
    final paid = inv['total_paid'];
    final state = (inv['state'] as String?) ?? (draft ? 'draft' : '');
    final lineItems = inv['line_items'];
    final itemCount = lineItems is List ? lineItems.length : 0;

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: AppColors.whiteOverlay(0.08),
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () => _navigateToInvoice(id, edit: draft),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        invoiceNum.isNotEmpty ? invoiceNum : 'Invoice',
                        style: GoogleFonts.inter(
                          color: draft ? AppColors.primary : Colors.white,
                          fontWeight: FontWeight.w700,
                          fontSize: 15,
                        ),
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: _stateColor(state).withValues(alpha: 0.18),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        _stateLabel(state),
                        style: GoogleFonts.inter(
                          color: _stateColor(state),
                          fontWeight: FontWeight.w700,
                          fontSize: 11,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  '${date.isNotEmpty ? date : '—'} · $itemCount ${itemCount == 1 ? 'item' : 'items'}',
                  style: GoogleFonts.inter(color: AppColors.slate400, fontSize: 12),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 12,
                  runSpacing: 4,
                  children: [
                    _miniMetric('Sub', _money(sub)),
                    _miniMetric('Tax', _money(tax)),
                    _miniMetric('Total', _money(total)),
                    _miniMetric('Paid', _money(paid)),
                  ],
                ),
                if (draft && id != null) ...[
                  const SizedBox(height: 10),
                  const Divider(color: Colors.white10, height: 1),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      TextButton.icon(
                        onPressed: () => _issueInvoice(id, controller),
                        icon: const Icon(Icons.send_rounded, size: 16),
                        label: Text('Issue', style: GoogleFonts.inter(color: const Color(0xFF34D399), fontWeight: FontWeight.w700)),
                      ),
                      const SizedBox(width: 8),
                      TextButton.icon(
                        onPressed: () => _deleteInvoice(id, controller),
                        icon: const Icon(Icons.delete_outline_rounded, size: 16),
                        label: Text('Delete', style: GoogleFonts.inter(color: const Color(0xFFFCA5A5), fontWeight: FontWeight.w700)),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _miniMetric(String label, String value) {
    return Text(
      '$label: $value',
      style: GoogleFonts.inter(
        color: AppColors.whiteOverlay(0.55),
        fontSize: 12,
        fontWeight: FontWeight.w500,
      ),
    );
  }
}
