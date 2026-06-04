import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/values/app_colors.dart';
import '../../../data/repositories/mobile_repository.dart';
import 'settings_sheet_helpers.dart';

class ServiceRemindersSheet extends StatefulWidget {
  const ServiceRemindersSheet({super.key});

  @override
  State<ServiceRemindersSheet> createState() => _ServiceRemindersSheetState();
}

class _ServiceRemindersSheetState extends State<ServiceRemindersSheet> {
  bool _loading = true;
  bool _saving = false;
  bool _running = false;
  String? _error;
  String? _success;

  bool _enabled = false;
  String _recipientMode = 'customer_account';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final repo = Get.find<MobileRepository>();
      final s = await repo.fetchServiceReminders();
      setState(() {
        _enabled = s['automated_enabled'] == true;
        _recipientMode = s['recipient_mode'] as String? ?? 'customer_account';
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
      await Get.find<MobileRepository>().patchServiceReminders({
        'automated_enabled': _enabled,
        'recipient_mode': _recipientMode,
      });
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

  Future<void> _runNow() async {
    setState(() {
      _running = true;
      _error = null;
      _success = null;
    });
    try {
      final r = await Get.find<MobileRepository>().postRunServiceReminders();
      final svc = r['service_reminders'] as Map? ?? {};
      final srr = r['site_report_renewals'] as Map? ?? {};
      final job = r['job_office_task_reminders'] as Map? ?? {};
      final st = r['staff_reminders'] as Map? ?? {};
      setState(() {
        _success = 'Run finished. Renewals: sent ${svc['sent'] ?? 0}, skipped ${svc['skipped'] ?? 0}. '
            'Site reports: sent ${srr['sent'] ?? 0}. Job reminders: sent ${job['sent'] ?? 0}. '
            'Staff reminders: sent ${st['sent'] ?? 0}.';
        _running = false;
      });
    } catch (e) {
      setState(() {
        _error = 'Run failed: $e';
        _running = false;
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
        Row(
          children: [
            Switch(
              value: _enabled,
              onChanged: (v) => setState(() => _enabled = v),
              activeThumbColor: AppColors.primary,
              activeTrackColor: AppColors.primary.withValues(alpha: 0.4),
            ),
            Expanded(
              child: Text(
                'Send automated reminder emails',
                style: GoogleFonts.inter(fontWeight: FontWeight.w600, fontSize: 14, color: AppColors.slate900),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        sheetFieldLabel('Send reminders to'),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14),
          decoration: BoxDecoration(
            color: AppColors.slate50,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.slate300),
          ),
          child: DropdownButtonHideUnderline(
            child: DropdownButton<String>(
              value: _recipientMode,
              isExpanded: true,
              items: const [
                DropdownMenuItem(value: 'customer_account', child: Text('Customer account email')),
                DropdownMenuItem(value: 'job_contact', child: Text('Job contact')),
                DropdownMenuItem(value: 'primary_contact', child: Text('Primary customer contact')),
              ],
              onChanged: (v) {
                if (v != null) setState(() => _recipientMode = v);
              },
            ),
          ),
        ),
        const SizedBox(height: 20),
        sheetSaveButton(onPressed: _saving ? null : _save, saving: _saving, label: 'Save'),
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton(
            onPressed: _running ? null : _runNow,
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.primary,
              side: const BorderSide(color: AppColors.primary),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              padding: const EdgeInsets.symmetric(vertical: 14),
            ),
            child: _running
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary))
                : Text('Run pending reminders now', style: GoogleFonts.inter(fontWeight: FontWeight.w700)),
          ),
        ),
      ],
    );
  }
}
