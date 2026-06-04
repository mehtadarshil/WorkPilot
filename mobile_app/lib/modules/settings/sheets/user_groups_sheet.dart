import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/values/app_colors.dart';
import '../../../data/repositories/mobile_repository.dart';
import 'settings_sheet_helpers.dart';

class UserGroupsSheet extends StatefulWidget {
  const UserGroupsSheet({super.key});

  @override
  State<UserGroupsSheet> createState() => _UserGroupsSheetState();
}

class _UserGroupsSheetState extends State<UserGroupsSheet> {
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _items = [];
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
      final items = await Get.find<MobileRepository>().fetchUserGroups();
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

  Future<void> _add() async {
    if (_nameCtrl.text.trim().isEmpty) return;
    try {
      await Get.find<MobileRepository>().postUserGroup({'name': _nameCtrl.text.trim()});
      _nameCtrl.clear();
      await _load();
    } catch (e) {
      setState(() => _error = 'Add failed: $e');
    }
  }

  Future<void> _delete(int id) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete?'),
        content: const Text('Delete this user group?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Delete')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await Get.find<MobileRepository>().deleteUserGroup(id);
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
        sheetFieldLabel('Group name'),
        Row(
          children: [
            Expanded(child: sheetTextField(_nameCtrl, hint: 'e.g. Installation Team')),
            const SizedBox(width: 12),
            FilledButton(
              onPressed: _add,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.primary,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 20),
              ),
              child: Text('Add', style: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 16)),
            ),
          ],
        ),
        const SizedBox(height: 20),
        Text('Existing groups', style: GoogleFonts.inter(fontWeight: FontWeight.w800, fontSize: 16, color: AppColors.slate900)),
        const SizedBox(height: 8),
        if (_items.isEmpty)
          Text('No user groups created yet.', style: GoogleFonts.inter(color: AppColors.slate500, fontSize: 13))
        else
          ..._items.map((item) {
            final name = item['name'] as String? ?? '';
            final id = item['id'] as int? ?? 0;
            return Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
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
