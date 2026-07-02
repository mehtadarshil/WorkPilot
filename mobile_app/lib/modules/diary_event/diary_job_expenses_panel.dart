import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/values/app_colors.dart';
import '../jobs/job_expense_dialog.dart';
import 'diary_event_detail_controller.dart';

String _str(Map<String, dynamic> m, String k) {
  final v = m[k];
  if (v is String) return v.trim();
  if (v != null) return v.toString().trim();
  return '';
}

String _formatMoney(dynamic raw) {
  final value = raw is num ? raw.toDouble() : double.tryParse(raw?.toString() ?? '') ?? 0;
  return '£${value.toStringAsFixed(2)}';
}

/// Job expenses list + add control on the diary visit detail screen.
class DiaryJobExpensesPanel extends StatelessWidget {
  const DiaryJobExpensesPanel({super.key, required this.controller});

  final DiaryEventDetailController controller;

  bool _showForPhase(DiaryVisitUiPhase phase, int jobId) {
    if (jobId <= 0) return false;
    if (phase == DiaryVisitUiPhase.cancelled) return false;
    return phase == DiaryVisitUiPhase.travelling ||
        phase == DiaryVisitUiPhase.onSite ||
        phase == DiaryVisitUiPhase.completed;
  }

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final d = controller.detail.value;
      if (d == null) return const SizedBox.shrink();
      final phase = controller.phase;
      if (!_showForPhase(phase, d.jobId ?? 0)) return const SizedBox.shrink();

      final expenses = controller.expenses;
      final loading = controller.expensesLoading.value;
      final posting = controller.postingExpense.value;

      return _DetailGlassPanel(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(child: _accentTitleLocal('Job expenses')),
                Material(
                  color: AppColors.primary,
                  borderRadius: BorderRadius.circular(12),
                  child: InkWell(
                    onTap: posting ? null : () => _openAddDialog(context),
                    borderRadius: BorderRadius.circular(12),
                    child: const Padding(
                      padding: EdgeInsets.all(10),
                      child: Icon(
                        Icons.add_rounded,
                        color: Colors.white,
                        size: 22,
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              'Add parking, materials, or other costs for this job. Receipt photo is optional.',
              style: GoogleFonts.inter(
                fontSize: 12,
                height: 1.35,
                color: AppColors.slate400,
              ),
            ),
            if (loading) ...[
              const SizedBox(height: 16),
              const Center(
                child: SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            ] else if (expenses.isEmpty) ...[
              const SizedBox(height: 12),
              Text(
                'No job expenses added yet.',
                style: GoogleFonts.inter(fontSize: 13, color: AppColors.slate500),
              ),
            ] else ...[
              const SizedBox(height: 12),
              ...expenses.map((e) => _ExpenseRow(expense: e)),
            ],
          ],
        ),
      );
    });
  }

  Future<void> _openAddDialog(BuildContext context) async {
    final data = await showAddJobExpenseDialog(context, requireProof: false);
    if (data == null) return;
    await controller.postJobExpense(
      category: data.category,
      amount: data.amount,
      description: data.description,
      expenseDate: data.expenseDate,
      expenseType: data.expenseType,
      proofFiles: data.proofFiles,
    );
  }
}

class _ExpenseRow extends StatelessWidget {
  const _ExpenseRow({required this.expense});

  final Map<String, dynamic> expense;

  @override
  Widget build(BuildContext context) {
    final date = _str(expense, 'expense_date');
    final category = _str(expense, 'category').isEmpty ? 'Expense' : _str(expense, 'category');
    final description = _str(expense, 'description');
    final status = _str(expense, 'status').isEmpty ? 'submitted' : _str(expense, 'status');
    final claimer = _str(expense, 'claimed_by_name').isNotEmpty
        ? _str(expense, 'claimed_by_name')
        : (_str(expense, 'officer_name').isNotEmpty ? _str(expense, 'officer_name') : 'You');
    final proofCount = expense['proof_files'] is List ? (expense['proof_files'] as List).length : 0;

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.receipt_long, size: 18, color: AppColors.slate400),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '$category · ${_formatMoney(expense['amount'])}',
                  style: GoogleFonts.inter(
                    fontSize: 14,
                    color: AppColors.slate900,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                Text(
                  'Claimed by: $claimer',
                  style: GoogleFonts.inter(
                    fontSize: 12,
                    color: AppColors.slate300,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                Text(
                  'Status: $status',
                  style: GoogleFonts.inter(
                    fontSize: 12,
                    color: status == 'approved' ? AppColors.primary : AppColors.slate400,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (proofCount > 0)
                  Text(
                    'Receipt attached',
                    style: GoogleFonts.inter(fontSize: 12, color: AppColors.primary),
                  ),
                if (description.isNotEmpty)
                  Text(
                    description,
                    style: GoogleFonts.inter(fontSize: 13, height: 1.35, color: AppColors.slate300),
                  ),
                if (date.isNotEmpty)
                  Text(
                    date,
                    style: GoogleFonts.inter(fontSize: 12, color: AppColors.slate400),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

Widget _accentTitleLocal(String t) {
  return Row(
    children: [
      Container(
        width: 4,
        height: 18,
        decoration: BoxDecoration(
          color: AppColors.primary,
          borderRadius: BorderRadius.circular(2),
        ),
      ),
      const SizedBox(width: 10),
      Expanded(
        child: Text(
          t,
          style: GoogleFonts.inter(
            fontSize: 16,
            fontWeight: FontWeight.w800,
            color: AppColors.slate900,
            letterSpacing: -0.2,
          ),
        ),
      ),
    ],
  );
}

class _DetailGlassPanel extends StatelessWidget {
  const _DetailGlassPanel({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        color: Colors.white,
        border: Border.all(color: AppColors.slate200, width: 0.8),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(18, 18, 18, 18),
        child: child,
      ),
    );
  }
}
