import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';

import '../../core/network/api_exception.dart';
import '../../core/values/app_colors.dart';
import '../../data/repositories/jobs_repository.dart';
import 'job_detail_controller.dart';

/// Customer site / FRA report — mirrors web job tab **Reports** (`CustomerSiteReportTab`).
class JobTabSiteReports extends StatefulWidget {
  const JobTabSiteReports({super.key});

  @override
  State<JobTabSiteReports> createState() => _JobTabSiteReportsState();
}

class _JobTabSiteReportsState extends State<JobTabSiteReports> {
  bool _loading = true;
  bool _saving = false;
  String? _err;
  Map<String, dynamic>? _report;
  Map<String, dynamic>? _templateDef;
  int? _customerId;
  int? _workAddressId;
  int? _reportId;

  final Map<String, TextEditingController> _textCtr = {};
  final Map<String, String?> _yesNo = {};
  TextEditingController? _titleCtr;

  @override
  void dispose() {
    _disposeFieldControllers();
    super.dispose();
  }

  void _disposeFieldControllers() {
    for (final c in _textCtr.values) {
      c.dispose();
    }
    _textCtr.clear();
    _yesNo.clear();
    _titleCtr?.dispose();
    _titleCtr = null;
  }

  Map<String, dynamic> _jsonClone(Map<String, dynamic> m) =>
      Map<String, dynamic>.from(jsonDecode(jsonEncode(m)) as Map);

  void _collectFields(Map<String, dynamic> def, List<Map<String, dynamic>> out) {
    final sections = def['sections'];
    if (sections is List) {
      for (final s in sections) {
        if (s is! Map) continue;
        final fields = s['fields'];
        if (fields is List) {
          for (final f in fields) {
            if (f is Map) out.add(Map<String, dynamic>.from(f));
          }
        }
      }
    }
    final footer = def['footer'];
    if (footer is Map) {
      final fields = footer['fields'];
      if (fields is List) {
        for (final f in fields) {
          if (f is Map) out.add(Map<String, dynamic>.from(f));
        }
      }
    }
  }

  Future<void> _load() async {
    final c = Get.find<JobDetailController>();
    final jobs = Get.find<JobsRepository>();
    final j = c.job.value;
    final cid = (j?['customer_id'] as num?)?.toInt();
    if (cid == null) {
      setState(() {
        _loading = false;
        _err = 'Missing customer';
      });
      return;
    }
    int? waId = (j?['work_address_id'] as num?)?.toInt();
    final wa = j?['work_address'];
    if (waId == null && wa is Map) {
      waId = (wa['id'] as num?)?.toInt();
    }

    setState(() {
      _loading = true;
      _err = null;
      _disposeFieldControllers();
    });

    try {
      final payload = await jobs.getCustomerSiteReport(cid, workAddressId: waId);
      final rep = payload['report'];
      final tpl = payload['template'];
      if (rep is! Map) throw ApiException('Invalid site report response');
      final def = tpl is Map ? tpl['definition'] : null;
      if (def is! Map) throw ApiException('Invalid template');

      final reportMap = Map<String, dynamic>.from(rep);
      final defMap = Map<String, dynamic>.from(def);
      final doc = reportMap['document'];
      final values = doc is Map ? (doc['values'] as Map?) : null;
      final valueStr = <String, String>{};
      if (values != null) {
        for (final e in values.entries) {
          valueStr[e.key.toString()] = e.value?.toString() ?? '';
        }
      }

      final fields = <Map<String, dynamic>>[];
      _collectFields(defMap, fields);

      final titleText = (reportMap['report_title'] as String?)?.trim() ?? '';
      _titleCtr = TextEditingController(text: titleText);

      for (final f in fields) {
        final id = (f['id'] as String?) ?? '';
        if (id.isEmpty) continue;
        final type = (f['type'] as String?) ?? 'text';
        if (type == 'static_text') continue;
        final cur = valueStr[id] ?? '';
        if (type == 'yes_no_na') {
          _yesNo[id] = cur.isEmpty ? null : cur;
        } else if (type == 'image' || type == 'signature') {
          continue;
        } else {
          _textCtr[id] = TextEditingController(text: cur);
        }
      }

      if (!mounted) return;
      setState(() {
        _report = reportMap;
        _templateDef = defMap;
        _customerId = cid;
        _workAddressId = waId;
        _reportId = (reportMap['id'] as num?)?.toInt();
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _err = e.message);
    } catch (e) {
      if (mounted) setState(() => _err = '$e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _save() async {
    final jobs = Get.find<JobsRepository>();
    final cid = _customerId;
    final rid = _reportId;
    final rep = _report;
    if (cid == null || rid == null || rep == null) return;

    setState(() => _saving = true);
    try {
      final doc = _jsonClone(Map<String, dynamic>.from((rep['document'] as Map?) ?? {}));
      final values = Map<String, dynamic>.from((doc['values'] as Map?) ?? {});
      for (final e in _textCtr.entries) {
        values[e.key] = e.value.text;
      }
      for (final e in _yesNo.entries) {
        values[e.key] = e.value ?? '';
      }
      doc['values'] = values;

      final title = _titleCtr?.text.trim();
      await jobs.putCustomerSiteReport(
        cid,
        <String, dynamic>{
          'report_id': rid,
          if (_workAddressId != null) 'work_address_id': _workAddressId,
          'document': doc,
          if (title != null && title.isNotEmpty) 'report_title': title,
        },
      );
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Saved')));
      await _load();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _downloadPdf() async {
    final jobs = Get.find<JobsRepository>();
    final cid = _customerId;
    final rid = _reportId;
    if (cid == null || rid == null) return;
    try {
      final bytes = await jobs.getCustomerSiteReportPdf(cid, rid);
      if (bytes.isEmpty) return;
      final dir = await getTemporaryDirectory();
      final f = File('${dir.path}/site-report-$rid.pdf');
      await f.writeAsBytes(bytes, flush: true);
      await OpenFilex.open(f.path);
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator(color: AppColors.primary));
    }
    if (_err != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(_err!, textAlign: TextAlign.center, style: GoogleFonts.inter(color: AppColors.slate400)),
              const SizedBox(height: 12),
              FilledButton(onPressed: _load, child: const Text('Retry')),
            ],
          ),
        ),
      );
    }
    final rep = _report!;
    final cert = rep['certificate_number']?.toString();
    final updated = rep['updated_at']?.toString();

    final fields = <Map<String, dynamic>>[];
    if (_templateDef != null) _collectFields(_templateDef!, fields);

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
                  'Site report',
                  style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18),
                ),
              ),
              FilledButton.tonal(onPressed: _downloadPdf, child: const Text('PDF')),
            ],
          ),
          if (cert != null && cert.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text('Certificate: $cert', style: GoogleFonts.inter(color: AppColors.slate300, fontSize: 13)),
          ],
          if (updated != null && updated.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text('Updated $updated', style: GoogleFonts.inter(color: AppColors.slate500, fontSize: 12)),
          ],
          const SizedBox(height: 16),
          TextField(
            controller: _titleCtr,
            style: GoogleFonts.inter(color: Colors.white),
            decoration: InputDecoration(
              labelText: 'Report title',
              labelStyle: GoogleFonts.inter(color: AppColors.slate400),
              filled: true,
              fillColor: AppColors.whiteOverlay(0.06),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Photos and signatures are best managed on the web dashboard.',
            style: GoogleFonts.inter(color: AppColors.slate500, fontSize: 12),
          ),
          const SizedBox(height: 16),
          for (final f in fields) ..._fieldWidgets(f),
          const SizedBox(height: 24),
          FilledButton(
            onPressed: _saving ? null : _save,
            child: _saving ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Save'),
          ),
        ],
      ),
    );
  }

  List<Widget> _fieldWidgets(Map<String, dynamic> f) {
    final id = (f['id'] as String?) ?? '';
    final label = (f['label'] as String?) ?? id;
    final type = (f['type'] as String?) ?? 'text';
    if (id.isEmpty || type == 'static_text') return [];

    if (type == 'image' || type == 'signature') {
      return [
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Text('$label — attach on web', style: GoogleFonts.inter(color: AppColors.slate500, fontSize: 13)),
        ),
      ];
    }

    if (type == 'yes_no_na') {
      const opts = ['yes', 'no', 'na', 'not_determined', ''];
      return [
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: DropdownButtonFormField<String>(
            value: _yesNo[id] != null && _yesNo[id]!.isNotEmpty ? _yesNo[id] : null,
            decoration: InputDecoration(
              labelText: label,
              labelStyle: GoogleFonts.inter(color: AppColors.slate400),
              filled: true,
              fillColor: AppColors.whiteOverlay(0.06),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
            dropdownColor: const Color(0xFF1E293B),
            items: [
              const DropdownMenuItem(value: null, child: Text('—')),
              for (final o in opts.where((x) => x.isNotEmpty))
                DropdownMenuItem(value: o, child: Text(o)),
            ],
            onChanged: (v) => setState(() => _yesNo[id] = v),
          ),
        ),
      ];
    }

    final c = _textCtr[id];
    if (c == null) return [];

    final maxLines = type == 'textarea' ? 5 : 1;
    return [
      Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextField(
          controller: c,
          maxLines: maxLines,
          style: GoogleFonts.inter(color: Colors.white),
          decoration: InputDecoration(
            labelText: label,
            labelStyle: GoogleFonts.inter(color: AppColors.slate400),
            filled: true,
            fillColor: AppColors.whiteOverlay(0.06),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          ),
        ),
      ),
    ];
  }
}
