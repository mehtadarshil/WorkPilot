import 'dart:io';

import 'package:file_picker/file_picker.dart' as fp;
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/services/storage_service.dart';
import '../../../core/values/app_colors.dart';
import '../../../core/values/app_constants.dart';
import '../../../data/repositories/customers_repository.dart';
import 'helpers.dart';
import 'shell.dart';

const int _kMaxUploadBytes = 8 * 1024 * 1024;

String _customerFileContentUrl(int customerId, int fileId) {
  final base = AppConstants.apiBaseUrl.replaceAll(RegExp(r'/+$'), '');
  return '$base/customers/$customerId/files/$fileId/content';
}

class CustomerFilesTab extends StatefulWidget {
  const CustomerFilesTab({super.key, required this.customerId, this.workAddressId});

  final int customerId;
  final int? workAddressId;

  @override
  State<CustomerFilesTab> createState() => _CustomerFilesTabState();
}

class _CustomerFilesTabState extends State<CustomerFilesTab> {
  final _repo = Get.find<CustomersRepository>();
  final _picker = ImagePicker();
  List<Map<String, dynamic>> _rows = [];
  bool _loading = true;
  int? _busyId;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant CustomerFilesTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.workAddressId != widget.workAddressId) {
      _load();
    }
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      _rows = await _repo.getFiles(widget.customerId, workAddressId: widget.workAddressId);
    } catch (_) {
      _rows = [];
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _bytesLabel(dynamic n) {
    final v = n is num ? n.toInt() : int.tryParse('$n') ?? 0;
    if (v < 1024) return '$v B';
    if (v < 1024 * 1024) return '${(v / 1024).toStringAsFixed(1)} KB';
    return '${(v / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  bool _isImage(Map<String, dynamic> r) {
    return ctStr(r, 'content_type').toLowerCase().startsWith('image/');
  }

  Future<void> _uploadBytes(String name, String contentType, List<int> bytes) async {
    if (bytes.length > _kMaxUploadBytes) {
      Get.snackbar('Files', 'Each file must be ${_kMaxUploadBytes ~/ (1024 * 1024)} MB or smaller.');
      return;
    }
    try {
      await _repo.uploadCustomerFile(
        widget.customerId,
        filename: name,
        contentType: contentType,
        bytes: bytes,
        workAddressId: widget.workAddressId,
      );
      await _load();
    } on ApiException catch (e) {
      Get.snackbar('Upload', e.message);
    } catch (e) {
      Get.snackbar('Upload', e.toString());
    }
  }

  Future<void> _pickGallery() async {
    final list = await _picker.pickMultiImage(imageQuality: 88);
    if (list.isEmpty) return;
    for (final x in list) {
      final bytes = await x.readAsBytes();
      final name = x.name.isNotEmpty ? x.name : 'photo.jpg';
      await _uploadBytes(name, 'image/jpeg', bytes);
    }
  }

  Future<void> _pickCamera() async {
    final x = await _picker.pickImage(source: ImageSource.camera, imageQuality: 88);
    if (x == null) return;
    final bytes = await x.readAsBytes();
    final name = x.name.isNotEmpty ? x.name : 'photo.jpg';
    await _uploadBytes(name, 'image/jpeg', bytes);
  }

  Future<void> _pickDocuments() async {
    final res = await fp.FilePicker.pickFiles(allowMultiple: true, withData: true);
    if (res == null || res.files.isEmpty) return;
    for (final f in res.files) {
      final bytes = f.bytes;
      if (bytes == null) continue;
      final name = f.name.isNotEmpty ? f.name : 'file';
      final ct = f.extension != null ? _guessMime(f.extension!) : 'application/octet-stream';
      await _uploadBytes(name, ct, bytes);
    }
  }

  String _guessMime(String ext) {
    switch (ext.toLowerCase()) {
      case 'pdf':
        return 'application/pdf';
      case 'png':
        return 'image/png';
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'webp':
        return 'image/webp';
      default:
        return 'application/octet-stream';
    }
  }

  Future<void> _openImagePreview(Map<String, dynamic> r) async {
    final id = (r['id'] as num?)?.toInt() ?? 0;
    if (id <= 0) return;
    final tok = Get.find<StorageService>().authToken ?? '';
    final url = _customerFileContentUrl(widget.customerId, id);
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (ctx) {
        final mq = MediaQuery.of(ctx);
        return Dialog(
          backgroundColor: Colors.black87,
          insetPadding: const EdgeInsets.all(12),
          child: SizedBox(
            width: mq.size.width * 0.94,
            height: mq.size.height * 0.82,
            child: Column(
              children: [
                Align(
                  alignment: Alignment.centerRight,
                  child: IconButton(icon: const Icon(Icons.close_rounded, color: Colors.white), onPressed: () => Navigator.pop(ctx)),
                ),
                Expanded(
                  child: InteractiveViewer(
                    minScale: 0.5,
                    maxScale: 4,
                    child: Image.network(
                      url,
                      fit: BoxFit.contain,
                      headers: tok.isNotEmpty ? {'Authorization': 'Bearer $tok'} : null,
                      loadingBuilder: (_, child, prog) {
                        if (prog == null) return child;
                        return const Center(child: CircularProgressIndicator(color: AppColors.primary));
                      },
                      errorBuilder: (_, __, ___) => const Center(
                        child: Icon(Icons.broken_image_outlined, color: Colors.white54, size: 48),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Future<void> _downloadAndOpen(Map<String, dynamic> r) async {
    final id = (r['id'] as num?)?.toInt() ?? 0;
    if (id <= 0) return;
    setState(() => _busyId = id);
    try {
      final bytes = await _repo.getCustomerFileBytes(widget.customerId, id);
      if (bytes.isEmpty) throw StateError('Empty file');
      final dir = await getTemporaryDirectory();
      final raw = ctStr(r, 'original_filename').replaceAll(RegExp(r'[/\\]'), '_');
      final safe = raw.isEmpty ? 'file' : raw;
      final f = File('${dir.path}/wp_cust_${widget.customerId}_${id}_$safe');
      await f.writeAsBytes(bytes, flush: true);
      await OpenFilex.open(f.path);
    } on ApiException catch (e) {
      Get.snackbar('File', e.message);
    } catch (e) {
      Get.snackbar('File', e.toString());
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  Future<void> _delete(Map<String, dynamic> r) async {
    final id = (r['id'] as num?)?.toInt() ?? 0;
    if (id <= 0) return;
    final name = ctStr(r, 'original_filename');
    final go = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete file?'),
        content: Text(name.isEmpty ? 'This file will be removed.' : 'Delete “$name”?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete')),
        ],
      ),
    );
    if (go != true) return;
    try {
      await _repo.deleteCustomerFile(widget.customerId, id);
      await _load();
    } on ApiException catch (e) {
      Get.snackbar('Delete', e.message);
    }
  }

  void _onRowTap(Map<String, dynamic> r) {
    if (_isImage(r)) {
      _openImagePreview(r);
    } else {
      _downloadAndOpen(r);
    }
  }

  @override
  Widget build(BuildContext context) {
    final tok = Get.find<StorageService>().authToken ?? '';
    final images = _rows.where(_isImage).toList();

    if (_loading) return Center(child: CircularProgressIndicator(color: AppColors.primary));

    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: _load,
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            sliver: SliverToBoxAdapter(
              child: customerPanel(
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      widget.workAddressId != null
                          ? 'Photos and documents for this work site.'
                          : 'Customer-level files (all sites). Add photos or documents from this device.',
                      style: GoogleFonts.inter(fontSize: 12, color: AppColors.whiteOverlay(0.6), height: 1.35),
                    ),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        FilledButton.tonalIcon(
                          onPressed: _pickGallery,
                          icon: const Icon(Icons.photo_library_outlined, size: 18),
                          label: const Text('Gallery'),
                        ),
                        FilledButton.tonalIcon(
                          onPressed: _pickCamera,
                          icon: const Icon(Icons.photo_camera_outlined, size: 18),
                          label: const Text('Camera'),
                        ),
                        FilledButton.icon(
                          onPressed: _pickDocuments,
                          icon: const Icon(Icons.upload_file_rounded, size: 18),
                          label: const Text('Files'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
          if (images.isNotEmpty)
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              sliver: SliverToBoxAdapter(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    customerSectionHeader('Photos'),
                    SizedBox(
                      height: 96,
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        itemCount: images.length,
                        separatorBuilder: (_, __) => const SizedBox(width: 8),
                        itemBuilder: (_, i) {
                          final r = images[i];
                          final id = (r['id'] as num?)?.toInt() ?? 0;
                          final url = _customerFileContentUrl(widget.customerId, id);
                          return Material(
                            color: Colors.transparent,
                            child: InkWell(
                              onTap: () => _openImagePreview(r),
                              borderRadius: BorderRadius.circular(12),
                              child: ClipRRect(
                                borderRadius: BorderRadius.circular(12),
                                child: AspectRatio(
                                  aspectRatio: 1,
                                  child: Image.network(
                                    url,
                                    fit: BoxFit.cover,
                                    width: 96,
                                    headers: tok.isNotEmpty ? {'Authorization': 'Bearer $tok'} : null,
                                    errorBuilder: (_, __, ___) => Container(
                                      color: AppColors.whiteOverlay(0.08),
                                      child: const Icon(Icons.broken_image_outlined, color: Colors.white38),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                  ],
                ),
              ),
            ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
            sliver: SliverToBoxAdapter(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  customerSectionHeader('All files'),
                  if (_rows.isEmpty)
                    customerEmptyState(
                      icon: Icons.folder_open_rounded,
                      title: 'No files yet',
                      subtitle: 'Use Gallery, Camera, or Files above to upload.',
                    )
                  else
                    ..._rows.map((r) {
                      final id = (r['id'] as num?)?.toInt() ?? 0;
                      final busy = _busyId == id;
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: Material(
                          color: Colors.transparent,
                          child: InkWell(
                            borderRadius: BorderRadius.circular(16),
                            onTap: busy ? null : () => _onRowTap(r),
                            child: customerPanel(
                              child: Row(
                                children: [
                                  if (busy)
                                    const SizedBox(
                                      width: 44,
                                      height: 44,
                                      child: Center(child: SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary))),
                                    )
                                  else if (_isImage(r))
                                    ClipRRect(
                                      borderRadius: BorderRadius.circular(10),
                                      child: Image.network(
                                        _customerFileContentUrl(widget.customerId, id),
                                        width: 44,
                                        height: 44,
                                        fit: BoxFit.cover,
                                        headers: tok.isNotEmpty ? {'Authorization': 'Bearer $tok'} : null,
                                        errorBuilder: (_, __, ___) => Icon(Icons.image_outlined, color: AppColors.whiteOverlay(0.45)),
                                      ),
                                    )
                                  else
                                    Icon(Icons.insert_drive_file_outlined, color: AppColors.whiteOverlay(0.45), size: 40),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          ctStr(r, 'original_filename'),
                                          style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w700),
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          '${ctStr(r, 'content_type')} · ${_bytesLabel(r['byte_size'])}',
                                          style: GoogleFonts.inter(fontSize: 12, color: AppColors.whiteOverlay(0.45)),
                                        ),
                                        const SizedBox(height: 2),
                                        Text(
                                          _isImage(r) ? 'Tap to preview' : 'Tap to open',
                                          style: GoogleFonts.inter(fontSize: 11, color: AppColors.primary, fontWeight: FontWeight.w600),
                                        ),
                                      ],
                                    ),
                                  ),
                                  PopupMenuButton<String>(
                                    icon: Icon(Icons.more_vert_rounded, color: AppColors.whiteOverlay(0.5)),
                                    onSelected: (v) {
                                      if (v == 'del') _delete(r);
                                      if (v == 'open') _downloadAndOpen(r);
                                    },
                                    itemBuilder: (_) => [
                                      const PopupMenuItem(value: 'open', child: Text('Open / save')),
                                      const PopupMenuItem(value: 'del', child: Text('Delete')),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      );
                    }),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
