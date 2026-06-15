import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../app/routes/app_routes.dart';
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

/// Job detail with the same primary tabs as the web job page (details, report, site report, client share, reminders, files, invoices).
class JobDetailView extends StatefulWidget {
  const JobDetailView({super.key});

  @override
  State<JobDetailView> createState() => _JobDetailViewState();
}

class _JobDetailViewState extends State<JobDetailView>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;

  static const _tabWidgets = <Widget>[
    JobTabDetails(),
    JobTabJobReport(),
    JobTabDynamicReports(),
    JobTabClientPanel(),
    JobTabOfficeTasks(),
    JobTabFiles(),
    JobTabInvoices(),
    JobTabCosts(),
  ];

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: _tabWidgets.length, vsync: this);
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
      value: SystemUiOverlayStyle.light.copyWith(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: AppColors.gradientStart,
        systemNavigationBarIconBrightness: Brightness.light,
      ),
      child: Scaffold(
        backgroundColor: AppColors.gradientStart,
        appBar: AppBar(
          title: Obx(() {
            final number = (controller.job.value?['job_number'] as String?)?.trim();
            return Text(
              number != null && number.isNotEmpty ? number : 'Job #${controller.jobId}',
              style: GoogleFonts.inter(fontWeight: FontWeight.w700),
            );
          }),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_ios_new_rounded),
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
                icon: const Icon(Icons.edit_rounded),
                onPressed: () => Get.toNamed(AppRoutes.editJob),
              );
            }),
            Obx(() {
              if (controller.loading.value) return const SizedBox.shrink();
              return IconButton(
                tooltip: 'Refresh',
                icon: const Icon(Icons.refresh_rounded),
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
            tabs: const [
              Tab(text: 'Details'),
              Tab(text: 'Job report'),
              Tab(text: 'Reports'),
              Tab(text: 'Client'),
              Tab(text: 'Reminders'),
              Tab(text: 'Files'),
              Tab(text: 'Invoices'),
              Tab(text: 'Costs'),
            ],
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
              children: _tabWidgets,
            );
          }),
        ),
      ),
    );
  }
}
