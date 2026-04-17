import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../app/routes/app_routes.dart';
import '../../core/values/app_colors.dart';
import '../../data/models/open_job_summary.dart';
import 'open_job_formatters.dart';
import 'open_jobs_controller.dart';

class OpenJobsView extends GetView<OpenJobsController> {
  const OpenJobsView({super.key});

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
            'Open jobs',
            style: GoogleFonts.inter(fontWeight: FontWeight.w700),
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
            if (controller.loading.value && controller.jobs.isEmpty) {
              return const Center(
                child: CircularProgressIndicator(color: AppColors.primary),
              );
            }
            if (controller.error.value.isNotEmpty && controller.jobs.isEmpty) {
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
                        onPressed: controller.load,
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
                ),
              );
            }
            if (controller.jobs.isEmpty) {
              return RefreshIndicator(
                color: AppColors.primary,
                onRefresh: controller.load,
                child: ListView(
                  physics: const AlwaysScrollableScrollPhysics(
                    parent: BouncingScrollPhysics(),
                  ),
                  children: [
                    SizedBox(height: MediaQuery.sizeOf(context).height * 0.2),
                    Center(
                      child: Column(
                        children: [
                          Icon(
                            Icons.work_outline_rounded,
                            size: 56,
                            color: AppColors.whiteOverlay(0.25),
                          ),
                          const SizedBox(height: 16),
                          Text(
                            'No open jobs',
                            style: GoogleFonts.inter(
                              fontSize: 17,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 32),
                            child: Text(
                              'Assigned jobs that are not completed will appear here.',
                              textAlign: TextAlign.center,
                              style: GoogleFonts.inter(
                                fontSize: 14,
                                color: AppColors.slate400,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              );
            }
            return RefreshIndicator(
              color: AppColors.primary,
              onRefresh: controller.load,
              child: ListView.separated(
                physics: const AlwaysScrollableScrollPhysics(
                  parent: BouncingScrollPhysics(),
                ),
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                itemCount: controller.jobs.length,
                separatorBuilder: (_, __) => const SizedBox(height: 12),
                itemBuilder: (context, i) {
                  final job = controller.jobs[i];
                  return _OpenJobListTile(
                    job: job,
                    onTap: () =>
                        Get.toNamed(AppRoutes.openJobDetail, arguments: job),
                  );
                },
              ),
            );
          }),
        ),
      ),
    );
  }
}

class _OpenJobListTile extends StatelessWidget {
  const _OpenJobListTile({required this.job, required this.onTap});

  final OpenJobSummary job;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final schedule = formatJobSchedule(job);
    final stateLabel = formatJobState(job.state);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
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
                      child: Text(
                        job.title,
                        style: GoogleFonts.inter(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                          height: 1.25,
                        ),
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
                if (job.customerFullName != null &&
                    job.customerFullName!.trim().isNotEmpty) ...[
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
                          job.customerFullName!,
                          style: GoogleFonts.inter(
                            fontSize: 13,
                            color: AppColors.slate300,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
                if (job.location != null &&
                    job.location!.trim().isNotEmpty) ...[
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
                          job.location!,
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
    );
  }
}
