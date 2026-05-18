import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../app/routes/app_routes.dart';
import '../../core/values/app_colors.dart';
import 'quotation_helpers.dart';
import 'quotations_list_controller.dart';

class QuotationsListView extends GetView<QuotationsListController> {
  const QuotationsListView({super.key});

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light.copyWith(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: AppColors.gradientStart,
        systemNavigationBarIconBrightness: Brightness.light,
      ),
      child: Scaffold(
        backgroundColor: AppColors.gradientStart,
        appBar: AppBar(
          title: Text('Quotations', style: GoogleFonts.inter(fontWeight: FontWeight.w700)),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_ios_new_rounded),
            onPressed: Get.back,
          ),
        ),
        floatingActionButton: FloatingActionButton.extended(
          onPressed: () async {
            final raw = await Get.toNamed(AppRoutes.quotationForm);
            final newId = raw is int ? raw : null;
            if (newId != null && newId > 0) {
              await Get.toNamed(AppRoutes.quotationDetail, arguments: newId);
            }
            controller.reloadFromStart();
          },
          backgroundColor: AppColors.primary,
          icon: const Icon(Icons.add_rounded),
          label: Text('Create', style: GoogleFonts.inter(fontWeight: FontWeight.w700)),
        ),
        body: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [AppColors.gradientStart, AppColors.gradientMid, AppColors.gradientEnd],
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                child: Obx(() {
                  return Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final s in QuotationsListController.states)
                        _CountChip(
                          label: QuotationHelpers.stateLabel(s),
                          count: controller.stateCounts[s] ?? 0,
                          selected: controller.stateFilter.value == s,
                          onTap: () {
                            if (controller.stateFilter.value == s) {
                              controller.setStateFilter('');
                            } else {
                              controller.setStateFilter(s);
                            }
                          },
                        ),
                    ],
                  );
                }),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                child: TextField(
                  onChanged: controller.setSearch,
                  style: GoogleFonts.inter(color: Colors.white),
                  decoration: InputDecoration(
                    hintText: 'Search quotations…',
                    hintStyle: GoogleFonts.inter(color: AppColors.whiteOverlay(0.45)),
                    prefixIcon: Icon(Icons.search_rounded, color: AppColors.whiteOverlay(0.55)),
                    filled: true,
                    fillColor: AppColors.whiteOverlay(0.08),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: BorderSide(color: AppColors.whiteOverlay(0.15)),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: BorderSide(color: AppColors.whiteOverlay(0.15)),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: const BorderSide(color: AppColors.primary, width: 1.4),
                    ),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Obx(() {
                  return DropdownButtonFormField<String>(
                    value: controller.stateFilter.value.isEmpty ? null : controller.stateFilter.value,
                    hint: Text('All states', style: GoogleFonts.inter(color: AppColors.whiteOverlay(0.65))),
                    dropdownColor: const Color(0xFF1e293b),
                    style: GoogleFonts.inter(color: Colors.white),
                    decoration: InputDecoration(
                      filled: true,
                      fillColor: AppColors.whiteOverlay(0.08),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                    items: [
                      DropdownMenuItem<String>(
                        value: null,
                        child: Text('All states', style: GoogleFonts.inter(color: Colors.white)),
                      ),
                      for (final s in QuotationsListController.states)
                        DropdownMenuItem<String>(
                          value: s,
                          child: Text(QuotationHelpers.stateLabel(s), style: GoogleFonts.inter(color: Colors.white)),
                        ),
                    ],
                    onChanged: (v) => controller.setStateFilter(v ?? ''),
                  );
                }),
              ),
              const SizedBox(height: 8),
              Expanded(
                child: Obx(() {
                  if (controller.loading.value && controller.items.isEmpty) {
                    return const Center(child: CircularProgressIndicator(color: AppColors.primary));
                  }
                  if (controller.error.value.isNotEmpty && controller.items.isEmpty) {
                    return Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              controller.error.value,
                              textAlign: TextAlign.center,
                              style: GoogleFonts.inter(color: AppColors.slate400),
                            ),
                            const SizedBox(height: 16),
                            FilledButton(onPressed: controller.reloadFromStart, child: const Text('Retry')),
                          ],
                        ),
                      ),
                    );
                  }
                  return NotificationListener<ScrollNotification>(
                    onNotification: (n) {
                      if (n.metrics.pixels > n.metrics.maxScrollExtent - 200) {
                        controller.loadMore();
                      }
                      return false;
                    },
                    child: RefreshIndicator(
                      color: AppColors.primary,
                      onRefresh: controller.reloadFromStart,
                      child: ListView.builder(
                        physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 88),
                        itemCount: controller.items.length + (controller.loading.value && controller.hasMore ? 1 : 0),
                        itemBuilder: (context, i) {
                          if (i >= controller.items.length) {
                            return const Padding(
                              padding: EdgeInsets.all(16),
                              child: Center(child: CircularProgressIndicator(color: AppColors.primary)),
                            );
                          }
                          final row = controller.items[i];
                          final id = (row['id'] as num?)?.toInt() ?? 0;
                          final qNumber = (row['quotation_number'] as String?)?.trim().isNotEmpty == true
                              ? row['quotation_number'] as String
                              : 'Quote #$id';
                          final cust = (row['customer_full_name'] as String?)?.trim();
                          final state = (row['state'] as String?) ?? '';
                          final total = (row['total_amount'] as num?)?.toDouble() ?? 0;
                          final cur = (row['currency'] as String?) ?? 'USD';
                          final qd = row['quotation_date'] as String?;
                          final vu = row['valid_until'] as String?;
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: Material(
                              color: AppColors.whiteOverlay(0.08),
                              borderRadius: BorderRadius.circular(16),
                              child: InkWell(
                                borderRadius: BorderRadius.circular(16),
                                onTap: () async {
                                  await Get.toNamed(AppRoutes.quotationDetail, arguments: id);
                                  controller.reloadFromStart();
                                },
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        children: [
                                          Expanded(
                                            child: Text(
                                              qNumber,
                                              style: GoogleFonts.inter(
                                                color: Colors.white,
                                                fontWeight: FontWeight.w700,
                                                fontSize: 16,
                                              ),
                                            ),
                                          ),
                                          Container(
                                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                            decoration: BoxDecoration(
                                              color: QuotationHelpers.stateColor(state).withValues(alpha: 0.2),
                                              borderRadius: BorderRadius.circular(20),
                                            ),
                                            child: Text(
                                              QuotationHelpers.stateLabel(state),
                                              style: GoogleFonts.inter(
                                                fontSize: 11,
                                                fontWeight: FontWeight.w700,
                                                color: QuotationHelpers.stateColor(state),
                                              ),
                                            ),
                                          ),
                                        ],
                                      ),
                                      if (cust != null && cust.isNotEmpty) ...[
                                        const SizedBox(height: 4),
                                        Text(cust, style: GoogleFonts.inter(color: AppColors.slate400, fontSize: 13)),
                                      ],
                                      const SizedBox(height: 8),
                                      Row(
                                        children: [
                                          Text(
                                            QuotationHelpers.formatMoney(total, cur),
                                            style: GoogleFonts.inter(
                                              color: AppColors.primary,
                                              fontWeight: FontWeight.w800,
                                              fontSize: 15,
                                            ),
                                          ),
                                          const Spacer(),
                                          Text(
                                            '${QuotationHelpers.formatDateIso(qd)} → ${QuotationHelpers.formatDateIso(vu)}',
                                            style: GoogleFonts.inter(fontSize: 11, color: AppColors.whiteOverlay(0.45)),
                                          ),
                                        ],
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                  );
                }),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CountChip extends StatelessWidget {
  const _CountChip({
    required this.label,
    required this.count,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final int count;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppColors.primary.withValues(alpha: 0.35) : AppColors.whiteOverlay(0.08),
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(label, style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 12)),
              const SizedBox(width: 6),
              Text('$count', style: GoogleFonts.inter(color: AppColors.whiteOverlay(0.75), fontWeight: FontWeight.w800)),
            ],
          ),
        ),
      ),
    );
  }
}
