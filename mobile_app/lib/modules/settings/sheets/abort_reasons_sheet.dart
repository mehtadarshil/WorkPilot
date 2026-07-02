import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/values/app_colors.dart';
import '../../../data/repositories/mobile_repository.dart';
import 'settings_sheet_helpers.dart';

class AbortReasonsSheet extends StatefulWidget {
  const AbortReasonsSheet({super.key});

  @override
  State<AbortReasonsSheet> createState() => _AbortReasonsSheetState();
}

class _AbortReasonsSheetState extends State<AbortReasonsSheet> {
  bool _loading = true;
  bool _saving = false;
  String? _error;
  String? _success;
  final _controllers = <TextEditingController>[];

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final c in _controllers) { c.dispose(); }
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final items = await Get.find<MobileRepository>().fetchAbortReasons();
      setState(() {
        _controllers.clear();
        for (final item in items) {
          _controllers.add(TextEditingController(text: item['label'] as String? ?? ''));
        }
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = 'Failed to load: $e';
        _loading = false;
      });
    }
  }

  void _add() {
    setState(() => _controllers.add(TextEditingController()));
  }

  void _remove(int index) {
    if (_controllers.length <= 1) {
      setState(() => _error = 'At least one reason is required');
      return;
    }
    setState(() {
      _controllers.removeAt(index);
      _error = null;
    });
  }

  void _move(int index, int dir) {
    final j = index + dir;
    if (j < 0 || j >= _controllers.length) return;
    setState(() {
      final tmp = _controllers[index];
      _controllers[index] = _controllers[j];
      _controllers[j] = tmp;
    });
  }

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _error = null;
      _success = null;
    });
    try {
      final reasons = _controllers.map((c) => {'label': c.text.trim()}).toList();
      await Get.find<MobileRepository>().putAbortReasons(reasons);
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
          'Field officers must pick one of these reasons when aborting a visit.',
          style: GoogleFonts.inter(fontSize: 13, color: AppColors.slate500),
        ),
        const SizedBox(height: 12),
        ..._controllers.asMap().entries.map((entry) {
          final i = entry.key;
          final c = entry.value;
          return Container(
            margin: const EdgeInsets.only(bottom: 8),
            child: Row(
              children: [
                Column(
                  children: [
                    IconButton(
                      icon: Icon(Icons.arrow_upward, size: 18),
                      onPressed: i == 0 ? null : () => _move(i, -1),
                      color: AppColors.slate500,
                    ),
                    IconButton(
                      icon: Icon(Icons.arrow_downward, size: 18),
                      onPressed: i == _controllers.length - 1 ? null : () => _move(i, 1),
                      color: AppColors.slate500,
                    ),
                  ],
                ),
                Expanded(child: sheetTextField(c, hint: 'Reason label')),
                IconButton(
                  icon: Icon(Icons.delete, size: 18, color: Colors.redAccent),
                  onPressed: () => _remove(i),
                ),
              ],
            ),
          );
        }),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: _add,
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.primary,
                  side: BorderSide(color: AppColors.primary),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                child: Text('Add reason', style: GoogleFonts.inter(fontWeight: FontWeight.w700)),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: FilledButton(
                onPressed: _saving ? null : _save,
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                child: _saving
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.slate900))
                    : Text('Save list', style: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 16)),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
