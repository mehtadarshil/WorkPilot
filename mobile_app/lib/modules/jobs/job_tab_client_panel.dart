import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/network/api_exception.dart';
import '../../core/values/app_colors.dart';
import '../../core/values/app_constants.dart';
import '../../data/repositories/jobs_repository.dart';
import 'job_detail_controller.dart';
import 'job_formatters.dart';

String _extraKey(Map<String, dynamic> m) {
  final sid = m['extra_submission_id'];
  final fn = (m['stored_filename'] as String?) ?? '';
  return '$sid\t$fn';
}

/// Mirrors web **Client panel** (`JobClientPanelTab`).
class JobTabClientPanel extends StatefulWidget {
  const JobTabClientPanel({super.key});

  @override
  State<JobTabClientPanel> createState() => _JobTabClientPanelState();
}

class _JobTabClientPanelState extends State<JobTabClientPanel> {
  bool _loadingSubs = true;
  String? _subsErr;
  List<Map<String, dynamic>> _subs = [];

  int? _diaryEventId;
  bool _didAutoPickVisit = false;
  Map<String, dynamic>? _options;
  bool _optionsLoading = false;
  String? _optionsErr;
  final Set<int> _selectedQuestions = {};
  final Set<String> _selectedExtra = {};
  bool _notifyOffice = false;
  bool _submitting = false;
  String? _submitErr;
  String? _lastReportUrl;

  @override
  void initState() {
    super.initState();
    _loadSubs();
  }

  Future<void> _loadSubs() async {
    final c = Get.find<JobDetailController>();
    final jobs = Get.find<JobsRepository>();
    setState(() {
      _loadingSubs = true;
      _subsErr = null;
    });
    try {
      final list = await jobs.getClientSubmissions(c.jobId);
      if (mounted) setState(() => _subs = list);
    } on ApiException catch (e) {
      if (mounted) setState(() => _subsErr = e.message);
    } catch (e) {
      if (mounted) setState(() => _subsErr = '$e');
    } finally {
      if (mounted) setState(() => _loadingSubs = false);
    }
  }

  Future<void> _loadOptions() async {
    final id = _diaryEventId;
    final c = Get.find<JobDetailController>();
    final jobs = Get.find<JobsRepository>();
    if (id == null) {
      setState(() {
        _options = null;
        _optionsErr = null;
      });
      return;
    }
    setState(() {
      _optionsLoading = true;
      _optionsErr = null;
      _selectedQuestions.clear();
      _selectedExtra.clear();
    });
    try {
      final o = await jobs.getClientShareOptions(c.jobId, id);
      if (mounted) setState(() => _options = o);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _options = null;
          _optionsErr = e.message;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _options = null;
          _optionsErr = '$e';
        });
      }
    } finally {
      if (mounted) setState(() => _optionsLoading = false);
    }
  }

  String _reportUrlForToken(String pdfToken) {
    final origin = AppConstants.resolvedWebAppOrigin;
    if (origin.isEmpty) return '';
    return '$origin/public/job-client-report/$pdfToken';
  }

  Future<void> _copy(String url) async {
    await Clipboard.setData(ClipboardData(text: url));
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Copied')));
  }

  Future<void> _openUrl(String url) async {
    final u = Uri.tryParse(url);
    if (u == null) return;
    await launchUrl(u, mode: LaunchMode.externalApplication);
  }

  Future<void> _createShare() async {
    final id = _diaryEventId;
    final opt = _options;
    final c = Get.find<JobDetailController>();
    final jobs = Get.find<JobsRepository>();
    if (id == null || opt == null) return;
    if (_selectedQuestions.isEmpty && _selectedExtra.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Select at least one answer or file')));
      return;
    }
    setState(() {
      _submitting = true;
      _submitErr = null;
    });
    try {
      final rawExtra = opt['extra_media'];
      final extraList = rawExtra is List ? rawExtra : <dynamic>[];
      final extraMedia = <Map<String, dynamic>>[];
      for (final x in extraList) {
        if (x is! Map) continue;
        final m = Map<String, dynamic>.from(x);
        if (_selectedExtra.contains(_extraKey(m))) {
          extraMedia.add(<String, dynamic>{
            'extra_submission_id': m['extra_submission_id'],
            'stored_filename': m['stored_filename'],
          });
        }
      }
      final res = await jobs.postClientShare(
        c.jobId,
        id,
        <String, dynamic>{
          'report_question_ids': _selectedQuestions.toList(),
          'extra_media': extraMedia,
          'notify_office': _notifyOffice,
        },
      );
      final url = (res['report_url'] as String?)?.trim();
      if (mounted) {
        setState(() => _lastReportUrl = url);
      }
      await _loadSubs();
      await c.refreshAll();
    } on ApiException catch (e) {
      if (mounted) setState(() => _submitErr = e.message);
    } catch (e) {
      if (mounted) setState(() => _submitErr = '$e');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = Get.find<JobDetailController>();
    return Obx(() {
      final completed = c.diaryEvents.where((e) => diaryVisitIsCompleted(e['status'] as String?)).toList();
      if (!_didAutoPickVisit && completed.length == 1) {
        scheduleMicrotask(() {
          if (!mounted || _didAutoPickVisit) return;
          setState(() {
            _didAutoPickVisit = true;
            _diaryEventId = (completed.first['id'] as num?)?.toInt();
          });
          _loadOptions();
        });
      }

      return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: () async {
        await c.refreshAll();
        await _loadSubs();
        await _loadOptions();
      },
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          Text(
            'Share visit report with the customer',
            style: GoogleFonts.inter(color: AppColors.slate900, fontWeight: FontWeight.w800, fontSize: 16),
          ),
          const SizedBox(height: 8),
          Text(
            'Pick a completed visit, select job report answers and extra files, then create one customer link.',
            style: GoogleFonts.inter(color: AppColors.slate400, fontSize: 13, height: 1.4),
          ),
          const SizedBox(height: 16),
          if (completed.isEmpty)
            Text(
              'No completed visits yet. Complete a visit and submit the job report first.',
              style: GoogleFonts.inter(color: Colors.amber.shade200, fontSize: 13),
            )
          else ...[
            Text('Visit', style: GoogleFonts.inter(color: AppColors.slate400, fontSize: 12, fontWeight: FontWeight.w700)),
            const SizedBox(height: 6),
            DropdownButtonFormField<int?>(
              value: _diaryEventId != null && completed.any((e) => (e['id'] as num?)?.toInt() == _diaryEventId)
                  ? _diaryEventId
                  : null,
              decoration: InputDecoration(
                filled: true,
                fillColor: Colors.white,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
              dropdownColor: Colors.white,
              hint: Text('Select visit…', style: GoogleFonts.inter(color: AppColors.slate500)),
              items: [
                for (final v in completed)
                  DropdownMenuItem<int?>(
                    value: (v['id'] as num?)?.toInt(),
                    child: Text(
                      _visitLabel(v),
                      style: GoogleFonts.inter(color: AppColors.slate900, fontSize: 13),
                    ),
                  ),
              ],
              onChanged: (v) {
                setState(() => _diaryEventId = v);
                _loadOptions();
              },
            ),
          ],
          if (_optionsLoading) ...[
            const SizedBox(height: 16),
            const Center(child: CircularProgressIndicator(color: AppColors.primary)),
          ],
          if (_optionsErr != null) ...[
            const SizedBox(height: 12),
            Text(_optionsErr!, style: GoogleFonts.inter(color: Colors.redAccent, fontSize: 13)),
          ],
          if (_options != null && _diaryEventId != null) ...[
            const SizedBox(height: 20),
            Text('Job report answers', style: GoogleFonts.inter(color: AppColors.slate900, fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            ..._answerTiles(),
            const SizedBox(height: 20),
            Text('Extra photos & videos', style: GoogleFonts.inter(color: AppColors.slate900, fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            ..._extraTiles(),
            const SizedBox(height: 12),
            CheckboxListTile(
              value: _notifyOffice,
              onChanged: (v) => setState(() => _notifyOffice = v ?? false),
              title: Text(
                'Email job owner when email is configured',
                style: GoogleFonts.inter(color: AppColors.slate600, fontSize: 13),
              ),
              activeColor: AppColors.primary,
              tileColor: AppColors.slate100,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            if (_submitErr != null) ...[
              const SizedBox(height: 8),
              Text(_submitErr!, style: GoogleFonts.inter(color: Colors.redAccent, fontSize: 13)),
            ],
            const SizedBox(height: 12),
            FilledButton(
              onPressed: (_submitting || (_selectedQuestions.isEmpty && _selectedExtra.isEmpty)) ? null : _createShare,
              child: Text(_submitting ? 'Creating…' : 'Create customer link'),
            ),
            if (_lastReportUrl != null && _lastReportUrl!.isNotEmpty) ...[
              const SizedBox(height: 16),
              Material(
                color: AppColors.primary.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(12),
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Latest link', style: GoogleFonts.inter(color: AppColors.primary, fontWeight: FontWeight.w800, fontSize: 12)),
                      const SizedBox(height: 6),
                      SelectableText(_lastReportUrl!, style: GoogleFonts.inter(color: AppColors.slate900, fontSize: 12)),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        children: [
                          OutlinedButton(onPressed: () => _copy(_lastReportUrl!), child: const Text('Copy')),
                          OutlinedButton(onPressed: () => _openUrl(_lastReportUrl!), child: const Text('Open')),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ],
          const SizedBox(height: 28),
          Text('Shared reports', style: GoogleFonts.inter(color: AppColors.slate900, fontWeight: FontWeight.w800, fontSize: 16)),
          const SizedBox(height: 8),
          if (_loadingSubs)
            const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator(color: AppColors.primary)))
          else if (_subsErr != null)
            Text(_subsErr!, style: GoogleFonts.inter(color: AppColors.slate400))
          else if (_subs.isEmpty)
            Text('None yet.', style: GoogleFonts.inter(color: AppColors.slate500, fontSize: 13))
          else
            ..._subs.map((s) {
              final tok = (s['pdf_public_token'] as String?) ?? '';
              final created = (s['created_at'] as String?) ?? '';
              final name = (s['submitter_name'] as String?)?.trim();
              final url = _reportUrlForToken(tok);
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Material(
                  color: AppColors.slate100,
                  borderRadius: BorderRadius.circular(14),
                  child: ListTile(
                    title: Text(created, style: GoogleFonts.inter(color: AppColors.slate900, fontWeight: FontWeight.w600, fontSize: 13)),
                    subtitle: name != null && name.isNotEmpty ? Text(name, style: GoogleFonts.inter(color: AppColors.slate400, fontSize: 12)) : null,
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (url.isNotEmpty)
                          IconButton(
                            icon: Icon(Icons.copy_rounded, color: AppColors.primary),
                            onPressed: () => _copy(url),
                          ),
                        if (url.isNotEmpty)
                          IconButton(
                            icon: Icon(Icons.open_in_new_rounded, color: AppColors.primary),
                            onPressed: () => _openUrl(url),
                          ),
                      ],
                    ),
                  ),
                ),
              );
            }),
        ],
      ),
    );
    });
  }

  String _visitLabel(Map<String, dynamic> v) {
    final iso = v['start_time'] as String?;
    final rawOfficers = v['officers'];
    final officers = <Map<String, dynamic>>[];
    if (rawOfficers is List) {
      for (final o in rawOfficers) {
        if (o is Map) officers.add(Map<String, dynamic>.from(o));
      }
    }
    final officerNames = officers.isNotEmpty
        ? officers.map((o) => (o['full_name'] as String?)?.trim()).where((n) => n != null && n.isNotEmpty).join(', ')
        : (v['officer_full_name'] as String?)?.trim() ?? '';
    final d = iso != null ? DateTime.tryParse(iso) : null;
    final dateStr = d != null ? '${d.day}/${d.month}/${d.year}' : (iso ?? '');
    if (officerNames.isNotEmpty) return '$dateStr · $officerNames';
    return dateStr;
  }

  List<Widget> _answerTiles() {
    final raw = _options!['report_answers'];
    final list = raw is List ? raw : <dynamic>[];
    if (list.isEmpty) {
      return [Text('No answers for this visit.', style: GoogleFonts.inter(color: AppColors.slate500, fontSize: 13))];
    }
    return [
      for (final x in list)
                if (x is Map) _oneAnswer(Map<String, dynamic>.from(x)),
    ];
  }

  Widget _oneAnswer(Map<String, dynamic> a) {
    final qid = (a['question_id'] as num?)?.toInt();
    final prompt = (a['prompt'] as String?) ?? '';
    final has = a['has_value'] == true;
    if (qid == null) return const SizedBox.shrink();
    return CheckboxListTile(
      value: _selectedQuestions.contains(qid),
      onChanged: has
          ? (v) {
              setState(() {
                if (v == true) {
                  _selectedQuestions.add(qid);
                } else {
                  _selectedQuestions.remove(qid);
                }
              });
            }
          : null,
      title: Text(prompt, style: GoogleFonts.inter(color: has ? AppColors.slate900 : AppColors.slate500, fontSize: 13)),
      activeColor: AppColors.primary,
      tileColor: AppColors.slate100,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
    );
  }

  List<Widget> _extraTiles() {
    final raw = _options!['extra_media'];
    final list = raw is List ? raw : <dynamic>[];
    if (list.isEmpty) {
      return [Text('No extra files.', style: GoogleFonts.inter(color: AppColors.slate500, fontSize: 13))];
    }
    return [
      for (final x in list)
        if (x is Map) _oneExtra(Map<String, dynamic>.from(x)),
    ];
  }

  Widget _oneExtra(Map<String, dynamic> m) {
    final k = _extraKey(m);
    final name = (m['original_filename'] as String?) ?? (m['stored_filename'] as String?) ?? '';
    return CheckboxListTile(
      value: _selectedExtra.contains(k),
      onChanged: (v) {
        setState(() {
          if (v == true) {
            _selectedExtra.add(k);
          } else {
            _selectedExtra.remove(k);
          }
        });
      },
      title: Text(name, style: GoogleFonts.inter(color: AppColors.slate900, fontSize: 13)),
      activeColor: AppColors.primary,
      tileColor: AppColors.slate100,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
    );
  }
}
