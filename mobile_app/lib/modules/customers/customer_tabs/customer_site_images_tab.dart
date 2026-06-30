import 'dart:io';

import 'package:file_picker/file_picker.dart' as fp;
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/services/storage_service.dart';
import '../../../core/values/app_colors.dart';
import '../../../core/values/app_constants.dart';
import '../../../data/repositories/customers_repository.dart';
import 'helpers.dart';
import 'image_viewer_helper.dart';

const int _kMaxUploadBytes = 8 * 1024 * 1024;

String _siteImageContentUrl(int customerId, int fileId) {
  final base = AppConstants.apiBaseUrl.replaceAll(RegExp(r'/+$'), '');
  return '$base/customers/$customerId/files/$fileId/content';
}

class CustomerSiteImagesTab extends StatefulWidget {
  const CustomerSiteImagesTab({
    super.key,
    required this.customerId,
    this.workAddressId,
  });

  final int customerId;
  final int? workAddressId;

  @override
  State<CustomerSiteImagesTab> createState() => _CustomerSiteImagesTabState();
}

class _CustomerSiteImagesTabState extends State<CustomerSiteImagesTab> {
  final _repo = Get.find<CustomersRepository>();
  final _picker = ImagePicker();
  List<Map<String, dynamic>> _images = [];
  bool _loading = true;
  bool _uploading = false;

  // Per-image note editing state
  final Map<String, TextEditingController> _noteControllers = {};
  final Map<String, bool> _savingNote = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant CustomerSiteImagesTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.workAddressId != widget.workAddressId) _load();
  }

  @override
  void dispose() {
    for (final c in _noteControllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final all = await _repo.getFiles(widget.customerId, workAddressId: widget.workAddressId);
      _images = all
          .where((f) => ctStr(f, 'content_type').toLowerCase().startsWith('image/'))
          .toList();
      // Sync note controllers
      for (final img in _images) {
        final key = '${img['id']}';
        if (!_noteControllers.containsKey(key)) {
          _noteControllers[key] = TextEditingController(text: ctStr(img, 'notes'));
        } else {
          _noteControllers[key]!.text = ctStr(img, 'notes');
        }
      }
    } catch (_) {
      _images = [];
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

  bool _isGenerated(Map<String, dynamic> r) {
    final kind = ctStr(r, 'kind');
    return kind == 'electrical_certificate' || kind == 'site_report';
  }

  Future<void> _uploadBytes(String name, String contentType, List<int> bytes) async {
    if (bytes.length > _kMaxUploadBytes) {
      Get.snackbar('Upload', 'Each file must be under ${_kMaxUploadBytes ~/ (1024 * 1024)} MB.');
      return;
    }
    setState(() => _uploading = true);
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
      Get.snackbar('Upload failed', e.message);
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _pickFromCamera() async {
    final x = await _picker.pickImage(source: ImageSource.camera, maxWidth: 1800, imageQuality: 82);
    if (x == null || !mounted) return;
    final bytes = await x.readAsBytes();
    await _uploadBytes(x.name, 'image/jpeg', bytes);
  }

  Future<void> _pickFromGallery() async {
    final result = await fp.FilePicker.pickFiles(
      type: fp.FileType.image,
      allowMultiple: true,
    );
    if (result == null || result.files.isEmpty) return;
    for (final pf in result.files) {
      if (!mounted) return;
      final path = pf.path;
      if (path == null) continue;
      final file = File(path);
      final bytes = await file.readAsBytes();
      final ext = pf.extension?.toLowerCase() ?? 'jpg';
      final contentType = ext == 'png' ? 'image/png' : 'image/jpeg';
      await _uploadBytes(pf.name, contentType, bytes);
    }
  }

  Future<void> _deleteImage(Map<String, dynamic> img) async {
    if (_isGenerated(img)) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete image?'),
        content: const Text('This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: const Color(0xFFDC2626)),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await _repo.deleteCustomerFile(widget.customerId, (img['id'] as num).toInt());
      await _load();
    } on ApiException catch (e) {
      Get.snackbar('Error', e.message);
    }
  }

  Future<void> _saveNote(Map<String, dynamic> img) async {
    final key = '${img['id']}';
    if (_isGenerated(img)) return;
    setState(() => _savingNote[key] = true);
    try {
      final notes = _noteControllers[key]?.text.trim() ?? '';
      await _repo.patchCustomerFile(
        widget.customerId,
        (img['id'] as num).toInt(),
        <String, dynamic>{'notes': notes},
      );
      await _load();
    } on ApiException catch (e) {
      Get.snackbar('Error', e.message);
    } finally {
      if (mounted) setState(() => _savingNote.remove(key));
    }
  }

  void _openImagePreview(Map<String, dynamic> img) {
    final id = (img['id'] as num?)?.toInt() ?? 0;
    if (id <= 0) return;
    final tok = Get.find<StorageService>().authToken ?? '';
    final url = _siteImageContentUrl(widget.customerId, id);
    openFullscreenImage(
      context,
      url,
      headers: tok.isNotEmpty ? {'Authorization': 'Bearer $tok'} : null,
    );
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          // --- Upload strip ---
          _buildUploadStrip(),
          const SizedBox(height: 16),

          // --- Gallery ---
          if (_loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 48),
              child: Center(child: CircularProgressIndicator(color: AppColors.primary)),
            )
          else if (_images.isEmpty)
            _buildEmpty()
          else
            ..._images.map((img) => _buildImageCard(img)),
        ],
      ),
    );
  }

  Widget _buildUploadStrip() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.whiteOverlay(0.07),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.whiteOverlay(0.12)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Site Images',
            style: GoogleFonts.inter(fontWeight: FontWeight.w800, fontSize: 15, color: Colors.white),
          ),
          const SizedBox(height: 4),
          Text(
            widget.workAddressId != null
                ? 'Images stored for this work site only.'
                : 'Images stored at the customer level (all sites).',
            style: GoogleFonts.inter(fontSize: 12, color: AppColors.whiteOverlay(0.55)),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  onPressed: _uploading ? null : _pickFromCamera,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  icon: const Icon(Icons.camera_alt_outlined, size: 18),
                  label: Text('Camera', style: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 13)),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _uploading ? null : _pickFromGallery,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white,
                    side: BorderSide(color: AppColors.whiteOverlay(0.2)),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  icon: const Icon(Icons.photo_library_outlined, size: 18),
                  label: Text('Gallery', style: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 13)),
                ),
              ),
            ],
          ),
          if (_uploading) ...[
            const SizedBox(height: 12),
            const LinearProgressIndicator(color: AppColors.primary),
          ],
        ],
      ),
    );
  }

  Widget _buildEmpty() {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 48),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.photo_library_outlined, size: 52, color: AppColors.whiteOverlay(0.25)),
          const SizedBox(height: 14),
          Text(
            'No site images yet',
            style: GoogleFonts.inter(color: AppColors.whiteOverlay(0.6), fontSize: 15, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 6),
          Text(
            'Upload photos of this site using the buttons above.',
            textAlign: TextAlign.center,
            style: GoogleFonts.inter(color: AppColors.whiteOverlay(0.38), fontSize: 12),
          ),
        ],
      ),
    );
  }

  Widget _buildImageCard(Map<String, dynamic> img) {
    final id = (img['id'] as num?)?.toInt() ?? 0;
    final url = _siteImageContentUrl(widget.customerId, id);
    final tok = Get.find<StorageService>().authToken ?? '';
    final key = '$id';
    final isGenerated = _isGenerated(img);
    final noteCtrl = _noteControllers[key] ?? TextEditingController();
    final isSavingNote = _savingNote[key] == true;

    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Container(
        decoration: BoxDecoration(
          color: AppColors.whiteOverlay(0.06),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.whiteOverlay(0.1)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Image preview
            Stack(
              children: [
                ClipRRect(
                  borderRadius: const BorderRadius.only(
                    topLeft: Radius.circular(13),
                    topRight: Radius.circular(13),
                  ),
                  child: GestureDetector(
                    onTap: () => _openImagePreview(img),
                    child: Image.network(
                      url,
                      headers: tok.isNotEmpty ? {'Authorization': 'Bearer $tok'} : null,
                      height: 200,
                      width: double.infinity,
                      fit: BoxFit.cover,
                      loadingBuilder: (_, child, prog) {
                        if (prog == null) return child;
                        return Container(
                          height: 200,
                          color: AppColors.whiteOverlay(0.05),
                          child: const Center(child: CircularProgressIndicator(color: AppColors.primary)),
                        );
                      },
                      errorBuilder: (_, __, ___) => Container(
                        height: 200,
                        color: AppColors.whiteOverlay(0.05),
                        child: Center(
                          child: Icon(Icons.broken_image_outlined, color: AppColors.whiteOverlay(0.3), size: 48),
                        ),
                      ),
                    ),
                  ),
                ),
                // Delete button overlay
                if (!isGenerated)
                  Positioned(
                    top: 8,
                    right: 8,
                    child: Material(
                      color: Colors.black54,
                      borderRadius: BorderRadius.circular(20),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(20),
                        onTap: () => _deleteImage(img),
                        child: const Padding(
                          padding: EdgeInsets.all(8),
                          child: Icon(Icons.delete_outline_rounded, color: Colors.white, size: 20),
                        ),
                      ),
                    ),
                  ),
                // View full-size icon
                Positioned(
                  top: 8,
                  left: 8,
                  child: Material(
                    color: Colors.black54,
                    borderRadius: BorderRadius.circular(20),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(20),
                      onTap: () => _openImagePreview(img),
                      child: const Padding(
                        padding: EdgeInsets.all(8),
                        child: Icon(Icons.open_in_full_rounded, color: Colors.white, size: 20),
                      ),
                    ),
                  ),
                ),
              ],
            ),

            // Filename + size
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 4),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      ctStr(img, 'original_filename').isEmpty ? 'Image' : ctStr(img, 'original_filename'),
                      style: GoogleFonts.inter(color: AppColors.whiteOverlay(0.75), fontSize: 12, fontWeight: FontWeight.w600),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  Text(
                    _bytesLabel(img['byte_size']),
                    style: GoogleFonts.inter(fontSize: 11, color: AppColors.whiteOverlay(0.4)),
                  ),
                ],
              ),
            ),

            // Note field
            if (!isGenerated)
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    TextField(
                      controller: noteCtrl,
                      maxLines: 3,
                      minLines: 1,
                      style: GoogleFonts.inter(color: AppColors.whiteOverlay(0.85), fontSize: 12),
                      decoration: InputDecoration(
                        hintText: 'Add a note for this image...',
                        hintStyle: GoogleFonts.inter(fontSize: 12, color: AppColors.whiteOverlay(0.3)),
                        filled: true,
                        fillColor: AppColors.whiteOverlay(0.05),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                          borderSide: BorderSide(color: AppColors.whiteOverlay(0.1)),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                          borderSide: const BorderSide(color: AppColors.primary),
                        ),
                        isDense: true,
                        contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Align(
                      alignment: Alignment.centerRight,
                      child: FilledButton(
                        onPressed: isSavingNote ? null : () => _saveNote(img),
                        style: FilledButton.styleFrom(
                          visualDensity: VisualDensity.compact,
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                          textStyle: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 12),
                        ),
                        child: Text(isSavingNote ? 'Saving...' : 'Save note'),
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}
