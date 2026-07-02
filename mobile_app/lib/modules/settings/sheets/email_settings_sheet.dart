import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/values/app_colors.dart';
import '../../../data/repositories/mobile_repository.dart';
import 'settings_sheet_helpers.dart';

class EmailSettingsSheet extends StatefulWidget {
  const EmailSettingsSheet({super.key});

  @override
  State<EmailSettingsSheet> createState() => _EmailSettingsSheetState();
}

class _EmailSettingsSheetState extends State<EmailSettingsSheet> {
  bool _loading = true;
  bool _saving = false;
  String? _error;
  String? _success;

  final _fromNameCtrl = TextEditingController();
  final _fromEmailCtrl = TextEditingController();
  final _replyToCtrl = TextEditingController();
  final _signatureCtrl = TextEditingController();
  final _testToCtrl = TextEditingController();
  bool _oauthConnected = false;
  String? _oauthProvider;

  List<Map<String, dynamic>> _templates = [];
  bool _sendingTest = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _fromNameCtrl.dispose();
    _fromEmailCtrl.dispose();
    _replyToCtrl.dispose();
    _signatureCtrl.dispose();
    _testToCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final repo = Get.find<MobileRepository>();
      final s = await repo.fetchEmailSettings();
      final tpls = await repo.fetchEmailTemplates();
      setState(() {
        _fromNameCtrl.text = s['from_name'] as String? ?? '';
        _fromEmailCtrl.text = s['from_email'] as String? ?? '';
        _replyToCtrl.text = s['reply_to'] as String? ?? '';
        _signatureCtrl.text = s['default_signature_html'] as String? ?? '';
        _oauthConnected = s['oauth_connected'] == true;
        _oauthProvider = s['oauth_provider'] as String?;
        _templates = tpls;
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
        'from_name': _fromNameCtrl.text.trim().isEmpty ? null : _fromNameCtrl.text.trim(),
        'from_email': _fromEmailCtrl.text.trim().isEmpty ? null : _fromEmailCtrl.text.trim(),
        'reply_to': _replyToCtrl.text.trim().isEmpty ? null : _replyToCtrl.text.trim(),
        'default_signature_html': _signatureCtrl.text.trim().isEmpty ? null : _signatureCtrl.text.trim(),
      };
      await Get.find<MobileRepository>().patchEmailSettings(payload);
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

  Future<void> _sendTest() async {
    final to = _testToCtrl.text.trim();
    if (to.isEmpty) return;
    setState(() => _sendingTest = true);
    try {
      await Get.find<MobileRepository>().postEmailTest(to);
      setState(() => _success = 'Test email sent to $to');
    } catch (e) {
      setState(() => _error = 'Test failed: $e');
    } finally {
      setState(() => _sendingTest = false);
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
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: _oauthConnected ? const Color(0xFFF0FFF4) : AppColors.slate50,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: _oauthConnected ? const Color(0xFF9AE6B4) : AppColors.slate300),
          ),
          child: Row(
            children: [
              Icon(
                _oauthConnected ? Icons.check_circle : Icons.mail_outline,
                color: _oauthConnected ? const Color(0xFF276749) : AppColors.slate500,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  _oauthConnected
                      ? 'Connected to ${_oauthProvider == 'google' ? 'Gmail' : _oauthProvider == 'microsoft' ? 'Outlook' : 'mailbox'}'
                      : 'OAuth mailbox not connected. Connect via web CRM for full setup.',
                  style: GoogleFonts.inter(
                    fontSize: 13,
                    color: _oauthConnected ? const Color(0xFF276749) : AppColors.slate500,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        sheetFieldLabel('From name'),
        sheetTextField(_fromNameCtrl, hint: 'Your company'),
        sheetFieldLabel('From email'),
        sheetTextField(_fromEmailCtrl, hint: 'billing@company.com', keyboard: TextInputType.emailAddress),
        sheetFieldLabel('Reply-To'),
        sheetTextField(_replyToCtrl, hint: 'support@company.com', keyboard: TextInputType.emailAddress),
        sheetFieldLabel('Default signature (HTML)'),
        sheetTextField(_signatureCtrl, hint: '<p>Regards, …</p>', maxLines: 4),
        const SizedBox(height: 8),
        sheetSaveButton(onPressed: _saving ? null : _save, saving: _saving, label: 'Save email settings'),
        const SizedBox(height: 20),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppColors.slate50,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.slate300),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Send test email', style: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 14, color: AppColors.slate900)),
              const SizedBox(height: 8),
              sheetTextField(_testToCtrl, hint: 'your@email.com', keyboard: TextInputType.emailAddress),
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: _sendingTest ? null : _sendTest,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.primary,
                    side: BorderSide(color: AppColors.primary),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  child: _sendingTest
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary))
                      : Text('Send test', style: GoogleFonts.inter(fontWeight: FontWeight.w700)),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        Text('Email templates', style: GoogleFonts.inter(fontWeight: FontWeight.w800, fontSize: 16, color: AppColors.slate900)),
        const SizedBox(height: 8),
        if (_templates.isEmpty)
          Text('No templates found.', style: GoogleFonts.inter(color: AppColors.slate500, fontSize: 13))
        else
          ..._templates.map((t) {
            final key = t['template_key'] as String? ?? '';
            final name = t['name'] as String? ?? key;
            return Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.slate50,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.slate300),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name, style: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 14, color: AppColors.slate900)),
                  Text('Key: $key', style: GoogleFonts.inter(fontSize: 12, color: AppColors.slate500)),
                  const SizedBox(height: 4),
                  Text(
                    t['subject'] as String? ?? '',
                    style: GoogleFonts.inter(fontSize: 13, color: AppColors.slate500),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            );
          }),
      ],
    );
  }
}
