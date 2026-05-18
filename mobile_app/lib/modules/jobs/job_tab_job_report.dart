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
  bool _loading = true;
  String? _err;
  List<Map<String, dynamic>> _questions = [];
  bool _saving = false;

  static const _types = <String>['text', 'textarea', 'customer_signature', 'officer_signature', 'before_photo', 'after_photo'];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final c = Get.find<JobDetailController>();
    final jobs = Get.find<JobsRepository>();
    setState(() {
      _loading = true;
      _err = null;
    });
    try {
      final list = await jobs.getJobReportQuestions(c.jobId);
      setState(() => _questions = list);
    } on ApiException catch (e) {
      setState(() {
        _err = e.message;
        _questions = [];
      });
    } catch (e) {
      setState(() {
        _err = '$e';
        _questions = [];
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _save() async {
    final c = Get.find<JobDetailController>();
    final jobs = Get.find<JobsRepository>();
    setState(() => _saving = true);
    try {
      final payload = _questions.asMap().entries.map((e) {
        final m = Map<String, dynamic>.from(e.value);
        m['sort_order'] = e.key;
        return m;
      }).toList();
      await jobs.putJobReportQuestions(c.jobId, payload);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Saved')));
      await _load();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _move(int i, int dir) {
    final j = i + dir;
    if (j < 0 || j >= _questions.length) return;
    setState(() {
      final t = _questions[i];
      _questions[i] = _questions[j];
      _questions[j] = t;
    });
  }

  void _add() {
    setState(() {
      _questions.add(<String, dynamic>{
        'question_type': 'text',
        'prompt': '',
        'helper_text': null,
        'required': true,
      });
    });
  }

  void _remove(int i) {
    setState(() => _questions.removeAt(i));
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator(color: AppColors.primary));
    }
    if (_err != null) {
      return Center(child: Text(_err!, style: GoogleFonts.inter(color: AppColors.slate400)));
    }
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  'Final job report template (this job)',
                  style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w800),
                ),
              ),
              IconButton(onPressed: _add, icon: const Icon(Icons.add_rounded, color: AppColors.primary)),
              FilledButton(
                onPressed: _saving ? null : _save,
                child: _saving ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Save'),
              ),
            ],
          ),
        ),
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: _questions.length,
            itemBuilder: (context, i) {
              final q = _questions[i];
              final type = (q['question_type'] as String?) ?? 'text';
              return Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Material(
                  color: AppColors.whiteOverlay(0.08),
                  borderRadius: BorderRadius.circular(14),
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Row(
                          children: [
                            IconButton(icon: const Icon(Icons.arrow_upward), onPressed: () => _move(i, -1)),
                            IconButton(icon: const Icon(Icons.arrow_downward), onPressed: () => _move(i, 1)),
                            const Spacer(),
                            IconButton(icon: const Icon(Icons.delete_outline, color: Colors.redAccent), onPressed: () => _remove(i)),
                          ],
                        ),
                        DropdownButtonFormField<String>(
                          isExpanded: true,
                          value: _types.contains(type) ? type : 'text',
                          dropdownColor: const Color(0xFF1e293b),
                          style: GoogleFonts.inter(color: Colors.white),
                          decoration: const InputDecoration(labelText: 'Type', labelStyle: TextStyle(color: Colors.white70)),
                          items: [for (final t in _types) DropdownMenuItem(value: t, child: Text(t))],
                          onChanged: (v) => setState(() => q['question_type'] = v ?? 'text'),
                        ),
                        TextFormField(
                          initialValue: (q['prompt'] as String?) ?? '',
                          onChanged: (v) => q['prompt'] = v,
                          style: GoogleFonts.inter(color: Colors.white),
                          decoration: const InputDecoration(
                            labelText: 'Prompt',
                            labelStyle: TextStyle(color: Colors.white70),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
