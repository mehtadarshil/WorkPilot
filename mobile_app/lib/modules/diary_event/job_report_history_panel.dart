import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/services/storage_service.dart';
import '../../core/values/app_colors.dart';
import '../../core/values/app_constants.dart';
import '../../data/models/diary_extra_submission.dart';
import '../../data/models/job_report_history_models.dart';
import 'extra_submission_media_tiles.dart';

Uint8List? _bytesFromDataUrl(String? s) {
  if (s == null || !s.startsWith('data:image')) return null;
  final i = s.indexOf(',');
  if (i < 0) return null;
  try {
    return base64Decode(s.substring(i + 1));
  } catch (_) {
    return null;
  }
}

String _resolveImageUrl(String v) {
  final t = v.trim();
  if (t.startsWith('http://') || t.startsWith('https://')) return t;
  if (t.startsWith('/')) {
    final base = AppConstants.apiBaseUrl.replaceAll(RegExp(r'/+$'), '');
    return '$base$t';
  }
  return t;
}

/// Job report history list; [historyLoaded] turns true after the first fetch attempt.
class JobReportHistoryBody extends StatelessWidget {
  const JobReportHistoryBody({
    super.key,
    required this.historyLoaded,
    required this.historyError,
    required this.historyItems,
    this.showLoadingPlaceholder = false,
  });

  final RxBool historyLoaded;
  final RxString historyError;
  final RxList<JobReportHistorySubmission> historyItems;
  final bool showLoadingPlaceholder;

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      if (!historyLoaded.value) {
        if (showLoadingPlaceholder) {
          return const Padding(
            padding: EdgeInsets.symmetric(vertical: 24),
            child: Center(
              child: CircularProgressIndicator(color: AppColors.primary),
            ),
          );
        }
        return const SizedBox.shrink();
      }
      final err = historyError.value;
      final list = historyItems;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Completed visits on this job: full job report (except signatures) and any extra photos, videos & notes (signatures are not shown).',
            style: GoogleFonts.inter(fontSize: 12, height: 1.35, color: AppColors.slate400),
          ),
          if (err.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(err, style: GoogleFonts.inter(fontSize: 13, color: const Color(0xFFFFA8A8))),
          ],
          if (list.isEmpty && err.isEmpty) ...[
            const SizedBox(height: 10),
            Text(
              'No completed job reports on this job yet.',
              style: GoogleFonts.inter(fontSize: 14, color: AppColors.slate300),
            ),
          ],
          for (final sub in list) ...[
            const SizedBox(height: 14),
            _HistoryVisitCard(submission: sub),
          ],
        ],
      );
    });
  }
}

class _HistoryVisitCard extends StatelessWidget {
  const _HistoryVisitCard({required this.submission});

  final JobReportHistorySubmission submission;

  @override
  Widget build(BuildContext context) {
    final when = DateTime.tryParse(submission.startTimeIso)?.toLocal();
    final whenLabel = when == null
        ? 'Previous visit'
        : _formatVisitDateTime(when);
    final who = submission.officerFullName?.trim();
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        color: AppColors.whiteOverlay(0.06),
        border: Border.all(color: AppColors.whiteOverlay(0.1)),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              whenLabel,
              style: GoogleFonts.inter(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: AppColors.slate50,
              ),
            ),
            if (who != null && who.isNotEmpty) ...[
              const SizedBox(height: 2),
              Text(
                who,
                style: GoogleFonts.inter(fontSize: 12, color: AppColors.slate400),
              ),
            ],
            for (final a in submission.answers) ...[
              const SizedBox(height: 12),
              Text(
                a.prompt,
                style: GoogleFonts.inter(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: AppColors.slate400,
                ),
              ),
              if (a.helperText != null && a.helperText!.trim().isNotEmpty) ...[
                const SizedBox(height: 2),
                Text(
                  a.helperText!,
                  style: GoogleFonts.inter(
                    fontSize: 11,
                    height: 1.35,
                    color: AppColors.slate500,
                  ),
                ),
              ],
              const SizedBox(height: 4),
              _HistoryAnswerValue(answer: a),
            ],
            if (submission.extraSubmissions.isNotEmpty) ...[
              const SizedBox(height: 16),
              Text(
                'Extra on this visit',
                style: GoogleFonts.inter(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: AppColors.slate300,
                ),
              ),
              const SizedBox(height: 8),
              for (final ex in submission.extraSubmissions) ...[
                _HistoryExtraSubmissionCard(submission: ex),
                const SizedBox(height: 8),
              ],
            ],
          ],
        ),
      ),
    );
  }
}

class _HistoryExtraSubmissionCard extends StatelessWidget {
  const _HistoryExtraSubmissionCard({required this.submission});

  final DiaryExtraSubmission submission;

  @override
  Widget build(BuildContext context) {
    final t = Get.find<StorageService>().authToken;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        color: AppColors.whiteOverlay(0.05),
        border: Border.all(color: AppColors.whiteOverlay(0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            submission.createdAtIso.isNotEmpty ? submission.createdAtIso : '—',
            style: GoogleFonts.inter(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: AppColors.slate500,
            ),
          ),
          if (submission.displayName != null && submission.displayName!.trim().isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(
              submission.displayName!,
              style: GoogleFonts.inter(fontSize: 12, color: AppColors.slate400),
            ),
          ],
          if (submission.notes != null && submission.notes!.trim().isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              submission.notes!,
              style: GoogleFonts.inter(fontSize: 14, height: 1.4, color: AppColors.slate50),
            ),
          ],
          if (submission.media.isNotEmpty) ...[
            const SizedBox(height: 10),
            SizedBox(
              height: 88,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: submission.media.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (context, i) {
                  final m = submission.media[i];
                  if (m.kind == 'video') {
                    final tok = t;
                    if (tok == null || tok.isEmpty) {
                      return Container(
                        width: 88,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(10),
                          color: AppColors.whiteOverlay(0.08),
                          border: Border.all(color: AppColors.whiteOverlay(0.12)),
                        ),
                        child: const Icon(Icons.lock_outline, color: AppColors.slate500, size: 28),
                      );
                    }
                    return DecoratedBox(
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: AppColors.whiteOverlay(0.12)),
                      ),
                      child: AuthVideoPosterTile(
                        url: m.fullUrl,
                        token: tok,
                        onTap: () {
                          showDialog<void>(
                            context: context,
                            builder: (ctx) => ExtraSubmissionVideoDialog(
                              url: m.fullUrl,
                              token: tok,
                            ),
                          );
                        },
                      ),
                    );
                  }
                  return ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: Image.network(
                      m.fullUrl,
                      width: 88,
                      height: 88,
                      fit: BoxFit.cover,
                      headers: t != null && t.isNotEmpty ? {'Authorization': 'Bearer $t'} : null,
                      errorBuilder: (_, __, ___) => Container(
                        width: 88,
                        color: AppColors.slate900,
                        child: const Icon(Icons.broken_image_outlined, color: AppColors.slate500),
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _HistoryAnswerValue extends StatelessWidget {
  const _HistoryAnswerValue({required this.answer});

  final JobReportHistoryAnswer answer;

  @override
  Widget build(BuildContext context) {
    final v = answer.value.trim();
    if (v.isEmpty) {
      return Text('—', style: GoogleFonts.inter(fontSize: 14, color: AppColors.slate500));
    }
    switch (answer.questionType) {
      case 'before_photo':
      case 'after_photo':
        final bytes = _bytesFromDataUrl(v);
        if (bytes != null) {
          return ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: Image.memory(
              bytes,
              height: 140,
              width: double.infinity,
              fit: BoxFit.contain,
            ),
          );
        }
        if (v.startsWith('http://') || v.startsWith('https://') || v.startsWith('/')) {
          final uri = _resolveImageUrl(v);
          return ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: Image.network(
              uri,
              height: 140,
              width: double.infinity,
              fit: BoxFit.contain,
              errorBuilder: (_, __, ___) => Text(
                'Could not load image',
                style: GoogleFonts.inter(fontSize: 13, color: AppColors.slate400),
              ),
            ),
          );
        }
        return Text(v, style: GoogleFonts.inter(fontSize: 14, color: AppColors.slate50, height: 1.35));
      default:
        return Text(
          v,
          style: GoogleFonts.inter(fontSize: 14, color: AppColors.slate50, height: 1.4),
        );
    }
  }
}

String _formatVisitDateTime(DateTime l) {
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
