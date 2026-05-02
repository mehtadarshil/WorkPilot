import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/values/app_colors.dart';
import 'crm_list_controller.dart';

class CrmListView extends GetView<CrmListController> {
  const CrmListView({super.key});

  String _titleLine(Map<String, dynamic> row) {
    switch (controller.module) {
      case 'customers':
        return (row['full_name'] as String?)?.trim().isNotEmpty == true
            ? row['full_name'] as String
            : 'Customer #${row['id']}';
      case 'jobs':
        return (row['title'] as String?)?.trim().isNotEmpty == true
            ? row['title'] as String
            : 'Job #${row['id']}';
      case 'quotations':
        return (row['quotation_number'] as String?)?.trim().isNotEmpty == true
            ? row['quotation_number'] as String
            : 'Quote #${row['id']}';
      case 'invoices':
        return (row['invoice_number'] as String?)?.trim().isNotEmpty == true
            ? row['invoice_number'] as String
            : 'Invoice #${row['id']}';
      case 'parts_catalog':
        return (row['name'] as String?)?.trim().isNotEmpty == true
            ? row['name'] as String
            : 'Part #${row['id']}';
      case 'certifications':
        return (row['name'] as String?)?.trim().isNotEmpty == true
            ? row['name'] as String
            : 'Cert #${row['id']}';
      default:
        return '#${row['id']}';
    }
  }

  String? _subtitle(Map<String, dynamic> row) {
    switch (controller.module) {
      case 'customers':
        final c = (row['company'] as String?)?.trim();
        if (c != null && c.isNotEmpty) return c;
        return (row['email'] as String?)?.trim();
      case 'jobs':
        return (row['customer_full_name'] as String?)?.trim();
      case 'quotations':
        return (row['customer_full_name'] as String?)?.trim();
      case 'invoices':
        final c = (row['customer_full_name'] as String?)?.trim();
        final st = row['state'] as String?;
        if (c != null && c.isNotEmpty && st != null) return '$c · $st';
        return c ?? st;
      case 'parts_catalog':
        return (row['mpn'] as String?)?.trim();
      case 'certifications':
        return (row['description'] as String?)?.trim();
      default:
        return null;
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
          title: Obx(
            () => Text(
              controller.title,
              style: GoogleFonts.inter(fontWeight: FontWeight.w700),
            ),
          ),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_ios_new_rounded),
            onPressed: Get.back,
          ),
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
          child: Obx(() {
            if (controller.loading.value && controller.items.isEmpty) {
              return const Center(
                child: CircularProgressIndicator(color: AppColors.primary),
              );
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
                      FilledButton(
                        onPressed: controller.reloadFromStart,
                        child: const Text('Retry'),
                      ),
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
                  physics: const AlwaysScrollableScrollPhysics(
                    parent: BouncingScrollPhysics(),
                  ),
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                  itemCount: controller.items.length +
                      (controller.loading.value && controller.hasMore ? 1 : 0),
                  itemBuilder: (context, i) {
                    if (i >= controller.items.length) {
                      return const Padding(
                        padding: EdgeInsets.all(16),
                        child: Center(
                          child: CircularProgressIndicator(color: AppColors.primary),
                        ),
                      );
                    }
                    final row = controller.items[i];
                    final sub = _subtitle(row);
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Material(
                        color: AppColors.whiteOverlay(0.08),
                        borderRadius: BorderRadius.circular(16),
                        child: ListTile(
                          title: Text(
                            _titleLine(row),
                            style: GoogleFonts.inter(
                              color: Colors.white,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          subtitle: sub == null || sub.isEmpty
                              ? null
                              : Text(
                                  sub,
                                  style: GoogleFonts.inter(
                                    color: AppColors.slate400,
                                    fontSize: 13,
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
      ),
    );
  }
}
