import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/values/app_colors.dart';
import '../../../data/repositories/mobile_repository.dart';
import 'settings_sheet_helpers.dart';

class JobReportTemplateSheet extends StatefulWidget {
  const JobReportTemplateSheet({super.key});

  @override
  State<JobReportTemplateSheet> createState() => _JobReportTemplateSheetState();
}

class _JobReportTemplateSheetState extends State<JobReportTemplateSheet> {
  bool _loading = true;
  bool _saving = false;
  String? _error;
  String? _success;
  final _jsonCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _jsonCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final t = await Get.find<MobileRepository>().fetchJobReportTemplate();
      setState(() {
        _jsonCtrl.text = const JsonEncoder.withIndent('  ').convert(t);
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = 'Failed to load: $e';
        _loading = false;
      });
    }
  }

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _error = null;
      _success = null;
    });
    try {
      final map = jsonDecode(_jsonCtrl.text) as Map<String, dynamic>;
      await Get.find<MobileRepository>().patchJobReportTemplate(map);
      setState(() {
        _success = 'Saved!';
        _saving = false;
      });
    } catch (e) {
      setState(() {
        _error = 'Save failed: $e';
        _saving = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());

    return ListView(
      padding: const EdgeInsets.only(bottom: 24),
      children: [
        if (_error != null) sheetErrorBox(_error!),
        if (_success != null) sheetSuccessBox(_success!),
        Text(
          'Edit the default job report template. For complex changes, use the web CRM.',
          style: GoogleFonts.inter(fontSize: 13, color: AppColors.slate500),
        ),
        const SizedBox(height: 12),
        sheetTextField(_jsonCtrl, hint: '{"questions": [...]}', maxLines: 20),
        const SizedBox(height: 20),
        sheetSaveButton(onPressed: _saving ? null : _save, saving: _saving, label: 'Save template'),
      ],
    );
  }
}
