import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/values/app_colors.dart';
import '../../data/models/open_job_summary.dart';
import 'open_job_formatters.dart';

class OpenJobDetailView extends StatelessWidget {
  const OpenJobDetailView({super.key, required this.job});

  final OpenJobSummary job;

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
            'Job #${job.id}',
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
          child: ListView(
            physics: const BouncingScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
            children: [
              Text(
                job.title,
                style: GoogleFonts.inter(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  color: Colors.white,
                  height: 1.2,
                  letterSpacing: -0.4,
                ),
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _Chip(label: formatJobState(job.state), emphasized: true),
                  if (job.priority != null && job.priority!.isNotEmpty)
                    _Chip(
                      label: formatJobState(job.priority!),
                      emphasized: false,
                    ),
                ],
              ),
              const SizedBox(height: 20),
              _Section(
                title: 'Schedule',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _DetailRow(
                      icon: Icons.event_rounded,
                      text: formatJobSchedule(job),
                    ),
                    if (formatDurationMinutes(job.durationMinutes) != null) ...[
                      const SizedBox(height: 8),
                      _DetailRow(
                        icon: Icons.timer_outlined,
                        text: formatDurationMinutes(job.durationMinutes)!,
                      ),
                    ],
                  ],
                ),
              ),
              if (job.dispatchedAt != null &&
                  job.dispatchedAt!.trim().isNotEmpty) ...[
                const SizedBox(height: 12),
                _Section(
                  title: 'Dispatched',
                  child: _DetailRow(
                    icon: Icons.local_shipping_outlined,
                    text: _formatIso(job.dispatchedAt!),
                  ),
                ),
              ],
              if (job.customerFullName != null &&
                  job.customerFullName!.trim().isNotEmpty) ...[
                const SizedBox(height: 12),
                _Section(
                  title: 'Customer',
                  child: _DetailRow(
                    icon: Icons.person_outline_rounded,
                    text: job.customerFullName!,
                  ),
                ),
              ],
              if (job.location != null && job.location!.trim().isNotEmpty) ...[
                const SizedBox(height: 12),
                _Section(
                  title: 'Location',
                  child: _DetailRow(
                    icon: Icons.place_outlined,
                    text: job.location!,
                  ),
                ),
              ],
              if (job.description != null &&
                  job.description!.trim().isNotEmpty) ...[
                const SizedBox(height: 12),
                _Section(
                  title: 'Description',
                  child: Text(
                    job.description!,
                    style: GoogleFonts.inter(
                      fontSize: 14,
                      height: 1.5,
                      color: AppColors.slate300,
                    ),
                  ),
                ),
              ],
              if (job.schedulingNotes != null &&
                  job.schedulingNotes!.trim().isNotEmpty) ...[
                const SizedBox(height: 12),
                _Section(
                  title: 'Scheduling notes',
                  child: Text(
                    job.schedulingNotes!,
                    style: GoogleFonts.inter(
                      fontSize: 14,
                      height: 1.5,
                      color: AppColors.slate300,
                    ),
                  ),
                ),
              ],
              if (job.jobNotes != null && job.jobNotes!.trim().isNotEmpty) ...[
                const SizedBox(height: 12),
                _Section(
                  title: 'Job notes',
                  child: Text(
                    job.jobNotes!,
                    style: GoogleFonts.inter(
                      fontSize: 14,
                      height: 1.5,
                      color: AppColors.slate300,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  String _formatIso(String iso) {
    final d = DateTime.tryParse(iso);
    if (d == null) return iso;
    final l = d.toLocal();
    return '${l.day}/${l.month}/${l.year} ${l.hour.toString().padLeft(2, '0')}:${l.minute.toString().padLeft(2, '0')}';
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.emphasized});

  final String label;
  final bool emphasized;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: emphasized
            ? AppColors.primary.withValues(alpha: 0.22)
            : AppColors.whiteOverlay(0.08),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: emphasized
              ? AppColors.primary.withValues(alpha: 0.5)
              : AppColors.whiteOverlay(0.15),
        ),
      ),
      child: Text(
        label,
        style: GoogleFonts.inter(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: emphasized ? AppColors.primary : AppColors.slate300,
        ),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        color: const Color(0xB30F172A),
        border: Border.all(color: AppColors.whiteOverlay(0.1)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: GoogleFonts.inter(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: AppColors.slate400,
                letterSpacing: 0.4,
              ),
            ),
            const SizedBox(height: 10),
            child,
          ],
        ),
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18, color: AppColors.slate400),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            text,
            style: GoogleFonts.inter(
              fontSize: 14,
              height: 1.45,
              color: AppColors.slate300,
            ),
          ),
        ),
      ],
    );
  }
}

/// Pushed via [Get.toNamed] with [OpenJobSummary] as [Get.arguments].
class OpenJobDetailPage extends StatelessWidget {
  const OpenJobDetailPage({super.key});

  @override
  Widget build(BuildContext context) {
    final arg = Get.arguments;
    if (arg is! OpenJobSummary) {
      return Scaffold(
        backgroundColor: AppColors.gradientStart,
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_ios_new_rounded),
            onPressed: Get.back,
          ),
        ),
        body: Center(
          child: Text(
            'Job not found',
            style: GoogleFonts.inter(color: AppColors.slate400),
          ),
        ),
      );
    }
    return OpenJobDetailView(job: arg);
  }
}
