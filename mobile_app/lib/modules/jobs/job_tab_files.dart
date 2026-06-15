import 'dart:convert';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';

import '../../core/network/api_exception.dart';
import '../../core/values/app_colors.dart';
import '../../data/providers/api_provider.dart';
import '../../data/repositories/jobs_repository.dart';
import 'job_detail_controller.dart';

class JobTabFiles extends StatefulWidget {
  const JobTabFiles({super.key});

  @override
  State<JobTabFiles> createState() => _JobTabFilesState();
}

class _JobTabFilesState extends State<JobTabFiles> {
  static const int _maxEmailAttachBytes = 8 * 1024 * 1024;
  static const int _maxEmailTotalBytes = 10 * 1024 * 1024;

  bool _loading = true;
  String? _err;
  List<Map<String, dynamic>> _files = [];
  final Set<String> _selectedIds = <String>{};
  bool _preparingEmail = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final c = Get.find<JobDetailController>();
    final jobs = Get.find<JobsRepository>();
    setState(() {
      _loading = true;
      _err = null;
    });
    try {
      final m = await jobs.getJobFilesManifest(c.jobId);
      final raw = m['files'];
      _files = raw is List
          ? raw.map((e) => e is Map ? Map<String, dynamic>.from(e) : <String, dynamic>{}).toList()
          : [];
      _selectedIds.removeWhere((id) => !_files.any((f) => _id(f) == id));
    } on ApiException catch (e) {
      _err = e.message;
      _files = [];
      _selectedIds.clear();
    } catch (e) {
      _err = '$e';
      _files = [];
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _id(Map<String, dynamic> f) => ((f['id'] as String?) ?? '').trim();

  String _label(Map<String, dynamic> f) {
    final label = ((f['label'] as String?) ?? '').trim();
    final source = ((f['source'] as String?) ?? '').trim();
    return label.isNotEmpty ? label : (source.isNotEmpty ? source : 'File');
  }

  String _sourceDetail(Map<String, dynamic> f) {
    final source = ((f['source'] as String?) ?? '').trim();
    final detail = ((f['source_detail'] as String?) ?? '').trim();
    final kind = ((f['kind'] as String?) ?? '').trim();
    return [
      if (source.isNotEmpty) source,
      if (detail.isNotEmpty) detail,
      if (kind.isNotEmpty) kind.toUpperCase(),
    ].join(' · ');
  }

  String _formatBytes(dynamic v) {
    final n = v is num ? v.toDouble() : double.tryParse('$v');
    if (n == null || !n.isFinite || n <= 0) return '—';
    if (n < 1024) return '${n.round()} B';
    if (n < 1024 * 1024) return '${(n / 1024).toStringAsFixed(1)} KB';
    return '${(n / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  String _formatDate(dynamic v) {
    final raw = v is String ? v : v?.toString();
    if (raw == null || raw.trim().isEmpty) return '—';
    final d = DateTime.tryParse(raw);
    if (d == null) return raw;
    final l = d.toLocal();
    return '${l.day.toString().padLeft(2, '0')}/${l.month.toString().padLeft(2, '0')}/${l.year}';
  }

  bool _canAttach(Map<String, dynamic> f) {
    final href = ((f['href'] as String?) ?? '').trim();
    if (href.isEmpty) return false;
    final size = f['byte_size'];
    if (size is num && size > _maxEmailAttachBytes) return false;
    return !(f['access'] == 'inline' && f['too_large_for_inline'] == true);
  }

  bool _canPreview(Map<String, dynamic> f) {
    if (((f['href'] as String?) ?? '').trim().isEmpty) return false;
    if (f['too_large_for_inline'] == true) return false;
    final kind = (f['kind'] as String?) ?? '';
    return kind == 'image' || kind == 'signature' || kind == 'video' || kind == 'pdf';
  }

  IconData _kindIcon(Map<String, dynamic> f) {
    return switch ((f['kind'] as String?) ?? '') {
      'image' || 'signature' => Icons.image_outlined,
      'video' => Icons.videocam_outlined,
      'pdf' => Icons.picture_as_pdf_outlined,
      _ => Icons.description_outlined,
    };
  }

  String _safeFileName(Map<String, dynamic> f, String href) {
    final label = ((f['label'] as String?) ?? '').trim();
    final fromHref = href.split('/').last.split('?').first.trim();
    final raw = label.isNotEmpty ? label : (fromHref.isNotEmpty ? fromHref : 'download');
    final cleaned = raw.replaceAll(RegExp(r'[/\\:*?"<>|]'), '_');
    if (cleaned.contains('.')) return cleaned;
    final kind = (f['kind'] as String?) ?? '';
    final ct = ((f['content_type'] as String?) ?? '').toLowerCase();
    final ext = switch (kind) {
      'pdf' => '.pdf',
      'image' || 'signature' => ct.contains('png') ? '.png' : '.jpg',
      'video' => ct.contains('quicktime') ? '.mov' : '.mp4',
      _ => '',
    };
    return '$cleaned$ext';
  }

  Future<File> _writeTempFile(Map<String, dynamic> f, String href, List<int> bytes) async {
    final dir = await getTemporaryDirectory();
    final file = File('${dir.path}/${_safeFileName(f, href)}');
    await file.writeAsBytes(bytes, flush: true);
    return file;
  }

  Future<File> _writeSavedFile(Map<String, dynamic> f, String href, List<int> bytes) async {
    final dir = await getApplicationDocumentsDirectory();
    final file = File('${dir.path}/${_safeFileName(f, href)}');
    await file.writeAsBytes(bytes, flush: true);
    return file;
  }

  List<int>? _bytesFromDataUrl(String dataUrl) {
    final comma = dataUrl.indexOf(',');
    if (comma < 0) return null;
    final meta = dataUrl.substring(0, comma).toLowerCase();
    final body = dataUrl.substring(comma + 1);
    if (meta.contains(';base64')) return base64Decode(body);
    return utf8.encode(Uri.decodeComponent(body));
  }

  String _apiPath(String href) {
    if (href.startsWith('/api/')) return href.substring(4);
    if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('/')) return href;
    return '/$href';
  }

  Future<List<int>> _loadFileBytes(Map<String, dynamic> f) async {
    final api = Get.find<ApiProvider>();
    final href = (f['href'] as String?)?.trim() ?? '';
    if (href.isEmpty) throw ApiException('This file is not available from the manifest.');
    if (href.startsWith('data:')) {
      final bytes = _bytesFromDataUrl(href);
      if (bytes == null || bytes.isEmpty) throw ApiException('This file is empty or invalid.');
      return bytes;
    }
    final res = await api.getBytes(_apiPath(href));
    final bytes = res.data;
    if (bytes == null || bytes.isEmpty) throw ApiException('This file is empty.');
    return bytes;
  }

  Future<void> _previewFile(Map<String, dynamic> f) async {
    if (!_canPreview(f)) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Preview is not available for this file.')));
      return;
    }
    final href = (f['href'] as String?)?.trim() ?? '';
    try {
      final bytes = await _loadFileBytes(f);
      final file = await _writeTempFile(f, href, bytes);
      await OpenFilex.open(file.path);
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Could not open file: $e')));
    }
  }

  Future<void> _saveFile(Map<String, dynamic> f) async {
    final href = (f['href'] as String?)?.trim() ?? '';
    try {
      final bytes = await _loadFileBytes(f);
      final file = await _writeSavedFile(f, href, bytes);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Saved ${_label(f)}'),
          action: SnackBarAction(label: 'Open', onPressed: () => OpenFilex.open(file.path)),
        ),
      );
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Could not save file: $e')));
    }
  }

  Future<Map<String, String>> _manifestAttachment(Map<String, dynamic> f) async {
    final size = f['byte_size'];
    if (size is num && size > _maxEmailAttachBytes) {
      throw ApiException('${_label(f)} is over 8 MB and cannot be attached.');
    }
    final bytes = await _loadFileBytes(f);
    if (bytes.length > _maxEmailAttachBytes) {
      throw ApiException('${_label(f)} is over 8 MB and cannot be attached.');
    }
    return <String, String>{
      'filename': _safeFileName(f, (f['href'] as String?) ?? ''),
      'content_base64': base64Encode(bytes),
      'content_type': ((f['content_type'] as String?) ?? '').trim().isNotEmpty
          ? (f['content_type'] as String).trim()
          : 'application/octet-stream',
    };
  }

  String _plainToHtml(String plain) {
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
    return '<p>$htmlBody</p>';
  }

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

  Future<void> _composeEmail() async {
    if (_preparingEmail) return;
    final c = Get.find<JobDetailController>();
    final jobs = Get.find<JobsRepository>();
    setState(() => _preparingEmail = true);
    try {
      final draft = await jobs.getJobEmailCompose(c.jobId);
      final selected = _files.where((f) => _selectedIds.contains(_id(f))).toList();
      final initialAttachments = <Map<String, String>>[];
      var runningBytes = 0;
      for (final f in selected) {
        final att = await _manifestAttachment(f);
        runningBytes += ((att['content_base64']?.length ?? 0) * 0.75).floor();
        if (runningBytes > _maxEmailTotalBytes) {
          throw ApiException('Combined attachments exceed 10 MB. Select fewer files.');
        }
        initialAttachments.add(att);
      }
      if (!mounted) return;
      await _showEmailSheet(draft, initialAttachments);
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Could not prepare email: $e')));
    } finally {
      if (mounted) setState(() => _preparingEmail = false);
    }
  }

  Future<void> _showEmailSheet(Map<String, dynamic> draft, List<Map<String, String>> initialAttachments) async {
    final c = Get.find<JobDetailController>();
    final jobs = Get.find<JobsRepository>();
    final toC = TextEditingController(text: (draft['default_to'] as String?) ?? '');
    final ccC = TextEditingController();
    final bccC = TextEditingController();
    final subC = TextEditingController(text: (draft['subject'] as String?) ?? '');
    final bodyC = TextEditingController(text: _stripHtml((draft['body_html'] as String?) ?? ''));
    var showCc = false;
    var showBcc = false;
    var appendSig = draft['append_signature'] != false;
    var sending = false;
    final attachments = List<Map<String, String>>.from(initialAttachments);
    final toOptions = <Map<String, String>>[];
    final rawOptions = draft['to_email_options'];
    if (rawOptions is List) {
      for (final e in rawOptions) {
        if (e is! Map) continue;
        final m = Map<String, dynamic>.from(e);
        final email = (m['email'] as String?)?.trim();
        if (email == null || email.isEmpty) continue;
        toOptions.add({'email': email, 'label': (m['label'] as String?)?.trim() ?? email});
      }
    }

    final smtpReady = draft['smtp_ready'] == true;
    final canSend = draft['can_send'] == true;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      isDismissible: true,
      enableDrag: true,
      showDragHandle: true,
      useSafeArea: true,
      backgroundColor: const Color(0xFF0f172a),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setS) {
            Future<void> addManualAttachment() async {
              final r = await FilePicker.pickFiles(withData: true);
              if (r == null || r.files.isEmpty) return;
              final picked = r.files.first;
              List<int>? bytes;
              if (picked.bytes != null) {
                bytes = picked.bytes!.toList();
              } else if (picked.path != null) {
                bytes = await File(picked.path!).readAsBytes();
              }
              if (bytes == null || bytes.isEmpty) return;
              if (bytes.length > _maxEmailAttachBytes) {
                if (ctx.mounted) {
                  ScaffoldMessenger.of(ctx).showSnackBar(const SnackBar(content: Text('Attachment is over 8 MB.')));
                }
                return;
              }
              setS(() {
                attachments.add({
                  'filename': picked.name.trim().isEmpty ? 'attachment' : picked.name.trim(),
                  'content_base64': base64Encode(bytes!),
                  'content_type': 'application/octet-stream',
                });
              });
            }

            Future<void> send() async {
              final to = toC.text.trim();
              final subject = subC.text.trim();
              final plain = bodyC.text.trim();
              if (to.isEmpty || subject.isEmpty || plain.isEmpty) return;
              setS(() => sending = true);
              try {
                await jobs.sendJobEmail(c.jobId, <String, dynamic>{
                  'to': to,
                  if (ccC.text.trim().isNotEmpty) 'cc': ccC.text.trim(),
                  if (bccC.text.trim().isNotEmpty) 'bcc': bccC.text.trim(),
                  'subject': subject,
                  'body_html': _plainToHtml(plain),
                  'append_signature': appendSig,
                  'attachments': attachments,
                });
                if (ctx.mounted) Navigator.pop(ctx);
                if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Email sent.')));
              } on ApiException catch (e) {
                if (ctx.mounted) ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(content: Text(e.message)));
              } finally {
                if (ctx.mounted) setS(() => sending = false);
              }
            }

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
                      children: [
                        Expanded(
                          child: Text(
                            'Email from job',
                            style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18),
                          ),
                        ),
                        IconButton(
                          tooltip: 'Close',
                          onPressed: sending ? null : () => Navigator.pop(ctx),
                          icon: const Icon(Icons.close_rounded, color: Colors.white70),
                        ),
                      ],
                    ),
                    if (!smtpReady || !canSend)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: Text(
                          'Email connection is not configured or incomplete. Open Settings → Email to connect your mailbox.',
                          style: GoogleFonts.inter(color: const Color(0xFFFBBF24), fontSize: 12),
                        ),
                      ),
                    if (toOptions.isNotEmpty) ...[
                      Text('Quick pick', style: GoogleFonts.inter(color: AppColors.whiteOverlay(0.55), fontSize: 12)),
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
                      const SizedBox(height: 12),
                    ],
                    TextField(controller: toC, style: GoogleFonts.inter(color: Colors.white), decoration: const InputDecoration(labelText: 'To', labelStyle: TextStyle(color: Colors.white70))),
                    TextButton(
                      style: TextButton.styleFrom(alignment: Alignment.centerLeft),
                      onPressed: () => setS(() => showCc = !showCc),
                      child: Text(showCc ? 'Hide CC' : 'Add CC', style: GoogleFonts.inter(color: AppColors.primary)),
                    ),
                    if (showCc)
                      TextField(controller: ccC, style: GoogleFonts.inter(color: Colors.white), decoration: const InputDecoration(labelText: 'CC', labelStyle: TextStyle(color: Colors.white70))),
                    TextButton(
                      style: TextButton.styleFrom(alignment: Alignment.centerLeft),
                      onPressed: () => setS(() => showBcc = !showBcc),
                      child: Text(showBcc ? 'Hide BCC' : 'Add BCC', style: GoogleFonts.inter(color: AppColors.primary)),
                    ),
                    if (showBcc)
                      TextField(controller: bccC, style: GoogleFonts.inter(color: Colors.white), decoration: const InputDecoration(labelText: 'BCC', labelStyle: TextStyle(color: Colors.white70))),
                    const SizedBox(height: 12),
                    TextField(controller: subC, style: GoogleFonts.inter(color: Colors.white), decoration: const InputDecoration(labelText: 'Subject', labelStyle: TextStyle(color: Colors.white70))),
                    const SizedBox(height: 12),
                    TextField(controller: bodyC, maxLines: 8, style: GoogleFonts.inter(color: Colors.white), decoration: const InputDecoration(labelText: 'Message', labelStyle: TextStyle(color: Colors.white70))),
                    const SizedBox(height: 12),
                    SwitchListTile(
                      value: appendSig,
                      onChanged: (v) => setS(() => appendSig = v),
                      activeThumbColor: AppColors.primary,
                      title: Text('Include email signature', style: GoogleFonts.inter(color: Colors.white)),
                    ),
                    _emailFilePicker(setS, attachments),
                    TextButton.icon(
                      onPressed: addManualAttachment,
                      icon: const Icon(Icons.attach_file_rounded, color: AppColors.primary),
                      label: Text('Attach files', style: GoogleFonts.inter(color: AppColors.primary)),
                    ),
                    if (attachments.isNotEmpty)
                      ...attachments.asMap().entries.map((entry) {
                        return ListTile(
                          dense: true,
                          contentPadding: EdgeInsets.zero,
                          title: Text(entry.value['filename'] ?? '', style: GoogleFonts.inter(color: Colors.white70, fontSize: 13)),
                          trailing: IconButton(
                            icon: const Icon(Icons.close_rounded, color: Colors.redAccent, size: 20),
                            onPressed: () => setS(() => attachments.removeAt(entry.key)),
                          ),
                        );
                      }),
                    const SizedBox(height: 12),
                    FilledButton(
                      onPressed: !canSend || sending ? null : send,
                      child: sending
                          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                          : const Text('Send email'),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );

    toC.dispose();
    ccC.dispose();
    bccC.dispose();
    subC.dispose();
    bodyC.dispose();
  }

  Widget _emailFilePicker(StateSetter setSheetState, List<Map<String, String>> attachments) {
    final attachable = _files.where(_canAttach).toList();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Material(
        color: AppColors.whiteOverlay(0.06),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  const Icon(Icons.folder_open_rounded, color: AppColors.primary, size: 18),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text('Pick files from linked job', style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w800)),
                  ),
                  TextButton(
                    onPressed: attachable.isEmpty
                        ? null
                        : () => setState(() => _selectedIds
                          ..clear()
                          ..addAll(attachable.map(_id))),
                    child: const Text('Select all'),
                  ),
                  TextButton(
                    onPressed: _selectedIds.isEmpty ? null : () => setState(_selectedIds.clear),
                    child: const Text('Clear'),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              for (final f in _files.take(6))
                CheckboxListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  value: _selectedIds.contains(_id(f)),
                  onChanged: !_canAttach(f)
                      ? null
                      : (v) {
                          setState(() {
                            if (v == true) {
                              _selectedIds.add(_id(f));
                            } else {
                              _selectedIds.remove(_id(f));
                            }
                          });
                          setSheetState(() {});
                        },
                  title: Text(_label(f), style: GoogleFonts.inter(color: Colors.white70, fontSize: 13)),
                  subtitle: Text(_formatBytes(f['byte_size']), style: GoogleFonts.inter(color: AppColors.slate500, fontSize: 11)),
                ),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton.icon(
                  onPressed: _selectedIds.isEmpty
                      ? null
                      : () async {
                          try {
                            final selected = _files.where((f) => _selectedIds.contains(_id(f))).toList();
                            var total = attachments.fold<int>(0, (sum, a) => sum + (((a['content_base64']?.length ?? 0) * 0.75).floor()));
                            final add = <Map<String, String>>[];
                            for (final f in selected) {
                              final att = await _manifestAttachment(f);
                              total += ((att['content_base64']?.length ?? 0) * 0.75).floor();
                              if (total > _maxEmailTotalBytes) throw ApiException('Combined attachments exceed 10 MB.');
                              add.add(att);
                            }
                            setSheetState(() => attachments.addAll(add));
                          } on ApiException catch (e) {
                            if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
                          }
                        },
                  icon: const Icon(Icons.add_rounded),
                  label: const Text('Add selected to email'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator(color: AppColors.primary));
    }
    if (_err != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(_err!, textAlign: TextAlign.center, style: GoogleFonts.inter(color: AppColors.slate400)),
              const SizedBox(height: 12),
              FilledButton(onPressed: _load, child: const Text('Retry')),
            ],
          ),
        ),
      );
    }
    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          _toolbar(),
          const SizedBox(height: 12),
          Text('Files & media', style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16)),
          const SizedBox(height: 8),
          if (_files.isEmpty)
            _emptyState()
          else
            ..._files.map(_fileRow),
        ],
      ),
    );
  }

  Widget _toolbar() {
    final attachable = _files.where(_canAttach).toList();
    return Material(
      color: AppColors.whiteOverlay(0.08),
      borderRadius: BorderRadius.circular(16),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('All job files', style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w900)),
            const SizedBox(height: 4),
            Text(
              'Photos, videos, PDFs, customer files, invoices and quotations linked to this job.',
              style: GoogleFonts.inter(color: AppColors.slate400, fontSize: 12, height: 1.35),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                OutlinedButton(onPressed: attachable.isEmpty ? null : () => setState(() => _selectedIds.addAll(attachable.map(_id))), child: const Text('Select all')),
                OutlinedButton(onPressed: _selectedIds.isEmpty ? null : () => setState(_selectedIds.clear), child: const Text('Clear')),
                FilledButton.icon(
                  onPressed: _preparingEmail ? null : _composeEmail,
                  icon: _preparingEmail
                      ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.mail_outline_rounded, size: 18),
                  label: const Text('Compose email'),
                ),
                IconButton(onPressed: _load, icon: const Icon(Icons.refresh_rounded, color: AppColors.primary)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _emptyState() {
    return Material(
      color: AppColors.whiteOverlay(0.06),
      borderRadius: BorderRadius.circular(16),
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          'No files linked to this job yet.',
          textAlign: TextAlign.center,
          style: GoogleFonts.inter(color: AppColors.slate400),
        ),
      ),
    );
  }

  Widget _fileRow(Map<String, dynamic> f) {
    final id = _id(f);
    final selected = _selectedIds.contains(id);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: AppColors.whiteOverlay(selected ? 0.14 : 0.08),
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(4, 8, 8, 8),
          child: Row(
            children: [
              Checkbox(
                value: selected,
                onChanged: !_canAttach(f)
                    ? null
                    : (v) => setState(() {
                          if (v == true) {
                            _selectedIds.add(id);
                          } else {
                            _selectedIds.remove(id);
                          }
                        }),
              ),
              Icon(_kindIcon(f), color: AppColors.primary),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(_label(f), style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 3),
                    Text(_sourceDetail(f), style: GoogleFonts.inter(color: AppColors.slate400, fontSize: 12), maxLines: 2, overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 3),
                    Text('${_formatBytes(f['byte_size'])} · ${_formatDate(f['created_at'])}', style: GoogleFonts.inter(color: AppColors.slate500, fontSize: 11)),
                  ],
                ),
              ),
              TextButton(onPressed: _canPreview(f) ? () => _previewFile(f) : null, child: const Text('Preview')),
              TextButton(onPressed: () => _saveFile(f), child: const Text('Save')),
            ],
          ),
        ),
      ),
    );
  }
}
