import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/values/app_colors.dart';
import '../../data/models/timesheet_history_entry.dart';
import 'timesheet_history_controller.dart';

class TimesheetHistoryView extends GetView<TimesheetHistoryController> {
  const TimesheetHistoryView({super.key});

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
            'Timesheet history',
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
            if (controller.loading.value && controller.entries.isEmpty) {
              return const Center(
                child: CircularProgressIndicator(color: AppColors.primary),
              );
            }
            if (controller.error.value.isNotEmpty && controller.entries.isEmpty) {
              return Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text(
                    controller.error.value,
                    textAlign: TextAlign.center,
                    style: GoogleFonts.inter(color: AppColors.slate400),
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
                    SizedBox(height: MediaQuery.sizeOf(context).height * 0.25),
                    Center(
                      child: Text(
                        'No timesheet entries yet',
                        style: GoogleFonts.inter(
                          fontSize: 15,
                          color: AppColors.slate400,
                        ),
                      ),
                    ),
                  ],
                ),
              );
            }
            return RefreshIndicator(
              color: AppColors.primary,
              onRefresh: controller.load,
              child: ListView.builder(
                physics: const AlwaysScrollableScrollPhysics(
                  parent: BouncingScrollPhysics(),
                ),
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
                itemCount: controller.entries.length,
                itemBuilder: (context, i) {
                  final e = controller.entries[i];
                  return _HistoryTile(entry: e);
                },
              ),
            );
          }),
        ),
      ),
    );
  }
}

class _HistoryTile extends StatelessWidget {
  const _HistoryTile({required this.entry});

  final TimesheetHistoryEntry entry;

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
    final ds = '${a.day.toString().padLeft(2, '0')}/${a.month.toString().padLeft(2, '0')}/${a.year}';
    if (b == null) return '$ds · In progress';
    final t0 =
        '${a.hour.toString().padLeft(2, '0')}:${a.minute.toString().padLeft(2, '0')}';
    final t1 =
        '${b.hour.toString().padLeft(2, '0')}:${b.minute.toString().padLeft(2, '0')}';
    return '$ds · $t0 – $t1';
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          color: AppColors.whiteOverlay(0.06),
          border: Border.all(color: AppColors.whiteOverlay(0.1)),
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Text(
                      _fmtRange(),
                      style: GoogleFonts.inter(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: Colors.white,
                      ),
                    ),
                  ),
                  Text(
                    entry.isOpen ? '—' : _fmtDuration(entry.durationSeconds),
                    style: GoogleFonts.inter(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: AppColors.primary,
                    ),
                  ),
                ],
              ),
              if (entry.notes != null && entry.notes!.trim().isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  entry.notes!,
                  style: GoogleFonts.inter(
                    fontSize: 13,
                    height: 1.35,
                    color: AppColors.slate400,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
