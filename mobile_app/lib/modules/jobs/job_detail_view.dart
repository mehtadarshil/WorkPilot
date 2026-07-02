import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../app/routes/app_routes.dart';
import '../../core/tenant_permissions.dart';
import '../../core/values/app_colors.dart';
import '../home/controllers/home_controller.dart';
import 'job_detail_controller.dart';
import 'job_tab_client_panel.dart';
import 'job_tab_costs.dart';
import 'job_tab_details.dart';
import 'job_tab_files.dart';
import 'job_tab_invoices.dart';
import 'job_tab_job_report.dart';
import 'job_tab_office_tasks.dart';
import 'job_tab_dynamic_reports.dart';
import 'job_tab_parts.dart';

class _JobTabEntry {
  const _JobTabEntry({
    required this.label,
    required this.widget,
    this.permissionKey,
  });

  final String label;
  final Widget widget;
  final String? permissionKey;
}

/// Job detail with the same primary tabs as the web job page (details, report, site report, client share, reminders, files, invoices).
class JobDetailView extends StatefulWidget {
  const JobDetailView({super.key});

  @override
  State<JobDetailView> createState() => _JobDetailViewState();
}

class _JobDetailViewState extends State<JobDetailView>
    with SingleTickerProviderStateMixin {
  static const _allTabs = <_JobTabEntry>[
    _JobTabEntry(label: 'Details', widget: JobTabDetails()),
    _JobTabEntry(label: 'Job report', widget: JobTabJobReport(), permissionKey: 'job_tab_job_report'),
    _JobTabEntry(label: 'Reports', widget: JobTabDynamicReports(), permissionKey: 'job_tab_reports'),
    _JobTabEntry(label: 'Parts', widget: JobTabParts(), permissionKey: 'job_tab_parts'),
    _JobTabEntry(label: 'Client', widget: JobTabClientPanel(), permissionKey: 'job_tab_client_panel'),
    _JobTabEntry(label: 'Reminders', widget: JobTabOfficeTasks(), permissionKey: 'job_tab_reminders'),
    _JobTabEntry(label: 'Files', widget: JobTabFiles(), permissionKey: 'job_tab_files'),
    _JobTabEntry(label: 'Invoices', widget: JobTabInvoices(), permissionKey: 'job_tab_invoices'),
    _JobTabEntry(label: 'Costs', widget: JobTabCosts(), permissionKey: 'job_tab_costs'),
  ];

  late final List<_JobTabEntry> _visibleTabs;
  late final TabController _tabs;

  Map<String, bool> _perms() {
    if (!Get.isRegistered<HomeController>()) return {};
    return Get.find<HomeController>().home.value?.mobilePermissions ?? {};
  }

  String? _role() {
    if (!Get.isRegistered<HomeController>()) return null;
    return Get.find<HomeController>().home.value?.role;
  }

  @override
  void initState() {
    super.initState();
    final perms = _perms();
    final role = _role();
    _visibleTabs = _allTabs
        .where((t) =>
            t.permissionKey == null ||
            canViewJobDetailTab(perms, t.permissionKey!, role: role))
        .toList();
    _tabs = TabController(length: _visibleTabs.length, vsync: this);
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = Get.find<JobDetailController>();

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark.copyWith(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: AppColors.gradientStart,
        systemNavigationBarIconBrightness: Brightness.light,
      ),
      child: Scaffold(
        backgroundColor: AppColors.slate50,
        appBar: AppBar(
          title: Obx(() {
            final number = (controller.job.value?['job_number'] as String?)?.trim();
            return Text(
              number != null && number.isNotEmpty ? number : 'Job #${controller.jobId}',
              style: GoogleFonts.inter(fontWeight: FontWeight.w700),
            );
          }),
          leading: IconButton(
            icon: Icon(Icons.arrow_back_ios_new_rounded),
            onPressed: Get.back,
          ),
          actions: [
            Obx(() {
              final showEdit = !controller.loading.value &&
                  Get.isRegistered<HomeController>() &&
                  Get.find<HomeController>().canEditBookedJobs;
              if (!showEdit) return const SizedBox.shrink();
              return IconButton(
                tooltip: 'Edit Job',
                icon: Icon(Icons.edit_rounded),
                onPressed: () => Get.toNamed(AppRoutes.editJob),
              );
            }),
            Obx(() {
              if (controller.loading.value) return const SizedBox.shrink();
              return IconButton(
                tooltip: 'Refresh',
                icon: Icon(Icons.refresh_rounded),
                onPressed: controller.refreshAll,
              );
            }),
          ],
          bottom: TabBar(
            controller: _tabs,
            isScrollable: true,
            indicatorColor: AppColors.primary,
            labelColor: AppColors.primary,
            unselectedLabelColor: AppColors.slate400,
            tabs: [
              for (final t in _visibleTabs) Tab(text: t.label),
            ],
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
          child: Obx(() {
            if (controller.loading.value && controller.job.value == null) {
              return const Center(
                child: CircularProgressIndicator(color: AppColors.primary),
              );
            }
            if (controller.error.value.isNotEmpty &&
                controller.job.value == null) {
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
                        onPressed: controller.refreshAll,
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
                ),
              );
            }
            if (controller.job.value == null) {
              return Center(
                child: Text(
                  'No data',
                  style: GoogleFonts.inter(color: AppColors.slate400),
                ),
              );
            }
            return TabBarView(
              controller: _tabs,
              physics: const BouncingScrollPhysics(),
              children: [for (final t in _visibleTabs) t.widget],
            );
          }),
        ),
      ),
    );
  }
}
