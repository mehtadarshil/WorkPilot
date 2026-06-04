import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/values/app_colors.dart';
import '../../../data/repositories/mobile_repository.dart';
import 'settings_sheet_helpers.dart';

class JobDescriptionsSheet extends StatefulWidget {
  const JobDescriptionsSheet({super.key});

  @override
  State<JobDescriptionsSheet> createState() => _JobDescriptionsSheetState();
}

class _JobDescriptionsSheetState extends State<JobDescriptionsSheet> {
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _items = [];

  int? _editingId;
  final _nameCtrl = TextEditingController();
  final _skillsCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();
  String _priority = 'medium';
  String _businessUnit = '';
  bool _isServiceJob = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _skillsCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final items = await Get.find<MobileRepository>().fetchJobDescriptions();
      setState(() {
        _items = items;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = 'Failed to load: $e';
        _loading = false;
      });
    }
  }

  void _edit(Map<String, dynamic> item) {
    setState(() {
      _editingId = item['id'] as int?;
      _nameCtrl.text = item['name'] as String? ?? '';
      _skillsCtrl.text = item['default_skills'] as String? ?? '';
      _notesCtrl.text = item['default_job_notes'] as String? ?? '';
      _priority = item['default_priority'] as String? ?? 'medium';
      _businessUnit = item['default_business_unit'] as String? ?? '';
      _isServiceJob = item['is_service_job'] == true;
      _error = null;
    });
  }

  void _reset() {
    setState(() {
      _editingId = null;
      _nameCtrl.clear();
      _skillsCtrl.clear();
      _notesCtrl.clear();
      _priority = 'medium';
      _businessUnit = '';
      _isServiceJob = false;
      _error = null;
    });
  }

  Future<void> _save() async {
    if (_nameCtrl.text.trim().isEmpty) {
      setState(() => _error = 'Name is required');
      return;
    }
    try {
      final payload = {
        'name': _nameCtrl.text.trim(),
        'default_skills': _skillsCtrl.text.trim().isEmpty ? null : _skillsCtrl.text.trim(),
        'default_job_notes': _notesCtrl.text.trim().isEmpty ? null : _notesCtrl.text.trim(),
        'default_priority': _priority,
        'default_business_unit': _businessUnit.trim().isEmpty ? null : _businessUnit.trim(),
        'is_service_job': _isServiceJob,
      };
      final repo = Get.find<MobileRepository>();
      if (_editingId != null) {
        await repo.patchJobDescription(_editingId!, payload);
      } else {
        await repo.postJobDescription(payload);
      }
      _reset();
      await _load();
    } catch (e) {
      setState(() => _error = 'Save failed: $e');
    }
  }

  Future<void> _delete(int id) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete?'),
        content: const Text('Delete this job description?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Delete')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await Get.find<MobileRepository>().deleteJobDescription(id);
      if (_editingId == id) _reset();
      await _load();
    } catch (e) {
      setState(() => _error = 'Delete failed: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());

    return ListView(
      padding: const EdgeInsets.only(bottom: 24),
      children: [
        if (_error != null) sheetErrorBox(_error!),
        Text(
          _editingId != null ? 'Edit job description' : 'Add job description',
          style: GoogleFonts.inter(fontWeight: FontWeight.w800, fontSize: 16, color: AppColors.slate900),
        ),
        sheetFieldLabel('Name *'),
        sheetTextField(_nameCtrl, hint: 'e.g. Domestic Gas Boiler Service'),
        sheetFieldLabel('Default skills'),
        sheetTextField(_skillsCtrl, hint: 'e.g. Gas Safe, Plumbing'),
        sheetFieldLabel('Default job notes'),
        sheetTextField(_notesCtrl, hint: 'Carry out service…', maxLines: 3),
        sheetFieldLabel('Default priority'),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14),
          decoration: BoxDecoration(
            color: AppColors.slate50,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.slate300),
          ),
          child: DropdownButtonHideUnderline(
            child: DropdownButton<String>(
              value: _priority,
              isExpanded: true,
              items: const [
                DropdownMenuItem(value: 'low', child: Text('Low')),
                DropdownMenuItem(value: 'medium', child: Text('Medium')),
                DropdownMenuItem(value: 'high', child: Text('High')),
                DropdownMenuItem(value: 'critical', child: Text('Critical')),
              ],
              onChanged: (v) {
                if (v != null) setState(() => _priority = v);
              },
            ),
          ),
        ),
        sheetFieldLabel('Business unit'),
        sheetTextField(TextEditingController(text: _businessUnit), hint: 'None'),
        Row(
          children: [
            Checkbox(
              value: _isServiceJob,
              onChanged: (v) => setState(() => _isServiceJob = v ?? false),
              fillColor: WidgetStateProperty.resolveWith((states) => states.contains(WidgetState.selected) ? AppColors.primary : null),
            ),
            Expanded(
              child: Text(
                'This is a service job',
                style: GoogleFonts.inter(fontSize: 13, color: AppColors.slate500),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            if (_editingId != null)
              Expanded(
                child: OutlinedButton(
                  onPressed: _reset,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.slate500,
                    side: BorderSide(color: AppColors.slate300),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  child: Text('Cancel', style: GoogleFonts.inter(fontWeight: FontWeight.w700)),
                ),
              ),
            if (_editingId != null) const SizedBox(width: 12),
            Expanded(
              child: FilledButton(
                onPressed: _save,
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                child: Text(
                  _editingId != null ? 'Save' : 'Add',
                  style: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 16),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 20),
        Text('Existing descriptions', style: GoogleFonts.inter(fontWeight: FontWeight.w800, fontSize: 16, color: AppColors.slate900)),
        const SizedBox(height: 8),
        if (_items.isEmpty)
          Text('No job descriptions defined.', style: GoogleFonts.inter(color: AppColors.slate500, fontSize: 13))
        else
          ..._items.map((item) {
            final name = item['name'] as String? ?? '';
            final id = item['id'] as int? ?? 0;
            final isService = item['is_service_job'] == true;
            return Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.slate50,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.slate300),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(name, style: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 14, color: AppColors.slate900)),
                            ),
                            if (isService)
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFFFF3E0),
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: Text(
                                  'Service',
                                  style: GoogleFonts.inter(fontSize: 10, fontWeight: FontWeight.w700, color: const Color(0xFFE65100)),
                                ),
                              ),
                          ],
                        ),
                        Text(
                          '${item['default_priority'] as String? ?? ''} priority',
                          style: GoogleFonts.inter(fontSize: 12, color: AppColors.slate500),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.edit, size: 18, color: AppColors.primary),
                    onPressed: () => _edit(item),
                  ),
                  IconButton(
                    icon: const Icon(Icons.delete, size: 18, color: Colors.redAccent),
                    onPressed: () => _delete(id),
                  ),
                ],
              ),
            );
          }),
      ],
    );
  }
}
