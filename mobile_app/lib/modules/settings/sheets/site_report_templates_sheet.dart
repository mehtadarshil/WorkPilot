import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/values/app_colors.dart';
import '../../../data/repositories/mobile_repository.dart';
import 'settings_sheet_helpers.dart';

class SiteReportTemplatesSheet extends StatefulWidget {
  const SiteReportTemplatesSheet({super.key});

  @override
  State<SiteReportTemplatesSheet> createState() => _SiteReportTemplatesSheetState();
}

class _SiteReportTemplatesSheetState extends State<SiteReportTemplatesSheet> {
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _templates = [];

  int? _selectedId;
  final _nameCtrl = TextEditingController();
  final _jsonCtrl = TextEditingController();
  final _newNameCtrl = TextEditingController();
  bool _saving = false;
  bool _creating = false;

  @override
  void initState() {
    super.initState();
    _loadList();
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _jsonCtrl.dispose();
    _newNameCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadList() async {
    try {
      final items = await Get.find<MobileRepository>().fetchSiteReportTemplates();
      setState(() {
        _templates = items;
        _loading = false;
        if (_selectedId == null && items.isNotEmpty) {
          final fra = items.firstWhere((t) => t['slug'] == 'fra', orElse: () => items.first);
          _select(fra['id'] as int?);
        }
      });
    } catch (e) {
      setState(() {
        _error = 'Failed to load: $e';
        _loading = false;
      });
    }
  }

  Future<void> _select(int? id) async {
    if (id == null) return;
    setState(() => _selectedId = id);
    try {
      final t = await Get.find<MobileRepository>().fetchSiteReportTemplate(id);
      setState(() {
        _nameCtrl.text = t['name'] as String? ?? '';
        _jsonCtrl.text = const JsonEncoder.withIndent('  ').convert(t['definition']);
      });
    } catch (e) {
      setState(() => _error = 'Failed to load template: $e');
    }
  }

  Future<void> _save() async {
    if (_selectedId == null) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final def = jsonDecode(_jsonCtrl.text);
      await Get.find<MobileRepository>().putSiteReportTemplate(_selectedId!, {
        'name': _nameCtrl.text.trim(),
        'definition': def,
      });
      await _loadList();
      setState(() => _saving = false);
    } catch (e) {
      setState(() {
        _error = 'Save failed: $e';
        _saving = false;
      });
    }
  }

  Future<void> _create() async {
    if (_newNameCtrl.text.trim().isEmpty) {
      setState(() => _error = 'Enter a name');
      return;
    }
    setState(() => _creating = true);
    try {
      await Get.find<MobileRepository>().postSiteReportTemplate({
        'name': _newNameCtrl.text.trim(),
        'definition': {},
      });
      _newNameCtrl.clear();
      await _loadList();
      setState(() => _creating = false);
    } catch (e) {
      setState(() {
        _error = 'Create failed: $e';
        _creating = false;
      });
    }
  }

  Future<void> _delete(int id) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete?'),
        content: const Text('Delete this template?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Delete')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await Get.find<MobileRepository>().deleteSiteReportTemplate(id);
      if (_selectedId == id) {
        setState(() {
          _selectedId = null;
          _nameCtrl.clear();
          _jsonCtrl.clear();
        });
      }
      await _loadList();
    } catch (e) {
      setState(() => _error = 'Delete failed: $e');
    }
  }

  Future<void> _resetFra() async {
    try {
      final t = await Get.find<MobileRepository>().postResetFraTemplate();
      setState(() {
        _selectedId = t['id'] as int?;
        _nameCtrl.text = t['name'] as String? ?? '';
        _jsonCtrl.text = const JsonEncoder.withIndent('  ').convert(t['definition']);
      });
      await _loadList();
    } catch (e) {
      setState(() => _error = 'Reset failed: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());

    return ListView(
      padding: const EdgeInsets.only(bottom: 24),
      children: [
        if (_error != null) sheetErrorBox(_error!),
        Text('Templates', style: GoogleFonts.inter(fontWeight: FontWeight.w800, fontSize: 16, color: AppColors.slate900)),
        const SizedBox(height: 8),
        ..._templates.map((t) {
          final id = t['id'] as int? ?? 0;
          final name = t['name'] as String? ?? '';
          final slug = t['slug'] as String?;
          final selected = _selectedId == id;
          return Container(
            margin: const EdgeInsets.only(bottom: 6),
            decoration: BoxDecoration(
              color: selected ? const Color(0xFFE6FFFA) : AppColors.slate50,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: selected ? AppColors.primary : AppColors.slate300),
            ),
            child: ListTile(
              dense: true,
              title: Text(
                name,
                style: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 14, color: AppColors.slate900),
              ),
              subtitle: slug == 'fra' ? Text('Default', style: GoogleFonts.inter(fontSize: 11, color: AppColors.slate500)) : null,
              trailing: slug != 'fra'
                  ? IconButton(
                      icon: const Icon(Icons.delete, size: 18, color: Colors.redAccent),
                      onPressed: () => _delete(id),
                    )
                  : null,
              onTap: () => _select(id),
            ),
          );
        }),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(child: sheetTextField(_newNameCtrl, hint: 'New template name')),
            const SizedBox(width: 8),
            FilledButton(
              onPressed: _creating ? null : _create,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.primary,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
              ),
              child: _creating
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : Text('Create', style: GoogleFonts.inter(fontWeight: FontWeight.w700)),
            ),
          ],
        ),
        const SizedBox(height: 8),
        OutlinedButton(
          onPressed: _resetFra,
          style: OutlinedButton.styleFrom(
            foregroundColor: AppColors.slate500,
            side: BorderSide(color: AppColors.slate300),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            padding: const EdgeInsets.symmetric(vertical: 12),
          ),
          child: Text('Reset FRA to factory fields', style: GoogleFonts.inter(fontWeight: FontWeight.w600)),
        ),
        if (_selectedId != null) ...[
          const SizedBox(height: 20),
          sheetFieldLabel('Template name'),
          sheetTextField(_nameCtrl, hint: 'Template name'),
          sheetFieldLabel('Definition (JSON)'),
          sheetTextField(_jsonCtrl, hint: '{"sections": [...]}', maxLines: 16),
          const SizedBox(height: 12),
          sheetSaveButton(onPressed: _saving ? null : _save, saving: _saving, label: 'Save template'),
        ],
      ],
    );
  }
}
