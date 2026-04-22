import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:glass_kit/glass_kit.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../app/routes/app_routes.dart';
import '../../../core/values/app_colors.dart';
import '../../../core/values/app_constants.dart';
import '../../../data/models/diary_event_row.dart';
import '../../diary_event/diary_event_detail_controller.dart';
import '../controllers/home_controller.dart';

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
                child: Obx(
                  () => IndexedStack(
                    index: controller.navIndex.value,
                    children: const [_HomeTab(), _DiaryTab(), _ProfileTab()],
                  ),
                ),
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

  static const int _tabCount = 3;

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final idx = controller.navIndex.value;
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
                final segment = w / _tabCount;
                return Stack(
                  clipBehavior: Clip.hardEdge,
                  alignment: Alignment.center,
                  children: [
                    AnimatedPositioned(
                      duration: const Duration(milliseconds: 260),
                      curve: Curves.easeOutCubic,
                      left: idx * segment,
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
                        _NavItem(
                          selected: idx == 2,
                          icon: Icons.person_rounded,
                          iconMuted: Icons.person_outline_rounded,
                          label: 'Profile',
                          onTap: () => controller.navIndex.value = 2,
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
                ]),
              ),
            ),
          ],
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
          CircleAvatar(
            radius: 28,
            backgroundColor: AppColors.whiteOverlay(0.12),
            child: Text(
              initial,
              style: GoogleFonts.inter(
                fontSize: 20,
                fontWeight: FontWeight.w700,
                color: Colors.white,
              ),
            ),
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
            child: child,
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
                  Text(
                    next.title ?? 'Job',
                    style: GoogleFonts.inter(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
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
            return Text(
              phase,
              textAlign: TextAlign.center,
              style: GoogleFonts.inter(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: AppColors.primary,
              ),
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

class _DiaryTab extends GetView<HomeController> {
  const _DiaryTab();

  static String _normVisitStatus(String? s) =>
      (s ?? '').trim().toLowerCase().replaceAll(RegExp(r'\s+'), '_');

  static bool _visitCompleted(String? s) => _normVisitStatus(s) == 'completed';

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
              Text(
                'Next 7 days',
                style: GoogleFonts.inter(
                  fontSize: 14,
                  color: AppColors.slate400,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        Expanded(
          child: Obx(() {
            if (!controller.officerFeatures) {
              return Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text(
                    'Diary is available for field officer accounts.',
                    textAlign: TextAlign.center,
                    style: GoogleFonts.inter(
                      fontSize: 15,
                      color: AppColors.slate400,
                    ),
                  ),
                ),
              );
            }
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
                      'No diary entries this week',
                      style: GoogleFonts.inter(
                        fontSize: 15,
                        color: AppColors.slate400,
                      ),
                    ),
                  ],
                ),
              );
            }
            return ListView.builder(
              padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
              physics: const BouncingScrollPhysics(),
              itemCount: controller.diaryEvents.length,
              itemBuilder: (context, i) {
                final e = controller.diaryEvents[i];
                return Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Material(
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
                        await controller.loadDiaryWeek();
                      },
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
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Expanded(
                                    child: Text(
                                      e.title ?? 'Job',
                                      style: GoogleFonts.inter(
                                        fontSize: 15,
                                        fontWeight: FontWeight.w700,
                                        color: Colors.white,
                                      ),
                                    ),
                                  ),
                                  Icon(
                                    Icons.chevron_right_rounded,
                                    color: AppColors.slate400,
                                    size: 22,
                                  ),
                                ],
                              ),
                              const SizedBox(height: 6),
                              Text(
                                _line(e),
                                style: GoogleFonts.inter(
                                  fontSize: 13,
                                  color: AppColors.slate400,
                                ),
                              ),
                              if (e.displayContactName.isNotEmpty) ...[
                                const SizedBox(height: 6),
                                Text(
                                  e.displayContactName,
                                  style: GoogleFonts.inter(
                                    fontSize: 14,
                                    color: AppColors.slate300,
                                  ),
                                ),
                              ],
                              if (e.location != null &&
                                  e.location!.trim().isNotEmpty) ...[
                                const SizedBox(height: 4),
                                Text(
                                  e.location!,
                                  style: GoogleFonts.inter(
                                    fontSize: 13,
                                    color: AppColors.slate500,
                                  ),
                                ),
                              ],
                              const SizedBox(height: 10),
                              Text(
                                'Status: ${_displayVisitStatus(e.eventStatus)}',
                                style: GoogleFonts.inter(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.slate400,
                                ),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                'Tap card for visit details, site contact, and to mark arrived.',
                                style: GoogleFonts.inter(
                                  fontSize: 11,
                                  height: 1.35,
                                  color: AppColors.slate500,
                                ),
                              ),
                              if (!_visitCompleted(e.eventStatus) &&
                                  !_visitCancelled(e.eventStatus)) ...[
                                const SizedBox(height: 10),
                                Obx(() {
                                  final busy =
                                      controller.updatingDiaryEventId.value ==
                                      e.diaryId;
                                  final btnStyle = OutlinedButton.styleFrom(
                                    foregroundColor: Colors.white,
                                    side: BorderSide(
                                      color: AppColors.whiteOverlay(0.25),
                                    ),
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 12,
                                      vertical: 8,
                                    ),
                                    minimumSize: Size.zero,
                                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                                  );
                                  if (busy) {
                                    return const Padding(
                                      padding: EdgeInsets.symmetric(vertical: 8),
                                      child: Center(
                                        child: SizedBox(
                                          width: 22,
                                          height: 22,
                                          child: CircularProgressIndicator(
                                            strokeWidth: 2,
                                            color: AppColors.primary,
                                          ),
                                        ),
                                      ),
                                    );
                                  }
                                  final phase = visitPhaseFromStatus(
                                    e.eventStatus,
                                  );
                                  if (phase == DiaryVisitUiPhase.travelling ||
                                      phase == DiaryVisitUiPhase.onSite ||
                                      phase == DiaryVisitUiPhase.completed) {
                                    return const SizedBox.shrink();
                                  }
                                  return Align(
                                    alignment: Alignment.centerLeft,
                                    child: OutlinedButton(
                                      style: btnStyle,
                                      onPressed: () => controller
                                          .updateDiaryVisitStatus(
                                            e.diaryId,
                                            'travelling_to_site',
                                          ),
                                      child: Text(
                                        'Travelling to site',
                                        style: GoogleFonts.inter(
                                          fontSize: 12,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ),
                                  );
                                }),
                              ],
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                );
              },
            );
          }),
        ),
      ],
    );
  }
}

class _ProfileTab extends GetView<HomeController> {
  const _ProfileTab();

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
            const SizedBox(height: 32),
            Row(
              children: [
                CircleAvatar(
                  radius: 40,
                  backgroundColor: AppColors.whiteOverlay(0.12),
                  child: Text(
                    initial,
                    style: GoogleFonts.inter(
                      fontSize: 28,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        p?.fullName ?? name,
                        style: GoogleFonts.inter(
                          fontSize: 20,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        h?.email ?? p?.email ?? '',
                        style: GoogleFonts.inter(
                          fontSize: 14,
                          color: AppColors.slate400,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            if (p != null) ...[
              const SizedBox(height: 24),
              if (p.rolePosition != null && p.rolePosition!.trim().isNotEmpty)
                _ProfileLine(label: 'Role', value: p.rolePosition!),
              if (p.department != null && p.department!.trim().isNotEmpty) ...[
                const SizedBox(height: 12),
                _ProfileLine(label: 'Department', value: p.department!),
              ],
              if (p.phone != null && p.phone!.trim().isNotEmpty) ...[
                const SizedBox(height: 12),
                _ProfileLine(label: 'Phone', value: p.phone!),
              ],
            ],
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
