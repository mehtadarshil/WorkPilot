import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../app/routes/app_routes.dart';
import '../../core/values/app_colors.dart';
import 'job_detail_controller.dart';

class JobTabInvoices extends StatelessWidget {
  const JobTabInvoices({super.key});

  @override
  Widget build(BuildContext context) {
    final c = Get.find<JobDetailController>();
    return Obx(() {
      final finalized = c.invoices.where((i) => (i['state'] as String?) != 'draft').toList();
      final drafts = c.invoices.where((i) => (i['state'] as String?) == 'draft').toList();
      return ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          Align(
            alignment: Alignment.centerRight,
            child: FilledButton(
              onPressed: () {
                final job = c.job.value;
                final cid = (job?['customer_id'] as num?)?.toInt();
                if (cid == null) return;
                final wa = job?['work_address'];
                final waId = (job?['work_address_id'] as num?)?.toInt() ?? (wa is Map ? (wa['id'] as num?)?.toInt() : null);
                Get.toNamed(
                  AppRoutes.invoiceForm,
                  arguments: <String, dynamic>{
                    'customer_id': cid,
                    'job_id': c.jobId,
                    if (waId != null) 'work_address_id': waId,
                  },
                );
              },
              child: const Text('Add new invoice'),
            ),
          ),
          const SizedBox(height: 12),
          Text('Invoices', style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16)),
          const SizedBox(height: 8),
          if (finalized.isEmpty)
            _panel(child: Text('No finalized invoices.', style: GoogleFonts.inter(color: AppColors.slate400)))
          else
            ...finalized.map((inv) => _invoiceTile(inv, c.job.value?['title'] as String?)),
          const SizedBox(height: 20),
          Text('Draft invoices', style: GoogleFonts.inter(color: AppColors.slate400, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          if (drafts.isEmpty)
            _panel(child: Text('No draft invoices.', style: GoogleFonts.inter(color: AppColors.slate500, fontSize: 13)))
          else
            ...drafts.map((inv) => _invoiceTile(inv, c.job.value?['title'] as String?, draft: true)),
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

  Widget _invoiceTile(Map<String, dynamic> inv, String? jobTitle, {bool draft = false}) {
    final id = (inv['id'] as num?)?.toInt();
    final invoiceNum = (inv['invoice_number'] as String?) ?? '';
    final date = (inv['invoice_date'] as String?) ?? '';
    final total = inv['total_amount'];
    final sub = inv['subtotal'];
    final tax = inv['tax_amount'];
    final paid = inv['total_paid'];
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: AppColors.whiteOverlay(0.08),
        borderRadius: BorderRadius.circular(16),
        child: ListTile(
          title: Text(
            invoiceNum + (draft ? ' (draft)' : ''),
            style: GoogleFonts.inter(color: draft ? AppColors.primary : Colors.white, fontWeight: FontWeight.w700),
          ),
          subtitle: Text(
            '$date · ${jobTitle ?? ''}\nSub $sub · Tax $tax · Total $total · Paid $paid',
            style: GoogleFonts.inter(color: AppColors.slate400, fontSize: 12),
          ),
          trailing: id != null
              ? TextButton(
                  onPressed: () => Get.toNamed(AppRoutes.invoiceDetail, arguments: id),
                  child: Text(draft ? 'Edit' : 'View', style: GoogleFonts.inter(color: AppColors.primary)),
                )
              : null,
        ),
      ),
    );
  }
}
