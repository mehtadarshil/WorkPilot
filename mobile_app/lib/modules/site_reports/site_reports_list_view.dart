import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../app/routes/app_routes.dart';
import '../../core/values/app_colors.dart';
import '../../data/repositories/mobile_repository.dart';
import 'site_reports_list_controller.dart';

class SiteReportsListView extends GetView<SiteReportsListController> {
  const SiteReportsListView({super.key});

  String _titleLine(Map<String, dynamic> row) {
    final title = (row['report_title'] as String?)?.trim();
    if (title != null && title.isNotEmpty) return title;
    final template = (row['template_name'] as String?)?.trim();
    if (template != null && template.isNotEmpty) return template;
    return 'Site Report #${row['id']}';
  }

  String? _subtitle(Map<String, dynamic> row) {
    final customer = (row['customer_full_name'] as String?)?.trim();
    final cert = (row['certificate_number'] as String?)?.trim();
    final template = (row['template_name'] as String?)?.trim();
    final parts = <String>[];
    if (customer != null && customer.isNotEmpty) parts.add(customer);
    if (cert != null && cert.isNotEmpty) parts.add('Cert: $cert');
    if (parts.isEmpty && template != null && template.isNotEmpty) parts.add(template);
    return parts.isEmpty ? null : parts.join(' · ');
  }

  String _updatedAt(Map<String, dynamic> row) {
    final raw = row['updated_at'] ?? row['created_at'];
    if (raw == null) return '';
    try {
      final d = DateTime.parse(raw as String);
      return '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';
    } catch (_) {
      return '';
    }
  }

  Future<void> _showCreateSheet(BuildContext context) async {
    final mobile = Get.find<MobileRepository>();
    List<Map<String, dynamic>> customers = [];
    List<Map<String, dynamic>> templates = [];
    String? error;
    try {
      final cRes = await mobile.fetchCrmListPage(module: 'customers', page: 1);
      customers = cRes.items;
      templates = await mobile.fetchSiteReportTemplates();
    } catch (e) {
      error = e.toString();
    }

    if (!context.mounted) return;

    int? selectedCustomerId;
    int? selectedTemplateId;
    if (customers.isNotEmpty) {
      final raw = customers.first['id'];
      selectedCustomerId = raw is int ? raw : (raw is num ? raw.toInt() : null);
    }
    if (templates.isNotEmpty) {
      final raw = templates.first['id'];
      selectedTemplateId = raw is int ? raw : (raw is num ? raw.toInt() : null);
    }

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx2, setState) {
            return Container(
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
                borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
              ),
              padding: EdgeInsets.only(
                left: 20,
                right: 20,
                top: 20,
                bottom: MediaQuery.paddingOf(ctx2).bottom + 24,
              ),
              child: SafeArea(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Center(
                      child: Container(
                        width: 40,
                        height: 4,
                        decoration: BoxDecoration(
                          color: AppColors.whiteOverlay(0.3),
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Create new report',
                      style: GoogleFonts.inter(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Select a customer and template',
                      style: GoogleFonts.inter(
                        color: AppColors.slate400,
                        fontSize: 13,
                      ),
                    ),
                    if (error != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: Text(
                          error,
                          style: GoogleFonts.inter(
                            color: Colors.red.shade300,
                            fontSize: 13,
                          ),
                        ),
                      ),
                    const SizedBox(height: 16),
                    if (customers.isEmpty && error == null)
                      Text(
                        'No customers available',
                        style: GoogleFonts.inter(color: AppColors.slate400),
                      )
                    else ...[
                      Text(
                        'Customer',
                        style: GoogleFonts.inter(
                          color: AppColors.slate400,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Container(
                        decoration: BoxDecoration(
                          color: AppColors.whiteOverlay(0.06),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: AppColors.whiteOverlay(0.1)),
                        ),
                        child: DropdownButtonHideUnderline(
                          child: DropdownButton<int>(
                            value: selectedCustomerId,
                            dropdownColor: const Color(0xFF1E293B),
                            isExpanded: true,
                            icon: const Icon(Icons.arrow_drop_down, color: Colors.white54),
                            padding: const EdgeInsets.symmetric(horizontal: 12),
                            items: customers.map((c) {
                              final rawId = c['id'];
                              final cid = rawId is int
                                  ? rawId
                                  : (rawId is num ? rawId.toInt() : null);
                              final name = (c['full_name'] as String?) ?? 'Customer';
                              return DropdownMenuItem(
                                value: cid,
                                child: Text(
                                  name,
                                  style: GoogleFonts.inter(color: Colors.white, fontSize: 14),
                                ),
                              );
                            }).toList(),
                            onChanged: (v) => setState(() => selectedCustomerId = v),
                          ),
                        ),
                      ),
                    ],
                    const SizedBox(height: 16),
                    if (templates.isEmpty && error == null)
                      Text(
                        'No templates available',
                        style: GoogleFonts.inter(color: AppColors.slate400),
                      )
                    else if (templates.isNotEmpty) ...[
                      Text(
                        'Template',
                        style: GoogleFonts.inter(
                          color: AppColors.slate400,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Container(
                        decoration: BoxDecoration(
                          color: AppColors.whiteOverlay(0.06),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: AppColors.whiteOverlay(0.1)),
                        ),
                        child: DropdownButtonHideUnderline(
                          child: DropdownButton<int>(
                            value: selectedTemplateId,
                            dropdownColor: const Color(0xFF1E293B),
                            isExpanded: true,
                            icon: const Icon(Icons.arrow_drop_down, color: Colors.white54),
                            padding: const EdgeInsets.symmetric(horizontal: 12),
                            items: templates.map((t) {
                              final rawId = t['id'];
                              final tid = rawId is int
                                  ? rawId
                                  : (rawId is num ? rawId.toInt() : null);
                              final name = (t['name'] as String?) ?? 'Template';
                              return DropdownMenuItem(
                                value: tid,
                                child: Text(
                                  name,
                                  style: GoogleFonts.inter(color: Colors.white, fontSize: 14),
                                ),
                              );
                            }).toList(),
                            onChanged: (v) => setState(() => selectedTemplateId = v),
                          ),
                        ),
                      ),
                    ],
                    const SizedBox(height: 24),
                    FilledButton(
                      onPressed: selectedCustomerId != null && selectedTemplateId != null
                          ? () async {
                              Navigator.of(ctx2).pop();
                              try {
                                final res = await mobile.createSiteReport(
                                  customerId: selectedCustomerId!,
                                  templateId: selectedTemplateId!,
                                );
                                final report = res['report'] as Map?;
                                final reportId = report?['id'];
                                final rid = reportId is int
                                    ? reportId
                                    : (reportId is num ? reportId.toInt() : null);
                                if (rid != null) {
                                  Get.toNamed(
                                    AppRoutes.siteReportEditor,
                                    arguments: <String, dynamic>{
                                      'customer_id': selectedCustomerId,
                                      'report_id': rid,
                                    },
                                  );
                                }
                              } catch (e) {
                                Get.snackbar(
                                  'Error',
                                  'Failed to create report: $e',
                                  snackPosition: SnackPosition.BOTTOM,
                                  backgroundColor: Colors.red.shade800,
                                  colorText: Colors.white,
                                );
                              }
                            }
                          : null,
                      child: const Text('Create draft'),
                    ),
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: () => Navigator.of(ctx2).pop(),
                      child: Text(
                        'Cancel',
                        style: GoogleFonts.inter(color: AppColors.slate400),
                      ),
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
            'Site Reports',
            style: GoogleFonts.inter(fontWeight: FontWeight.w700),
          ),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_ios_new_rounded),
            onPressed: Get.back,
          ),
        ),
        floatingActionButton: FloatingActionButton(
          onPressed: () => _showCreateSheet(context),
          backgroundColor: AppColors.primary,
          child: const Icon(Icons.add, color: Colors.white),
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
                    final updated = _updatedAt(row);
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Material(
                        color: AppColors.whiteOverlay(0.08),
                        borderRadius: BorderRadius.circular(16),
                        child: ListTile(
                          onTap: () {
                            final rawCid = row['customer_id'];
                            final customerId = rawCid is int
                                ? rawCid
                                : (rawCid is num ? rawCid.toInt() : null);
                            final rawRid = row['id'];
                            final reportId = rawRid is int
                                ? rawRid
                                : (rawRid is num ? rawRid.toInt() : null);
                            final rawWid = row['work_address_id'];
                            final workAddressId = rawWid is int
                                ? rawWid
                                : (rawWid is num ? rawWid.toInt() : null);
                            if (customerId != null && reportId != null) {
                              Get.toNamed(
                                AppRoutes.siteReportEditor,
                                arguments: <String, dynamic>{
                                  'customer_id': customerId,
                                  'report_id': reportId,
                                  if (workAddressId != null) 'work_address_id': workAddressId,
                                },
                              );
                            }
                          },
                          title: Text(
                            _titleLine(row),
                            style: GoogleFonts.inter(
                              color: Colors.white,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          subtitle: sub == null || sub.isEmpty
                              ? null
                              : Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      sub,
                                      style: GoogleFonts.inter(
                                        color: AppColors.slate400,
                                        fontSize: 13,
                                      ),
                                    ),
                                    if (updated.isNotEmpty)
                                      Text(
                                        updated,
                                        style: GoogleFonts.inter(
                                          color: AppColors.slate500,
                                          fontSize: 12,
                                        ),
                                      ),
                                  ],
                                ),
                          trailing: const Icon(
                            Icons.chevron_right_rounded,
                            color: Colors.white54,
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
