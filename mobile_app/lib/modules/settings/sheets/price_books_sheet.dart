import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/values/app_colors.dart';
import '../../../data/repositories/mobile_repository.dart';
import 'settings_sheet_helpers.dart';

class PriceBooksSheet extends StatefulWidget {
  const PriceBooksSheet({super.key});

  @override
  State<PriceBooksSheet> createState() => _PriceBooksSheetState();
}

class _PriceBooksSheetState extends State<PriceBooksSheet> {
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _items = [];

  int? _editingId;
  final _nameCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final items = await Get.find<MobileRepository>().fetchPriceBooks();
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
      _error = null;
    });
  }

  void _reset() {
    setState(() {
      _editingId = null;
      _nameCtrl.clear();
      _error = null;
    });
  }

  Future<void> _save() async {
    if (_nameCtrl.text.trim().isEmpty) {
      setState(() => _error = 'Name is required');
      return;
    }
    try {
      final payload = {'name': _nameCtrl.text.trim()};
      final repo = Get.find<MobileRepository>();
      if (_editingId != null) {
        await repo.patchPriceBook(_editingId!, payload);
      } else {
        await repo.postPriceBook(payload);
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
        content: const Text('Delete this price book?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Delete')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await Get.find<MobileRepository>().deletePriceBook(id);
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
          _editingId != null ? 'Edit price book' : 'Add price book',
          style: GoogleFonts.inter(fontWeight: FontWeight.w800, fontSize: 16, color: AppColors.slate900),
        ),
        sheetFieldLabel('Name *'),
        sheetTextField(_nameCtrl, hint: 'e.g. Standard Pricing'),
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
        Text('Existing price books', style: GoogleFonts.inter(fontWeight: FontWeight.w800, fontSize: 16, color: AppColors.slate900)),
        const SizedBox(height: 8),
        if (_items.isEmpty)
          Text('No price books defined.', style: GoogleFonts.inter(color: AppColors.slate500, fontSize: 13))
        else
          ..._items.map((item) {
            final name = item['name'] as String? ?? '';
            final id = item['id'] as int? ?? 0;
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
                    child: Text(name, style: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 14, color: AppColors.slate900)),
                  ),
                  IconButton(
                    icon: Icon(Icons.edit, size: 18, color: AppColors.primary),
                    onPressed: () => _edit(item),
                  ),
                  IconButton(
                    icon: Icon(Icons.delete, size: 18, color: Colors.redAccent),
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
