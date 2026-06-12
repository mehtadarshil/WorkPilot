import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../app/routes/app_routes.dart';
import '../../core/values/app_colors.dart';
import '../open_jobs/open_job_formatters.dart';
import '../certificates/certificate_catalog.dart';
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
        final jobNumber = (row['job_number'] as String?)?.trim();
        final title = (row['title'] as String?)?.trim();
        if (jobNumber != null && jobNumber.isNotEmpty && title != null && title.isNotEmpty) {
          return '$jobNumber · $title';
        }
        if (jobNumber != null && jobNumber.isNotEmpty) return jobNumber;
        return title?.isNotEmpty == true ? title! : 'Job #${row['id']}';
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
        final certNo = (row['certificate_number'] as String?)?.trim();
        final typeSlug = (row['type_slug'] as String?)?.trim() ?? '';
        final shortLabel = certificateTypeForSlug(typeSlug).shortLabel;
        if (certNo != null && certNo.isNotEmpty) {
          return '$certNo · $shortLabel';
        }
        return shortLabel.isNotEmpty ? shortLabel : 'Cert #${row['id']}';
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
        final customer = (row['customer_full_name'] as String?)?.trim();
        final installation = (row['installation_label'] as String?)?.trim();
        final status = (row['status'] as String?)?.trim() ?? '';
        final jobNo = (row['job_number'] as String?)?.trim();
        final parts = <String>[];
        if (customer != null && customer.isNotEmpty) parts.add(customer);
        if (installation != null && installation.isNotEmpty) parts.add(installation);
        if (jobNo != null && jobNo.isNotEmpty) parts.add('Job $jobNo');
        if (status.isNotEmpty) parts.add(status.toUpperCase());
        return parts.join(' · ');
      default:
        return null;
    }
  }

  String _formatCrmJobSchedule(Map<String, dynamic> row) {
    final iso = row['schedule_start'] as String?;
    if (iso != null && iso.isNotEmpty) {
      final d = DateTime.tryParse(iso);
      if (d != null) {
        final local = d.toLocal();
        final dd = local.day.toString().padLeft(2, '0');
        final mm = local.month.toString().padLeft(2, '0');
        final yyyy = local.year;
        final hh = local.hour.toString().padLeft(2, '0');
        final min = local.minute.toString().padLeft(2, '0');
        return '$dd/$mm/$yyyy · $hh:$min';
      }
    }

    final sdIso = row['start_date'] as String?;
    final dlIso = row['deadline'] as String?;
    String? sdStr;
    String? dlStr;
    if (sdIso != null && sdIso.isNotEmpty) {
      final d = DateTime.tryParse(sdIso);
      if (d != null) {
        final local = d.toLocal();
        sdStr = '${local.day.toString().padLeft(2, '0')}/${local.month.toString().padLeft(2, '0')}/${local.year}';
      }
    }
    if (dlIso != null && dlIso.isNotEmpty) {
      final d = DateTime.tryParse(dlIso);
      if (d != null) {
        final local = d.toLocal();
        dlStr = '${local.day.toString().padLeft(2, '0')}/${local.month.toString().padLeft(2, '0')}/${local.year}';
      }
    }
    if (sdStr != null && dlStr != null) {
      return 'Start: $sdStr · Deadline: $dlStr';
    } else if (sdStr != null) {
      return 'Start: $sdStr';
    } else if (dlStr != null) {
      return 'Deadline: $dlStr';
    }
    return 'Not scheduled';
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
            controller.title,
            style: GoogleFonts.inter(fontWeight: FontWeight.w700),
          ),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_ios_new_rounded),
            onPressed: Get.back,
          ),
        ),
        floatingActionButton: () {
          if (controller.module == 'jobs') {
            return FloatingActionButton.extended(
              onPressed: () async {
                final r = await Get.toNamed(AppRoutes.customerNewJob);
                if (r == true) {
                  controller.reloadFromStart();
                }
              },
              backgroundColor: AppColors.primary,
              icon: const Icon(Icons.add_rounded, color: Colors.white),
              label: Text(
                'New Job',
                style: GoogleFonts.inter(
                  color: Colors.white,
                  fontWeight: FontWeight.w600,
                ),
              ),
            );
          } else if (controller.module == 'certifications') {
            return FloatingActionButton.extended(
              onPressed: () async {
                await Get.toNamed(AppRoutes.certificateTypePicker);
                controller.reloadFromStart();
              },
              backgroundColor: AppColors.primary,
              icon: const Icon(Icons.add_rounded, color: Colors.white),
              label: Text(
                'New Certificate',
                style: GoogleFonts.inter(
                  color: Colors.white,
                  fontWeight: FontWeight.w600,
                ),
              ),
            );
          }
          return null;
        }(),
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
            return Column(
              children: [
                if (controller.module == 'jobs')
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 10),
                    child: TextField(
                      controller: controller.searchController,
                      onChanged: controller.setSearch,
                      style: GoogleFonts.inter(color: Colors.white),
                      decoration: InputDecoration(
                        hintText: 'Search jobs by number, title, customer...',
                        hintStyle: GoogleFonts.inter(color: AppColors.slate500),
                        prefixIcon: const Icon(
                          Icons.search_rounded,
                          color: AppColors.slate400,
                        ),
                        filled: true,
                        fillColor: AppColors.whiteOverlay(0.08),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(16),
                          borderSide: BorderSide(color: AppColors.whiteOverlay(0.12)),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(16),
                          borderSide: BorderSide(color: AppColors.whiteOverlay(0.12)),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(16),
                          borderSide: const BorderSide(color: AppColors.primary),
                        ),
                      ),
                    ),
                  ),
                Expanded(
                  child: NotificationListener<ScrollNotification>(
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
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
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

                          if (controller.module == 'jobs') {
                            final jobNumber = (row['job_number'] as String?)?.trim();
                            final title = (row['title'] as String?)?.trim() ?? 'Untitled';
                            final desc = (row['description'] as String?)?.trim();
                            final customer = (row['customer_full_name'] as String?)?.trim();
                            final location = (row['location'] as String?)?.trim();
                            final state = (row['state'] as String?)?.trim() ?? '';
                            final isQuotationVisit = row['is_quotation_visit'] == true;
                            final schedule = _formatCrmJobSchedule(row);
                            final stateLabel = formatJobState(state);

                            return Padding(
                              padding: const EdgeInsets.only(bottom: 12),
                              child: Material(
                                color: Colors.transparent,
                                child: InkWell(
                                  onTap: () {
                                    final raw = row['id'];
                                    final id = raw is int ? raw : (raw is num ? raw.toInt() : null);
                                    if (id != null) {
                                      Get.toNamed(AppRoutes.jobDetail, arguments: id);
                                    }
                                  },
                                  borderRadius: BorderRadius.circular(18),
                                  splashColor: AppColors.primary.withValues(alpha: 0.15),
                                  child: Ink(
                                    decoration: BoxDecoration(
                                      borderRadius: BorderRadius.circular(18),
                                      color: const Color(0xB30F172A),
                                      border: Border.all(color: AppColors.whiteOverlay(0.12)),
                                      boxShadow: [
                                        BoxShadow(
                                          color: AppColors.blackOverlay(0.25),
                                          blurRadius: 16,
                                          offset: const Offset(0, 6),
                                        ),
                                      ],
                                    ),
                                    child: Padding(
                                      padding: const EdgeInsets.all(16),
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Row(
                                            crossAxisAlignment: CrossAxisAlignment.start,
                                            children: [
                                              Expanded(
                                                child: Column(
                                                  crossAxisAlignment: CrossAxisAlignment.start,
                                                  children: [
                                                    Row(
                                                      children: [
                                                        if (jobNumber != null && jobNumber.isNotEmpty) ...[
                                                          Text(
                                                            jobNumber,
                                                            style: GoogleFonts.inter(
                                                              fontSize: 12,
                                                              fontWeight: FontWeight.w800,
                                                              color: AppColors.primary,
                                                            ),
                                                          ),
                                                          const SizedBox(width: 8),
                                                        ],
                                                        if (isQuotationVisit) ...[
                                                          Container(
                                                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                                            decoration: BoxDecoration(
                                                              color: const Color(0xFFFEF3C7),
                                                              borderRadius: BorderRadius.circular(6),
                                                            ),
                                                            child: Text(
                                                              'Quotation visit',
                                                              style: GoogleFonts.inter(
                                                                fontSize: 10,
                                                                fontWeight: FontWeight.w700,
                                                                color: const Color(0xFF92400E),
                                                              ),
                                                            ),
                                                          ),
                                                        ],
                                                      ],
                                                    ),
                                                    if ((jobNumber ?? '').isNotEmpty || isQuotationVisit)
                                                      const SizedBox(height: 4),
                                                    Text(
                                                      title,
                                                      style: GoogleFonts.inter(
                                                        fontSize: 16,
                                                        fontWeight: FontWeight.w700,
                                                        color: Colors.white,
                                                        height: 1.25,
                                                      ),
                                                    ),
                                                  ],
                                                ),
                                              ),
                                              const SizedBox(width: 8),
                                              Container(
                                                padding: const EdgeInsets.symmetric(
                                                  horizontal: 10,
                                                  vertical: 4,
                                                ),
                                                decoration: BoxDecoration(
                                                  color: AppColors.primary.withValues(alpha: 0.2),
                                                  borderRadius: BorderRadius.circular(20),
                                                  border: Border.all(
                                                    color: AppColors.primary.withValues(alpha: 0.45),
                                                  ),
                                                ),
                                                child: Text(
                                                  stateLabel,
                                                  style: GoogleFonts.inter(
                                                    fontSize: 11,
                                                    fontWeight: FontWeight.w600,
                                                    color: AppColors.primary,
                                                  ),
                                                ),
                                              ),
                                            ],
                                          ),
                                          if (desc != null && desc.isNotEmpty) ...[
                                            const SizedBox(height: 6),
                                            Text(
                                              desc,
                                              maxLines: 2,
                                              overflow: TextOverflow.ellipsis,
                                              style: GoogleFonts.inter(
                                                fontSize: 13,
                                                color: AppColors.slate400,
                                                height: 1.35,
                                              ),
                                            ),
                                          ],
                                          const SizedBox(height: 10),
                                          Row(
                                            children: [
                                              Icon(
                                                Icons.schedule_rounded,
                                                size: 16,
                                                color: AppColors.slate400,
                                              ),
                                              const SizedBox(width: 6),
                                              Expanded(
                                                child: Text(
                                                  schedule,
                                                  style: GoogleFonts.inter(
                                                    fontSize: 13,
                                                    color: AppColors.slate300,
                                                  ),
                                                ),
                                              ),
                                            ],
                                          ),
                                          if (customer != null && customer.isNotEmpty) ...[
                                            const SizedBox(height: 8),
                                            Row(
                                              children: [
                                                Icon(
                                                  Icons.person_outline_rounded,
                                                  size: 16,
                                                  color: AppColors.slate400,
                                                ),
                                                const SizedBox(width: 6),
                                                Expanded(
                                                  child: Text(
                                                    customer,
                                                    style: GoogleFonts.inter(
                                                      fontSize: 13,
                                                      color: AppColors.slate300,
                                                    ),
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ],
                                          if (location != null && location.isNotEmpty) ...[
                                            const SizedBox(height: 6),
                                            Row(
                                              crossAxisAlignment: CrossAxisAlignment.start,
                                              children: [
                                                Icon(
                                                  Icons.place_outlined,
                                                  size: 16,
                                                  color: AppColors.slate500,
                                                ),
                                                const SizedBox(width: 6),
                                                Expanded(
                                                  child: Text(
                                                    location,
                                                    style: GoogleFonts.inter(
                                                      fontSize: 12,
                                                      height: 1.35,
                                                      color: AppColors.slate400,
                                                    ),
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ],
                                          const SizedBox(height: 10),
                                          Row(
                                            mainAxisAlignment: MainAxisAlignment.end,
                                            children: [
                                              Text(
                                                'Details',
                                                style: GoogleFonts.inter(
                                                  fontSize: 13,
                                                  fontWeight: FontWeight.w600,
                                                  color: AppColors.primary,
                                                ),
                                              ),
                                              Icon(
                                                Icons.chevron_right_rounded,
                                                color: AppColors.primary,
                                                size: 22,
                                              ),
                                            ],
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            );
                          }

                          return Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: Material(
                              color: AppColors.whiteOverlay(0.08),
                              borderRadius: BorderRadius.circular(16),
                              child: ListTile(
                                onTap: () {
                                  if (controller.module == 'jobs') {
                                    final raw = row['id'];
                                    final id = raw is int ? raw : (raw is num ? raw.toInt() : null);
                                    if (id != null) {
                                      Get.toNamed(AppRoutes.jobDetail, arguments: id);
                                    }
                                  } else if (controller.module == 'certifications') {
                                    final raw = row['id'];
                                    final id = raw is int ? raw : (raw is num ? raw.toInt() : null);
                                    if (id != null) {
                                      Get.toNamed(
                                        AppRoutes.certificateEditor,
                                        arguments: {'id': id},
                                      );
                                    }
                                  }
                                },
                                title: Text(
                                  _titleLine(row),
                                  style: GoogleFonts.inter(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                subtitle: () {
                                  final desc = controller.module == 'jobs' ? (row['description'] as String?)?.trim() : null;
                                  final hasSub = sub != null && sub.isNotEmpty;
                                  final hasDesc = desc != null && desc.isNotEmpty;
                                  if (!hasSub && !hasDesc) return null;
                                  return Padding(
                                    padding: const EdgeInsets.only(top: 4),
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        if (hasSub)
                                          Text(
                                            sub,
                                            style: GoogleFonts.inter(
                                              color: AppColors.slate300,
                                              fontSize: 13,
                                            ),
                                          ),
                                        if (hasDesc) ...[
                                          const SizedBox(height: 4),
                                          Text(
                                            desc,
                                            maxLines: 2,
                                            overflow: TextOverflow.ellipsis,
                                            style: GoogleFonts.inter(
                                              color: AppColors.slate400,
                                              fontSize: 12,
                                            ),
                                          ),
                                        ],
                                      ],
                                    ),
                                  );
                                }(),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                  ),
                ),
              ],
            );
          }),
        ),
      ),
    );
  }
}
