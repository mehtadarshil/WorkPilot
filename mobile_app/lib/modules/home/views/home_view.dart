import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:glass_kit/glass_kit.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../app/routes/app_routes.dart';
import '../../../core/offline/connectivity_service.dart';
import '../../../core/offline/offline_queue_service.dart';
import '../../../core/services/storage_service.dart';
import '../../../core/services/user_profile_cache.dart';
import '../../../core/values/app_colors.dart';
import '../../../core/values/app_constants.dart';
import '../../../data/models/diary_event_row.dart';
import '../../profile/widgets/profile_avatar_button.dart';
import '../../legal/legal_document_view.dart';
import '../controllers/home_controller.dart';
import '../widgets/work_hub_tab.dart';

class HomeView extends GetView<HomeController> {
  const HomeView({super.key});

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.paddingOf(context).bottom;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light.copyWith(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: AppColors.gradientStart,
        systemNavigationBarIconBrightness: Brightness.light,
      ),
      child: Scaffold(
        extendBody: true,
        body: Stack(
          fit: StackFit.expand,
          children: [
            const _ShellGradientBackground(),
            _ShellAmbientOrbs(size: MediaQuery.sizeOf(context)),
            SafeArea(
              bottom: false,
              child: Padding(
                padding: EdgeInsets.only(bottom: 80 + bottomInset),
                child: Obx(() {
                  final hub = controller.showWorkHubTab;
                  final maxIdx = controller.profileTabIndex;
                  final idx = controller.navIndex.value.clamp(0, maxIdx);
                  return IndexedStack(
                    index: idx,
                    children: [
                      const _HomeTab(),
                      const _DiaryTab(),
                      if (hub) WorkHubTab(controller: controller),
                      const _ProfileTab(),
                    ],
                  );
                }),
              ),
            ),
            Positioned(
              left: 20,
              right: 20,
              bottom: 10 + bottomInset,
              child: _GlassTabBar(controller: controller),
            ),
          ],
        ),
      ),
    );
  }
}

class _ShellGradientBackground extends StatelessWidget {
  const _ShellGradientBackground();

  @override
  Widget build(BuildContext context) {
    return const DecoratedBox(
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
    );
  }
}

class _ShellAmbientOrbs extends StatelessWidget {
  const _ShellAmbientOrbs({required this.size});

  final Size size;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Stack(
        children: [
          Positioned(
            top: -size.height * 0.06,
            right: -size.width * 0.12,
            child: _Orb(
              diameter: size.width * 0.72,
              colors: [
                AppColors.primary.withValues(alpha: 0.14),
                Colors.transparent,
              ],
            ),
          ),
          Positioned(
            bottom: size.height * 0.15,
            left: -size.width * 0.18,
            child: _Orb(
              diameter: size.width * 0.65,
              colors: [
                const Color(0xFF022C22).withValues(alpha: 0.45),
                Colors.transparent,
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Orb extends StatelessWidget {
  const _Orb({required this.diameter, required this.colors});

  final double diameter;
  final List<Color> colors;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: diameter,
      height: diameter,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: RadialGradient(colors: colors),
      ),
    );
  }
}

/// iOS-style “chrome material” bar: floating pill, strong backdrop blur,
/// hairline luminance border, and a sliding capsule behind the selected tab
/// (similar to system tab bars and apps like WhatsApp on recent iOS).
class _GlassTabBar extends StatelessWidget {
  const _GlassTabBar({required this.controller});

  final HomeController controller;

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final idx = controller.navIndex.value;
      final hub = controller.showWorkHubTab;
      final tabCount = controller.tabCount;
      final profileI = controller.profileTabIndex;
      return LayoutBuilder(
        builder: (context, constraints) {
          return GlassContainer.frostedGlass(
            height: 72,
            width: constraints.maxWidth,
            blur: 36,
            frostedOpacity: 0.12,
            borderRadius: BorderRadius.circular(28),
            borderWidth: 1,
            borderGradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                AppColors.whiteOverlay(0.5),
                AppColors.whiteOverlay(0.08),
              ],
            ),
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                AppColors.whiteOverlay(0.14),
                const Color(0x66101828),
                const Color(0x990a0f1a),
              ],
            ),
            boxShadow: [
              BoxShadow(
                color: AppColors.blackOverlay(0.45),
                blurRadius: 28,
                offset: const Offset(0, 12),
              ),
              BoxShadow(
                color: AppColors.whiteOverlay(0.04),
                blurRadius: 0,
                offset: const Offset(0, 1),
              ),
            ],
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
            child: LayoutBuilder(
              builder: (context, c) {
                final w = c.maxWidth;
                final segment = w / tabCount;
                final slideIdx = idx.clamp(0, tabCount - 1);
                return Stack(
                  clipBehavior: Clip.hardEdge,
                  alignment: Alignment.center,
                  children: [
                    AnimatedPositioned(
                      duration: const Duration(milliseconds: 260),
                      curve: Curves.easeOutCubic,
                      left: slideIdx * segment,
                      width: segment,
                      top: 0,
                      bottom: 0,
                      child: const Padding(
                        padding: EdgeInsets.symmetric(horizontal: 2),
                        child: _IOSSelectionCapsule(),
                      ),
                    ),
                    Row(
                      children: [
                        _NavItem(
                          selected: idx == 0,
                          icon: Icons.home_rounded,
                          iconMuted: Icons.home_outlined,
                          label: 'Home',
                          onTap: () => controller.navIndex.value = 0,
                        ),
                        _NavItem(
                          selected: idx == 1,
                          icon: Icons.calendar_month_rounded,
                          iconMuted: Icons.calendar_month_outlined,
                          label: 'Diary',
                          onTap: () => controller.navIndex.value = 1,
                        ),
                        if (hub)
                          _NavItem(
                            selected: idx == 2,
                            icon: Icons.grid_view_rounded,
                            iconMuted: Icons.grid_view_outlined,
                            label: 'Work',
                            onTap: () => controller.navIndex.value = 2,
                          ),
                        _NavItem(
                          selected: idx == profileI,
                          icon: Icons.person_rounded,
                          iconMuted: Icons.person_outline_rounded,
                          label: 'Profile',
                          onTap: () => controller.navIndex.value = profileI,
                        ),
                      ],
                    ),
                  ],
                );
              },
            ),
          );
        },
      );
    });
  }
}

/// Secondary “lifted glass” chip + thin iridescent rim (approximates chromatic
/// highlights on real UIVisualEffectView stacks).
class _IOSSelectionCapsule extends StatelessWidget {
  const _IOSSelectionCapsule();

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            const Color(0x55A5F3FC),
            const Color(0x33F0ABFC),
            const Color(0x44FDE68A),
          ],
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(1.25),
        child: DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20.75),
            color: AppColors.whiteOverlay(0.16),
            border: Border.all(color: AppColors.whiteOverlay(0.22)),
            boxShadow: [
              BoxShadow(
                color: AppColors.blackOverlay(0.2),
                blurRadius: 12,
                offset: const Offset(0, 4),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.selected,
    required this.icon,
    required this.iconMuted,
    required this.label,
    required this.onTap,
  });

  final bool selected;
  final IconData icon;
  final IconData iconMuted;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = selected ? Colors.white : AppColors.whiteOverlay(0.45);
    return Expanded(
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(20),
          splashColor: AppColors.whiteOverlay(0.1),
          highlightColor: AppColors.whiteOverlay(0.05),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(selected ? icon : iconMuted, size: 25, color: color),
              const SizedBox(height: 3),
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.fade,
                softWrap: false,
                style: GoogleFonts.inter(
                  fontSize: 10,
                  fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                  letterSpacing: 0.15,
                  color: color,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _HomeTab extends GetView<HomeController> {
  const _HomeTab();

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      if (controller.homeLoading.value && controller.home.value == null) {
        return const Center(
          child: CircularProgressIndicator(color: AppColors.primary),
        );
      }
      return RefreshIndicator(
        color: AppColors.primary,
        onRefresh: controller.refreshHome,
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(
            parent: BouncingScrollPhysics(),
          ),
          slivers: [
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
              sliver: SliverList(
                delegate: SliverChildListDelegate([
                  const _HomeHeader(),
                  const SizedBox(height: 10),
                  const _OfflineSyncBanner(),
                  const SizedBox(height: 16),
                  const _HomeStatsRow(),
                  if (controller.homeError.value.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Text(
                      controller.homeError.value,
                      style: GoogleFonts.inter(
                        fontSize: 13,
                        color: Colors.red.shade300,
                      ),
                    ),
                  ],
                  const SizedBox(height: 24),
                  const _HomeCurrentEventCard(),
                  const SizedBox(height: 16),
                  const _HomeTimesheetCard(),
                  const SizedBox(height: 16),
                  const _HomeMyOfficeTasksOpenCard(),
                  const SizedBox(height: 16),
                  const _HomeMyOfficeTasksCompletedCard(),
                ]),
              ),
            ),
          ],
        ),
      );
    });
  }
}

class _OfflineSyncBanner extends StatelessWidget {
  const _OfflineSyncBanner();

  @override
  Widget build(BuildContext context) {
    if (!Get.isRegistered<ConnectivityService>() ||
        !Get.isRegistered<OfflineQueueService>()) {
      return const SizedBox.shrink();
    }
    final conn = Get.find<ConnectivityService>();
    final q = Get.find<OfflineQueueService>();
    return Obx(() {
      final offline = !conn.isOnline.value;
      final n = q.pendingCount.value;
      final syncing = q.isProcessingQueue.value;
      final err = q.queueErrorMessage.value;
      final blocking = q.queueErrorBlocksProgress.value;
      final show =
          offline || n > 0 || syncing || (err != null && err.isNotEmpty);
      if (!show) return const SizedBox.shrink();

      String headline;
      if (offline) {
        headline = n > 0
            ? 'Offline — $n pending change${n == 1 ? '' : 's'} will sync when you are back online.'
            : 'Offline — job actions will queue until you are back online.';
      } else if (err != null && err.isNotEmpty && n == 0 && !syncing) {
        headline = 'Could not complete the last sync.';
      } else if (syncing && n > 0) {
        headline = 'Sending $n pending change${n == 1 ? '' : 's'}…';
      } else if (n > 0) {
        headline =
            '$n change${n == 1 ? '' : 's'} waiting to sync. Tap Sync now if this stays stuck.';
      } else {
        headline = 'Connection restored.';
      }

      final errColor = blocking ? Colors.red.shade300 : AppColors.slate400;

      return Material(
        color: blocking
            ? AppColors.whiteOverlay(0.12)
            : AppColors.whiteOverlay(0.08),
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    offline
                        ? Icons.cloud_off_rounded
                        : (blocking
                              ? Icons.error_outline_rounded
                              : Icons.cloud_sync_rounded),
                    color: offline
                        ? Colors.amber.shade200
                        : (blocking ? Colors.red.shade200 : AppColors.primary),
                    size: 22,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          headline,
                          style: GoogleFonts.inter(
                            fontSize: 13,
                            color: AppColors.slate300,
                            height: 1.35,
                          ),
                        ),
                        if (syncing && !offline) ...[
                          const SizedBox(height: 8),
                          const SizedBox(
                            height: 3,
                            child: LinearProgressIndicator(
                              backgroundColor: Colors.white12,
                              color: AppColors.primary,
                            ),
                          ),
                        ],
                        if (err != null && err.isNotEmpty) ...[
                          const SizedBox(height: 8),
                          Text(
                            err,
                            style: GoogleFonts.inter(
                              fontSize: 12,
                              color: errColor,
                              height: 1.35,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
              if (!offline && (n > 0 || err != null)) ...[
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 6,
                  alignment: WrapAlignment.end,
                  children: [
                    if (n > 0 && !syncing)
                      TextButton(
                        onPressed: () {
                          q.retrySync();
                        },
                        child: Text(
                          blocking ? 'Retry sync' : 'Sync now',
                          style: GoogleFonts.inter(
                            fontWeight: FontWeight.w700,
                            color: AppColors.primary,
                          ),
                        ),
                      ),
                    if (err != null && err.isNotEmpty && !blocking)
                      TextButton(
                        onPressed: q.dismissQueueError,
                        child: Text(
                          'Dismiss',
                          style: GoogleFonts.inter(
                            color: AppColors.slate400,
                            fontSize: 13,
                          ),
                        ),
                      ),
                  ],
                ),
              ],
            ],
          ),
        ),
      );
    });
  }
}

class _HomeStatsRow extends GetView<HomeController> {
  const _HomeStatsRow();

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final h = controller.home.value;
      if (h == null || !h.officerFeatures) {
        return const SizedBox.shrink();
      }
      return Row(
        children: [
          Expanded(
            child: _StatChip(
              label: 'Open jobs',
              value: '${h.stats.assignedJobsOpen}',
              onTap: controller.goToOpenJobs,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: _StatChip(
              label: 'Diary (7d)',
              value: '${h.stats.diaryUpcomingWeek}',
              onTap: controller.goToDiary,
            ),
          ),
        ],
      );
    });
  }
}

class _StatChip extends StatelessWidget {
  const _StatChip({required this.label, required this.value, this.onTap});

  final String label;
  final String value;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final inner = DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: AppColors.whiteOverlay(0.06),
        border: Border.all(color: AppColors.whiteOverlay(0.1)),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    label,
                    style: GoogleFonts.inter(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: AppColors.slate400,
                      letterSpacing: 0.3,
                    ),
                  ),
                ),
                if (onTap != null)
                  Icon(
                    Icons.chevron_right_rounded,
                    size: 18,
                    color: AppColors.whiteOverlay(0.35),
                  ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              value,
              style: GoogleFonts.inter(
                fontSize: 22,
                fontWeight: FontWeight.w800,
                color: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );

    if (onTap == null) return inner;

    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(14),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        splashColor: AppColors.primary.withValues(alpha: 0.18),
        highlightColor: AppColors.whiteOverlay(0.06),
        child: inner,
      ),
    );
  }
}

class _HomeHeader extends GetView<HomeController> {
  const _HomeHeader();

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final name = controller.greetingFirstName.value;
      final initial = name.isNotEmpty ? name[0].toUpperCase() : '?';
      return Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          ProfileAvatarButton(
            radius: 28,
            fallbackInitial: initial,
            onTap: openIdCard,
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Hi $name',
                  style: GoogleFonts.inter(
                    fontSize: 26,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                    letterSpacing: -0.5,
                    height: 1.15,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  AppConstants.appName,
                  style: GoogleFonts.inter(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: AppColors.slate400,
                    letterSpacing: 0.2,
                  ),
                ),
              ],
            ),
          ),
        ],
      );
    });
  }
}

/// Frosted card shell matching login / tab bar (translucent, teal-tinted edge).
class _HomeGlassCard extends StatelessWidget {
  const _HomeGlassCard({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            AppColors.whiteOverlay(0.18),
            AppColors.primary.withValues(alpha: 0.08),
            AppColors.whiteOverlay(0.04),
          ],
        ),
        boxShadow: [
          BoxShadow(
            color: AppColors.blackOverlay(0.35),
            blurRadius: 24,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(1.1),
        child: DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20.9),
            color: const Color(0xB30F172A),
            border: Border.all(color: AppColors.whiteOverlay(0.1)),
          ),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(18, 18, 18, 18),
            child: SizedBox(width: double.infinity, child: child),
          ),
        ),
      ),
    );
  }
}

class _HomeCurrentEventCard extends GetView<HomeController> {
  const _HomeCurrentEventCard();

  static String _timeLine(DateTime? d) {
    if (d == null) return '';
    final t =
        '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
    final ds =
        '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';
    return '$ds · $t';
  }

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final next = controller.home.value?.nextDiaryEvent;
      final officer = controller.officerFeatures;

      return Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: controller.goToDiary,
          borderRadius: BorderRadius.circular(22),
          splashColor: AppColors.primary.withValues(alpha: 0.12),
          highlightColor: AppColors.whiteOverlay(0.04),
          child: _HomeGlassCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(
                      Icons.event_note_rounded,
                      size: 20,
                      color: AppColors.primary.withValues(alpha: 0.95),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Next appointment',
                        style: GoogleFonts.inter(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                          letterSpacing: -0.2,
                        ),
                      ),
                    ),
                    Icon(
                      Icons.chevron_right_rounded,
                      size: 22,
                      color: AppColors.whiteOverlay(0.4),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                if (!officer)
                  Text(
                    'Sign in as a field officer to see your diary and timesheet.',
                    style: GoogleFonts.inter(
                      fontSize: 14,
                      height: 1.45,
                      color: AppColors.slate300,
                    ),
                  )
                else if (next == null)
                  Text(
                    'No upcoming visits in the next 7 days.',
                    style: GoogleFonts.inter(
                      fontSize: 14,
                      height: 1.45,
                      color: AppColors.slate300,
                    ),
                  )
                else ...[
                  Row(
                    children: [
                      if ((next.jobNumber ?? '').trim().isNotEmpty) ...[
                        Text(
                          next.jobNumber!.trim(),
                          style: GoogleFonts.inter(
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                            color: AppColors.primary,
                          ),
                        ),
                        const SizedBox(width: 8),
                      ],
                      if (next.isQuotationVisit) ...[
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
                        const SizedBox(width: 8),
                      ],
                      if (next.chargeType != null && next.chargeType != 'chargeable') ...[
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: next.chargeType == 'free'
                                ? const Color(0xFF10B981).withValues(alpha: 0.15)
                                : const Color(0xFFF59E0B).withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(6),
                            border: Border.all(
                              color: next.chargeType == 'free'
                                  ? const Color(0xFF10B981).withValues(alpha: 0.4)
                                  : const Color(0xFFF59E0B).withValues(alpha: 0.4),
                              width: 1,
                            ),
                          ),
                          child: Text(
                            next.chargeType == 'free' ? 'FREE OF CHARGE' : 'CALL BACK',
                            style: GoogleFonts.inter(
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 0.5,
                              color: next.chargeType == 'free'
                                  ? const Color(0xFF34D399)
                                  : const Color(0xFFFBBF24),
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                  if ((next.jobNumber ?? '').trim().isNotEmpty || next.isQuotationVisit || (next.chargeType != null && next.chargeType != 'chargeable'))
                    const SizedBox(height: 4),
                  Text(
                    next.title ?? 'Job',
                    style: GoogleFonts.inter(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                  if (next.description != null && next.description!.trim().isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Text(
                      next.description!.trim(),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.inter(
                        fontSize: 13,
                        color: AppColors.slate400,
                        height: 1.35,
                      ),
                    ),
                  ],
                  const SizedBox(height: 6),
                  Text(
                    _timeLine(next.startTime),
                    style: GoogleFonts.inter(
                      fontSize: 13,
                      color: AppColors.slate400,
                    ),
                  ),
                  if (next.displayContactName.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Text(
                      next.displayContactName,
                      style: GoogleFonts.inter(
                        fontSize: 14,
                        height: 1.45,
                        color: AppColors.slate300,
                      ),
                    ),
                  ],
                  if (next.location != null &&
                      next.location!.trim().isNotEmpty) ...[
                    const SizedBox(height: 4),
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
                            next.location!,
                            style: GoogleFonts.inter(
                              fontSize: 13,
                              height: 1.4,
                              color: AppColors.slate400,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
                const SizedBox(height: 16),
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    onPressed: controller.goToDiary,
                    style: TextButton.styleFrom(
                      foregroundColor: AppColors.primary,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 8,
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    icon: const Icon(Icons.menu_book_rounded, size: 18),
                    label: Text(
                      'Open diary',
                      style: GoogleFonts.inter(
                        fontWeight: FontWeight.w700,
                        fontSize: 14,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    });
  }
}

class _HomeTimesheetCard extends GetView<HomeController> {
  const _HomeTimesheetCard();

  @override
  Widget build(BuildContext context) {
    return _HomeGlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(
                    Icons.schedule_rounded,
                    size: 20,
                    color: AppColors.primary.withValues(alpha: 0.95),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'Timesheet',
                    style: GoogleFonts.inter(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                      letterSpacing: -0.2,
                    ),
                  ),
                ],
              ),
              Obx(() {
                if (!controller.officerFeatures) {
                  return const SizedBox.shrink();
                }
                return TextButton(
                  onPressed: controller.openTimesheetHistory,
                  style: TextButton.styleFrom(
                    foregroundColor: AppColors.slate300,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  child: Text(
                    'Timesheet history',
                    style: GoogleFonts.inter(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      decoration: TextDecoration.underline,
                      decorationColor: AppColors.slate400,
                    ),
                  ),
                );
              }),
            ],
          ),
          const SizedBox(height: 10),
          Obx(() {
            if (!controller.officerFeatures) return const SizedBox.shrink();
            final phase = controller.timesheetPhaseLabel.value;
            if (!controller.clockedIn.value || phase.isEmpty) {
              return Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: Text(
                  'Time is recorded from your diary: mark a visit as travelling, on site, or completed.',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.inter(
                    fontSize: 12,
                    height: 1.35,
                    color: AppColors.slate400,
                  ),
                ),
              );
            }
            final activeDiaryId =
                controller.home.value?.activeTimesheet?.diaryEventId;
            final where = activeDiaryId != null
                ? controller.diaryById(activeDiaryId)
                : null;
            final title = (where?.title ?? '').trim();
            final loc = (where?.location ?? '').trim();
            final whereLine = title.isNotEmpty && loc.isNotEmpty
                ? '$title · $loc'
                : (title.isNotEmpty ? title : (loc.isNotEmpty ? loc : ''));

            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  phase,
                  textAlign: TextAlign.center,
                  style: GoogleFonts.inter(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: AppColors.primary,
                  ),
                ),
                if (whereLine.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(
                    whereLine,
                    textAlign: TextAlign.center,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.inter(
                      fontSize: 12,
                      height: 1.35,
                      color: AppColors.slate300,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ],
            );
          }),
          const SizedBox(height: 14),
          Obx(() {
            final display = controller.clockedIn.value
                ? controller.formattedElapsed
                : '00 : 00 : 00';
            return Center(
              child: Text(
                display,
                style: GoogleFonts.inter(
                  fontSize: 36,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 2,
                  color: Colors.white,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            );
          }),
        ],
      ),
    );
  }
}

String _formatOfficeTaskDate(String? iso) {
  if (iso == null || iso.isEmpty) return '';
  try {
    final d = DateTime.parse(iso).toLocal();
    return '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year} · '
        '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
  } catch (_) {
    return '';
  }
}

class _HomeMyOfficeTasksOpenCard extends GetView<HomeController> {
  const _HomeMyOfficeTasksOpenCard();

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      if (!controller.officerFeatures) {
        return const SizedBox.shrink();
      }
      final tasks = controller.home.value?.myOfficeTasksOpen ?? const [];
      return _HomeGlassCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  Icons.task_alt_rounded,
                  size: 20,
                  color: AppColors.primary.withValues(alpha: 0.95),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'My job reminders',
                    style: GoogleFonts.inter(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                      letterSpacing: -0.2,
                    ),
                  ),
                ),
                TextButton(
                  onPressed: controller.goToOpenJobs,
                  style: TextButton.styleFrom(
                    foregroundColor: AppColors.slate300,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  child: Text(
                    'Open jobs',
                    style: GoogleFonts.inter(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      decoration: TextDecoration.underline,
                      decorationColor: AppColors.slate400,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              'Reminders assigned to you or mentioning you (@) from the job Reminders tab (web).',
              style: GoogleFonts.inter(
                fontSize: 12,
                height: 1.35,
                color: AppColors.slate500,
              ),
            ),
            const SizedBox(height: 12),
            if (tasks.isEmpty)
              Text(
                'No open reminders for you right now.',
                style: GoogleFonts.inter(
                  fontSize: 14,
                  height: 1.45,
                  color: AppColors.slate300,
                ),
              )
            else
              ...tasks.map((t) {
                return Padding(
                  padding: const EdgeInsets.only(bottom: 14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        t.jobTitle,
                        style: GoogleFonts.inter(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        t.description,
                        style: GoogleFonts.inter(
                          fontSize: 14,
                          height: 1.4,
                          color: AppColors.slate300,
                        ),
                      ),
                      if (t.reminderAt != null &&
                          t.reminderAt!.trim().isNotEmpty &&
                          _formatOfficeTaskDate(t.reminderAt).isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          'Reminder · ${_formatOfficeTaskDate(t.reminderAt)}',
                          style: GoogleFonts.inter(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: AppColors.primary,
                          ),
                        ),
                      ],
                      if (_formatOfficeTaskDate(t.createdAt).isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          'Added ${_formatOfficeTaskDate(t.createdAt)}',
                          style: GoogleFonts.inter(
                            fontSize: 12,
                            color: AppColors.slate500,
                          ),
                        ),
                      ],
                      const SizedBox(height: 4),
                      Text(
                        'From ${t.createdByName}',
                        style: GoogleFonts.inter(
                          fontSize: 12,
                          color: AppColors.slate500,
                        ),
                      ),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          TextButton(
                            onPressed: () => controller.openJobFromTask(t),
                            style: TextButton.styleFrom(
                              foregroundColor: AppColors.slate300,
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 4,
                              ),
                              minimumSize: Size.zero,
                              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                            ),
                            child: Text(
                              'View job',
                              style: GoogleFonts.inter(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                decoration: TextDecoration.underline,
                                decorationColor: AppColors.slate400,
                              ),
                            ),
                          ),
                          const Spacer(),
                          Obx(() {
                            final busy =
                                controller.updatingOfficeTaskId.value == t.id;
                            if (busy) {
                              return const SizedBox(
                                width: 24,
                                height: 24,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: AppColors.primary,
                                ),
                              );
                            }
                            return TextButton(
                              onPressed: () =>
                                  controller.completeMyOfficeTask(t),
                              style: TextButton.styleFrom(
                                foregroundColor: AppColors.primary,
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                  vertical: 8,
                                ),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12),
                                ),
                              ),
                              child: Text(
                                'Complete',
                                style: GoogleFonts.inter(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 14,
                                ),
                              ),
                            );
                          }),
                        ],
                      ),
                      if (t != tasks.last)
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Divider(
                            height: 1,
                            color: AppColors.whiteOverlay(0.08),
                          ),
                        ),
                    ],
                  ),
                );
              }),
          ],
        ),
      );
    });
  }
}

class _HomeMyOfficeTasksCompletedCard extends GetView<HomeController> {
  const _HomeMyOfficeTasksCompletedCard();

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      if (!controller.officerFeatures) {
        return const SizedBox.shrink();
      }
      final tasks = controller.home.value?.myOfficeTasksCompleted ?? const [];
      return _HomeGlassCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  Icons.check_circle_outline_rounded,
                  size: 20,
                  color: AppColors.primary.withValues(alpha: 0.95),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Completed office tasks',
                    style: GoogleFonts.inter(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                      letterSpacing: -0.2,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              'Recently finished tasks that were assigned to you.',
              style: GoogleFonts.inter(
                fontSize: 12,
                height: 1.35,
                color: AppColors.slate500,
              ),
            ),
            const SizedBox(height: 12),
            if (tasks.isEmpty)
              Text(
                'No completed office tasks yet.',
                style: GoogleFonts.inter(
                  fontSize: 14,
                  height: 1.45,
                  color: AppColors.slate300,
                ),
              )
            else
              ...tasks.map((t) {
                return Padding(
                  padding: const EdgeInsets.only(bottom: 14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        t.jobTitle,
                        style: GoogleFonts.inter(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        t.description,
                        style: GoogleFonts.inter(
                          fontSize: 14,
                          height: 1.4,
                          color: AppColors.slate300,
                        ),
                      ),
                      if (t.completedAt != null &&
                          _formatOfficeTaskDate(t.completedAt).isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          'Completed · ${_formatOfficeTaskDate(t.completedAt)}',
                          style: GoogleFonts.inter(
                            fontSize: 12,
                            color: AppColors.slate500,
                          ),
                        ),
                      ],
                      const SizedBox(height: 6),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: TextButton(
                          onPressed: () => controller.openJobFromTask(t),
                          style: TextButton.styleFrom(
                            foregroundColor: AppColors.slate300,
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 4,
                            ),
                            minimumSize: Size.zero,
                            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          ),
                          child: Text(
                            'View job',
                            style: GoogleFonts.inter(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              decoration: TextDecoration.underline,
                              decorationColor: AppColors.slate400,
                            ),
                          ),
                        ),
                      ),
                      if (t != tasks.last)
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Divider(
                            height: 1,
                            color: AppColors.whiteOverlay(0.08),
                          ),
                        ),
                    ],
                  ),
                );
              }),
          ],
        ),
      );
    });
  }
}

class _DiaryScopeChip extends StatelessWidget {
  const _DiaryScopeChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppColors.primary.withValues(alpha: 0.22) : AppColors.whiteOverlay(0.06),
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: selected ? AppColors.primary.withValues(alpha: 0.55) : AppColors.whiteOverlay(0.12),
            ),
          ),
          child: Text(
            label,
            style: GoogleFonts.inter(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: selected ? AppColors.primary : AppColors.slate400,
            ),
          ),
        ),
      ),
    );
  }
}

class _DiaryTab extends GetView<HomeController> {
  const _DiaryTab();

  static String _normVisitStatus(String? s) =>
      (s ?? '').trim().toLowerCase().replaceAll(RegExp(r'\s+'), '_');

  static bool _visitCancelled(String? s) {
    final t = _normVisitStatus(s);
    return t == 'cancelled' || t == 'aborted';
  }

  static String _displayVisitStatus(String? s) {
    final t = _normVisitStatus(s);
    if (t.isEmpty || t == 'no_status') return 'No status';
    return (s ?? '').trim();
  }

  static String _line(DiaryEventRow e) {
    final d = e.startTime;
    final t = d == null
        ? ''
        : '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')} '
              '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
    return t;
  }



  static String _monthNameAbbr(int month) {
    const names = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    if (month < 1 || month > 12) return '';
    return names[month - 1];
  }

  static String _emptyStateMessage(DiaryListScope scope, DiaryFilter filter) {
    final team = scope == DiaryListScope.team;
    switch (filter) {
      case DiaryFilter.today:
        return team ? 'No team diary entries today' : 'No diary entries today';
      case DiaryFilter.sevenDays:
        return team ? 'No team diary entries this week' : 'No diary entries this week';
      case DiaryFilter.month:
        return team ? 'No team diary entries this month' : 'No diary entries this month';
    }
  }

  Widget _buildDiaryEventCard(
    BuildContext context,
    DiaryEventRow e,
    bool ownVisit,
    bool allowFieldActions,
    bool showTeamFields,
  ) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () async {
          await Get.toNamed(
            AppRoutes.diaryEventDetail,
            arguments: <String, dynamic>{
              'diaryId': e.diaryId,
              'jobReportQuestionCount': e.jobReportQuestionCount,
            },
          );
          await controller.loadDiaryEvents();
        },
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
                              if ((e.jobNumber ?? '').trim().isNotEmpty) ...[
                                Text(
                                  e.jobNumber!.trim(),
                                  style: GoogleFonts.inter(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w800,
                                    color: AppColors.primary,
                                  ),
                                ),
                                const SizedBox(width: 8),
                              ],
                              if (e.isQuotationVisit) ...[
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
                          if ((e.jobNumber ?? '').trim().isNotEmpty || e.isQuotationVisit)
                            const SizedBox(height: 4),
                          Text(
                            e.title ?? 'Job',
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
                        _displayVisitStatus(e.eventStatus),
                        style: GoogleFonts.inter(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: AppColors.primary,
                        ),
                      ),
                    ),
                  ],
                ),
                if (e.description != null && e.description!.trim().isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(
                    e.description!.trim(),
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
                        _line(e),
                        style: GoogleFonts.inter(
                          fontSize: 13,
                          color: AppColors.slate300,
                        ),
                      ),
                    ),
                  ],
                ),
                if (showTeamFields &&
                    (e.officerFullName ?? '').trim().isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Icon(
                        Icons.badge_outlined,
                        size: 16,
                        color: AppColors.slate400,
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          'Officer: ${e.officerFullName!.trim()}',
                          style: GoogleFonts.inter(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: AppColors.primary,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
                if (e.displayContactName.isNotEmpty) ...[
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
                          e.displayContactName,
                          style: GoogleFonts.inter(
                            fontSize: 13,
                            color: AppColors.slate300,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
                if (e.location != null &&
                    e.location!.trim().isNotEmpty) ...[
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
                          e.location!,
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
                if (_visitCancelled(e.eventStatus) &&
                    e.abortReason != null &&
                    e.abortReason!.trim().isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(
                        Icons.error_outline_rounded,
                        size: 16,
                        color: Colors.red.shade300,
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          'Reason: ${e.abortReason!.trim()}',
                          style: GoogleFonts.inter(
                            fontSize: 12,
                            height: 1.35,
                            color: Colors.red.shade300,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Text(
                        ownVisit
                            ? 'Tap card for visit details, site contact, and to mark arrived.'
                            : 'Tap card to view visit details (read-only).',
                        style: GoogleFonts.inter(
                          fontSize: 11,
                          height: 1.35,
                          color: AppColors.slate500,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Row(
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
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Diary',
                style: GoogleFonts.inter(
                  fontSize: 28,
                  fontWeight: FontWeight.w800,
                  color: Colors.white,
                  letterSpacing: -0.6,
                ),
              ),
              const SizedBox(height: 8),
              Obx(() {
                final team = controller.diaryListScope.value == DiaryListScope.team;
                return Text(
                  team ? 'All team visits · ongoing and upcoming' : 'Ongoing and upcoming',
                  style: GoogleFonts.inter(
                    fontSize: 14,
                    color: AppColors.slate400,
                  ),
                );
              }),
              const SizedBox(height: 10),
              Obx(() {
                if (!controller.showDiaryScopeTabs) return const SizedBox.shrink();
                final selected = controller.diaryListScope.value;
                return Row(
                  children: [
                    Expanded(
                      child: _DiaryScopeChip(
                        label: 'Mine',
                        selected: selected == DiaryListScope.mine,
                        onTap: () => controller.setDiaryListScope(DiaryListScope.mine),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _DiaryScopeChip(
                        label: 'All team',
                        selected: selected == DiaryListScope.team,
                        onTap: () => controller.setDiaryListScope(DiaryListScope.team),
                      ),
                    ),
                  ],
                );
              }),
              Obx(() {
                return Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: _DiaryViewModeToggle(
                    mode: controller.diaryViewMode.value,
                    onChanged: (mode) => controller.setDiaryViewMode(mode),
                  ),
                );
              }),
              Obx(() {
                final isList = controller.diaryViewMode.value == DiaryViewMode.list;
                if (!isList) return const SizedBox.shrink();
                return Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: _DiaryFilterBar(
                    selectedFilter: controller.diaryFilter.value,
                    onChanged: (filter) => controller.setDiaryFilter(filter),
                  ),
                );
              }),
              const SizedBox(height: 10),
              const _OfflineSyncBanner(),
            ],
          ),
        ),
        const SizedBox(height: 16),
        Expanded(
          child: Obx(() {
            if (!controller.canUseDiaryTab) {
              return Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text(
                    'Diary needs a linked field profile (Mine) or jobs/scheduling access (All team). Ask your administrator in Team & access.',
                    textAlign: TextAlign.center,
                    style: GoogleFonts.inter(
                      fontSize: 15,
                      color: AppColors.slate400,
                    ),
                  ),
                ),
              );
            }

            final isCalendar = controller.diaryViewMode.value == DiaryViewMode.calendar;

            if (isCalendar) {
              if (controller.diaryLoading.value) {
                return const Center(
                  child: CircularProgressIndicator(color: AppColors.primary),
                );
              }

              final selectedDate = controller.calendarSelectedDate.value;
              final dayEvents = controller.diaryEvents.where((e) {
                final start = e.startTime;
                if (start == null) return false;
                return start.year == selectedDate.year &&
                    start.month == selectedDate.month &&
                    start.day == selectedDate.day;
              }).toList();
              dayEvents.sort((a, b) {
                final tA = a.startTime;
                final tB = b.startTime;
                if (tA == null) return 1;
                if (tB == null) return -1;
                return tA.compareTo(tB);
              });

              return SingleChildScrollView(
                physics: const BouncingScrollPhysics(),
                padding: const EdgeInsets.only(bottom: 24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: _DiaryCalendarView(
                        focusedMonth: controller.calendarFocusedMonth.value,
                        selectedDate: selectedDate,
                        events: controller.diaryEvents,
                        onDateSelected: (date) => controller.selectCalendarDate(date),
                        onMonthChanged: (delta) => controller.changeCalendarMonth(delta),
                        onJumpToToday: () {
                          controller.selectCalendarDate(DateTime.now());
                        },
                      ),
                    ),
                    const SizedBox(height: 16),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: Text(
                        '${selectedDate.day} ${_monthNameAbbr(selectedDate.month)} ${selectedDate.year} · ${dayEvents.length} visit${dayEvents.length == 1 ? '' : 's'}',
                        style: GoogleFonts.inter(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: AppColors.slate300,
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    if (dayEvents.isEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 32),
                        child: Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(
                                Icons.calendar_month_rounded,
                                size: 48,
                                color: AppColors.whiteOverlay(0.15),
                              ),
                              const SizedBox(height: 12),
                              Text(
                                'No visits scheduled',
                                style: GoogleFonts.inter(
                                  fontSize: 14,
                                  color: AppColors.slate500,
                                ),
                              ),
                            ],
                          ),
                        ),
                      )
                    else
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 24),
                        child: Column(
                          children: dayEvents.map((e) {
                            final showTeamFields = controller.diaryListScope.value == DiaryListScope.team;
                            final allowFieldActions = !showTeamFields;
                            final ownVisit = allowFieldActions || controller.isOwnDiaryVisit(e);
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 12),
                              child: _buildDiaryEventCard(context, e, ownVisit, allowFieldActions, showTeamFields),
                            );
                          }).toList(),
                        ),
                      ),
                  ],
                ),
              );
            } else {
              if (controller.diaryLoading.value) {
                return const Center(
                  child: CircularProgressIndicator(color: AppColors.primary),
                );
              }
              if (controller.diaryEvents.isEmpty) {
                return Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.calendar_month_rounded,
                        size: 64,
                        color: AppColors.whiteOverlay(0.25),
                      ),
                      const SizedBox(height: 16),
                      Text(
                        _emptyStateMessage(controller.diaryListScope.value, controller.diaryFilter.value),
                        style: GoogleFonts.inter(
                          fontSize: 15,
                          color: AppColors.slate400,
                        ),
                      ),
                    ],
                  ),
                );
              }
              final showTeamFields = controller.diaryListScope.value == DiaryListScope.team;
              final allowFieldActions = !showTeamFields;
              return ListView.builder(
                padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
                physics: const BouncingScrollPhysics(),
                itemCount: controller.diaryEvents.length,
                itemBuilder: (context, i) {
                  final e = controller.diaryEvents[i];
                  final ownVisit = allowFieldActions || controller.isOwnDiaryVisit(e);
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: _buildDiaryEventCard(context, e, ownVisit, allowFieldActions, showTeamFields),
                  );
                },
              );
            }
          }),
        ),
      ],
    );
  }
}

class _DiaryViewModeToggle extends StatelessWidget {
  const _DiaryViewModeToggle({
    required this.mode,
    required this.onChanged,
  });

  final DiaryViewMode mode;
  final ValueChanged<DiaryViewMode> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 42,
      decoration: BoxDecoration(
        color: AppColors.whiteOverlay(0.04),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.whiteOverlay(0.08)),
      ),
      padding: const EdgeInsets.all(3),
      child: Row(
        children: [
          Expanded(
            child: GestureDetector(
              onTap: () => onChanged(DiaryViewMode.calendar),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                decoration: BoxDecoration(
                  color: mode == DiaryViewMode.calendar
                      ? const Color(0xFF1E293B)
                      : Colors.transparent,
                  borderRadius: BorderRadius.circular(9),
                ),
                alignment: Alignment.center,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      Icons.calendar_month_rounded,
                      size: 16,
                      color: mode == DiaryViewMode.calendar
                          ? Colors.white
                          : AppColors.slate400,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'Calendar',
                      style: GoogleFonts.inter(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: mode == DiaryViewMode.calendar
                            ? Colors.white
                            : AppColors.slate400,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          Expanded(
            child: GestureDetector(
              onTap: () => onChanged(DiaryViewMode.list),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                decoration: BoxDecoration(
                  color: mode == DiaryViewMode.list
                      ? const Color(0xFF1E293B)
                      : Colors.transparent,
                  borderRadius: BorderRadius.circular(9),
                ),
                alignment: Alignment.center,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      Icons.list_rounded,
                      size: 16,
                      color: mode == DiaryViewMode.list
                          ? Colors.white
                          : AppColors.slate400,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'List',
                      style: GoogleFonts.inter(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: mode == DiaryViewMode.list
                            ? Colors.white
                            : AppColors.slate400,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DiaryFilterBar extends StatelessWidget {
  const _DiaryFilterBar({
    required this.selectedFilter,
    required this.onChanged,
  });

  final DiaryFilter selectedFilter;
  final ValueChanged<DiaryFilter> onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        _buildChip('Today', DiaryFilter.today),
        const SizedBox(width: 8),
        _buildChip('7 Days', DiaryFilter.sevenDays),
        const SizedBox(width: 8),
        _buildChip('This Month', DiaryFilter.month),
      ],
    );
  }

  Widget _buildChip(String label, DiaryFilter filter) {
    final active = selectedFilter == filter;
    return Expanded(
      child: GestureDetector(
        onTap: () => onChanged(filter),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(vertical: 8),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: active
                ? AppColors.primary.withValues(alpha: 0.15)
                : AppColors.whiteOverlay(0.04),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: active
                  ? AppColors.primary.withValues(alpha: 0.45)
                  : AppColors.whiteOverlay(0.08),
            ),
          ),
          child: Text(
            label,
            style: GoogleFonts.inter(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: active ? AppColors.primary : AppColors.slate400,
            ),
          ),
        ),
      ),
    );
  }
}

class _DiaryCalendarView extends StatelessWidget {
  const _DiaryCalendarView({
    required this.focusedMonth,
    required this.selectedDate,
    required this.events,
    required this.onDateSelected,
    required this.onMonthChanged,
    required this.onJumpToToday,
  });

  final DateTime focusedMonth;
  final DateTime selectedDate;
  final List<DiaryEventRow> events;
  final ValueChanged<DateTime> onDateSelected;
  final ValueChanged<int> onMonthChanged;
  final VoidCallback onJumpToToday;

  @override
  Widget build(BuildContext context) {
    final weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    final firstDay = DateTime(focusedMonth.year, focusedMonth.month, 1);
    final firstWeekday = firstDay.weekday;
    final leadingDays = firstWeekday - 1;
    final gridStart = firstDay.subtract(Duration(days: leadingDays));
    final gridDates = List.generate(42, (i) => gridStart.add(Duration(days: i)));

    final monthFormatter = _monthName(focusedMonth.month);

    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            _MonthNavButton(
              icon: Icons.chevron_left_rounded,
              onTap: () => onMonthChanged(-1),
            ),
            Column(
              children: [
                Text(
                  '$monthFormatter ${focusedMonth.year}',
                  style: GoogleFonts.inter(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                    letterSpacing: -0.3,
                  ),
                ),
                const SizedBox(height: 2),
                GestureDetector(
                  onTap: onJumpToToday,
                  child: Text(
                    'Today',
                    style: GoogleFonts.inter(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: AppColors.primary,
                    ),
                  ),
                ),
              ],
            ),
            _MonthNavButton(
              icon: Icons.chevron_right_rounded,
              onTap: () => onMonthChanged(1),
            ),
          ],
        ),
        const SizedBox(height: 16),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: weekdays.map((day) {
            return Container(
              width: 40,
              alignment: Alignment.center,
              child: Text(
                day,
                style: GoogleFonts.inter(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: AppColors.slate400,
                ),
              ),
            );
          }).toList(),
        ),
        const SizedBox(height: 8),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: 42,
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 7,
            mainAxisSpacing: 8,
            crossAxisSpacing: 8,
            childAspectRatio: 1,
          ),
          itemBuilder: (context, index) {
            final date = gridDates[index];
            final isCurrentMonth = date.month == focusedMonth.month;
            final isSelected = date.year == selectedDate.year &&
                date.month == selectedDate.month &&
                date.day == selectedDate.day;
            final isToday = _isToday(date);
            final hasEvents = _hasEventsOn(date);

            return _CalendarDayCell(
              date: date,
              isCurrentMonth: isCurrentMonth,
              isSelected: isSelected,
              isToday: isToday,
              hasEvents: hasEvents,
              onTap: () => onDateSelected(date),
            );
          },
        ),
      ],
    );
  }

  String _monthName(int month) {
    const names = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    if (month < 1 || month > 12) return '';
    return names[month - 1];
  }

  bool _isToday(DateTime date) {
    final now = DateTime.now();
    return date.year == now.year && date.month == now.month && date.day == now.day;
  }

  bool _hasEventsOn(DateTime date) {
    return events.any((e) {
      final start = e.startTime;
      if (start == null) return false;
      return start.year == date.year && start.month == date.month && start.day == date.day;
    });
  }
}

class _CalendarDayCell extends StatelessWidget {
  const _CalendarDayCell({
    required this.date,
    required this.isCurrentMonth,
    required this.isSelected,
    required this.isToday,
    required this.hasEvents,
    required this.onTap,
  });

  final DateTime date;
  final bool isCurrentMonth;
  final bool isSelected;
  final bool isToday;
  final bool hasEvents;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    Color textColor;
    if (isSelected) {
      textColor = AppColors.primary;
    } else if (isToday) {
      textColor = AppColors.primary;
    } else if (isCurrentMonth) {
      textColor = Colors.white;
    } else {
      textColor = AppColors.slate500;
    }

    BoxDecoration? decoration;
    if (isSelected) {
      decoration = BoxDecoration(
        color: AppColors.primary.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: AppColors.primary,
          width: 2,
        ),
      );
    } else if (isToday) {
      decoration = BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: AppColors.primary.withValues(alpha: 0.4),
          width: 1,
        ),
      );
    }

    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        decoration: decoration,
        child: Stack(
          alignment: Alignment.center,
          children: [
            Text(
              '${date.day}',
              style: GoogleFonts.inter(
                fontSize: 14,
                fontWeight: (isSelected || isToday) ? FontWeight.w800 : FontWeight.w600,
                color: textColor,
              ),
            ),
            if (hasEvents)
              Positioned(
                bottom: 4,
                child: Container(
                  width: 4,
                  height: 4,
                  decoration: BoxDecoration(
                    color: isSelected ? AppColors.primary : AppColors.primary.withValues(alpha: 0.6),
                    shape: BoxShape.circle,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _MonthNavButton extends StatelessWidget {
  const _MonthNavButton({
    required this.icon,
    required this.onTap,
  });

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.whiteOverlay(0.04),
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          width: 38,
          height: 38,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: AppColors.whiteOverlay(0.08)),
          ),
          child: Icon(
            icon,
            color: Colors.white,
            size: 20,
          ),
        ),
      ),
    );
  }
}

class _ProfileTab extends GetView<HomeController> {
  const _ProfileTab();

  Future<void> _confirmLogout() async {
    final ok = await Get.dialog<bool>(
      AlertDialog(
        backgroundColor: const Color(0xFF0f172a),
        title: Text(
          'Log out?',
          style: GoogleFonts.inter(
            fontWeight: FontWeight.w800,
            color: Colors.white,
          ),
        ),
        content: Text(
          'Any pending offline changes will be cleared on logout.',
          style: GoogleFonts.inter(
            color: AppColors.slate300,
            height: 1.35,
            fontSize: 13,
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Get.back(result: false),
            child: Text(
              'Cancel',
              style: GoogleFonts.inter(color: AppColors.slate300),
            ),
          ),
          TextButton(
            onPressed: () => Get.back(result: true),
            child: Text(
              'Log out',
              style: GoogleFonts.inter(
                color: Colors.red.shade300,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      ),
    );
    if (ok == true) {
      await Get.find<StorageService>().clearSession();
      Get.offAllNamed(AppRoutes.login);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      physics: const BouncingScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
      child: Obx(() {
        final h = controller.home.value;
        final p = h?.profile;
        final name = p?.fullName ?? controller.greetingFirstName.value;
        final initial = name.isNotEmpty ? name[0].toUpperCase() : '?';
        final statusRaw = (p?.state ?? '').trim();
        final status = statusRaw.isEmpty ? '—' : statusRaw;

        final online =
            Get.isRegistered<ConnectivityService>() &&
            Get.find<ConnectivityService>().isOnline.value;
        final q = Get.isRegistered<OfflineQueueService>()
            ? Get.find<OfflineQueueService>()
            : null;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Profile',
              style: GoogleFonts.inter(
                fontSize: 28,
                fontWeight: FontWeight.w800,
                color: Colors.white,
                letterSpacing: -0.6,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Account',
              style: GoogleFonts.inter(fontSize: 14, color: AppColors.slate400),
            ),
            const SizedBox(height: 14),
            _HomeGlassCard(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Obx(
                    () => ProfileAvatarButton(
                      key: ValueKey(controller.profileRevision.value),
                      radius: 34,
                      fallbackInitial: initial,
                      onTap: openIdCard,
                      showEditHint: true,
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          p?.fullName ?? name,
                          style: GoogleFonts.inter(
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                            color: Colors.white,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 4),
                        Text(
                          (h?.email ?? p?.email ?? '').trim(),
                          style: GoogleFonts.inter(
                            fontSize: 13,
                            color: AppColors.slate400,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 10),
                  _ProfileCardEditButton(
                    onPressed: () async {
                      final ok = await Get.toNamed(AppRoutes.profileEdit);
                      if (ok == true) {
                        await controller.refreshHome();
                        controller.bumpProfileRevision();
                      }
                    },
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            _HomeGlassCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(
                        Icons.badge_outlined,
                        size: 20,
                        color: AppColors.primary.withValues(alpha: 0.95),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        'Account',
                        style: GoogleFonts.inter(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: Colors.white,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  if (p != null) ...[
                    _ProfileLine(label: 'Account status', value: status),
                    const SizedBox(height: 12),
                    _ProfileLine(label: 'Officer ID', value: '${p.id}'),
                    if (p.rolePosition != null &&
                        p.rolePosition!.trim().isNotEmpty) ...[
                      const SizedBox(height: 12),
                      _ProfileLine(label: 'Role', value: p.rolePosition!),
                    ],
                    if (p.department != null &&
                        p.department!.trim().isNotEmpty) ...[
                      const SizedBox(height: 12),
                      _ProfileLine(label: 'Department', value: p.department!),
                    ],
                    if (p.phone != null && p.phone!.trim().isNotEmpty) ...[
                      const SizedBox(height: 12),
                      _ProfileLine(label: 'Phone', value: p.phone!),
                    ],
                  ] else ...[
                    Text(
                      'Profile details will appear after the next sync.',
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
            Obx(
              () => _ProfileContactSummary(
                key: ValueKey('contact-${controller.profileRevision.value}'),
              ),
            ),
            const SizedBox(height: 14),
            _HomeGlassCard(
              child: Obx(() {
                final pending = q?.pendingCount.value ?? 0;
                final syncing = q?.isProcessingQueue.value ?? false;
                final err = q?.queueErrorMessage.value;
                final label = online ? 'Online' : 'Offline';
                final icon = online
                    ? Icons.wifi_rounded
                    : Icons.wifi_off_rounded;
                final iconColor = online
                    ? AppColors.primary
                    : Colors.amber.shade200;
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(icon, size: 20, color: iconColor),
                        const SizedBox(width: 8),
                        Text(
                          'Offline & sync',
                          style: GoogleFonts.inter(
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                            color: Colors.white,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    _ProfileLine(label: 'Connection', value: label),
                    const SizedBox(height: 12),
                    _ProfileLine(label: 'Pending changes', value: '$pending'),
                    if (err != null && err.trim().isNotEmpty) ...[
                      const SizedBox(height: 12),
                      Text(
                        err,
                        style: GoogleFonts.inter(
                          fontSize: 12,
                          height: 1.35,
                          color: Colors.red.shade300,
                        ),
                      ),
                    ],
                    if (q != null) ...[
                      const SizedBox(height: 12),
                      Align(
                        alignment: Alignment.centerRight,
                        child: FilledButton.icon(
                          onPressed: (!online || syncing || pending == 0)
                              ? null
                              : () {
                                  q.retrySync();
                                },
                          style: FilledButton.styleFrom(
                            backgroundColor: AppColors.primary,
                            disabledBackgroundColor: AppColors.whiteOverlay(
                              0.06,
                            ),
                            padding: const EdgeInsets.symmetric(
                              horizontal: 14,
                              vertical: 10,
                            ),
                          ),
                          icon: syncing
                              ? const SizedBox(
                                  width: 16,
                                  height: 16,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                              : const Icon(Icons.sync_rounded, size: 18),
                          label: Text(
                            syncing ? 'Syncing…' : 'Sync now',
                            style: GoogleFonts.inter(
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ],
                );
              }),
            ),
            const SizedBox(height: 14),
            _HomeGlassCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(
                        Icons.info_outline_rounded,
                        size: 20,
                        color: AppColors.primary.withValues(alpha: 0.95),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        'App',
                        style: GoogleFonts.inter(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: Colors.white,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  Obx(() {
                    final v = controller.appVersionLabel.value.trim();
                    return _ProfileLine(
                      label: 'Version',
                      value: v.isEmpty ? '—' : v,
                    );
                  }),
                ],
              ),
            ),
            const SizedBox(height: 14),
            _HomeGlassCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(
                        Icons.policy_outlined,
                        size: 20,
                        color: AppColors.primary.withValues(alpha: 0.95),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        'Legal & privacy',
                        style: GoogleFonts.inter(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: Colors.white,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    dense: true,
                    leading: const Icon(
                      Icons.privacy_tip_outlined,
                      color: AppColors.slate300,
                      size: 20,
                    ),
                    title: Text(
                      'Privacy policy',
                      style: GoogleFonts.inter(
                        color: AppColors.slate300,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    trailing: const Icon(Icons.chevron_right_rounded, size: 22, color: AppColors.slate500),
                    onTap: () => Get.to<void>(
                      () => const LegalDocumentView(
                        title: 'Privacy policy',
                        body: AppConstants.privacyPolicyInAppText,
                      ),
                    ),
                  ),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    dense: true,
                    leading: const Icon(
                      Icons.description_outlined,
                      color: AppColors.slate300,
                      size: 20,
                    ),
                    title: Text(
                      'Terms of service',
                      style: GoogleFonts.inter(
                        color: AppColors.slate300,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    trailing: const Icon(Icons.chevron_right_rounded, size: 22, color: AppColors.slate500),
                    onTap: () => Get.to<void>(
                      () => const LegalDocumentView(
                        title: 'Terms of service',
                        body: AppConstants.termsOfServiceInAppText,
                      ),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Your offline submissions (notes/photos/videos) are stored on this device until they sync.',
                    style: GoogleFonts.inter(
                      fontSize: 12,
                      height: 1.35,
                      color: AppColors.slate500,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            _HomeGlassCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Logout',
                    style: GoogleFonts.inter(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 10),
                  FilledButton(
                    onPressed: _confirmLogout,
                    style: FilledButton.styleFrom(
                      backgroundColor: Colors.red.shade700.withValues(
                        alpha: 0.85,
                      ),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                    child: Text(
                      'Log out',
                      style: GoogleFonts.inter(fontWeight: FontWeight.w900),
                    ),
                  ),
                ],
              ),
            ),
            if (h != null && !h.officerFeatures) ...[
              const SizedBox(height: 24),
              Text(
                'Signed in as ${h.role}. Mobile diary and timesheet are for field officers.',
                style: GoogleFonts.inter(
                  fontSize: 14,
                  height: 1.45,
                  color: AppColors.slate400,
                ),
              ),
            ],
          ],
        );
      }),
    );
  }
}

/// Teal ring edit control on the profile identity card.
class _ProfileCardEditButton extends StatelessWidget {
  const _ProfileCardEditButton({required this.onPressed});

  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'Edit profile',
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onPressed,
          customBorder: const CircleBorder(),
          child: Ink(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  AppColors.primary.withValues(alpha: 0.28),
                  AppColors.whiteOverlay(0.06),
                ],
              ),
              border: Border.all(
                color: AppColors.primary.withValues(alpha: 0.65),
                width: 1.5,
              ),
              boxShadow: [
                BoxShadow(
                  color: AppColors.primary.withValues(alpha: 0.22),
                  blurRadius: 14,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  Icons.edit_rounded,
                  size: 20,
                  color: AppColors.primary,
                ),
                const SizedBox(height: 1),
                Text(
                  'Edit',
                  style: GoogleFonts.inter(
                    fontSize: 9,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.3,
                    color: AppColors.primary,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ProfileContactSummary extends StatelessWidget {
  const _ProfileContactSummary({super.key});

  @override
  Widget build(BuildContext context) {
    if (!Get.isRegistered<UserProfileCache>()) {
      return const SizedBox.shrink();
    }
    final cache = Get.find<UserProfileCache>();

    return Obx(() {
      final p = cache.profile.value;
      final mobile = p?.mobilePhone?.trim() ?? p?.phone?.trim();
      final landline = p?.landlinePhone?.trim();
      final email = p?.email?.trim();
      final address = p?.profileAddress?.trim();
      final kinName = p?.nextOfKinName?.trim();
      final kinPhone = p?.nextOfKinPhone?.trim();

      final hasContent = [
        mobile,
        landline,
        email,
        address,
        kinName,
        kinPhone,
      ].any((v) => v != null && v.isNotEmpty);

      if (!hasContent) return const SizedBox.shrink();

      return Column(
        children: [
          const SizedBox(height: 14),
          _HomeGlassCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(
                      Icons.person_outline_rounded,
                      size: 20,
                      color: AppColors.primary.withValues(alpha: 0.95),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'Your details',
                      style: GoogleFonts.inter(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                if (mobile != null && mobile.isNotEmpty)
                  _ProfileLine(label: 'Mobile', value: mobile),
                if (landline != null && landline.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  _ProfileLine(label: 'Landline', value: landline),
                ],
                if (email != null && email.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  _ProfileLine(label: 'Email', value: email),
                ],
                if (address != null && address.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  _ProfileLine(label: 'Address', value: address),
                ],
                if (kinName != null && kinName.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  _ProfileLine(label: 'Next of kin', value: kinName),
                ],
                if (kinPhone != null && kinPhone.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  _ProfileLine(label: 'Kin contact', value: kinPhone),
                ],
              ],
            ),
          ),
        ],
      );
    });
  }
}

class _ProfileLine extends StatelessWidget {
  const _ProfileLine({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label.toUpperCase(),
          style: GoogleFonts.inter(
            fontSize: 10,
            fontWeight: FontWeight.w600,
            letterSpacing: 1.1,
            color: AppColors.slate500,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          value,
          style: GoogleFonts.inter(fontSize: 15, color: AppColors.slate300),
        ),
      ],
    );
  }
}
