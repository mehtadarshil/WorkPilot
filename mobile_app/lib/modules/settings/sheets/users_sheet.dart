import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/values/app_colors.dart';
import '../../../data/repositories/mobile_repository.dart';
import 'settings_sheet_helpers.dart';

class UsersSheet extends StatefulWidget {
  const UsersSheet({super.key});

  @override
  State<UsersSheet> createState() => _UsersSheetState();
}

class _UsersSheetState extends State<UsersSheet> {
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _users = [];
  int _totalPages = 1;
  int _page = 1;

  bool _showForm = false;
  int? _editingId;
  final _nameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _roleCtrl = TextEditingController();
  final _deptCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _bankNameCtrl = TextEditingController();
  final _sortCodeCtrl = TextEditingController();
  final _accountNumberCtrl = TextEditingController();
  String _state = 'active';
  String _accessLevel = 'standard';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _emailCtrl.dispose();
    _phoneCtrl.dispose();
    _roleCtrl.dispose();
    _deptCtrl.dispose();
    _passwordCtrl.dispose();
    _bankNameCtrl.dispose();
    _sortCodeCtrl.dispose();
    _accountNumberCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final data = await Get.find<MobileRepository>().fetchOfficers(page: _page, limit: 25);
      setState(() {
        _users = (data['officers'] as List?)?.cast<Map<String, dynamic>>() ?? [];
        _totalPages = (data['totalPages'] as num?)?.toInt() ?? 1;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = 'Failed to load: $e';
        _loading = false;
      });
    }
  }

  void _edit(Map<String, dynamic> u) {
    setState(() {
      _showForm = true;
      _editingId = u['id'] as int?;
      _nameCtrl.text = u['full_name'] as String? ?? '';
      _emailCtrl.text = u['email'] as String? ?? '';
      _phoneCtrl.text = u['phone'] as String? ?? '';
      _roleCtrl.text = u['role_position'] as String? ?? '';
      _deptCtrl.text = u['department'] as String? ?? '';
      _state = u['state'] as String? ?? 'active';
      _accessLevel = u['system_access_level'] as String? ?? 'standard';
      _bankNameCtrl.text = u['bank_name'] as String? ?? '';
      _sortCodeCtrl.text = u['sort_code'] as String? ?? '';
      _accountNumberCtrl.text = u['account_number'] as String? ?? '';
      _passwordCtrl.clear();
      _error = null;
    });
  }

  void _reset() {
    setState(() {
      _showForm = false;
      _editingId = null;
      _nameCtrl.clear();
      _emailCtrl.clear();
      _phoneCtrl.clear();
      _roleCtrl.clear();
      _deptCtrl.clear();
      _passwordCtrl.clear();
      _bankNameCtrl.clear();
      _sortCodeCtrl.clear();
      _accountNumberCtrl.clear();
      _state = 'active';
      _accessLevel = 'standard';
      _error = null;
    });
  }

  Future<void> _save() async {
    if (_nameCtrl.text.trim().isEmpty || _emailCtrl.text.trim().isEmpty) {
      setState(() => _error = 'Name and email are required');
      return;
    }
    try {
      final payload = {
        'full_name': _nameCtrl.text.trim(),
        'email': _emailCtrl.text.trim(),
        'phone': _phoneCtrl.text.trim().isEmpty ? null : _phoneCtrl.text.trim(),
        'role_position': _roleCtrl.text.trim().isEmpty ? null : _roleCtrl.text.trim(),
        'department': _deptCtrl.text.trim().isEmpty ? null : _deptCtrl.text.trim(),
        'state': _state,
        'system_access_level': _accessLevel,
        'bank_name': _bankNameCtrl.text.trim().isEmpty ? null : _bankNameCtrl.text.trim(),
        'sort_code': _sortCodeCtrl.text.trim().isEmpty ? null : _sortCodeCtrl.text.trim(),
        'account_number': _accountNumberCtrl.text.trim().isEmpty ? null : _accountNumberCtrl.text.trim(),
      };
      final repo = Get.find<MobileRepository>();
      if (_editingId != null) {
        final newPw = _passwordCtrl.text.trim();
        if (newPw.isNotEmpty) {
          if (newPw.length < 8) {
            setState(() => _error = 'Password must be at least 8 characters');
            return;
          }
          (payload as Map<String, dynamic>)['initial_password'] = newPw;
        }
        await repo.patchOfficer(_editingId!, payload);
      } else {
        final pw = _passwordCtrl.text.trim();
        if (pw.isEmpty || pw.length < 8) {
          setState(() => _error = 'Password is required (min 8 chars)');
          return;
        }
        (payload as Map<String, dynamic>)['initial_password'] = pw;
        await repo.postOfficer(payload);
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
        content: const Text('Delete this user?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Delete')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await Get.find<MobileRepository>().deleteOfficer(id);
      await _load();
    } catch (e) {
      setState(() => _error = 'Delete failed: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());

    if (_showForm) {
      return ListView(
        padding: const EdgeInsets.only(bottom: 24),
        children: [
          if (_error != null) sheetErrorBox(_error!),
          Text(
            _editingId != null ? 'Edit user' : 'Add user',
            style: GoogleFonts.inter(fontWeight: FontWeight.w800, fontSize: 16, color: AppColors.slate900),
          ),
          sheetFieldLabel('Full name *'),
          sheetTextField(_nameCtrl, hint: 'John Doe', capitalizeWords: true),
          sheetFieldLabel('Email *'),
          sheetTextField(_emailCtrl, hint: 'john@company.com', keyboard: TextInputType.emailAddress),
          sheetFieldLabel('Phone'),
          sheetTextField(_phoneCtrl, hint: '+1 234 567 8900', keyboard: TextInputType.phone),
          sheetFieldLabel('Role / position'),
          sheetTextField(_roleCtrl, hint: 'Manager'),
          sheetFieldLabel('Department'),
          sheetTextField(_deptCtrl, hint: 'Operations'),
          sheetFieldLabel('Status'),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14),
            decoration: BoxDecoration(
              color: AppColors.slate50,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.slate300),
            ),
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                value: _state,
                isExpanded: true,
                items: const [
                  DropdownMenuItem(value: 'active', child: Text('Active')),
                  DropdownMenuItem(value: 'inactive', child: Text('Inactive')),
                  DropdownMenuItem(value: 'on_leave', child: Text('On Leave')),
                  DropdownMenuItem(value: 'suspended', child: Text('Suspended')),
                  DropdownMenuItem(value: 'archived', child: Text('Archived')),
                ],
                onChanged: (v) {
                  if (v != null) setState(() => _state = v);
                },
              ),
            ),
          ),
          sheetFieldLabel('Access level'),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14),
            decoration: BoxDecoration(
              color: AppColors.slate50,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.slate300),
            ),
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                value: _accessLevel,
                isExpanded: true,
                items: const [
                  DropdownMenuItem(value: 'basic', child: Text('Basic')),
                  DropdownMenuItem(value: 'standard', child: Text('Standard')),
                  DropdownMenuItem(value: 'manager', child: Text('Manager')),
                  DropdownMenuItem(value: 'admin', child: Text('Admin')),
                  DropdownMenuItem(value: 'full', child: Text('Full')),
                ],
                onChanged: (v) {
                  if (v != null) setState(() => _accessLevel = v);
                },
              ),
            ),
          ),
          sheetFieldLabel('Bank name'),
          sheetTextField(_bankNameCtrl, hint: 'e.g. HSBC, Barclays'),
          sheetFieldLabel('Sort code'),
          sheetTextField(_sortCodeCtrl, hint: 'e.g. 12-34-56', keyboard: TextInputType.number),
          sheetFieldLabel('Account number'),
          sheetTextField(_accountNumberCtrl, hint: 'e.g. 12345678', keyboard: TextInputType.number),
          sheetFieldLabel(_editingId != null ? 'New password (optional)' : 'Password * (min 8 chars)'),
          sheetTextField(_passwordCtrl, hint: '••••••••', keyboard: TextInputType.visiblePassword),
          const SizedBox(height: 12),
          Row(
            children: [
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
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton(
                  onPressed: _save,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  child: Text(
                    _editingId != null ? 'Save' : 'Add user',
                    style: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 16),
                  ),
                ),
              ),
            ],
          ),
        ],
      );
    }

    return ListView(
      padding: const EdgeInsets.only(bottom: 24),
      children: [
        if (_error != null) sheetErrorBox(_error!),
        Row(
          children: [
            Expanded(
              child: Text('Users', style: GoogleFonts.inter(fontWeight: FontWeight.w800, fontSize: 16, color: AppColors.slate900)),
            ),
            FilledButton(
              onPressed: () => setState(() => _showForm = true),
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.primary,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 16),
              ),
              child: Text('Add', style: GoogleFonts.inter(fontWeight: FontWeight.w700)),
            ),
          ],
        ),
        const SizedBox(height: 12),
        if (_users.isEmpty)
          Text('No users found.', style: GoogleFonts.inter(color: AppColors.slate500, fontSize: 13))
        else
          ..._users.map((u) {
            final name = u['full_name'] as String? ?? '';
            final id = u['id'] as int? ?? 0;
            final email = u['email'] as String? ?? '';
            final state = u['state'] as String? ?? '';
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
                        Text(name, style: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 14, color: AppColors.slate900)),
                        Text(email, style: GoogleFonts.inter(fontSize: 12, color: AppColors.slate500)),
                        Text(
                          'Status: ${state.toUpperCase()}',
                          style: GoogleFonts.inter(fontSize: 11, color: AppColors.slate400),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: Icon(Icons.edit, size: 18, color: AppColors.primary),
                    onPressed: () => _edit(u),
                  ),
                  IconButton(
                    icon: Icon(Icons.delete, size: 18, color: Colors.redAccent),
                    onPressed: () => _delete(id),
                  ),
                ],
              ),
            );
          }),
        if (_totalPages > 1) ...[
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              IconButton(
                icon: Icon(Icons.chevron_left),
                onPressed: _page > 1 ? () { setState(() => _page--); _load(); } : null,
              ),
              Text('Page $_page of $_totalPages', style: GoogleFonts.inter(fontSize: 13, color: AppColors.slate500)),
              IconButton(
                icon: Icon(Icons.chevron_right),
                onPressed: _page < _totalPages ? () { setState(() => _page++); _load(); } : null,
              ),
            ],
          ),
        ],
      ],
    );
  }
}
