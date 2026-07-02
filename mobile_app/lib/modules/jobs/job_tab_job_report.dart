import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/network/api_exception.dart';
import '../../core/values/app_colors.dart';
import '../../data/repositories/jobs_repository.dart';
import 'job_detail_controller.dart';

class JobTabJobReport extends StatefulWidget {
  const JobTabJobReport({super.key});

  @override
  State<JobTabJobReport> createState() => _JobTabJobReportState();
}

class _JobTabJobReportState extends State<JobTabJobReport> {
  final _repo = Get.find<JobsRepository>();
  List<Map<String, dynamic>> _submissions = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final jobId = Get.find<JobDetailController>().jobId;
    if (mounted) setState(() { _loading = true; _error = null; });
    try {
      _submissions = await _repo.getJobReportHistory(jobId);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _fmtDate(String? iso) {
    if (iso == null || iso.isEmpty) return '';
    try {
      final d = DateTime.parse(iso);
      const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return '${d.day.toString().padLeft(2, '0')} ${m[d.month - 1]} ${d.year}';
    } catch (_) {
      return iso;
    }
  }

  String _fmtTime(String? iso) {
    if (iso == null || iso.isEmpty) return '';
    try {
      final d = DateTime.parse(iso);
      return '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
    } catch (_) {
      return '';
    }
  }

  Widget _card({required Widget child}) {
    return Container(
      padding: const EdgeInsets.all(14),
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: AppColors.slate200),
        borderRadius: BorderRadius.circular(18),
      ),
      child: child,
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator(color: AppColors.primary));
    }
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(_error!, textAlign: TextAlign.center, style: GoogleFonts.inter(color: AppColors.slate400)),
              const SizedBox(height: 12),
              FilledButton(onPressed: _load, child: const Text('Retry')),
            ],
          ),
        ),
      );
    }

    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Submitted Job Reports',
                  style: GoogleFonts.inter(color: AppColors.slate900, fontWeight: FontWeight.w800, fontSize: 18),
                ),
              ),
              if (_submissions.isNotEmpty)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: AppColors.blackOverlay(0.2),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    '${_submissions.length}',
                    style: GoogleFonts.inter(color: AppColors.primary, fontWeight: FontWeight.w800, fontSize: 12),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),
          if (_submissions.isEmpty)
            _card(
              child: Column(
                children: [
                  Text(
                    'No submitted job reports yet',
                    style: GoogleFonts.inter(color: AppColors.slate600, fontWeight: FontWeight.w700, fontSize: 15),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Reports appear here once a diary visit is marked complete and the engineer submits their job report.',
                    textAlign: TextAlign.center,
                    style: GoogleFonts.inter(color: AppColors.slate500, fontSize: 12),
                  ),
                ],
              ),
            )
          else
            for (final s in _submissions) _submissionCard(s),
        ],
      ),
    );
  }

  Widget _submissionCard(Map<String, dynamic> s) {
    final date = _fmtDate(s['start_time'] as String?);
    final time = _fmtTime(s['start_time'] as String?);
    final officer = (s['officer_full_name'] as String?) ?? 'Unknown officer';
    final rawAnswers = s['answers'];
    final answers = rawAnswers is List
        ? rawAnswers.map((e) => e is Map ? Map<String, dynamic>.from(e) : <String, dynamic>{}).toList()
        : <Map<String, dynamic>>[];
    final rawExtras = s['extra_submissions'];
    final extras = rawExtras is List
        ? rawExtras.map((e) => e is Map ? Map<String, dynamic>.from(e) : <String, dynamic>{}).toList()
        : <Map<String, dynamic>>[];

    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '$date · $time',
                      style: GoogleFonts.inter(color: AppColors.primary, fontWeight: FontWeight.w800, fontSize: 14),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      officer,
                      style: GoogleFonts.inter(color: AppColors.slate400, fontSize: 12),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          // Answers
          if (answers.isNotEmpty)
            Container(
              decoration: BoxDecoration(
                color: AppColors.blackOverlay(0.15),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                children: [
                  for (int i = 0; i < answers.length; i++) ...[
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            (answers[i]['prompt'] as String?) ?? 'Question',
                            style: GoogleFonts.inter(color: AppColors.slate400, fontSize: 11, fontWeight: FontWeight.w700),
                          ),
                          const SizedBox(height: 4),
                          _answerWidget(answers[i]),
                        ],
                      ),
                    ),
                    if (i < answers.length - 1)
                      Divider(height: 1, color: AppColors.whiteOverlay(0.08)),
                  ],
                ],
              ),
            ),
          // Extra submissions
          if (extras.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(
              'Extra submissions',
              style: GoogleFonts.inter(color: AppColors.slate400, fontSize: 11, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            for (final ex in extras) _extraCard(ex),
          ],
        ],
      ),
    );
  }

  Widget _answerWidget(Map<String, dynamic> ans) {
    final type = (ans['question_type'] as String?) ?? 'text';
    final value = (ans['value'] as String?) ?? '';

    if (value.isEmpty) {
      return Text(
        'No answer',
        style: GoogleFonts.inter(color: AppColors.slate500, fontSize: 12, fontStyle: FontStyle.italic),
      );
    }

    final isImage = type == 'customer_signature' ||
        type == 'officer_signature' ||
        type == 'before_photo' ||
        type == 'after_photo' ||
        value.startsWith('data:image');

    if (isImage) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(10),
        child: Image.network(
          value,
          height: 160,
          fit: BoxFit.contain,
          errorBuilder: (_, __, ___) => Text(
            'Image unavailable',
            style: GoogleFonts.inter(color: AppColors.slate500, fontSize: 12),
          ),
        ),
      );
    }

    if (type == 'textarea') {
      return Text(
        value,
        style: GoogleFonts.inter(color: AppColors.slate900, fontSize: 13),
      );
    }

    return Text(
      value,
      style: GoogleFonts.inter(color: AppColors.slate900, fontSize: 13),
    );
  }

  Widget _extraCard(Map<String, dynamic> ex) {
    final notes = (ex['notes'] as String?) ?? '';
    final author = (ex['display_name'] as String?) ??
        (ex['created_by_name'] as String?) ??
        'Unknown';
    final rawMedia = ex['media'];
    final media = rawMedia is List
        ? rawMedia.map((e) => e is Map ? Map<String, dynamic>.from(e) : <String, dynamic>{}).toList()
        : <Map<String, dynamic>>[];

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.blackOverlay(0.15),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.slate200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (notes.isNotEmpty)
            Text(notes, style: GoogleFonts.inter(color: AppColors.slate900, fontSize: 13)),
          if (notes.isNotEmpty) const SizedBox(height: 6),
          Text(author, style: GoogleFonts.inter(color: AppColors.slate500, fontSize: 11)),
          if (media.isNotEmpty) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final m in media)
                  if ((m['kind'] as String?) == 'video' || (m['content_type'] as String?)?.startsWith('video/') == true)
                    Chip(
                      label: Text(
                        (m['original_filename'] as String?) ?? 'Video',
                        style: GoogleFonts.inter(fontSize: 11),
                      ),
                      avatar: Icon(Icons.videocam_rounded, size: 16),
                    )
                  else
                    Chip(
                      label: Text(
                        (m['original_filename'] as String?) ?? 'Image',
                        style: GoogleFonts.inter(fontSize: 11),
                      ),
                      avatar: Icon(Icons.image_rounded, size: 16),
                    ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
