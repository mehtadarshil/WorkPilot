import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/values/app_colors.dart';
import '../../../data/repositories/mobile_repository.dart';
import 'settings_sheet_helpers.dart';

class CompanySettingsSheet extends StatefulWidget {
  const CompanySettingsSheet({super.key});

  @override
  State<CompanySettingsSheet> createState() => _CompanySettingsSheetState();
}

class _CompanySettingsSheetState extends State<CompanySettingsSheet> {
  bool _loading = true;
  bool _saving = false;
  String? _error;
  String? _success;

  final _nameCtrl = TextEditingController();
  final _logoCtrl = TextEditingController();
  final _websiteCtrl = TextEditingController();
  final _taxIdCtrl = TextEditingController();
  final _taxLabelCtrl = TextEditingController(text: 'Tax');
  final _addressCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _logoCtrl.dispose();
    _websiteCtrl.dispose();
    _taxIdCtrl.dispose();
    _taxLabelCtrl.dispose();
    _addressCtrl.dispose();
    _phoneCtrl.dispose();
    _emailCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final repo = Get.find<MobileRepository>();
      final s = await repo.fetchInvoiceSettings();
      setState(() {
        _nameCtrl.text = s['company_name'] as String? ?? '';
        _logoCtrl.text = s['company_logo'] as String? ?? '';
        _websiteCtrl.text = s['company_website'] as String? ?? '';
        _taxIdCtrl.text = s['company_tax_id'] as String? ?? '';
        _taxLabelCtrl.text = s['tax_label'] as String? ?? 'Tax';
        _addressCtrl.text = s['company_address'] as String? ?? '';
        _phoneCtrl.text = s['company_phone'] as String? ?? '';
        _emailCtrl.text = s['company_email'] as String? ?? '';
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = 'Failed to load settings: $e';
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
      final payload = {
        'company_name': _nameCtrl.text.trim().isEmpty ? 'WorkPilot' : _nameCtrl.text.trim(),
        'company_logo': _logoCtrl.text.trim().isEmpty ? null : _logoCtrl.text.trim(),
        'company_website': _websiteCtrl.text.trim().isEmpty ? null : _websiteCtrl.text.trim(),
        'company_tax_id': _taxIdCtrl.text.trim().isEmpty ? null : _taxIdCtrl.text.trim(),
        'tax_label': _taxLabelCtrl.text.trim().isEmpty ? 'Tax' : _taxLabelCtrl.text.trim(),
        'company_address': _addressCtrl.text.trim().isEmpty ? null : _addressCtrl.text.trim(),
        'company_phone': _phoneCtrl.text.trim().isEmpty ? null : _phoneCtrl.text.trim(),
        'company_email': _emailCtrl.text.trim().isEmpty ? null : _emailCtrl.text.trim(),
      };
      final repo = Get.find<MobileRepository>();
      await repo.patchInvoiceSettings(payload);
      await repo.patchQuotationSettings(payload);
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
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    return ListView(
      padding: const EdgeInsets.only(bottom: 24),
      children: [
        if (_error != null) sheetErrorBox(_error!),
        if (_success != null) sheetSuccessBox(_success!),
        sheetFieldLabel('Company logo URL'),
        sheetTextField(_logoCtrl, hint: 'https://… or base64 data URL'),
        if (_logoCtrl.text.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: Image.network(
                _logoCtrl.text,
                height: 48,
                fit: BoxFit.contain,
                errorBuilder: (_, __, ___) => Text(
                  'Unable to preview logo',
                  style: GoogleFonts.inter(color: AppColors.slate400, fontSize: 12),
                ),
              ),
            ),
          ),
        sheetFieldLabel('Company name'),
        sheetTextField(_nameCtrl, hint: 'WorkPilot'),
        sheetFieldLabel('Company website'),
        sheetTextField(_websiteCtrl, hint: 'https://example.com', keyboard: TextInputType.url),
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [sheetFieldLabel('Tax ID / VAT'), sheetTextField(_taxIdCtrl, hint: 'VAT123456789')],
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [sheetFieldLabel('Tax label'), sheetTextField(_taxLabelCtrl, hint: 'Tax')],
              ),
            ),
          ],
        ),
        sheetFieldLabel('Company address'),
        sheetTextField(_addressCtrl, hint: 'Street, City, Country', maxLines: 3),
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  sheetFieldLabel('Phone'),
                  sheetTextField(_phoneCtrl, hint: '+1 234 567 8900', keyboard: TextInputType.phone),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  sheetFieldLabel('Email'),
                  sheetTextField(_emailCtrl, hint: 'billing@company.com', keyboard: TextInputType.emailAddress),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 20),
        sheetSaveButton(onPressed: _saving ? null : _save, saving: _saving, label: 'Save changes'),
      ],
    );
  }
}
