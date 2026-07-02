import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app/routes/app_routes.dart';
import '../../core/services/storage_service.dart';
import '../../core/values/app_colors.dart';
import '../../core/values/app_constants.dart';
import '../../data/models/diary_event_detail.dart';
import '../../data/models/job_completion_context.dart';
import '../certificates/certificate_catalog.dart';
import '../home/controllers/home_controller.dart';
import 'diary_event_detail_controller.dart';
import 'diary_extra_submissions_panel.dart';
import 'job_completion_context_panel.dart';
import 'diary_job_expenses_panel.dart';
import 'diary_technical_notes_panel.dart';
import '../customers/customer_tabs/image_viewer_helper.dart';

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

void _showImagePreviewDialog(BuildContext context, int customerId, int fileId) {
  final tok = Get.find<StorageService>().authToken ?? '';
  final base = AppConstants.apiBaseUrl.replaceAll(RegExp(r'/+$'), '');
  final url = '$base/customers/$customerId/files/$fileId/content';
  openFullscreenImage(
    context,
    url,
    headers: tok.isNotEmpty ? {'Authorization': 'Bearer $tok'} : null,
  );
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
      value: SystemUiOverlayStyle.dark.copyWith(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: AppColors.gradientStart,
        systemNavigationBarIconBrightness: Brightness.dark,
      ),
      child: Scaffold(
        backgroundColor: AppColors.slate50,
        extendBodyBehindAppBar: true,
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          elevation: 0,
          scrolledUnderElevation: 0,
          surfaceTintColor: Colors.transparent,
          foregroundColor: AppColors.slate900,
          iconTheme: const IconThemeData(color: AppColors.slate700),
          titleTextStyle: GoogleFonts.inter(
            fontWeight: FontWeight.w700,
            color: AppColors.slate900,
            fontSize: 17,
          ),
          title: Obx(() {
            final d = controller.detail.value;
            if (d == null) return const Text('Visit');
            if (d.isQuotationVisit) return const Text('Quotation visit');
            return Text(d.headerTitle);
          }),
          leading: IconButton(
            icon: Icon(Icons.arrow_back_ios_new_rounded),
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
                            if (!d.isGeneral &&
                                (controller.phase == DiaryVisitUiPhase.completed || d.jobReportSubmitted)) ...[
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
                            if (!d.isGeneral && controller.phase == DiaryVisitUiPhase.completed) ...[
                              if (!d.isQuotationVisit) ...[
                                const SizedBox(height: 12),
                                _JobCompletionDocumentsPanel(controller: controller),
                              ],
                              if (d.isQuotationVisit) ...[
                                const SizedBox(height: 12),
                                _CreateQuotationBanner(
                                  onAddNotes: () async {
                                    showDiaryTechnicalNoteSheet(
                                      context,
                                      controller,
                                    );
                                  },
                                  onTap: () async {
                                    await Get.toNamed(
                                      AppRoutes.quotationForm,
                                      arguments: <String, dynamic>{
                                        'diaryEventId': controller.diaryId,
                                        'customerId': d.customerId,
                                      },
                                    );
                                  },
                                ),
                              ],
                            ],
                            if (!d.isGeneral &&
                                controller.phase == DiaryVisitUiPhase.onSite &&
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
                            if (!d.isGeneral &&
                                controller.phase == DiaryVisitUiPhase.onSite &&
                                d.isQuotationVisit) ...[
                              const SizedBox(height: 12),
                              _CreateQuotationBanner(
                                onAddNotes: () async {
                                  showDiaryTechnicalNoteSheet(
                                    context,
                                    controller,
                                    completeAfterSubmit: true,
                                  );
                                },
                                onTap: () async {
                                  await Get.toNamed(
                                    AppRoutes.quotationForm,
                                    arguments: <String, dynamic>{
                                      'diaryEventId': controller.diaryId,
                                      'customerId': d.customerId,
                                    },
                                  );
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
                                  _OfficerRows(officers: d.officers, fallbackName: d.officerFullName),
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
                                  _accentTitle(d.isGeneral ? 'Location' : 'Site information'),
                                  const SizedBox(height: 12),
                                  if (d.fullSiteAddress.trim() != '—')
                                    _NavigableAddress(address: d.fullSiteAddress, lat: d.siteLatitude, lon: d.siteLongitude)
                                  else if (d.isGeneral)
                                    _kv('Location', '—'),
                                  if (!d.isGeneral) ...[
                                  if (d.siteNotes != null && d.siteNotes!.trim().isNotEmpty) ...[
                                    const SizedBox(height: 14),
                                    Container(
                                      width: double.infinity,
                                      padding: const EdgeInsets.all(12),
                                      decoration: BoxDecoration(
                                        color: Colors.amber.withOpacity(0.1),
                                        borderRadius: BorderRadius.circular(8),
                                        border: Border.all(color: Colors.amber.withOpacity(0.3)),
                                      ),
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            'SITE NOTES',
                                            style: GoogleFonts.inter(
                                              fontSize: 10,
                                              fontWeight: FontWeight.w900,
                                              color: Colors.amber[200],
                                              letterSpacing: 1.1,
                                            ),
                                          ),
                                          const SizedBox(height: 4),
                                          Text(
                                            d.siteNotes!.trim(),
                                            style: GoogleFonts.inter(
                                              fontSize: 13,
                                              fontWeight: FontWeight.w500,
                                              color: AppColors.slate700,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ],
                                  if (d.keyInfo != null && d.keyInfo!.trim().isNotEmpty) ...[
                                    const SizedBox(height: 14),
                                    Container(
                                      width: double.infinity,
                                      padding: const EdgeInsets.all(12),
                                      decoration: BoxDecoration(
                                        color: Colors.indigo.withOpacity(0.1),
                                        borderRadius: BorderRadius.circular(8),
                                        border: Border.all(color: Colors.indigo.withOpacity(0.3)),
                                      ),
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            'KEY INFO / ACCESS CODE',
                                            style: GoogleFonts.inter(
                                              fontSize: 10,
                                              fontWeight: FontWeight.w900,
                                              color: Colors.indigo[200],
                                              letterSpacing: 1.1,
                                            ),
                                          ),
                                          const SizedBox(height: 4),
                                          Text(
                                            d.keyInfo!.trim(),
                                            style: GoogleFonts.inter(
                                              fontSize: 13,
                                              fontWeight: FontWeight.w500,
                                              color: AppColors.slate700,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ],
                                  if (d.siteImages.isNotEmpty) ...[
                                    const SizedBox(height: 14),
                                    Text(
                                      'SITE PICTURES',
                                      style: GoogleFonts.inter(
                                        fontSize: 10,
                                        fontWeight: FontWeight.w900,
                                        color: AppColors.slate400,
                                        letterSpacing: 1.1,
                                      ),
                                    ),
                                    const SizedBox(height: 8),
                                    SizedBox(
                                      height: 88,
                                      child: ListView.separated(
                                        scrollDirection: Axis.horizontal,
                                        itemCount: d.siteImages.length,
                                        separatorBuilder: (_, __) => const SizedBox(width: 8),
                                        itemBuilder: (context, index) {
                                          final img = d.siteImages[index];
                                          final base = AppConstants.apiBaseUrl.replaceAll(RegExp(r'/+$'), '');
                                          final url = '$base/customers/${d.customerId}/files/${img.id}/content';
                                          final tok = Get.find<StorageService>().authToken ?? '';
                                          return Material(
                                            color: Colors.transparent,
                                            child: InkWell(
                                              onTap: () {
                                                _showImagePreviewDialog(context, d.customerId ?? 0, img.id);
                                              },
                                              borderRadius: BorderRadius.circular(10),
                                              child: ClipRRect(
                                                borderRadius: BorderRadius.circular(10),
                                                child: AspectRatio(
                                                  aspectRatio: 1,
                                                  child: Image.network(
                                                    url,
                                                    fit: BoxFit.cover,
                                                    width: 88,
                                                    headers: tok.isNotEmpty ? {'Authorization': 'Bearer $tok'} : null,
                                                    errorBuilder: (_, __, ___) => Container(
                                                      color: AppColors.whiteOverlay(0.08),
                                                      child: Icon(Icons.broken_image_outlined, color: Colors.white38),
                                                    ),
                                                  ),
                                                ),
                                              ),
                                            ),
                                          );
                                        },
                                      ),
                                    ),
                                  ],
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
                                        color: AppColors.slate700,
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
                                ],
                              ),
                            ),
                            if (!d.isGeneral) ...[
                            const SizedBox(height: 12),
                            _DetailGlassPanel(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  _accentTitle('Customer information'),
                                  const SizedBox(height: 12),
                                  _callableKv(
                                    'Customer name',
                                    (d.customerFullName ?? '').trim().isNotEmpty
                                        ? d.customerFullName!.trim()
                                        : '—',
                                    phone: (d.customerPhone ?? '').trim(),
                                  ),
                                  if (!hideContacts) ...[_customerPhoneRow(d)],
                                  if (!hideContacts)
                                    _navigableKv(
                                      'Address',
                                      d.fullSiteAddress,
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
                                          color: AppColors.slate700,
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
                                  if (d.jobNumber != null && d.jobNumber!.trim().isNotEmpty)
                                    _kv('Job number', d.jobNumber!.trim()),
                                  _kv('Job title', d.title ?? '—'),
                                  if (d.chargeType != null && d.chargeType != 'chargeable') ...[
                                    Text(
                                      'Charge option',
                                      style: GoogleFonts.inter(
                                        fontSize: 11,
                                        fontWeight: FontWeight.w700,
                                        color: AppColors.slate400,
                                        letterSpacing: 0.2,
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    Row(
                                      children: [
                                        Container(
                                          padding: const EdgeInsets.symmetric(
                                            horizontal: 10,
                                            vertical: 3.5,
                                          ),
                                          decoration: BoxDecoration(
                                            color: d.chargeType == 'free'
                                                ? const Color(0xFF10B981).withValues(alpha: 0.15)
                                                : const Color(0xFFF59E0B).withValues(alpha: 0.15),
                                            borderRadius: BorderRadius.circular(8),
                                            border: Border.all(
                                              color: d.chargeType == 'free'
                                                  ? const Color(0xFF10B981).withValues(alpha: 0.4)
                                                  : const Color(0xFFF59E0B).withValues(alpha: 0.4),
                                              width: 1,
                                            ),
                                          ),
                                          child: Text(
                                            d.chargeType == 'free' ? 'FREE OF CHARGE' : 'CALL BACK',
                                            style: GoogleFonts.inter(
                                              fontSize: 10,
                                              fontWeight: FontWeight.w800,
                                              letterSpacing: 0.5,
                                              color: d.chargeType == 'free'
                                                  ? const Color(0xFF34D399)
                                                  : const Color(0xFFFBBF24),
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 10),
                                  ],
                                  if (d.description != null &&
                                      d.description!.trim().isNotEmpty)
                                    _kv('Job description', d.description!),
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
                            DiaryJobExpensesPanel(controller: controller),
                            const SizedBox(height: 12),
                            DiaryTechnicalNotesPanel(
                              controller: controller,
                              isQuotationVisit: d.isQuotationVisit,
                            ),
                            ],
                            const SizedBox(height: 12),
                            DiaryExtraSubmissionsPanel(controller: controller),
                            const SizedBox(height: 12),
                            _VisitTimelinePanel(controller: controller),
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
                    if (d.isGeneral ||
                        (p != DiaryVisitUiPhase.onSite &&
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
                          icon: Icon(Icons.history_rounded, size: 22),
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
                            foregroundColor: AppColors.slate900,
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
    return DecoratedBox(
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

/// White card panel matching web dashboard surfaces.
class _DetailGlassPanel extends StatelessWidget {
  const _DetailGlassPanel({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        color: Colors.white,
        border: Border.all(color: AppColors.slate200, width: 0.8),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(18, 18, 18, 18),
        child: child,
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
                                color: AppColors.slate900,
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
        borderRadius: BorderRadius.circular(16),
        color: AppColors.primarySurface,
        border: Border.all(color: AppColors.primaryBorder),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            Icon(
              Icons.fact_check_outlined,
              color: AppColors.primaryDark,
              size: 22,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'View submitted job report',
                style: GoogleFonts.inter(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: AppColors.slate900,
                ),
              ),
            ),
            TextButton(
              onPressed: () => onOpen(),
              child: Text(
                'Open',
                style: GoogleFonts.inter(
                  fontWeight: FontWeight.w800,
                  color: AppColors.primaryDark,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _JobCompletionDocumentsPanel extends StatelessWidget {
  const _JobCompletionDocumentsPanel({required this.controller});

  final DiaryEventDetailController controller;

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      if (controller.completionDocumentsLoading.value) {
        return const Center(
          child: Padding(
            padding: EdgeInsets.symmetric(vertical: 8),
            child: CircularProgressIndicator(color: AppColors.primary, strokeWidth: 2),
          ),
        );
      }
      final docs = controller.completionDocuments.value;
      final err = controller.completionDocumentsError.value;
      if (docs == null && err.isEmpty) return const SizedBox.shrink();
      if (docs == null) {
        return Text(
          err,
          style: GoogleFonts.inter(color: AppColors.slate400, fontSize: 12),
        );
      }
      if (docs.certificates.isEmpty && docs.siteReports.isEmpty) {
        return const SizedBox.shrink();
      }
      return _DetailGlassPanel(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Job documents',
              style: GoogleFonts.inter(
                fontWeight: FontWeight.w800,
                color: AppColors.slate900,
                fontSize: 15,
              ),
            ),
            const SizedBox(height: 10),
            if (docs.certificates.isNotEmpty) ...[
              Text(
                'Certificates',
                style: GoogleFonts.inter(
                  color: AppColors.slate400,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 6),
              for (final cert in docs.certificates)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                  leading: Icon(Icons.verified_outlined, color: AppColors.primary, size: 20),
                  title: Text(
                    cert.certificateNumber,
                    style: GoogleFonts.inter(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600),
                  ),
                  subtitle: Text(
                    certificateTypeForSlug(cert.typeSlug).shortLabel,
                    style: GoogleFonts.inter(color: AppColors.slate400, fontSize: 12),
                  ),
                  trailing: Icon(Icons.chevron_right_rounded, color: AppColors.slate400),
                  onTap: () => Get.toNamed(
                    AppRoutes.certificateEditor,
                    arguments: {'id': cert.id},
                  ),
                ),
            ],
            if (docs.siteReports.isNotEmpty) ...[
              if (docs.certificates.isNotEmpty) const SizedBox(height: 8),
              Text(
                'Site reports',
                style: GoogleFonts.inter(
                  color: AppColors.slate400,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 6),
              for (final report in docs.siteReports)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                  leading: Icon(Icons.description_outlined, color: AppColors.primary, size: 20),
                  title: Text(
                    report.reportTitle?.trim().isNotEmpty == true
                        ? report.reportTitle!
                        : (report.templateName ?? 'Site report'),
                    style: GoogleFonts.inter(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600),
                  ),
                  subtitle: report.certificateNumber?.trim().isNotEmpty == true
                      ? Text(
                          report.certificateNumber!,
                          style: GoogleFonts.inter(color: AppColors.slate400, fontSize: 12),
                        )
                      : null,
                  trailing: Icon(Icons.chevron_right_rounded, color: AppColors.slate400),
                  onTap: () {
                    final customerId = docs.customerId ?? controller.detail.value?.customerId;
                    if (customerId == null) return;
                    Get.toNamed(
                      AppRoutes.siteReportEditor,
                      arguments: <String, dynamic>{
                        'customer_id': customerId,
                        'work_address_id': docs.workAddressId,
                        'report_id': report.id,
                      },
                    );
                  },
                ),
            ],
          ],
        ),
      );
    });
  }
}

class _CreateQuotationBanner extends StatelessWidget {
  const _CreateQuotationBanner({
    required this.onTap,
    required this.onAddNotes,
  });

  final Future<void> Function() onTap;
  final Future<void> Function() onAddNotes;

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
                  colors: [AppColors.primary, Color(0x990f172a)],
                ),
                border: Border.all(color: AppColors.whiteOverlay(0.18)),
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 12,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        Icon(
                          Icons.request_quote_outlined,
                          color: AppColors.slate900,
                          size: 22,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            'Create quotation or add site notes only',
                            style: GoogleFonts.inter(
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                              color: AppColors.slate900,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: () => onAddNotes(),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: AppColors.slate900,
                              side: const BorderSide(color: AppColors.slate200),
                              padding: const EdgeInsets.symmetric(vertical: 11),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                            ),
                            child: Text(
                              'Notes only',
                              style: GoogleFonts.inter(
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: ElevatedButton(
                            onPressed: () => onTap(),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.white,
                              foregroundColor: const Color(0xFF0f766e),
                              padding: const EdgeInsets.symmetric(vertical: 11),
                              elevation: 0,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                            ),
                            child: Text(
                              'Quotation',
                              style: GoogleFonts.inter(
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ),
                        ),
                      ],
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
                    Icon(
                      Icons.assignment_outlined,
                      color: AppColors.slate900,
                      size: 22,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Fill in the job report',
                        style: GoogleFonts.inter(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: AppColors.slate900,
                        ),
                      ),
                    ),
                    TextButton(
                      onPressed: () => onOpen(),
                      child: Text(
                        'Start',
                        style: GoogleFonts.inter(
                          fontWeight: FontWeight.w800,
                          color: AppColors.slate900,
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
      color: AppColors.slate900,
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
                  color: AppColors.slate700,
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
                  color: AppColors.slate700,
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
          color: AppColors.slate900,
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
            color: AppColors.slate700,
          ),
        ),
      ],
    ),
  );
}

void _showNavigationSheet(BuildContext context, String address, {double? lat, double? lon}) {
  if (address.trim().isEmpty || address.trim() == '—') return;
  final encoded = Uri.encodeComponent(address.trim());
  final bool hasCoords = lat != null && lon != null && lat != 0.0 && lon != 0.0;

  showModalBottomSheet(
    context: context,
    backgroundColor: AppColors.slate50,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) {
      return _NavigationAppSheet(address: address, encoded: encoded, lat: lat, lon: lon, hasCoords: hasCoords);
    },
  );
}

class _NavigationAppSheet extends StatefulWidget {
  const _NavigationAppSheet({
    required this.address,
    required this.encoded,
    required this.lat,
    required this.lon,
    required this.hasCoords,
  });
  final String address;
  final String encoded;
  final double? lat;
  final double? lon;
  final bool hasCoords;

  @override
  State<_NavigationAppSheet> createState() => _NavigationAppSheetState();
}

class _NavigationAppSheetState extends State<_NavigationAppSheet> {
  // Map of app info: name, icon, native URI, fallback web URI
  late List<_MapApp> _apps;
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    _buildAndCheck();
  }

  Future<void> _buildAndCheck() async {
    final lat = widget.lat;
    final lon = widget.lon;
    final enc = widget.encoded;
    final hasCoords = widget.hasCoords;

    final candidates = <_MapApp>[
      _MapApp(
        name: 'Apple Maps',
        icon: Icons.apple,
        uri: hasCoords
            ? Uri.parse('maps://?daddr=$lat,$lon&dirflg=d')
            : Uri.parse('maps://?q=$enc'),
        fallbackUri: Uri.parse('https://maps.apple.com/?q=$enc'),
      ),
      _MapApp(
        name: 'Google Maps',
        icon: Icons.map_outlined,
        uri: hasCoords
            ? Uri.parse('comgooglemaps://?daddr=$lat,$lon&directionsmode=driving')
            : Uri.parse('comgooglemaps://?q=$enc'),
        fallbackUri: Uri.parse('https://maps.google.com/?q=$enc'),
      ),
      _MapApp(
        name: 'Waze',
        icon: Icons.navigation_outlined,
        uri: hasCoords
            ? Uri.parse('waze://?ll=$lat,$lon&navigate=yes')
            : Uri.parse('waze://?q=$enc&navigate=yes'),
        fallbackUri: Uri.parse('https://waze.com/ul?q=$enc'),
      ),
    ];

    final available = <_MapApp>[];
    for (final app in candidates) {
      final canNative = await canLaunchUrl(app.uri);
      available.add(app.copyWith(available: canNative));
    }

    if (mounted) {
      setState(() {
        _apps = available;
        _loaded = true;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Navigate to',
              style: GoogleFonts.inter(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: AppColors.slate900,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              widget.address.trim(),
              style: GoogleFonts.inter(
                fontSize: 13,
                color: AppColors.slate300,
              ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 16),
            if (!_loaded)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 16),
                child: Center(child: CircularProgressIndicator(color: AppColors.primary)),
              )
            else
              ..._apps.map((app) => ListTile(
                    leading: Icon(app.icon, color: app.available ? Colors.white : AppColors.slate400),
                    title: Text(
                      app.name + (app.available ? '' : ' (not installed)'),
                      style: GoogleFonts.inter(
                        color: app.available ? Colors.white : AppColors.slate400,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    onTap: app.available
                        ? () {
                            launchUrl(app.uri, mode: LaunchMode.externalApplication);
                            Navigator.pop(context);
                          }
                        : () {
                            launchUrl(app.fallbackUri, mode: LaunchMode.externalApplication);
                            Navigator.pop(context);
                          },
                  )),
          ],
        ),
      ),
    );
  }
}

class _MapApp {
  const _MapApp({
    required this.name,
    required this.icon,
    required this.uri,
    required this.fallbackUri,
    this.available = false,
  });
  final String name;
  final IconData icon;
  final Uri uri;
  final Uri fallbackUri;
  final bool available;

  _MapApp copyWith({bool? available}) => _MapApp(
        name: name,
        icon: icon,
        uri: uri,
        fallbackUri: fallbackUri,
        available: available ?? this.available,
      );
}


class _NavigableAddress extends StatelessWidget {
  const _NavigableAddress({required this.address, this.lat, this.lon});
  final String address;
  final double? lat;
  final double? lon;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Text(
            address,
            style: GoogleFonts.inter(
              fontSize: 14,
              height: 1.45,
              color: AppColors.slate700,
            ),
          ),
        ),
        if (address.trim().isNotEmpty && address.trim() != '—') ...[
          const SizedBox(width: 8),
          _GlassIconButton(
            icon: Icons.navigation_outlined,
            onPressed: () => _showNavigationSheet(context, address, lat: lat, lon: lon),
          ),
        ],
      ],
    );
  }
}

Widget _navigableKv(String k, String v) {
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
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Text(
                v,
                style: GoogleFonts.inter(
                  fontSize: 14,
                  height: 1.4,
                  color: AppColors.slate700,
                ),
              ),
            ),
            if (v.trim().isNotEmpty && v.trim() != '—') ...[
              const SizedBox(width: 8),
              Builder(
                builder: (ctx) => _GlassIconButton(
                  icon: Icons.navigation_outlined,
                  onPressed: () => _showNavigationSheet(ctx, v),
                ),
              ),
            ],
          ],
        ),
      ],
    ),
  );
}

Widget _callableKv(String k, String v, {String? phone}) {
  final callPhone = (phone ?? '').trim();
  final canCall = callPhone.isNotEmpty && callPhone != '—';
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
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Text(
                v,
                style: GoogleFonts.inter(
                  fontSize: 14,
                  height: 1.4,
                  color: AppColors.slate700,
                ),
              ),
            ),
            if (canCall) ...[
              const SizedBox(width: 8),
              _GlassIconButton(
                icon: Icons.phone_rounded,
                onPressed: () => _tryLaunchUri(
                  Uri(scheme: 'tel', path: callPhone.replaceAll(RegExp(r'\s'), '')),
                ),
              ),
            ],
          ],
        ),
      ],
    ),
  );
}

class _OfficerRows extends StatelessWidget {
  const _OfficerRows({required this.officers, this.fallbackName});

  final List<Map<String, dynamic>> officers;
  final String? fallbackName;

  @override
  Widget build(BuildContext context) {
    if (officers.isEmpty) {
      return Row(
        children: [
          Icon(Icons.person_outline_rounded, size: 18, color: AppColors.slate400),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              fallbackName ?? '—',
              style: GoogleFonts.inter(
                fontSize: 14,
                color: AppColors.slate700,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final o in officers)
          Padding(
            padding: EdgeInsets.only(bottom: o == officers.last ? 0 : 6),
            child: Row(
              children: [
                Icon(
                  o['is_primary'] == true ? Icons.star : Icons.person_outline_rounded,
                  size: 18,
                  color: AppColors.slate400,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    '${o['full_name'] ?? ''}${o['is_primary'] == true ? ' (Primary)' : ''}',
                    style: GoogleFonts.inter(
                      fontSize: 14,
                      color: AppColors.slate700,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
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
        if (phase == DiaryVisitUiPhase.completed && d.isQuotationVisit) {
          return _BottomGlassDock(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Choose what you want to send from this visit.',
                  style: GoogleFonts.inter(
                    fontSize: 12,
                    height: 1.35,
                    color: AppColors.slate300,
                  ),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: busy
                            ? null
                            : () => showDiaryTechnicalNoteSheet(
                                  context,
                                  controller,
                                ),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppColors.slate900,
                          side: _outlineOnGlass,
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                        ),
                        child: Text(
                          'Notes only',
                          style: GoogleFonts.inter(
                            fontWeight: FontWeight.w800,
                            fontSize: 15,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: ElevatedButton(
                        onPressed: busy
                            ? null
                            : () async {
                                await Get.toNamed(
                                  AppRoutes.quotationForm,
                                  arguments: <String, dynamic>{
                                    'diaryEventId': controller.diaryId,
                                    'customerId': d.customerId,
                                  },
                                );
                              },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.primary,
                          foregroundColor: AppColors.slate900,
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          elevation: 0,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                        ),
                        child: Text(
                          'Quotation',
                          style: GoogleFonts.inter(
                            fontWeight: FontWeight.w800,
                            fontSize: 15,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          );
        }
        return _BottomGlassDock(
          child: SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed: busy ? null : Get.back,
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.slate900,
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
            foregroundColor: AppColors.slate900,
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
            side: BorderSide(color: Color(0x66FECACA)),
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
        final reportSubmitted = controller.detail.value?.jobReportSubmitted ?? false;
        if (needsReport && !reportSubmitted) {
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
              foregroundColor: AppColors.slate900,
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
              foregroundColor: AppColors.slate900,
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
            side: BorderSide(color: Color(0x66FECACA)),
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
        final homeCtrl = Get.isRegistered<HomeController>()
            ? Get.find<HomeController>()
            : null;
        final isAdminOrScheduler = homeCtrl?.canEditBookedJobs ?? false;
        final myOid = homeCtrl?.myOfficerId;
        final isAssigned = myOid != null && (
          d.officerId == myOid ||
          d.officers.any((o) => o['id'] == myOid || o['officer_id'] == myOid)
        );
        final canEdit = isAdminOrScheduler || isAssigned;
        return _BottomGlassDock(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'When you leave for this job, tap “Travelling to site”. '
                'After you arrive, tap “Arrived at site” to start the visit.',
                style: GoogleFonts.inter(
                  fontSize: 13,
                  height: 1.45,
                  color: AppColors.slate300,
                ),
              ),
              const SizedBox(height: 12),
              ElevatedButton(
                onPressed: busy
                    ? null
                    : () => controller.applyStatus('travelling_to_site'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: AppColors.slate900,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  elevation: 0,
                  shadowColor: AppColors.primary.withValues(alpha: 0.4),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                child: Text(
                  'Travelling to site',
                  style: GoogleFonts.inter(
                    fontWeight: FontWeight.w800,
                    fontSize: 15,
                  ),
                ),
              ),
              if (canEdit) ...[
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: busy
                      ? null
                      : () => _showEditVisitSheet(
                            context,
                            controller,
                            d,
                            canChangeOfficers: isAdminOrScheduler,
                          ),
                  icon: Icon(Icons.edit_calendar_rounded, size: 18),
                  label: Text(
                    'Edit visit',
                    style: GoogleFonts.inter(
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                    ),
                  ),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.slate900,
                    side: _outlineOnGlass,
                    padding: const EdgeInsets.symmetric(vertical: 11),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                ),
              ],
            ],
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
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: AppColors.slate200)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
            blurRadius: 16,
            offset: const Offset(0, -4),
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
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      title: Text(
        'Abort visit?',
        style: GoogleFonts.inter(
          fontWeight: FontWeight.w800,
          color: AppColors.slate900,
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
                border: Border.all(color: AppColors.slate200),
              ),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  value: _selected,
                  dropdownColor: const Color(0xFF1e293b),
                  style: GoogleFonts.inter(
                    color: AppColors.slate700,
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
            foregroundColor: AppColors.slate900,
          ),
          child: const Text('Abort'),
        ),
      ],
    );
  }
}

Future<void> _confirmComplete(DiaryEventDetailController c) async {
  final d = c.detail.value;
  if (d?.isGeneral == true) {
    final ok = await Get.dialog<bool>(
      AlertDialog(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.transparent,
        title: Text(
          'Complete visit?',
          style: GoogleFonts.inter(
            fontWeight: FontWeight.w800,
            color: AppColors.slate900,
          ),
        ),
        content: Text(
          'Mark this general event as complete?',
          style: GoogleFonts.inter(color: AppColors.slate300),
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
              foregroundColor: AppColors.slate900,
            ),
            child: const Text('Complete'),
          ),
        ],
      ),
    );
    if (ok == true) await c.applyStatus('completed');
    return;
  }

  final ctx = d?.jobCompletionContext ?? JobCompletionContext.empty();
  final myStage = currentVisitNextJobState(ctx) ?? 'completed';

  final ok = await Get.dialog<bool>(
    AlertDialog(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      title: Text(
        'Complete visit?',
        style: GoogleFonts.inter(
          fontWeight: FontWeight.w800,
          color: AppColors.slate900,
        ),
      ),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: buildCompleteVisitContextContent(
            context: ctx,
            myChosenJobState: myStage,
          ),
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
        ElevatedButton(
          onPressed: () => Get.back(result: true),
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primary,
            foregroundColor: AppColors.slate900,
          ),
          child: const Text('Complete'),
        ),
      ],
    ),
  );
  if (ok == true) await c.applyStatus('completed');
}

class _VisitTimelinePanel extends StatelessWidget {
  const _VisitTimelinePanel({required this.controller});

  final DiaryEventDetailController controller;

  String _formatStatusLabel(String status) {
    final s = status.trim().toLowerCase().replaceAll(RegExp(r'\s+'), '_');
    if (s == 'travelling_to_site' || s == 'travelling') return 'Traveling to Site';
    if (s == 'arrived_at_site' || s == 'arrived' || s == 'on_site') return 'Arrived at Site';
    if (s == 'job_report_submitted') return 'Job Report Submitted';
    if (s == 'completed') return 'Completed';
    if (s == 'cancelled' || s == 'aborted') return 'Cancelled';
    return status;
  }

  IconData _formatStatusIcon(String status) {
    final s = status.trim().toLowerCase().replaceAll(RegExp(r'\s+'), '_');
    if (s == 'travelling_to_site' || s == 'travelling') return Icons.directions_car_rounded;
    if (s == 'arrived_at_site' || s == 'arrived' || s == 'on_site') return Icons.pin_drop_rounded;
    if (s == 'job_report_submitted') return Icons.assignment_turned_in_rounded;
    if (s == 'completed') return Icons.check_circle_rounded;
    if (s == 'cancelled' || s == 'aborted') return Icons.cancel_rounded;
    return Icons.circle_outlined;
  }

  Color _formatStatusColor(String status) {
    final s = status.trim().toLowerCase().replaceAll(RegExp(r'\s+'), '_');
    if (s == 'travelling_to_site' || s == 'travelling') return Colors.blue.shade300;
    if (s == 'arrived_at_site' || s == 'arrived' || s == 'on_site') return Colors.orange.shade300;
    if (s == 'job_report_submitted') return Colors.teal.shade300;
    if (s == 'completed') return Colors.green.shade300;
    if (s == 'cancelled' || s == 'aborted') return Colors.red.shade300;
    return Colors.grey.shade400;
  }

  @override
  Widget build(BuildContext context) {
    final d = controller.detail.value;
    if (d == null || d.statusLogs.isEmpty) {
      return const SizedBox.shrink();
    }

    return _DetailGlassPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                Icons.timeline_rounded,
                color: AppColors.slate900,
                size: 20,
              ),
              const SizedBox(width: 8),
              Text(
                'Visit timeline logs',
                style: GoogleFonts.inter(
                  fontSize: 14,
                  fontWeight: FontWeight.w800,
                  color: AppColors.slate900,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          ListView.builder(
            shrinkWrap: true,
            padding: EdgeInsets.zero,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: d.statusLogs.length,
            itemBuilder: (context, index) {
              final log = d.statusLogs[index];
              final status = log['status'] as String? ?? '';
              final lat = log['latitude'];
              final lon = log['longitude'];
              final tsStr = log['timestamp'] as String? ?? '';
              final ts = DateTime.tryParse(tsStr)?.toLocal();
              final timeFormatted = ts != null
                  ? '${ts.hour.toString().padLeft(2, '0')}:${ts.minute.toString().padLeft(2, '0')} (on ${_formatDate(ts)})'
                  : '—';

              final hasCoords = lat != null && lon != null && lat != 0.0 && lon != 0.0;
              final isLast = index == d.statusLogs.length - 1;

              return IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Column(
                      children: [
                        Container(
                          width: 28,
                          height: 28,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: _formatStatusColor(status).withValues(alpha: 0.15),
                            border: Border.all(
                              color: _formatStatusColor(status).withValues(alpha: 0.4),
                              width: 1.5,
                            ),
                          ),
                          child: Icon(
                            _formatStatusIcon(status),
                            size: 14,
                            color: _formatStatusColor(status),
                          ),
                        ),
                        if (!isLast)
                          Expanded(
                            child: Container(
                              width: 2,
                              color: AppColors.whiteOverlay(0.15),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.only(bottom: 16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _formatStatusLabel(status),
                              style: GoogleFonts.inter(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: AppColors.slate900,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              timeFormatted,
                              style: GoogleFonts.inter(
                                fontSize: 11,
                                color: AppColors.slate400,
                              ),
                            ),
                            if (hasCoords) ...[
                              const SizedBox(height: 4),
                              Row(
                                children: [
                                  Icon(
                                    Icons.location_on_rounded,
                                    size: 11,
                                    color: AppColors.slate400,
                                  ),
                                  const SizedBox(width: 4),
                                  Text(
                                    'Lat: ${lat.toStringAsFixed(5)}, Lon: ${lon.toStringAsFixed(5)}',
                                    style: GoogleFonts.inter(
                                      fontSize: 11,
                                      color: AppColors.slate300,
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  String _formatDate(DateTime dt) {
    return '${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')}/${dt.year}';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Edit-visit bottom sheet (admin / scheduling staff only)
// ─────────────────────────────────────────────────────────────────────────────

void _showEditVisitSheet(
  BuildContext context,
  DiaryEventDetailController controller,
  DiaryEventDetail detail, {
  required bool canChangeOfficers,
}) {
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _EditVisitSheet(
      controller: controller,
      detail: detail,
      canChangeOfficers: canChangeOfficers,
    ),
  );
}

class _EditVisitSheet extends StatefulWidget {
  const _EditVisitSheet({
    required this.controller,
    required this.detail,
    required this.canChangeOfficers,
  });

  final DiaryEventDetailController controller;
  final DiaryEventDetail detail;
  final bool canChangeOfficers;

  @override
  State<_EditVisitSheet> createState() => _EditVisitSheetState();
}

class _EditVisitSheetState extends State<_EditVisitSheet> {
  late DateTime _selectedDate;
  late TimeOfDay _selectedTime;
  late int _durationMinutes;
  late TextEditingController _notesCtrl;
  final Set<int> _selectedOfficerIds = {};
  List<Map<String, dynamic>> _availableOfficers = [];
  bool _loadingOfficers = false;
  String? _officerLoadError;

  static const _durations = [
    15, 30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 420, 480,
  ];

  @override
  void initState() {
    super.initState();
    final start = widget.detail.startTime ?? DateTime.now();
    _selectedDate = DateTime(start.year, start.month, start.day);
    _selectedTime = TimeOfDay(hour: start.hour, minute: start.minute);
    _durationMinutes = widget.detail.durationMinutes;
    // Clamp to nearest valid step if not in list.
    if (!_durations.contains(_durationMinutes)) {
      _durationMinutes = _durations.reduce(
        (a, b) =>
            (a - _durationMinutes).abs() < (b - _durationMinutes).abs() ? a : b,
      );
    }
    _notesCtrl = TextEditingController(
      text: widget.detail.notes?.trim() ?? '',
    );
    for (final o in widget.detail.officers) {
      if (o['is_primary'] != true) continue;
      final id = (o['id'] as num?)?.toInt() ?? (o['officer_id'] as num?)?.toInt();
      if (id != null) _selectedOfficerIds.add(id);
    }
    for (final o in widget.detail.officers) {
      final id = (o['id'] as num?)?.toInt() ?? (o['officer_id'] as num?)?.toInt();
      if (id != null) _selectedOfficerIds.add(id);
    }
    if (_selectedOfficerIds.isEmpty && widget.detail.officerId != null) {
      _selectedOfficerIds.add(widget.detail.officerId!);
    }
    if (widget.canChangeOfficers) {
      _loadOfficers();
    }
  }

  Future<void> _loadOfficers() async {
    setState(() {
      _loadingOfficers = true;
      _officerLoadError = null;
    });
    try {
      final list = await widget.controller.fetchAssignableOfficers();
      if (!mounted) return;
      setState(() {
        _availableOfficers = list;
        _loadingOfficers = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loadingOfficers = false;
        _officerLoadError = '$e';
      });
    }
  }

  @override
  void dispose() {
    _notesCtrl.dispose();
    super.dispose();
  }

  String _durationLabel(int minutes) {
    if (minutes < 60) return '${minutes}m';
    final h = minutes ~/ 60;
    final m = minutes % 60;
    return m == 0 ? '${h}h' : '${h}h ${m}m';
  }

  DateTime get _combinedStart => DateTime(
        _selectedDate.year,
        _selectedDate.month,
        _selectedDate.day,
        _selectedTime.hour,
        _selectedTime.minute,
      );

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now().add(const Duration(days: 730)),
      builder: (ctx, child) => Theme(
        data: ThemeData.dark().copyWith(
          colorScheme: const ColorScheme.dark(
            primary: AppColors.primary,
            onPrimary: Colors.white,
            surface: Color(0xFF1E293B),
          ),
        ),
        child: child!,
      ),
    );
    if (picked != null && mounted) {
      setState(() => _selectedDate = picked);
    }
  }

  Future<void> _pickTime() async {
    final picked = await showTimePicker(
      context: context,
      initialTime: _selectedTime,
      builder: (ctx, child) => Theme(
        data: ThemeData.dark().copyWith(
          colorScheme: const ColorScheme.dark(
            primary: AppColors.primary,
            onPrimary: Colors.white,
            surface: Color(0xFF1E293B),
          ),
        ),
        child: child!,
      ),
    );
    if (picked != null && mounted) {
      setState(() => _selectedTime = picked);
    }
  }

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    return ClipRRect(
      borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 28, sigmaY: 28),
        child: Container(
          padding: EdgeInsets.fromLTRB(20, 16, 20, mq.viewInsets.bottom + 24),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                AppColors.whiteOverlay(0.14),
                const Color(0xEF0F172A),
              ],
            ),
            border: Border(
              top: BorderSide(color: AppColors.whiteOverlay(0.15)),
            ),
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Handle
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    margin: const EdgeInsets.only(bottom: 16),
                    decoration: BoxDecoration(
                      color: AppColors.whiteOverlay(0.3),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                // Title
                Row(
                  children: [
                    Icon(
                      Icons.edit_calendar_rounded,
                      color: AppColors.primary,
                      size: 22,
                    ),
                    const SizedBox(width: 10),
                    Text(
                      'Edit visit',
                      style: GoogleFonts.inter(
                        fontWeight: FontWeight.w800,
                        fontSize: 18,
                        color: AppColors.slate900,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  widget.canChangeOfficers
                      ? 'Update the appointment date, time, duration, engineers, or notes.'
                      : 'Update the appointment date, time, duration, or notes.',
                  style: GoogleFonts.inter(
                    fontSize: 13,
                    color: AppColors.slate300,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 20),

                if (widget.canChangeOfficers) ...[
                  Text(
                    'ENGINEERS',
                    style: GoogleFonts.inter(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: AppColors.slate400,
                      letterSpacing: 0.8,
                    ),
                  ),
                  const SizedBox(height: 8),
                  if (_loadingOfficers)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 12),
                      child: Center(
                        child: SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                      ),
                    )
                  else if (_officerLoadError != null)
                    Text(
                      'Could not load engineers. ${_officerLoadError!}',
                      style: GoogleFonts.inter(
                        fontSize: 13,
                        color: const Color(0xFFFFA8A8),
                      ),
                    )
                  else if (_availableOfficers.isEmpty)
                    Text(
                      'No engineers available',
                      style: GoogleFonts.inter(
                        fontSize: 13,
                        color: AppColors.slate400,
                      ),
                    )
                  else
                    Container(
                      decoration: BoxDecoration(
                        color: AppColors.whiteOverlay(0.06),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: AppColors.whiteOverlay(0.14),
                        ),
                      ),
                      child: Column(
                        children: _availableOfficers.map((o) {
                          final id = (o['id'] as num?)?.toInt() ?? 0;
                          if (id <= 0) return const SizedBox.shrink();
                          final name = (o['full_name'] as String?)?.trim().isNotEmpty == true
                              ? (o['full_name'] as String).trim()
                              : 'Engineer #$id';
                          final selected = _selectedOfficerIds.contains(id);
                          final ordered = _selectedOfficerIds.toList();
                          final isPrimary =
                              selected && ordered.isNotEmpty && ordered.first == id;
                          return CheckboxListTile(
                            value: selected,
                            onChanged: (v) {
                              setState(() {
                                if (v == true) {
                                  _selectedOfficerIds.add(id);
                                } else {
                                  _selectedOfficerIds.remove(id);
                                }
                              });
                            },
                            title: Text(
                              isPrimary ? '$name (Primary)' : name,
                              style: GoogleFonts.inter(
                                fontSize: 14,
                                color: AppColors.slate900,
                                fontWeight: isPrimary ? FontWeight.w700 : FontWeight.w500,
                              ),
                            ),
                            activeColor: AppColors.primary,
                            checkColor: Colors.white,
                            dense: true,
                            visualDensity: VisualDensity.compact,
                            controlAffinity: ListTileControlAffinity.leading,
                          );
                        }).toList(),
                      ),
                    ),
                  const SizedBox(height: 6),
                  Text(
                    'First selected engineer is marked as primary.',
                    style: GoogleFonts.inter(
                      fontSize: 12,
                      color: AppColors.slate400,
                      height: 1.35,
                    ),
                  ),
                  const SizedBox(height: 16),
                ],

                // ── Date & Time row ──────────────────────────────────────────
                Text(
                  'DATE & TIME',
                  style: GoogleFonts.inter(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: AppColors.slate400,
                    letterSpacing: 0.8,
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: _SheetPickerTile(
                        icon: Icons.calendar_today_rounded,
                        label: () {
                          final d = _selectedDate;
                          const mo = [
                            'Jan','Feb','Mar','Apr','May','Jun',
                            'Jul','Aug','Sep','Oct','Nov','Dec',
                          ];
                          return '${d.day} ${mo[d.month - 1]} ${d.year}';
                        }(),
                        onTap: _pickDate,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _SheetPickerTile(
                        icon: Icons.access_time_rounded,
                        label: _selectedTime.format(context),
                        onTap: _pickTime,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),

                // ── Duration ────────────────────────────────────────────────
                Text(
                  'DURATION',
                  style: GoogleFonts.inter(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: AppColors.slate400,
                    letterSpacing: 0.8,
                  ),
                ),
                const SizedBox(height: 8),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: _durations.map((d) {
                      final selected = d == _durationMinutes;
                      return Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: GestureDetector(
                          onTap: () => setState(() => _durationMinutes = d),
                          child: AnimatedContainer(
                            duration: const Duration(milliseconds: 160),
                            padding: const EdgeInsets.symmetric(
                              horizontal: 14,
                              vertical: 8,
                            ),
                            decoration: BoxDecoration(
                              color: selected
                                  ? AppColors.primary
                                  : AppColors.whiteOverlay(0.08),
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(
                                color: selected
                                    ? AppColors.primary
                                    : AppColors.whiteOverlay(0.15),
                              ),
                            ),
                            child: Text(
                              _durationLabel(d),
                              style: GoogleFonts.inter(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: selected
                                    ? Colors.white
                                    : AppColors.slate300,
                              ),
                            ),
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                ),
                const SizedBox(height: 16),

                // ── Appointment notes ────────────────────────────────────────
                Text(
                  'APPOINTMENT NOTES',
                  style: GoogleFonts.inter(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: AppColors.slate400,
                    letterSpacing: 0.8,
                  ),
                ),
                const SizedBox(height: 8),
                Container(
                  decoration: BoxDecoration(
                    color: AppColors.whiteOverlay(0.06),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: AppColors.whiteOverlay(0.14),
                    ),
                  ),
                  child: TextField(
                    controller: _notesCtrl,
                    maxLines: 4,
                    style: GoogleFonts.inter(
                      fontSize: 14,
                      color: AppColors.slate900,
                      height: 1.5,
                    ),
                    cursorColor: AppColors.primary,
                    decoration: InputDecoration(
                      hintText: 'Add notes for this visit…',
                      hintStyle: GoogleFonts.inter(
                        fontSize: 14,
                        color: AppColors.slate400,
                      ),
                      border: InputBorder.none,
                      contentPadding: const EdgeInsets.all(14),
                    ),
                  ),
                ),
                const SizedBox(height: 24),

                // ── Save / Cancel ────────────────────────────────────────────
                Obx(() {
                  final busy = widget.controller.saving.value;
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      ElevatedButton(
                        onPressed: busy
                            ? null
                            : () async {
                                if (widget.canChangeOfficers &&
                                    _selectedOfficerIds.isEmpty) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                      content: Text(
                                        'Select at least one engineer',
                                      ),
                                    ),
                                  );
                                  return;
                                }
                                final officerIds = widget.canChangeOfficers
                                    ? _selectedOfficerIds.toList()
                                    : null;
                                Navigator.pop(context);
                                await widget.controller.rescheduleVisit(
                                  startTime: _combinedStart,
                                  durationMinutes: _durationMinutes,
                                  notes: _notesCtrl.text.trim().isEmpty
                                      ? null
                                      : _notesCtrl.text.trim(),
                                  officerIds: officerIds,
                                );
                              },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.primary,
                          foregroundColor: AppColors.slate900,
                          padding: const EdgeInsets.symmetric(vertical: 15),
                          elevation: 0,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                        ),
                        child: busy
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: AppColors.slate900,
                                ),
                              )
                            : Text(
                                'Save changes',
                                style: GoogleFonts.inter(
                                  fontWeight: FontWeight.w800,
                                  fontSize: 15,
                                ),
                              ),
                      ),
                      const SizedBox(height: 10),
                      OutlinedButton(
                        onPressed: busy ? null : () => Navigator.pop(context),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppColors.slate300,
                          side: BorderSide(
                            color: AppColors.whiteOverlay(0.18),
                          ),
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                        ),
                        child: Text(
                          'Cancel',
                          style: GoogleFonts.inter(
                            fontWeight: FontWeight.w700,
                            fontSize: 15,
                          ),
                        ),
                      ),
                    ],
                  );
                }),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Tappable pill used in the edit sheet for date and time pickers.
class _SheetPickerTile extends StatelessWidget {
  const _SheetPickerTile({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: AppColors.whiteOverlay(0.07),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.slate200),
        ),
        child: Row(
          children: [
            Icon(icon, size: 18, color: AppColors.primary),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                label,
                style: GoogleFonts.inter(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: AppColors.slate900,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            Icon(Icons.arrow_drop_down_rounded,
                size: 20, color: AppColors.slate400),
          ],
        ),
      ),
    );
  }
}
