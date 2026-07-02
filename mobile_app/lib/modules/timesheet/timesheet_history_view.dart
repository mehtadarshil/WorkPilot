import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/values/app_colors.dart';
import '../../data/models/timesheet_history_entry.dart';
import '../../widgets/wp_surface.dart';
import '../home/controllers/home_controller.dart';
import 'timesheet_history_controller.dart';

class TimesheetHistoryView extends GetView<TimesheetHistoryController> {
  const TimesheetHistoryView({super.key});

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark.copyWith(statusBarColor: Colors.transparent),
      child: Scaffold(
        backgroundColor: AppColors.slate50,
        appBar: AppBar(
          title: Text(
            'Timesheet history',
            style: GoogleFonts.inter(fontWeight: FontWeight.w700),
          ),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_ios_new_rounded),
            onPressed: Get.back,
          ),
        ),
        body: WpPageBackground(
          child: Obx(() {
            if (controller.loading.value && controller.entries.isEmpty) {
              return const Center(
                child: CircularProgressIndicator(color: AppColors.primary),
              );
            }
            if (controller.error.value.isNotEmpty && controller.entries.isEmpty) {
              return Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        controller.error.value,
                        textAlign: TextAlign.center,
                        style: GoogleFonts.inter(color: AppColors.slate600),
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
            if (controller.entries.isEmpty) {
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
                          WpAccentIconBadge(
                            icon: Icons.history_rounded,
                            accent: WpAccents.violet,
                            size: 56,
                          ),
                          const SizedBox(height: 16),
                          Text(
                            'No timesheet entries yet',
                            style: GoogleFonts.inter(
                              fontSize: 17,
                              fontWeight: FontWeight.w700,
                              color: AppColors.slate900,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            'Clock in from a diary visit to start tracking time.',
                            textAlign: TextAlign.center,
                            style: GoogleFonts.inter(
                              fontSize: 14,
                              color: AppColors.slate500,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              );
            }

            final totalSeconds = controller.entries.fold<int>(
              0,
              (sum, e) => sum + (e.isOpen ? 0 : e.durationSeconds),
            );

            return RefreshIndicator(
              color: AppColors.primary,
              onRefresh: controller.load,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(
                  parent: BouncingScrollPhysics(),
                ),
                padding: const EdgeInsets.fromLTRB(18, 8, 18, 32),
                children: [
                  _SummaryHeroCard(
                    entryCount: controller.entries.length,
                    totalSeconds: totalSeconds,
                  ),
                  const SizedBox(height: 18),
                  const WpSectionLabel('Recent entries'),
                  const SizedBox(height: 12),
                  ...controller.entries.map((e) => _HistoryTile(entry: e)),
                ],
              ),
            );
          }),
        ),
      ),
    );
  }
}

class _SummaryHeroCard extends StatelessWidget {
  const _SummaryHeroCard({
    required this.entryCount,
    required this.totalSeconds,
  });

  final int entryCount;
  final int totalSeconds;

  String _fmtTotal(int seconds) {
    final h = seconds ~/ 3600;
    final m = (seconds % 3600) ~/ 60;
    if (h > 0) return '${h}h ${m}m';
    return '${m}m';
  }

  @override
  Widget build(BuildContext context) {
    return WpSurfaceCard(
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned(
            right: -18,
            top: -22,
            child: IgnorePointer(
              child: Container(
                width: 88,
                height: 88,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(
                    colors: [
                      WpAccents.violet.withValues(alpha: 0.22),
                      Colors.transparent,
                    ],
                  ),
                ),
              ),
            ),
          ),
          Row(
            children: [
              WpAccentIconBadge(
                icon: Icons.timer_outlined,
                accent: WpAccents.violet,
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Time tracked',
                      style: GoogleFonts.inter(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: AppColors.slate500,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      _fmtTotal(totalSeconds),
                      style: GoogleFonts.inter(
                        fontSize: 26,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.8,
                        color: WpAccents.violet,
                        height: 1.05,
                      ),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '$entryCount',
                    style: GoogleFonts.inter(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      color: AppColors.slate900,
                    ),
                  ),
                  Text(
                    'entries',
                    style: GoogleFonts.inter(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: AppColors.slate500,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _HistoryTile extends StatelessWidget {
  const _HistoryTile({required this.entry});

  final TimesheetHistoryEntry entry;

  String? _whereLine() {
    final id = entry.diaryEventId;
    if (id == null || id <= 0) return null;
    if (!Get.isRegistered<HomeController>()) return 'Visit #$id';
    final d = Get.find<HomeController>().diaryById(id);
    if (d == null) return 'Visit #$id';
    final title = (d.title ?? '').trim();
    final loc = (d.location ?? '').trim();
    if (title.isNotEmpty && loc.isNotEmpty) return '$title · $loc';
    if (title.isNotEmpty) return title;
    if (loc.isNotEmpty) return loc;
    return 'Visit #$id';
  }

  String _fmtDuration(int seconds) {
    final h = seconds ~/ 3600;
    final m = (seconds % 3600) ~/ 60;
    if (h > 0) return '${h}h ${m}m';
    return '${m}m';
  }

  String _fmtRange() {
    final a = entry.clockIn;
    final b = entry.clockOut;
    if (a == null) return '—';
    final ds =
        '${a.day.toString().padLeft(2, '0')}/${a.month.toString().padLeft(2, '0')}/${a.year}';
    if (b == null) return '$ds · In progress';
    final t0 =
        '${a.hour.toString().padLeft(2, '0')}:${a.minute.toString().padLeft(2, '0')}';
    final t1 =
        '${b.hour.toString().padLeft(2, '0')}:${b.minute.toString().padLeft(2, '0')}';
    return '$ds · $t0 – $t1';
  }

  @override
  Widget build(BuildContext context) {
    final where = _whereLine();
    final accent = WpAccents.timesheetSegment(entry.segmentType);

    return WpSurfaceCard(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          WpAccentIconBadge(
            icon: accent.icon,
            accent: accent.color,
            size: 44,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _fmtRange(),
                  style: GoogleFonts.inter(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: AppColors.slate900,
                    height: 1.25,
                  ),
                ),
                if (entry.segmentType != null && entry.segmentType!.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  WpStatusPill(label: entry.segmentLabel, accent: accent.color),
                ],
                if (where != null && where.trim().isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.place_outlined, size: 14, color: AppColors.slate400),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(
                          where,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.inter(
                            fontSize: 12,
                            height: 1.35,
                            color: AppColors.slate500,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
                if (entry.notes != null && entry.notes!.trim().isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(
                    entry.notes!,
                    style: GoogleFonts.inter(
                      fontSize: 12,
                      height: 1.35,
                      color: AppColors.slate500,
                      fontStyle: FontStyle.italic,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                entry.isOpen ? '—' : _fmtDuration(entry.durationSeconds),
                style: GoogleFonts.inter(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  color: accent.color,
                  height: 1.1,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                entry.isOpen ? 'open' : 'total',
                style: GoogleFonts.inter(
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  color: AppColors.slate400,
                  letterSpacing: 0.3,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
