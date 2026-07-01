import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/values/app_colors.dart';
import '../../../data/repositories/mobile_repository.dart';
import 'settings_sheet_helpers.dart';

class InvoiceSettingsSheet extends StatefulWidget {
  const InvoiceSettingsSheet({super.key});

  @override
  State<InvoiceSettingsSheet> createState() => _InvoiceSettingsSheetState();
}

class _InvoiceSettingsSheetState extends State<InvoiceSettingsSheet> {
  bool _loading = true;
  bool _saving = false;
  String? _error;
  String? _success;

  final _currencyCtrl = TextEditingController(text: 'USD');
  final _prefixCtrl = TextEditingController(text: 'INV');
  final _termsCtrl = TextEditingController();
  final _dueDaysCtrl = TextEditingController(text: '30');
  final _afterDueReminderDaysCtrl = TextEditingController(text: '7');
  final _taxPctCtrl = TextEditingController(text: '0');
  final _footerCtrl = TextEditingController();
  final _paymentTermsCtrl = TextEditingController();
  final _bankDetailsCtrl = TextEditingController();
  final _accentCtrl = TextEditingController(text: '#14B8A6');
  final _accentEndCtrl = TextEditingController(text: '#0d9488');

  static const _currencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR', 'JPY'];

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _currencyCtrl.dispose();
    _prefixCtrl.dispose();
    _termsCtrl.dispose();
    _dueDaysCtrl.dispose();
    _afterDueReminderDaysCtrl.dispose();
    _taxPctCtrl.dispose();
    _footerCtrl.dispose();
    _paymentTermsCtrl.dispose();
    _bankDetailsCtrl.dispose();
    _accentCtrl.dispose();
    _accentEndCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final repo = Get.find<MobileRepository>();
      final s = await repo.fetchInvoiceSettings();
      setState(() {
        _currencyCtrl.text = s['default_currency'] as String? ?? 'USD';
        _prefixCtrl.text = s['invoice_prefix'] as String? ?? 'INV';
        _termsCtrl.text = s['terms_and_conditions'] as String? ?? '';
        _dueDaysCtrl.text = (s['default_due_days'] as num?)?.toString() ?? '30';
        _afterDueReminderDaysCtrl.text = (s['after_due_reminder_days'] as num?)?.toString() ?? '7';
        _taxPctCtrl.text = (s['default_tax_percentage'] as num?)?.toString() ?? '20';
        _footerCtrl.text = s['footer_text'] as String? ?? '';
        _paymentTermsCtrl.text = s['payment_terms'] as String? ?? '';
        _bankDetailsCtrl.text = s['bank_details'] as String? ?? '';
        _accentCtrl.text = s['invoice_accent_color'] as String? ?? '#14B8A6';
        _accentEndCtrl.text = s['invoice_accent_end_color'] as String? ?? '#0d9488';
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
      final payload = {
        'default_currency': _currencyCtrl.text.trim().isEmpty ? 'USD' : _currencyCtrl.text.trim(),
        'invoice_prefix': _prefixCtrl.text.trim().isEmpty ? 'INV' : _prefixCtrl.text.trim(),
        'terms_and_conditions': _termsCtrl.text.trim().isEmpty ? null : _termsCtrl.text.trim(),
        'default_due_days': int.tryParse(_dueDaysCtrl.text) ?? 30,
        'after_due_reminder_days': (int.tryParse(_afterDueReminderDaysCtrl.text) ?? 7).clamp(1, 30),
        'default_tax_percentage': double.tryParse(_taxPctCtrl.text) ?? 20,
        'footer_text': _footerCtrl.text.trim().isEmpty ? null : _footerCtrl.text.trim(),
        'payment_terms': _paymentTermsCtrl.text.trim().isEmpty ? null : _paymentTermsCtrl.text.trim(),
        'bank_details': _bankDetailsCtrl.text.trim().isEmpty ? null : _bankDetailsCtrl.text.trim(),
        'invoice_accent_color': _accentCtrl.text.trim().isEmpty ? '#14B8A6' : _accentCtrl.text.trim(),
        'invoice_accent_end_color': _accentEndCtrl.text.trim().isEmpty ? '#0d9488' : _accentEndCtrl.text.trim(),
      };
      await Get.find<MobileRepository>().patchInvoiceSettings(payload);
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
        sheetFieldLabel('Default currency'),
        _currencyDropdown(),
        sheetFieldLabel('Invoice prefix'),
        sheetTextField(_prefixCtrl, hint: 'INV'),
        sheetFieldLabel('Default due days'),
        sheetTextField(_dueDaysCtrl, hint: '30', keyboard: TextInputType.number),
        sheetFieldLabel('After due reminder days (1–30)'),
        sheetTextField(_afterDueReminderDaysCtrl, hint: '7', keyboard: TextInputType.number),
        sheetFieldLabel('Default tax %'),
        sheetTextField(_taxPctCtrl, hint: '0', keyboard: const TextInputType.numberWithOptions(decimal: true)),
        sheetFieldLabel('Terms and conditions'),
        sheetTextField(_termsCtrl, hint: 'Payment terms…', maxLines: 4),
        sheetFieldLabel('Payment terms (shown on invoice)'),
        sheetTextField(_paymentTermsCtrl, hint: 'Payment due within…', maxLines: 3),
        sheetFieldLabel('Bank details'),
        sheetTextField(_bankDetailsCtrl, hint: 'Bank: …\nSort code: …', maxLines: 4),
        sheetFieldLabel('Footer text'),
        sheetTextField(_footerCtrl, hint: 'Thank you for your business!', maxLines: 2),
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  sheetFieldLabel('Accent color'),
                  sheetTextField(_accentCtrl, hint: '#14B8A6'),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  sheetFieldLabel('Accent end'),
                  sheetTextField(_accentEndCtrl, hint: '#0d9488'),
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

  Widget _currencyDropdown() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14),
      decoration: BoxDecoration(
        color: AppColors.slate50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.slate300),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: _currencies.contains(_currencyCtrl.text) ? _currencyCtrl.text : 'USD',
          isExpanded: true,
          items: _currencies.map((c) => DropdownMenuItem(value: c, child: Text(c, style: GoogleFonts.inter(fontSize: 14)))).toList(),
          onChanged: (v) {
            if (v != null) setState(() => _currencyCtrl.text = v);
          },
        ),
      ),
    );
  }
}
