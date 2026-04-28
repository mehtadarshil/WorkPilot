import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app/routes/app_routes.dart';
import '../../core/values/app_colors.dart';
import '../../data/models/diary_event_detail.dart';
import 'diary_event_detail_controller.dart';
import 'diary_extra_submissions_panel.dart';
import 'diary_technical_notes_panel.dart';

String _formatVisitDateTime(DateTime? d) {
  if (d == null) return '—';
  // API times are usually UTC; always show in device time zone.
  final l = d.toLocal();
  const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const mo = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  final w = wd[l.weekday - 1];
  final ampm = l.hour >= 12 ? 'pm' : 'am';
  final h12 = l.hour % 12 == 0 ? 12 : l.hour % 12;
  final mm = l.minute.toString().padLeft(2, '0');
  return '$w ${l.day} ${mo[l.month - 1]} ${l.year} · $h12:$mm$ampm';
}

String _formatJobState(String? raw) {
  if (raw == null || raw.isEmpty) return '—';
  return raw
      .split('_')
      .map(
        (s) => s.isEmpty
            ? s
            : '${s[0].toUpperCase()}${s.length > 1 ? s.substring(1).toLowerCase() : ''}',
      )
      .join(' ');
}

String _siteContactName(DiaryEventDetail d) {
  final s = d.siteContactName?.trim();
  if (s != null && s.isNotEmpty) return s;
  return (d.customerFullName ?? '').trim();
}

String _siteContactPhone(DiaryEventDetail d) {
  final s = d.siteContactPhone?.trim();
  if (s != null && s.isNotEmpty) return s;
  return (d.customerPhone ?? '').trim();
}

Future<void> _tryLaunchUri(Uri uri) async {
  if (await canLaunchUrl(uri)) {
    await launchUrl(uri);
  }
}

class DiaryEventDetailView extends GetView<DiaryEventDetailController> {
  const DiaryEventDetailView({super.key});

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    final topContentPad = mq.padding.top + kToolbarHeight + 8;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light.copyWith(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: AppColors.gradientStart,
        systemNavigationBarIconBrightness: Brightness.light,
      ),
      child: Scaffold(
        backgroundColor: AppColors.gradientStart,
        extendBodyBehindAppBar: true,
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          elevation: 0,
          scrolledUnderElevation: 0,
          surfaceTintColor: Colors.transparent,
          foregroundColor: Colors.white,
          iconTheme: const IconThemeData(color: Colors.white),
          titleTextStyle: GoogleFonts.inter(
            fontWeight: FontWeight.w700,
            color: Colors.white,
            fontSize: 17,
          ),
          title: Obx(() {
            final id = controller.detail.value?.jobId;
            return Text(id != null ? 'Job #$id' : 'Visit');
          }),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_ios_new_rounded),
            onPressed: Get.back,
          ),
        ),
        body: Stack(
          fit: StackFit.expand,
          children: [
            const _DetailShellGradient(),
            _DetailAmbientOrbs(size: mq.size),
            Obx(() {
              if (controller.loading.value && controller.detail.value == null) {
                return const Center(
                  child: CircularProgressIndicator(color: AppColors.primary),
                );
              }
              if (controller.error.value.isNotEmpty &&
                  controller.detail.value == null) {
                return Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                      controller.error.value,
                      textAlign: TextAlign.center,
                      style: GoogleFonts.inter(color: AppColors.slate300),
                    ),
                  ),
                );
              }
              final d = controller.detail.value;
              if (d == null) {
                return const SizedBox.shrink();
              }
              final hideContacts =
                  controller.phase == DiaryVisitUiPhase.completed ||
                  controller.phase == DiaryVisitUiPhase.cancelled;
              return Column(
                children: [
                  Expanded(
                    child: RefreshIndicator(
                      color: AppColors.primary,
                      onRefresh: () => controller.load(silent: true),
                      child: SingleChildScrollView(
                        padding: EdgeInsets.fromLTRB(20, topContentPad, 20, 16),
                        physics: const AlwaysScrollableScrollPhysics(
                          parent: BouncingScrollPhysics(),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Obx(() {
                              if (!controller.visitDetailFromCache.value) {
                                return const SizedBox.shrink();
                              }
                              return Padding(
                                padding: const EdgeInsets.only(bottom: 12),
                                child: Material(
                                  color: AppColors.whiteOverlay(0.1),
                                  borderRadius: BorderRadius.circular(12),
                                  child: Padding(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 14,
                                      vertical: 10,
                                    ),
                                    child: Row(
                                      children: [
                                        Icon(
                                          Icons.wifi_off_rounded,
                                          size: 20,
                                          color: Colors.amber.shade200,
                                        ),
                                        const SizedBox(width: 10),
                                        Expanded(
                                          child: Text(
                                            'Offline or limited connection — showing the last saved copy of this visit. Pull down to retry.',
                                            style: GoogleFonts.inter(
                                              fontSize: 12,
                                              height: 1.35,
                                              color: AppColors.slate300,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              );
                            }),
                            _StatusBanner(d: d, phase: controller.phase),
                            if (controller.phase ==
                                DiaryVisitUiPhase.completed) ...[
                              const SizedBox(height: 12),
                              _SubmittedJobReportBanner(
                                onOpen: () async {
                                  await Get.toNamed(
                                    AppRoutes.diaryJobReport,
                                    arguments: <String, dynamic>{
                                      'diaryId': controller.diaryId,
                                      'readonly': true,
                                    },
                                  );
                                },
                              ),
                            ],
                            if (controller.phase == DiaryVisitUiPhase.onSite &&
                                controller.effectiveJobReportQuestionCount >
                                    0) ...[
                              const SizedBox(height: 12),
                              _JobReportBanner(
                                onOpen: () async {
                                  await Get.toNamed(
                                    AppRoutes.diaryJobReport,
                                    arguments: controller.diaryId,
                                  );
                                  await controller.load();
                                },
                              ),
                            ],
                            const SizedBox(height: 16),
                            _DetailGlassPanel(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  _sectionTitle('Service'),
                                  const SizedBox(height: 12),
                                  _kv(
                                    'Appointment notes',
                                    (d.notes != null &&
                                            d.notes!.trim().isNotEmpty)
                                        ? d.notes!
                                        : '—',
                                  ),
                                  const SizedBox(height: 12),
                                  Text(
                                    'Appointment details',
                                    style: GoogleFonts.inter(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w700,
                                      color: AppColors.slate400,
                                    ),
                                  ),
                                  const SizedBox(height: 6),
                                  Row(
                                    children: [
                                      Icon(
                                        Icons.person_outline_rounded,
                                        size: 18,
                                        color: AppColors.slate400,
                                      ),
                                      const SizedBox(width: 8),
                                      Expanded(
                                        child: Text(
                                          d.officerFullName ?? '—',
                                          style: GoogleFonts.inter(
                                            fontSize: 14,
                                            color: AppColors.slate50,
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 8),
                                  Row(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Icon(
                                        Icons.schedule_rounded,
                                        size: 18,
                                        color: AppColors.slate400,
                                      ),
                                      const SizedBox(width: 8),
                                      Expanded(
                                        child: Text(
                                          '${_formatVisitDateTime(d.startTime)} — ${_formatVisitDateTime(d.endTime)}',
                                          style: GoogleFonts.inter(
                                            fontSize: 14,
                                            color: AppColors.slate300,
                                            height: 1.35,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 12),
                            _DetailGlassPanel(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  _accentTitle('Site information'),
                                  const SizedBox(height: 12),
                                  Text(
                                    d.siteAddress?.trim().isNotEmpty == true
                                        ? d.siteAddress!.trim()
                                        : (d.location?.trim().isNotEmpty == true
                                              ? d.location!.trim()
                                              : '—'),
                                    style: GoogleFonts.inter(
                                      fontSize: 14,
                                      height: 1.45,
                                      color: AppColors.slate50,
                                    ),
                                  ),
                                  if (!hideContacts &&
                                      _siteContactName(
                                        d,
                                      ).trim().isNotEmpty) ...[
                                    const SizedBox(height: 14),
                                    Text(
                                      'Site contact',
                                      style: GoogleFonts.inter(
                                        fontSize: 12,
                                        fontWeight: FontWeight.w700,
                                        color: AppColors.slate400,
                                      ),
                                    ),
                                    const SizedBox(height: 6),
                                    Text(
                                      _siteContactName(d),
                                      style: GoogleFonts.inter(
                                        fontSize: 14,
                                        fontWeight: FontWeight.w600,
                                        color: AppColors.slate50,
                                      ),
                                    ),
                                    if (_siteContactPhone(
                                      d,
                                    ).trim().isNotEmpty) ...[
                                      const SizedBox(height: 8),
                                      Row(
                                        children: [
                                          Expanded(
                                            child: Text(
                                              _siteContactPhone(d),
                                              style: GoogleFonts.inter(
                                                fontSize: 14,
                                                color: AppColors.slate300,
                                              ),
                                            ),
                                          ),
                                          _GlassIconButton(
                                            icon: Icons.phone_rounded,
                                            onPressed: () => _tryLaunchUri(
                                              Uri(
                                                scheme: 'tel',
                                                path: _siteContactPhone(
                                                  d,
                                                ).replaceAll(RegExp(r'\s'), ''),
                                              ),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ],
                                  ],
                                ],
                              ),
                            ),
                            const SizedBox(height: 12),
                            _DetailGlassPanel(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  _accentTitle('Customer information'),
                                  const SizedBox(height: 12),
                                  _kv(
                                    'Customer name',
                                    (d.customerFullName ?? '').trim().isNotEmpty
                                        ? d.customerFullName!.trim()
                                        : '—',
                                  ),
                                  if (!hideContacts) ...[_customerPhoneRow(d)],
                                  if (!hideContacts)
                                    _kv(
                                      'Address',
                                      (d.siteAddress ?? '').trim().isNotEmpty
                                          ? d.siteAddress!.trim()
                                          : '—',
                                    ),
                                  _kv(
                                    'Account',
                                    d.customerId != null
                                        ? '${d.customerId}'
                                        : '—',
                                  ),
                                  if (d.customerReference != null &&
                                      d.customerReference!.trim().isNotEmpty)
                                    _kv(
                                      'Customer reference',
                                      d.customerReference!,
                                    ),
                                ],
                              ),
                            ),
                            if (d.customerSpecificNotes.isNotEmpty) ...[
                              const SizedBox(height: 12),
                              _DetailGlassPanel(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    _accentTitle('Technical notes'),
                                    const SizedBox(height: 12),
                                    for (final (i, n)
                                        in d.customerSpecificNotes.indexed) ...[
                                      if (i > 0) const SizedBox(height: 14),
                                      Text(
                                        n.title.isNotEmpty ? n.title : 'Note',
                                        style: GoogleFonts.inter(
                                          fontSize: 13,
                                          fontWeight: FontWeight.w600,
                                          color: AppColors.slate50,
                                        ),
                                      ),
                                      if (n.description.trim().isNotEmpty) ...[
                                        const SizedBox(height: 4),
                                        Text(
                                          n.description,
                                          style: GoogleFonts.inter(
                                            fontSize: 14,
                                            height: 1.45,
                                            color: AppColors.slate300,
                                          ),
                                        ),
                                      ],
                                    ],
                                  ],
                                ),
                              ),
                            ],
                            const SizedBox(height: 12),
                            _DetailGlassPanel(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  _accentTitle('Job details'),
                                  const SizedBox(height: 12),
                                  _kv('Job description', d.title ?? '—'),
                                  if (d.description != null &&
                                      d.description!.trim().isNotEmpty)
                                    _kv('Notes', d.description!),
                                  if (d.jobNotes != null &&
                                      d.jobNotes!.trim().isNotEmpty)
                                    _kv('Job notes', d.jobNotes!),
                                  _kv(
                                    'Job contact',
                                    (d.siteContactName ?? '').trim().isNotEmpty
                                        ? d.siteContactName!.trim()
                                        : '—',
                                  ),
                                  if (!hideContacts) ...[
                                    _jobContactPhoneRow(d),
                                  ],
                                  _kv(
                                    'Current stage',
                                    _formatJobState(d.jobState),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 12),
                            DiaryTechnicalNotesPanel(controller: controller),
                            const SizedBox(height: 12),
                            DiaryExtraSubmissionsPanel(controller: controller),
                            const SizedBox(height: 24),
                          ],
                        ),
                      ),
                    ),
                  ),
                  Obx(() {
                    final p = controller.phase;
                    final loaded = controller.jobReportHistoryLoaded.value;
                    final err = controller.jobReportHistoryError.value;
                    final count = controller.jobReportHistory.length;
                    if ((p != DiaryVisitUiPhase.onSite &&
                            p != DiaryVisitUiPhase.completed) ||
                        !loaded ||
                        err.isNotEmpty ||
                        count == 0) {
                      return const SizedBox.shrink();
                    }
                    return Padding(
                      padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
                      child: SizedBox(
                        width: double.infinity,
                        child: ElevatedButton.icon(
                          onPressed: () async {
                            await Get.toNamed(
                              AppRoutes.diaryJobReportHistory,
                              arguments: <String, dynamic>{
                                'diaryId': controller.diaryId,
                              },
                            );
                          },
                          icon: const Icon(Icons.history_rounded, size: 22),
                          label: Text(
                            'View job history',
                            style: GoogleFonts.inter(
                              fontWeight: FontWeight.w800,
                              fontSize: 15,
                            ),
                          ),
                          style: ElevatedButton.styleFrom(
                            elevation: 8,
                            shadowColor: Colors.black.withValues(alpha: 0.35),
                            backgroundColor: AppColors.primary,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(
                              vertical: 16,
                              horizontal: 18,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(16),
                            ),
                          ),
                        ),
                      ),
                    );
                  }),
                  _BottomActions(controller: controller),
                ],
              );
            }),
          ],
        ),
      ),
    );
  }
}

class _DetailShellGradient extends StatelessWidget {
  const _DetailShellGradient();

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

class _DetailAmbientOrbs extends StatelessWidget {
  const _DetailAmbientOrbs({required this.size});

  final Size size;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Stack(
        children: [
          Positioned(
            top: -size.height * 0.06,
            right: -size.width * 0.12,
            child: _DetailOrb(
              diameter: size.width * 0.72,
              colors: [
                AppColors.primary.withValues(alpha: 0.14),
                Colors.transparent,
              ],
            ),
          ),
          Positioned(
            bottom: size.height * 0.12,
            left: -size.width * 0.18,
            child: _DetailOrb(
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

class _DetailOrb extends StatelessWidget {
  const _DetailOrb({required this.diameter, required this.colors});

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

/// Frosted stack card: backdrop blur + rim gradient (login / home tab style).
class _DetailGlassPanel extends StatelessWidget {
  const _DetailGlassPanel({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.whiteOverlay(0.45), AppColors.whiteOverlay(0.06)],
        ),
        boxShadow: [
          BoxShadow(
            color: AppColors.blackOverlay(0.4),
            blurRadius: 28,
            offset: const Offset(0, 14),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(1.15),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(20.85),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 22, sigmaY: 22),
            child: DecoratedBox(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(20.85),
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    AppColors.whiteOverlay(0.1),
                    const Color(0x661e293b),
                    const Color(0x990f172a),
                  ],
                ),
                border: Border.all(color: AppColors.whiteOverlay(0.14)),
              ),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(18, 18, 18, 18),
                child: child,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _GlassIconButton extends StatelessWidget {
  const _GlassIconButton({required this.icon, required this.onPressed});

  final IconData icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(14),
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                AppColors.primary.withValues(alpha: 0.9),
                AppColors.primary.withValues(alpha: 0.65),
              ],
            ),
            border: Border.all(color: AppColors.whiteOverlay(0.22)),
            boxShadow: [
              BoxShadow(
                color: AppColors.primary.withValues(alpha: 0.35),
                blurRadius: 12,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Padding(
            padding: const EdgeInsets.all(10),
            child: Icon(icon, color: Colors.white, size: 20),
          ),
        ),
      ),
    );
  }
}

class _StatusBanner extends StatelessWidget {
  const _StatusBanner({required this.d, required this.phase});

  final DiaryEventDetail d;
  final DiaryVisitUiPhase phase;

  @override
  Widget build(BuildContext context) {
    late List<Color> wash;
    late IconData icon;
    late String title;
    late String subtitle;

    switch (phase) {
      case DiaryVisitUiPhase.completed:
        wash = [const Color(0x9915803D), const Color(0x660f172a)];
        icon = Icons.check_circle_outline_rounded;
        title = 'Visit completed';
        subtitle =
            'Updated ${_formatVisitDateTime(DateTime.tryParse(d.updatedAtIso))}';
        break;
      case DiaryVisitUiPhase.cancelled:
        wash = [
          AppColors.slate500.withValues(alpha: 0.55),
          const Color(0x660f172a),
        ];
        icon = Icons.block_rounded;
        title = 'Visit cancelled';
        final ar = d.abortReason?.trim();
        subtitle = ar != null && ar.isNotEmpty
            ? 'Reason: $ar'
            : 'This diary visit was aborted.';
        break;
      case DiaryVisitUiPhase.onSite:
        wash = [
          AppColors.primary.withValues(alpha: 0.5),
          const Color(0x660f172a),
        ];
        icon = Icons.place_rounded;
        title = 'On site';
        subtitle = 'Site working time is being recorded.';
        break;
      case DiaryVisitUiPhase.travelling:
        wash = [const Color(0x990284C7), const Color(0x660f172a)];
        icon = Icons.directions_car_outlined;
        title = 'Travelling to site';
        subtitle = 'Travel time is being recorded.';
        break;
      case DiaryVisitUiPhase.scheduled:
        wash = [
          AppColors.slate500.withValues(alpha: 0.45),
          const Color(0x660f172a),
        ];
        icon = Icons.event_note_rounded;
        title = 'Scheduled visit';
        subtitle =
            'Start travel from the diary list when you leave for the job.';
        break;
    }

    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.whiteOverlay(0.4), AppColors.whiteOverlay(0.06)],
        ),
        boxShadow: [
          BoxShadow(
            color: AppColors.blackOverlay(0.35),
            blurRadius: 22,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(1.1),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(20.9),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
            child: Stack(
              children: [
                Positioned.fill(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: wash,
                      ),
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 14,
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(icon, color: Colors.white, size: 26),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              title,
                              style: GoogleFonts.inter(
                                fontSize: 16,
                                fontWeight: FontWeight.w800,
                                color: Colors.white,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              subtitle,
                              style: GoogleFonts.inter(
                                fontSize: 12,
                                height: 1.35,
                                color: Colors.white.withValues(alpha: 0.92),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
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

class _SubmittedJobReportBanner extends StatelessWidget {
  const _SubmittedJobReportBanner({required this.onOpen});

  final Future<void> Function() onOpen;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.whiteOverlay(0.35), AppColors.whiteOverlay(0.05)],
        ),
        boxShadow: [
          BoxShadow(
            color: AppColors.blackOverlay(0.3),
            blurRadius: 16,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(1.0),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(17),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.centerLeft,
                  end: Alignment.centerRight,
                  colors: [const Color(0xCC0F766E), const Color(0x990f172a)],
                ),
                border: Border.all(color: AppColors.whiteOverlay(0.18)),
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 12,
                ),
                child: Row(
                  children: [
                    const Icon(
                      Icons.fact_check_outlined,
                      color: Colors.white,
                      size: 22,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'View submitted job report',
                        style: GoogleFonts.inter(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                        ),
                      ),
                    ),
                    TextButton(
                      onPressed: () => onOpen(),
                      child: Text(
                        'Open',
                        style: GoogleFonts.inter(
                          fontWeight: FontWeight.w800,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _JobReportBanner extends StatelessWidget {
  const _JobReportBanner({required this.onOpen});

  final Future<void> Function() onOpen;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.whiteOverlay(0.35), AppColors.whiteOverlay(0.05)],
        ),
        boxShadow: [
          BoxShadow(
            color: AppColors.blackOverlay(0.3),
            blurRadius: 16,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(1.0),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(17),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.centerLeft,
                  end: Alignment.centerRight,
                  colors: [const Color(0xCC0369A1), const Color(0x990f172a)],
                ),
                border: Border.all(color: AppColors.whiteOverlay(0.18)),
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 12,
                ),
                child: Row(
                  children: [
                    const Icon(
                      Icons.assignment_outlined,
                      color: Colors.white,
                      size: 22,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Fill in the job report',
                        style: GoogleFonts.inter(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                        ),
                      ),
                    ),
                    TextButton(
                      onPressed: () => onOpen(),
                      child: Text(
                        'Start',
                        style: GoogleFonts.inter(
                          fontWeight: FontWeight.w800,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

Widget _sectionTitle(String t) {
  return Text(
    t,
    style: GoogleFonts.inter(
      fontSize: 15,
      fontWeight: FontWeight.w800,
      color: Colors.white,
    ),
  );
}

Widget _customerPhoneRow(DiaryEventDetail d) {
  final phone = (d.customerPhone ?? '').trim();
  if (phone.isEmpty) return _kv('Mobile number', '—');
  return Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Mobile number',
          style: GoogleFonts.inter(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            color: AppColors.slate400,
            letterSpacing: 0.2,
          ),
        ),
        const SizedBox(height: 2),
        Row(
          children: [
            Expanded(
              child: Text(
                phone,
                style: GoogleFonts.inter(
                  fontSize: 14,
                  height: 1.4,
                  color: AppColors.slate50,
                ),
              ),
            ),
            _GlassIconButton(
              icon: Icons.phone_rounded,
              onPressed: () => _tryLaunchUri(
                Uri(scheme: 'tel', path: phone.replaceAll(RegExp(r'\s'), '')),
              ),
            ),
          ],
        ),
      ],
    ),
  );
}

Widget _jobContactPhoneRow(DiaryEventDetail d) {
  final phone = (d.siteContactPhone ?? '').trim();
  if (phone.isEmpty) return _kv('Job contact phone', '—');
  return Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Job contact phone',
          style: GoogleFonts.inter(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            color: AppColors.slate400,
            letterSpacing: 0.2,
          ),
        ),
        const SizedBox(height: 2),
        Row(
          children: [
            Expanded(
              child: Text(
                phone,
                style: GoogleFonts.inter(
                  fontSize: 14,
                  height: 1.4,
                  color: AppColors.slate50,
                ),
              ),
            ),
            _GlassIconButton(
              icon: Icons.phone_rounded,
              onPressed: () => _tryLaunchUri(
                Uri(scheme: 'tel', path: phone.replaceAll(RegExp(r'\s'), '')),
              ),
            ),
          ],
        ),
      ],
    ),
  );
}

Widget _accentTitle(String t) {
  return Row(
    children: [
      Container(
        width: 4,
        height: 18,
        decoration: BoxDecoration(
          color: AppColors.primary,
          borderRadius: BorderRadius.circular(2),
          boxShadow: [
            BoxShadow(
              color: AppColors.primary.withValues(alpha: 0.45),
              blurRadius: 8,
            ),
          ],
        ),
      ),
      const SizedBox(width: 10),
      Text(
        t,
        style: GoogleFonts.inter(
          fontSize: 15,
          fontWeight: FontWeight.w800,
          color: Colors.white,
        ),
      ),
    ],
  );
}

Widget _kv(String k, String v) {
  return Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          k,
          style: GoogleFonts.inter(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            color: AppColors.slate400,
            letterSpacing: 0.2,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          v,
          style: GoogleFonts.inter(
            fontSize: 14,
            height: 1.4,
            color: AppColors.slate50,
          ),
        ),
      ],
    ),
  );
}

class _BottomActions extends StatelessWidget {
  const _BottomActions({required this.controller});

  final DiaryEventDetailController controller;

  static const _outlineOnGlass = BorderSide(color: Color(0x55FFFFFF));

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final d = controller.detail.value;
      if (d == null) return const SizedBox.shrink();
      final phase = controller.phase;
      final busy = controller.saving.value;

      Widget? primary;
      Widget? secondary;

      if (phase == DiaryVisitUiPhase.completed ||
          phase == DiaryVisitUiPhase.cancelled) {
        return _BottomGlassDock(
          child: SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed: busy ? null : Get.back,
              style: OutlinedButton.styleFrom(
                foregroundColor: Colors.white,
                side: _outlineOnGlass,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              child: Text(
                'Close',
                style: GoogleFonts.inter(fontWeight: FontWeight.w700),
              ),
            ),
          ),
        );
      }

      if (phase == DiaryVisitUiPhase.travelling) {
        primary = ElevatedButton(
          onPressed: busy
              ? null
              : () => controller.applyStatus('arrived_at_site'),
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primary,
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(vertical: 14),
            elevation: 0,
            shadowColor: AppColors.primary.withValues(alpha: 0.4),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
            ),
          ),
          child: Text(
            'Arrived at site',
            style: GoogleFonts.inter(fontWeight: FontWeight.w800, fontSize: 15),
          ),
        );
        secondary = OutlinedButton(
          onPressed: busy ? null : () => _confirmAbort(controller),
          style: OutlinedButton.styleFrom(
            foregroundColor: const Color(0xFFFFA8A8),
            side: const BorderSide(color: Color(0x66FECACA)),
            padding: const EdgeInsets.symmetric(vertical: 14),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
            ),
          ),
          child: Text(
            'Abort',
            style: GoogleFonts.inter(fontWeight: FontWeight.w800, fontSize: 15),
          ),
        );
      }

      if (phase == DiaryVisitUiPhase.onSite) {
        final needsReport = controller.effectiveJobReportQuestionCount > 0;
        if (needsReport) {
          primary = ElevatedButton(
            onPressed: busy
                ? null
                : () async {
                    await Get.toNamed(
                      AppRoutes.diaryJobReport,
                      arguments: controller.diaryId,
                    );
                    await controller.load();
                  },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primary,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 14),
              elevation: 0,
              shadowColor: AppColors.primary.withValues(alpha: 0.4),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
            ),
            child: Text(
              'Job report',
              style: GoogleFonts.inter(
                fontWeight: FontWeight.w800,
                fontSize: 15,
              ),
            ),
          );
        } else {
          primary = ElevatedButton(
            onPressed: busy ? null : () => _confirmComplete(controller),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primary,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 14),
              elevation: 0,
              shadowColor: AppColors.primary.withValues(alpha: 0.4),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
            ),
            child: Text(
              'Complete visit',
              style: GoogleFonts.inter(
                fontWeight: FontWeight.w800,
                fontSize: 15,
              ),
            ),
          );
        }
        secondary = OutlinedButton(
          onPressed: busy ? null : () => _confirmAbort(controller),
          style: OutlinedButton.styleFrom(
            foregroundColor: const Color(0xFFFFA8A8),
            side: const BorderSide(color: Color(0x66FECACA)),
            padding: const EdgeInsets.symmetric(vertical: 14),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
            ),
          ),
          child: Text(
            'Abort',
            style: GoogleFonts.inter(fontWeight: FontWeight.w800, fontSize: 15),
          ),
        );
      }

      if (phase == DiaryVisitUiPhase.scheduled) {
        return _BottomGlassDock(
          child: Text(
            'When you leave for this job, tap “Travelling to site” on the Diary list. '
            'After you arrive, open this visit and tap “Arrived at site”.',
            style: GoogleFonts.inter(
              fontSize: 13,
              height: 1.45,
              color: AppColors.slate300,
            ),
          ),
        );
      }

      if (primary == null || secondary == null) {
        return const SizedBox.shrink();
      }

      return _BottomGlassDock(
        child: Row(
          children: [
            Expanded(child: secondary),
            const SizedBox(width: 10),
            Expanded(child: primary),
          ],
        ),
      );
    });
  }
}

class _BottomGlassDock extends StatelessWidget {
  const _BottomGlassDock({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 28, sigmaY: 28),
        child: DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [AppColors.whiteOverlay(0.14), const Color(0xCC0F172A)],
            ),
            border: Border(
              top: BorderSide(color: AppColors.whiteOverlay(0.12)),
            ),
            boxShadow: [
              BoxShadow(
                color: AppColors.blackOverlay(0.35),
                blurRadius: 24,
                offset: const Offset(0, -6),
              ),
            ],
          ),
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 14),
              child: child,
            ),
          ),
        ),
      ),
    );
  }
}

Future<void> _confirmAbort(DiaryEventDetailController c) async {
  List<String> reasons;
  try {
    reasons = await c.loadAbortReasonLabels();
  } catch (e) {
    Get.snackbar(
      'Abort',
      e is Exception ? e.toString() : 'Could not load abort reasons.',
      snackPosition: SnackPosition.BOTTOM,
      margin: const EdgeInsets.all(16),
      borderRadius: 12,
    );
    return;
  }
  if (reasons.isEmpty) {
    Get.snackbar(
      'Abort',
      'No abort reasons are configured. Ask an admin to add them under Settings → Visit abort reasons.',
      snackPosition: SnackPosition.BOTTOM,
      margin: const EdgeInsets.all(16),
      borderRadius: 12,
    );
    return;
  }

  final picked = await Get.dialog<String>(
    _AbortVisitDialog(reasons: reasons),
    barrierDismissible: false,
  );
  if (picked != null && picked.trim().isNotEmpty) {
    await c.applyStatus('cancelled', abortReason: picked.trim());
  }
}

class _AbortVisitDialog extends StatefulWidget {
  const _AbortVisitDialog({required this.reasons});

  final List<String> reasons;

  @override
  State<_AbortVisitDialog> createState() => _AbortVisitDialogState();
}

class _AbortVisitDialogState extends State<_AbortVisitDialog> {
  late String _selected;

  @override
  void initState() {
    super.initState();
    _selected = widget.reasons.first;
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: const Color(0xF21E293B),
      surfaceTintColor: Colors.transparent,
      title: Text(
        'Abort visit?',
        style: GoogleFonts.inter(
          fontWeight: FontWeight.w800,
          color: Colors.white,
        ),
      ),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'This stops any active timesheet segment for this visit and marks the diary entry as cancelled. Choose a reason:',
              style: GoogleFonts.inter(color: AppColors.slate300, height: 1.4),
            ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              decoration: BoxDecoration(
                color: AppColors.whiteOverlay(0.08),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.whiteOverlay(0.15)),
              ),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  value: _selected,
                  dropdownColor: const Color(0xFF1e293b),
                  style: GoogleFonts.inter(
                    color: AppColors.slate50,
                    fontSize: 14,
                  ),
                  isExpanded: true,
                  items: widget.reasons
                      .map(
                        (r) => DropdownMenuItem<String>(
                          value: r,
                          child: Text(r, overflow: TextOverflow.ellipsis),
                        ),
                      )
                      .toList(),
                  onChanged: (v) {
                    if (v != null) setState(() => _selected = v);
                  },
                ),
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Get.back(),
          child: Text(
            'Cancel',
            style: GoogleFonts.inter(color: AppColors.slate300),
          ),
        ),
        ElevatedButton(
          onPressed: () => Get.back(result: _selected),
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primary,
            foregroundColor: Colors.white,
          ),
          child: const Text('Abort'),
        ),
      ],
    );
  }
}

Future<void> _confirmComplete(DiaryEventDetailController c) async {
  final ok = await Get.dialog<bool>(
    AlertDialog(
      backgroundColor: const Color(0xF21E293B),
      surfaceTintColor: Colors.transparent,
      title: Text(
        'Complete visit?',
        style: GoogleFonts.inter(
          fontWeight: FontWeight.w800,
          color: Colors.white,
        ),
      ),
      content: Text(
        'This marks the visit complete, closes site time on your timesheet, and may complete the job for invoicing.',
        style: GoogleFonts.inter(color: AppColors.slate300, height: 1.4),
      ),
      actions: [
        TextButton(
          onPressed: () => Get.back(result: false),
          child: Text(
            'Cancel',
            style: GoogleFonts.inter(color: AppColors.slate300),
          ),
        ),
        ElevatedButton(
          onPressed: () => Get.back(result: true),
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primary,
            foregroundColor: Colors.white,
          ),
          child: const Text('Complete'),
        ),
      ],
    ),
  );
  if (ok == true) await c.applyStatus('completed');
}
