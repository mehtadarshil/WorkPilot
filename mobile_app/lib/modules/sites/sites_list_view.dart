import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../app/routes/app_routes.dart';
import '../../core/values/app_colors.dart';
import 'sites_list_controller.dart';

class SitesListView extends GetView<SitesListController> {
  const SitesListView({super.key});

  String _addressSubtitle(Map<String, dynamic> row) {
    final parts = <String>[
      row['address_line_1'] as String? ?? '',
      row['town'] as String? ?? '',
      row['postcode'] as String? ?? '',
    ].where((s) => s.trim().isNotEmpty).toList();
    return parts.join(', ');
  }

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark.copyWith(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: AppColors.gradientStart,
        systemNavigationBarIconBrightness: Brightness.light,
      ),
      child: Scaffold(
        backgroundColor: AppColors.slate50,
        appBar: AppBar(
          title: Text(
            'Sites',
            style: GoogleFonts.inter(fontWeight: FontWeight.w700),
          ),
          leading: IconButton(
            icon: Icon(Icons.arrow_back_ios_new_rounded),
            onPressed: Get.back,
          ),
        ),
        body: Container(
          decoration: BoxDecoration(
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
                  style: GoogleFonts.inter(color: AppColors.slate900),
                  decoration: InputDecoration(
                    hintText: 'Search site, address, customer…',
                    hintStyle: GoogleFonts.inter(color: AppColors.slate400),
                    prefixIcon: Icon(Icons.search_rounded, color: AppColors.slate500),
                    filled: true,
                    fillColor: Colors.white,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(16),
                      borderSide: const BorderSide(color: AppColors.slate200),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(16),
                      borderSide: const BorderSide(color: AppColors.slate200),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(16),
                      borderSide: BorderSide(color: AppColors.primary, width: 1.2),
                    ),
                  ),
                  onChanged: (v) {
                    controller.searchQuery.value = v;
                    controller.scheduleSearchReload();
                  },
                ),
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
                    '${controller.items.length} sites',
                    style: GoogleFonts.inter(
                      fontSize: 12,
                      color: AppColors.slate500,
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
                              onPressed: () => controller.load(),
                              child: const Text('Retry'),
                            ),
                          ],
                        ),
                      ),
                    );
                  }
                  return RefreshIndicator(
                    color: AppColors.primary,
                    onRefresh: () => controller.load(),
                    child: ListView.builder(
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                      itemCount: itemCount,
                      itemBuilder: (context, i) {
                        final row = controller.items[i];
                        final siteId = (row['id'] as num?)?.toInt();
                        final customerId = (row['customer_id'] as num?)?.toInt() ?? 0;
                        final customerName = row['customer_name'] as String? ?? '';
                        final name = row['name'] as String? ?? 'Site';
                        final isDefault = row['is_default_address'] == true;
                        final isActive = row['is_active'] == true;
                        final subtitle = _addressSubtitle(row);

                        return Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: Material(
                            color: Colors.white,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(16),
                              side: const BorderSide(color: AppColors.slate200),
                            ),
                            child: InkWell(
                              borderRadius: BorderRadius.circular(16),
                              onTap: () {
                                if (isDefault || siteId == null) {
                                  Get.toNamed(
                                    AppRoutes.customerDetail,
                                    arguments: customerId,
                                  );
                                } else {
                                  Get.toNamed(
                                    AppRoutes.customerDetail,
                                    arguments: {
                                      'id': customerId,
                                      'work_address_id': siteId,
                                    },
                                  );
                                }
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
                                              color: AppColors.slate900,
                                              fontWeight: FontWeight.w700,
                                              fontSize: 16,
                                            ),
                                          ),
                                          if (customerName.isNotEmpty)
                                            Padding(
                                              padding: const EdgeInsets.only(top: 2),
                                              child: Text(
                                                customerName,
                                                style: GoogleFonts.inter(
                                                  color: AppColors.whiteOverlay(0.6),
                                                  fontSize: 13,
                                                ),
                                              ),
                                            ),
                                          if (subtitle.isNotEmpty)
                                            Padding(
                                              padding: const EdgeInsets.only(top: 4),
                                              child: Text(
                                                subtitle,
                                                style: GoogleFonts.inter(
                                                  fontSize: 13,
                                                  color: AppColors.slate500,
                                                  height: 1.3,
                                                ),
                                              ),
                                            ),
                                        ],
                                      ),
                                    ),
                                    if (isDefault)
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                        decoration: BoxDecoration(
                                          color: const Color(0xFF60A5FA).withValues(alpha: 0.2),
                                          borderRadius: BorderRadius.circular(20),
                                        ),
                                        child: Text(
                                          'Default',
                                          style: GoogleFonts.inter(
                                            color: const Color(0xFF60A5FA),
                                            fontWeight: FontWeight.w700,
                                            fontSize: 11,
                                          ),
                                        ),
                                      )
                                    else
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                        decoration: BoxDecoration(
                                          color: isActive
                                              ? const Color(0xFF34D399).withValues(alpha: 0.2)
                                              : const Color(0xFFFCA5A5).withValues(alpha: 0.2),
                                          borderRadius: BorderRadius.circular(20),
                                        ),
                                        child: Text(
                                          isActive ? 'Active' : 'Dormant',
                                          style: GoogleFonts.inter(
                                            color: isActive ? const Color(0xFF34D399) : const Color(0xFFFCA5A5),
                                            fontWeight: FontWeight.w700,
                                            fontSize: 11,
                                          ),
                                        ),
                                      ),
                                    const SizedBox(width: 6),
                                    Icon(
                                      Icons.chevron_right_rounded,
                                      color: AppColors.slate400,
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
            ],
          ),
        ),
      ),
    );
  }
}
