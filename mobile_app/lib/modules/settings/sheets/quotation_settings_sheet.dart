import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/values/app_colors.dart';
import '../../../data/repositories/mobile_repository.dart';
import 'settings_sheet_helpers.dart';

class QuotationSettingsSheet extends StatefulWidget {
  const QuotationSettingsSheet({super.key});

  @override
  State<QuotationSettingsSheet> createState() => _QuotationSettingsSheetState();
}

class _QuotationSettingsSheetState extends State<QuotationSettingsSheet> {
  bool _loading = true;
  bool _saving = false;
  String? _error;
  String? _success;

  final _currencyCtrl = TextEditingController(text: 'USD');
  final _prefixCtrl = TextEditingController(text: 'QUOT');
  final _termsCtrl = TextEditingController();
  final _validDaysCtrl = TextEditingController(text: '30');
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
    _validDaysCtrl.dispose();
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
      final s = await repo.fetchInvoiceSettings(); // company fields come from invoice settings
      final q = await repo.fetchQuotationSettings();
      setState(() {
        _currencyCtrl.text = q['default_currency'] as String? ?? s['default_currency'] as String? ?? 'USD';
        _prefixCtrl.text = q['quotation_prefix'] as String? ?? 'QUOT';
        _termsCtrl.text = q['terms_and_conditions'] as String? ?? '';
        _validDaysCtrl.text = (q['default_valid_days'] as num?)?.toString() ?? '30';
        _taxPctCtrl.text = (q['default_tax_percentage'] as num?)?.toString() ?? '20';
        _footerCtrl.text = q['footer_text'] as String? ?? '';
        _paymentTermsCtrl.text = q['payment_terms'] as String? ?? '';
        _bankDetailsCtrl.text = q['bank_details'] as String? ?? '';
        _accentCtrl.text = q['quotation_accent_color'] as String? ?? '#14B8A6';
        _accentEndCtrl.text = q['quotation_accent_end_color'] as String? ?? '#0d9488';
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
        'quotation_prefix': _prefixCtrl.text.trim().isEmpty ? 'QUOT' : _prefixCtrl.text.trim(),
        'terms_and_conditions': _termsCtrl.text.trim().isEmpty ? null : _termsCtrl.text.trim(),
        'default_valid_days': int.tryParse(_validDaysCtrl.text) ?? 30,
        'default_tax_percentage': double.tryParse(_taxPctCtrl.text) ?? 20,
        'footer_text': _footerCtrl.text.trim().isEmpty ? null : _footerCtrl.text.trim(),
        'payment_terms': _paymentTermsCtrl.text.trim().isEmpty ? null : _paymentTermsCtrl.text.trim(),
        'bank_details': _bankDetailsCtrl.text.trim().isEmpty ? null : _bankDetailsCtrl.text.trim(),
        'quotation_accent_color': _accentCtrl.text.trim().isEmpty ? '#14B8A6' : _accentCtrl.text.trim(),
        'quotation_accent_end_color': _accentEndCtrl.text.trim().isEmpty ? '#0d9488' : _accentEndCtrl.text.trim(),
      };
      await Get.find<MobileRepository>().patchQuotationSettings(payload);
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
        sheetFieldLabel('Quotation prefix'),
        sheetTextField(_prefixCtrl, hint: 'QUOT'),
        sheetFieldLabel('Default valid days'),
        sheetTextField(_validDaysCtrl, hint: '30', keyboard: TextInputType.number),
        sheetFieldLabel('Default tax %'),
        sheetTextField(_taxPctCtrl, hint: '0', keyboard: const TextInputType.numberWithOptions(decimal: true)),
        sheetFieldLabel('Terms and conditions'),
        sheetTextField(_termsCtrl, hint: 'Terms…', maxLines: 4),
        sheetFieldLabel('Payment terms'),
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
