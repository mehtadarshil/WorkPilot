import 'dart:convert';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/network/api_exception.dart';
import '../../core/values/app_colors.dart';
import '../../data/repositories/invoices_repository.dart';

String _stripHtml(String html) {
  var s = html.replaceAllMapped(RegExp(r'<a\s+(?:[^>]*?\s+)?href="([^"]*)"[^>]*>(.*?)</a>', caseSensitive: false), (match) {
    final url = match.group(1) ?? '';
    final text = match.group(2) ?? '';
    final cleanText = text.replaceAll(RegExp(r'<[^>]*>'), '').trim();
    if (cleanText.isEmpty) return url;
    if (cleanText == url.trim()) return url;
    return '$cleanText: $url';
  });
  s = s.replaceAll(RegExp(r'</p>|<br\s*/?>|</div>|</li>', caseSensitive: false), '\n');
  s = s.replaceAll(RegExp(r'<[^>]*>'), '');
  s = s.replaceAll('&nbsp;', ' ')
       .replaceAll('&amp;', '&')
       .replaceAll('&lt;', '<')
       .replaceAll('&gt;', '>')
       .replaceAll('&quot;', '"')
       .replaceAll('&#39;', "'");
  s = s.replaceAll(RegExp(r'[^\S\r\n]+'), ' ');
  s = s.replaceAll(RegExp(r' +(?=\n)'), '');
  s = s.replaceAll(RegExp(r'(?<=\n) +'), '');
  s = s.replaceAll(RegExp(r'\n{3,}'), '\n\n');
  return s.trim();
}

/// Official SMTP send — same API as web [InvoiceEmailComposer] `send-email` (issued invoices only).
Future<void> showInvoiceOfficialSendSheet(
  BuildContext context, {
  required int invoiceId,
  required VoidCallback onSent,
}) async {
  final repo = Get.find<InvoicesRepository>();
  Map<String, dynamic>? draft;
  try {
    draft = await repo.getEmailComposeDraft(invoiceId);
  } catch (_) {}

  if (!context.mounted) return;

  final toC = TextEditingController(text: (draft?['default_to'] as String?) ?? '');
  final ccC = TextEditingController();
  final bccC = TextEditingController();
  final subC = TextEditingController(text: (draft?['subject'] as String?) ?? '');
  final bodyPlain = _stripHtml((draft?['body_html'] as String?) ?? '');
  final bodyC = TextEditingController(text: bodyPlain);
  var appendSig = draft?['append_signature'] != false;
  var scheduleFollowUp = false;
  var showCc = false;
  var showBcc = false;
  final attachments = <Map<String, String>>[];

  final toOptions = <Map<String, String>>[];
  final rawOpts = draft?['to_email_options'];
  if (rawOpts is List) {
    for (final e in rawOpts) {
      if (e is Map) {
        final m = Map<String, dynamic>.from(e);
        final em = (m['email'] as String?)?.trim();
        if (em != null && em.isNotEmpty) {
          toOptions.add({'email': em, 'label': (m['label'] as String?)?.trim() ?? em});
        }
      }
    }
  }

  final smtpReady = draft?['smtp_ready'] == true;
  final canSend = draft?['can_send'] == true;
  final invState = (draft?['invoice_state'] as String?) ?? '';

  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    isDismissible: true,
    enableDrag: true,
    showDragHandle: true,
    useSafeArea: true,
    backgroundColor: Colors.white,
    builder: (ctx) {
      return StatefulBuilder(
        builder: (ctx, setS) {
          return Padding(
            padding: EdgeInsets.only(
              left: 16,
              right: 16,
              top: 8,
              bottom: MediaQuery.of(ctx).viewInsets.bottom + MediaQuery.paddingOf(ctx).bottom + 16,
            ),
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Text(
                          'Send invoice',
                          style: GoogleFonts.inter(color: AppColors.slate900, fontWeight: FontWeight.w800, fontSize: 18),
                        ),
                      ),
                      IconButton(
                        tooltip: 'Close',
                        visualDensity: VisualDensity.compact,
                        onPressed: () => Navigator.pop(ctx),
                        icon: Icon(Icons.close_rounded, color: Colors.black54),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  if (!smtpReady)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Text(
                        'Configure Email Settings (SMTP/OAuth) on the web before sending will succeed.',
                        style: GoogleFonts.inter(color: const Color(0xFFFBBF24), fontSize: 12),
                      ),
                    ),
                  if (!canSend)
                    Padding(
                      padding: EdgeInsets.only(top: smtpReady ? 0 : 8, bottom: 8),
                      child: Text(
                        'Invoice must be in Issued state before email send. Current: ${invState.replaceAll('_', ' ')}. Use Issue on the detail screen first.',
                        style: GoogleFonts.inter(color: const Color(0xFFFBBF24), fontSize: 12),
                      ),
                    ),
                  if (toOptions.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text('Quick pick', style: GoogleFonts.inter(color: AppColors.slate500, fontSize: 12)),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 6,
                      runSpacing: 8,
                      children: [
                        for (final o in toOptions)
                          ActionChip(
                            label: Text(o['label'] ?? o['email']!, style: GoogleFonts.inter(fontSize: 12)),
                            onPressed: () => setS(() => toC.text = o['email']!),
                          ),
                      ],
                    ),
                  ],
                  const SizedBox(height: 16),
                  TextField(
                    controller: toC,
                    style: GoogleFonts.inter(color: AppColors.slate900),
                    decoration: InputDecoration(
                      labelText: 'To',
                      labelStyle: TextStyle(color: Colors.black54),
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextButton(
                    style: TextButton.styleFrom(alignment: Alignment.centerLeft),
                    onPressed: () => setS(() => showCc = !showCc),
                    child: Text(showCc ? 'Hide CC' : 'Add CC', style: GoogleFonts.inter(color: AppColors.primary)),
                  ),
                  if (showCc) ...[
                    const SizedBox(height: 8),
                    TextField(
                      controller: ccC,
                      style: GoogleFonts.inter(color: AppColors.slate900),
                      decoration: InputDecoration(labelText: 'CC', labelStyle: TextStyle(color: Colors.black54)),
                    ),
                  ],
                  const SizedBox(height: 4),
                  TextButton(
                    style: TextButton.styleFrom(alignment: Alignment.centerLeft),
                    onPressed: () => setS(() => showBcc = !showBcc),
                    child: Text(showBcc ? 'Hide BCC' : 'Add BCC', style: GoogleFonts.inter(color: AppColors.primary)),
                  ),
                  if (showBcc) ...[
                    const SizedBox(height: 8),
                    TextField(
                      controller: bccC,
                      style: GoogleFonts.inter(color: AppColors.slate900),
                      decoration: InputDecoration(labelText: 'BCC', labelStyle: TextStyle(color: Colors.black54)),
                    ),
                  ],
                  const SizedBox(height: 16),
                  TextField(
                    controller: subC,
                    style: GoogleFonts.inter(color: AppColors.slate900),
                    decoration: InputDecoration(labelText: 'Subject', labelStyle: TextStyle(color: Colors.black54)),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: bodyC,
                    maxLines: 8,
                    style: GoogleFonts.inter(color: AppColors.slate900),
                    decoration: InputDecoration(
                      labelText: 'Message',
                      labelStyle: TextStyle(color: Colors.black54),
                    ),
                  ),
                  const SizedBox(height: 16),
                  SwitchListTile(
                    value: appendSig,
                    onChanged: (v) => setS(() => appendSig = v),
                    title: Text('Include email signature', style: GoogleFonts.inter(color: AppColors.slate900)),
                    activeThumbColor: AppColors.primary,
                  ),
                  const SizedBox(height: 4),
                  SwitchListTile(
                    value: scheduleFollowUp,
                    onChanged: (v) => setS(() => scheduleFollowUp = v),
                    title: Text('Add follow-up note after send', style: GoogleFonts.inter(color: AppColors.slate900, fontSize: 13)),
                    activeThumbColor: AppColors.primary,
                  ),
                  const SizedBox(height: 12),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton.icon(
                      onPressed: () async {
                        final r = await FilePicker.pickFiles(withData: true);
                        if (r == null || r.files.isEmpty) return;
                        final f = r.files.first;
                        List<int>? bytes;
                        if (f.bytes != null) {
                          bytes = f.bytes!.toList();
                        } else if (f.path != null) {
                          bytes = await File(f.path!).readAsBytes();
                        }
                        if (bytes == null || bytes.isEmpty) return;
                        final b64 = base64Encode(bytes);
                        final name = f.name.trim().isEmpty ? 'attachment' : f.name.trim();
                        setS(() {
                          attachments.add({
                            'filename': name,
                            'content_base64': b64,
                            'content_type': 'application/octet-stream',
                          });
                        });
                      },
                      icon: Icon(Icons.attach_file_rounded, color: AppColors.primary),
                      label: Text('Add attachment', style: GoogleFonts.inter(color: AppColors.primary)),
                    ),
                  ),
                  if (attachments.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    ...attachments.asMap().entries.map(
                      (e) => Padding(
                        padding: const EdgeInsets.only(bottom: 4),
                        child: ListTile(
                          dense: true,
                          contentPadding: EdgeInsets.zero,
                          title: Text(
                            e.value['filename'] ?? '',
                            style: GoogleFonts.inter(color: Colors.black54, fontSize: 13),
                          ),
                          trailing: IconButton(
                            icon: Icon(Icons.close_rounded, color: Colors.redAccent, size: 20),
                            onPressed: () => setS(() => attachments.removeAt(e.key)),
                          ),
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: 20),
                  FilledButton(
                    onPressed: !canSend
                        ? null
                        : () async {
                            final plain = bodyC.text.trim();
                            final to = toC.text.trim();
                            final subject = subC.text.trim();
                            if (to.isEmpty || subject.isEmpty || plain.isEmpty) return;
                            final esc = plain
                                .replaceAll('&', '&amp;')
                                .replaceAll('<', '&lt;')
                                .replaceAll('>', '&gt;');
                            var htmlBody = esc.replaceAll('\n', '<br/>');
                            final labelUrlRegex = RegExp(r'([a-zA-Z0-9\-\.\#\s\(\)]{2,100}):\s*(https?://[^\s<]+)');
                            htmlBody = htmlBody.replaceAllMapped(labelUrlRegex, (match) {
                              final label = match.group(1)!.trim();
                              final url = match.group(2)!;
                              return '<a href="$url">$label</a>';
                            });
                            final standaloneUrlRegex = RegExp(r'(?<!href=")(https?://[^\s<]+)(?![^<>]*>)');
                            htmlBody = htmlBody.replaceAllMapped(standaloneUrlRegex, (match) {
                              final url = match.group(1)!;
                              return '<a href="$url">$url</a>';
                            });
                            final html = '<p>$htmlBody</p>';
                            final atts = attachments
                                .map(
                                  (a) => {
                                    'filename': a['filename'],
                                    'content_base64': a['content_base64'],
                                    'content_type': a['content_type'] ?? 'application/octet-stream',
                                  },
                                )
                                .toList();
                            try {
                              await repo.sendInvoiceEmail(
                                invoiceId,
                                to: to,
                                cc: ccC.text.trim().isEmpty ? null : ccC.text.trim(),
                                bcc: bccC.text.trim().isEmpty ? null : bccC.text.trim(),
                                subject: subject,
                                bodyHtml: html,
                                appendSignature: appendSig,
                                attachments: atts.isEmpty ? null : atts,
                              );
                              if (scheduleFollowUp) {
                                try {
                                  await repo.postCommunication(
                                    invoiceId,
                                    {
                                      'type': 'note',
                                      'text': 'Follow-up suggested after emailing invoice. Subject: $subject',
                                    },
                                  );
                                } catch (_) {}
                              }
                              if (ctx.mounted) Navigator.pop(ctx);
                              onSent();
                            } on ApiException catch (err) {
                              if (ctx.mounted) {
                                ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(content: Text(err.message)));
                              }
                            }
                          },
                    child: const Text('Send'),
                  ),
                ],
              ),
            ),
          );
        },
      );
    },
  );
}
