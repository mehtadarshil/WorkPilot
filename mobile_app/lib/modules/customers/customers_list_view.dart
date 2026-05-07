import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../app/routes/app_routes.dart';
import '../../core/values/app_colors.dart';
import 'customers_list_controller.dart';

class CustomersListView extends GetView<CustomersListController> {
  const CustomersListView({super.key});

  String _statusChip(String s) {
    switch (s) {
      case 'ACTIVE':
        return 'Active';
      case 'LEAD':
        return 'Lead';
      case 'INACTIVE':
        return 'Inactive';
      default:
        return s;
    }
  }

  Color _statusColor(String s) {
    switch (s) {
      case 'ACTIVE':
        return const Color(0xFF34D399);
      case 'LEAD':
        return const Color(0xFFFBBF24);
      default:
        return AppColors.slate400;
    }
  }

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
          title: Text(
            'Customers',
            style: GoogleFonts.inter(fontWeight: FontWeight.w700),
          ),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_ios_new_rounded),
            onPressed: Get.back,
          ),
          actions: [
            IconButton(
              tooltip: 'New customer',
              icon: const Icon(Icons.person_add_alt_1_rounded),
              onPressed: () async {
                final r = await Get.toNamed(AppRoutes.customerForm);
                if (r == true) await controller.load(reset: true);
              },
            ),
          ],
        ),
        floatingActionButton: FloatingActionButton.extended(
          onPressed: () async {
            final r = await Get.toNamed(AppRoutes.customerForm);
            if (r == true) await controller.load(reset: true);
          },
          backgroundColor: AppColors.primary,
          icon: const Icon(Icons.add_rounded),
          label: Text('New', style: GoogleFonts.inter(fontWeight: FontWeight.w600)),
        ),
        body: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                AppColors.gradientStart,
                AppColors.gradientMid,
                AppColors.gradientEnd,
              ],
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                child: TextField(
                  style: GoogleFonts.inter(color: Colors.white),
                  decoration: InputDecoration(
                    hintText: 'Search name, email, company…',
                    hintStyle: GoogleFonts.inter(color: AppColors.whiteOverlay(0.45)),
                    prefixIcon: Icon(Icons.search_rounded, color: AppColors.whiteOverlay(0.5)),
                    filled: true,
                    fillColor: AppColors.whiteOverlay(0.08),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(16),
                      borderSide: BorderSide(color: AppColors.whiteOverlay(0.15)),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(16),
                      borderSide: BorderSide(color: AppColors.whiteOverlay(0.15)),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(16),
                      borderSide: const BorderSide(color: AppColors.primary, width: 1.2),
                    ),
                  ),
                  onChanged: (v) {
                    controller.searchQuery.value = v;
                    controller.scheduleSearchReload();
                  },
                ),
              ),
              const SizedBox(height: 10),
              SizedBox(
                height: 40,
                child: Obx(() {
                  // Must read Rx synchronously in this closure (not inside lazy children).
                  final filter = controller.statusFilter.value;
                  return SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    child: Row(
                      children: [
                        for (final s in CustomersListController.statuses) ...[
                          if (s != CustomersListController.statuses.first)
                            const SizedBox(width: 8),
                          ChoiceChip(
                            label: Text(
                              CustomersListController.statusLabels[s] ?? s,
                              style: GoogleFonts.inter(
                                fontWeight: FontWeight.w600,
                                fontSize: 13,
                                color: filter == s
                                    ? AppColors.gradientStart
                                    : AppColors.whiteOverlay(0.85),
                              ),
                            ),
                            selected: filter == s,
                            onSelected: (_) => controller.setStatus(s),
                            selectedColor: AppColors.primary,
                            backgroundColor: AppColors.whiteOverlay(0.1),
                            side: BorderSide(color: AppColors.whiteOverlay(0.2)),
                          ),
                        ],
                      ],
                    ),
                  );
                }),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                child: Obx(() {
                  final loading = controller.loading.value;
                  final hasItems = controller.items.isNotEmpty;
                  if (loading && !hasItems) {
                    return const SizedBox.shrink();
                  }
                  return Text(
                    '${controller.total} records · ${controller.totalActive} active · ${controller.totalLeads} leads',
                    style: GoogleFonts.inter(
                      fontSize: 12,
                      color: AppColors.whiteOverlay(0.55),
                    ),
                  );
                }),
              ),
              Expanded(
                child: Obx(() {
                  final loading = controller.loading.value;
                  final err = controller.error.value;
                  final itemCount = controller.items.length;
                  if (loading && itemCount == 0) {
                    return const Center(
                      child: CircularProgressIndicator(color: AppColors.primary),
                    );
                  }
                  if (err.isNotEmpty && itemCount == 0) {
                    return Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              err,
                              textAlign: TextAlign.center,
                              style: GoogleFonts.inter(color: AppColors.slate400),
                            ),
                            const SizedBox(height: 16),
                            FilledButton(
                              onPressed: () => controller.load(reset: true),
                              child: const Text('Retry'),
                            ),
                          ],
                        ),
                      ),
                    );
                  }
                  return RefreshIndicator(
                    color: AppColors.primary,
                    onRefresh: () => controller.load(reset: true),
                    child: ListView.builder(
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 88),
                      itemCount: itemCount,
                      itemBuilder: (context, i) {
                        final row = controller.items[i];
                        final id = (row['id'] as num?)?.toInt() ?? 0;
                        final name = '${row['full_name'] ?? 'Customer'}';
                        final company = row['company'] as String?;
                        final email = row['email'] as String?;
                        final st = '${row['status'] ?? ''}';
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: Material(
                            color: AppColors.whiteOverlay(0.08),
                            borderRadius: BorderRadius.circular(16),
                            child: InkWell(
                              borderRadius: BorderRadius.circular(16),
                              onTap: () async {
                                await Get.toNamed(
                                  AppRoutes.customerDetail,
                                  arguments: id,
                                );
                                await controller.load(reset: false);
                              },
                              child: Padding(
                                padding: const EdgeInsets.all(14),
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            name,
                                            style: GoogleFonts.inter(
                                              color: Colors.white,
                                              fontWeight: FontWeight.w700,
                                              fontSize: 16,
                                            ),
                                          ),
                                          if (company != null && company.trim().isNotEmpty)
                                            Text(
                                              company,
                                              style: GoogleFonts.inter(
                                                color: AppColors.whiteOverlay(0.6),
                                                fontSize: 13,
                                              ),
                                            )
                                          else if (email != null && email.isNotEmpty)
                                            Text(
                                              email,
                                              style: GoogleFonts.inter(
                                                color: AppColors.whiteOverlay(0.55),
                                                fontSize: 13,
                                              ),
                                            ),
                                        ],
                                      ),
                                    ),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                      decoration: BoxDecoration(
                                        color: _statusColor(st).withValues(alpha: 0.2),
                                        borderRadius: BorderRadius.circular(20),
                                      ),
                                      child: Text(
                                        _statusChip(st),
                                        style: GoogleFonts.inter(
                                          color: _statusColor(st),
                                          fontWeight: FontWeight.w700,
                                          fontSize: 11,
                                        ),
                                      ),
                                    ),
                                    Icon(
                                      Icons.chevron_right_rounded,
                                      color: AppColors.whiteOverlay(0.35),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  );
                }),
              ),
              Obx(() {
                final loading = controller.loading.value;
                final totalPages = controller.totalPages;
                final page = controller.page;
                if (totalPages <= 1) return const SizedBox(height: 8);
                return Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      IconButton.filledTonal(
                        onPressed: page > 1 && !loading ? controller.prevPage : null,
                        icon: const Icon(Icons.chevron_left_rounded),
                      ),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        child: Text(
                          'Page $page / $totalPages',
                          style: GoogleFonts.inter(color: AppColors.whiteOverlay(0.75)),
                        ),
                      ),
                      IconButton.filledTonal(
                        onPressed: page < totalPages && !loading ? controller.nextPage : null,
                        icon: const Icon(Icons.chevron_right_rounded),
                      ),
                    ],
                  ),
                );
              }),
            ],
          ),
        ),
      ),
    );
  }
}
