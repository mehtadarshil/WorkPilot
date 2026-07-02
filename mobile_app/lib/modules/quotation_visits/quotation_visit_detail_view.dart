import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../app/routes/app_routes.dart';
import '../../core/values/app_colors.dart';
import '../quotations/quotation_helpers.dart';
import '../quotations/quotation_work_job_choice_sheet.dart';
import 'quotation_visit_detail_controller.dart';
import 'quotation_visit_formatters.dart';

class QuotationVisitDetailView extends GetView<QuotationVisitDetailController> {
  const QuotationVisitDetailView({super.key});

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark.copyWith(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: AppColors.gradientStart,
        systemNavigationBarIconBrightness: Brightness.light,
      ),
      child: Scaffold(
        backgroundColor: AppColors.slate50,
        appBar: AppBar(
          leading: IconButton(
            icon: Icon(Icons.arrow_back_ios_new_rounded),
            onPressed: Get.back,
          ),
          title: Obx(() {
            final v = controller.visit;
            if (v == null) {
              return Text('Quotation visit', style: GoogleFonts.inter(fontWeight: FontWeight.w700));
            }
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFEF3C7),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        'Quotation Visit',
                        style: GoogleFonts.inter(
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                          color: const Color(0xFF92400E),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        (v['title'] as String?) ?? 'Visit',
                        style: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 16),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
                Text(
                  'Visit #${v['id']}',
                  style: GoogleFonts.inter(fontSize: 11, color: AppColors.slate400),
                ),
              ],
            );
          }),
        ),
        body: Obx(() {
          if (controller.loading.value) {
            return const Center(child: CircularProgressIndicator(color: AppColors.primary));
          }
          if (controller.error.value.isNotEmpty || controller.visit == null) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      controller.error.value.isNotEmpty ? controller.error.value : 'Visit not found',
                      textAlign: TextAlign.center,
                      style: GoogleFonts.inter(color: AppColors.slate300),
                    ),
                    const SizedBox(height: 16),
                    TextButton(
                      onPressed: Get.back,
                      child: const Text('Back to visits'),
                    ),
                  ],
                ),
              ),
            );
          }

          final v = controller.visit!;
          final quotation = controller.quotation;
          final officers = _officerNames(v);

          return Container(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [AppColors.gradientStart, AppColors.gradientMid, AppColors.gradientEnd],
              ),
            ),
            child: RefreshIndicator(
              color: AppColors.primary,
              onRefresh: controller.load,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                children: [
                  _HeaderActions(controller: controller),
                  const SizedBox(height: 12),
                  if (controller.actionError.value.isNotEmpty) ...[
                    _ErrorBanner(message: controller.actionError.value),
                    const SizedBox(height: 12),
                  ],
                  Row(
                    children: [
                      Expanded(
                        child: _InfoCard(
                          label: 'Customer',
                          icon: Icons.person_outline_rounded,
                          child: _customerLink(v),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: _InfoCard(
                          label: 'Officer',
                          icon: Icons.badge_outlined,
                          child: Text(
                            officers.isNotEmpty ? officers : '—',
                            style: GoogleFonts.inter(
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                  if ((v['location'] as String?)?.trim().isNotEmpty == true) ...[
                    const SizedBox(height: 12),
                    _InfoCard(
                      label: 'Site',
                      icon: Icons.place_outlined,
                      child: Text(
                        (v['location'] as String).trim(),
                        style: GoogleFonts.inter(fontSize: 14, color: AppColors.slate300, height: 1.4),
                      ),
                    ),
                  ],
                  const SizedBox(height: 16),
                  ...controller.diaryEvents.map((ev) => Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: _DiaryEventCard(event: ev),
                      )),
                  if (quotation != null) ...[
                    const SizedBox(height: 4),
                    _LinkedQuotationCard(
                      quotation: quotation,
                      onTap: () {
                        final id = (quotation['id'] as num?)?.toInt();
                        if (id != null) {
                          Get.toNamed(AppRoutes.quotationDetail, arguments: id);
                        }
                      },
                    ),
                  ],
                ],
              ),
            ),
          );
        }),
      ),
    );
  }

  static String _officerNames(Map<String, dynamic> visit) {
    final raw = visit['officers'];
    if (raw is List && raw.isNotEmpty) {
      return raw
          .map((o) => o is Map ? (o['full_name'] as String?)?.trim() : null)
          .whereType<String>()
          .where((n) => n.isNotEmpty)
          .join(', ');
    }
    return (visit['officer_full_name'] as String?)?.trim() ?? '';
  }

  static Widget _customerLink(Map<String, dynamic> visit) {
    final name = (visit['customer_full_name'] as String?)?.trim();
    final customerId = (visit['customer_id'] as num?)?.toInt();
    if (customerId == null || name == null || name.isEmpty) {
      return Text('—', style: GoogleFonts.inter(fontSize: 14, color: AppColors.slate300));
    }
    return InkWell(
      onTap: () => Get.toNamed(AppRoutes.customerDetail, arguments: customerId),
      child: Text(
        name,
        style: GoogleFonts.inter(
          fontSize: 14,
          fontWeight: FontWeight.w700,
          color: AppColors.primary,
          decoration: TextDecoration.underline,
          decorationColor: AppColors.primary,
        ),
      ),
    );
  }
}

class _HeaderActions extends StatelessWidget {
  const _HeaderActions({required this.controller});

  final QuotationVisitDetailController controller;

  @override
  Widget build(BuildContext context) {
    final quotation = controller.quotation;
    final v = controller.visit!;
    final customerId = (v['customer_id'] as num?)?.toInt();

    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
          if (controller.canCreateQuotation)
            Obx(() {
              final busy = controller.creatingQuotation.value;
              return TextButton.icon(
                onPressed: busy
                    ? null
                    : () async {
                        final id = await controller.createQuotation();
                        if (id != null) {
                          await Get.toNamed(AppRoutes.quotationForm, arguments: id);
                        }
                      },
                icon: busy
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.slate900),
                      )
                    : Icon(Icons.add_rounded, size: 18),
                label: Text(busy ? 'Creating…' : 'Create quotation'),
                style: TextButton.styleFrom(
                  foregroundColor: AppColors.slate900,
                  backgroundColor: AppColors.primary,
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                ),
              );
            }),
          if (quotation != null)
            OutlinedButton.icon(
              onPressed: () {
                final id = (quotation['id'] as num?)?.toInt();
                if (id != null) Get.toNamed(AppRoutes.quotationDetail, arguments: id);
              },
              icon: Icon(Icons.description_outlined, size: 18),
              label: Text((quotation['quotation_number'] as String?) ?? 'Quotation'),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.slate900,
                side: BorderSide(color: AppColors.whiteOverlay(0.25)),
              ),
            ),
          if (controller.canSetupWorkJob && customerId != null)
            OutlinedButton.icon(
              onPressed: () {
                final qid = (quotation!['id'] as num?)?.toInt();
                if (qid == null) return;
                showQuotationWorkJobChoiceSheet(
                  context,
                  customerId: customerId,
                  quotationId: qid,
                  visitJobId: controller.visitId,
                  workAddressId: (v['work_address_id'] as num?)?.toInt(),
                );
              },
              icon: Icon(Icons.work_outline_rounded, size: 18),
              label: const Text('Set up work job'),
              style: OutlinedButton.styleFrom(
                foregroundColor: const Color(0xFF6EE7B7),
                side: BorderSide(color: Color(0xFF6EE7B7)),
              ),
            ),
        ],
    );
  }
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0x33F87171),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0x66F87171)),
      ),
      child: Text(message, style: GoogleFonts.inter(fontSize: 13, color: const Color(0xFFFECACA))),
    );
  }
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({
    required this.label,
    required this.icon,
    required this.child,
  });

  final String label;
  final IconData icon;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.slate200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 14, color: AppColors.slate400),
              const SizedBox(width: 6),
              Text(
                label.toUpperCase(),
                style: GoogleFonts.inter(
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.6,
                  color: AppColors.slate400,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          child,
        ],
      ),
    );
  }
}

class _DiaryEventCard extends StatelessWidget {
  const _DiaryEventCard({required this.event});

  final Map<String, dynamic> event;

  @override
  Widget build(BuildContext context) {
    final status = QuotationVisitFormatters.formatStatus(event['event_status'] as String?);
    final start = QuotationVisitFormatters.formatDateTime(event['start_time'] as String?);
    final duration = (event['duration_minutes'] as num?)?.toInt();
    final notes = (event['notes'] as String?)?.trim();
    final technical = _noteList(event['technical_notes']);
    final extra = _noteList(event['extra_submissions'], notesKey: 'notes');
    final timesheet = _timesheetList(event['timesheet_entries']);
    final totalSeconds = (event['timesheet_total_seconds'] as num?)?.toInt() ?? 0;

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.slate200),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.whiteOverlay(0.04),
              border: Border(bottom: BorderSide(color: AppColors.whiteOverlay(0.08))),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.calendar_today_rounded, size: 16, color: AppColors.slate400),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text.rich(
                        TextSpan(
                          children: [
                            TextSpan(
                              text: start,
                              style: GoogleFonts.inter(
                                fontSize: 14,
                                fontWeight: FontWeight.w700,
                                color: Colors.white,
                              ),
                            ),
                            if (duration != null)
                              TextSpan(
                                text: ' · $duration min',
                                style: GoogleFonts.inter(fontSize: 14, color: AppColors.slate400),
                              ),
                          ],
                        ),
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: AppColors.whiteOverlay(0.08),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        status,
                        style: GoogleFonts.inter(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: AppColors.slate300,
                        ),
                      ),
                    ),
                  ],
                ),
                if (notes != null && notes.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(notes, style: GoogleFonts.inter(fontSize: 13, color: AppColors.slate300, height: 1.4)),
                ],
              ],
            ),
          ),
          if (timesheet.isNotEmpty)
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(Icons.schedule_rounded, size: 16, color: AppColors.slate400),
                      const SizedBox(width: 8),
                      Text(
                        'Timesheet (${QuotationVisitFormatters.formatDurationSeconds(totalSeconds)})',
                        style: GoogleFonts.inter(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  ...timesheet.map((te) => Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: _TimesheetRow(entry: te),
                      )),
                ],
              ),
            ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Officer site notes',
                  style: GoogleFonts.inter(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.slate900),
                ),
                const SizedBox(height: 10),
                if (technical.isEmpty && extra.isEmpty)
                  Text(
                    'No site notes yet. Officer can add notes from the mobile app during the visit.',
                    style: GoogleFonts.inter(
                      fontSize: 13,
                      fontStyle: FontStyle.italic,
                      color: AppColors.slate500,
                      height: 1.4,
                    ),
                  )
                else ...[
                  ...technical.map((n) => _NoteBlock(note: n)),
                  ...extra.map((n) => _NoteBlock(note: n)),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  static List<Map<String, dynamic>> _noteList(dynamic raw, {String notesKey = 'notes'}) {
    if (raw is! List) return [];
    return raw
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .where((e) {
          final text = (e[notesKey] as String?)?.trim();
          return text != null && text.isNotEmpty;
        })
        .toList();
  }

  static List<Map<String, dynamic>> _timesheetList(dynamic raw) {
    if (raw is! List) return [];
    return raw.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  }
}

class _TimesheetRow extends StatelessWidget {
  const _TimesheetRow({required this.entry});

  final Map<String, dynamic> entry;

  @override
  Widget build(BuildContext context) {
    final name = (entry['officer_full_name'] as String?)?.trim() ?? 'Officer';
    final segment = QuotationVisitFormatters.formatSegmentType(entry['segment_type'] as String?);
    final duration = QuotationVisitFormatters.formatDurationSeconds((entry['duration_seconds'] as num?)?.toInt() ?? 0);
    final clockIn = QuotationVisitFormatters.formatDateTime(entry['clock_in'] as String?);
    final clockOut = entry['clock_out'] as String?;
    final range = clockOut == null ? '$clockIn (open)' : '$clockIn → ${QuotationVisitFormatters.formatDateTime(clockOut)}';

    return Text(
      '$name · $segment · $duration · $range',
      style: GoogleFonts.inter(fontSize: 12, color: AppColors.slate300, height: 1.4),
    );
  }
}

class _NoteBlock extends StatelessWidget {
  const _NoteBlock({required this.note});

  final Map<String, dynamic> note;

  @override
  Widget build(BuildContext context) {
    final text = (note['notes'] as String?)?.trim() ?? '';
    final author = (note['created_by_name'] as String?)?.trim() ?? 'Officer';
    final when = QuotationVisitFormatters.formatDateTime(note['created_at'] as String?);

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.whiteOverlay(0.04),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.slate200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (text.isNotEmpty)
            Text(text, style: GoogleFonts.inter(fontSize: 13, color: AppColors.slate50, height: 1.45)),
          const SizedBox(height: 8),
          Text(
            '$author · $when',
            style: GoogleFonts.inter(fontSize: 11, color: AppColors.slate500),
          ),
        ],
      ),
    );
  }
}

class _LinkedQuotationCard extends StatelessWidget {
  const _LinkedQuotationCard({required this.quotation, required this.onTap});

  final Map<String, dynamic> quotation;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final number = (quotation['quotation_number'] as String?) ?? 'Quotation';
    final state = (quotation['state'] as String?) ?? '';
    final stateLabel = QuotationHelpers.stateLabel(state).toLowerCase();
    final accepted = state == 'accepted';

    return Material(
      color: const Color(0x3310B981),
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0x664ADE80)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Linked quotation',
                style: GoogleFonts.inter(fontSize: 14, fontWeight: FontWeight.w800, color: const Color(0xFFD1FAE5)),
              ),
              const SizedBox(height: 6),
              Text(
                '$number — $stateLabel${accepted ? ' · Ready to set up as work job' : ''}',
                style: GoogleFonts.inter(fontSize: 13, color: const Color(0xFF6EE7B7), height: 1.4),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
