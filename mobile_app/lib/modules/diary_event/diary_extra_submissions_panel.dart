import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:video_compress/video_compress.dart';

import '../../core/services/storage_service.dart';
import '../../core/values/app_colors.dart';
import '../../data/models/diary_extra_submission.dart';
import 'diary_event_detail_controller.dart';
import 'extra_submission_media_tiles.dart';
import 'extra_submission_helpers.dart';
import '../customers/customer_tabs/image_viewer_helper.dart';

const int _kMaxItemsPerSubmission = 8;

/// List + add control for on-site “extra” media/notes (separate from the main job report form).
class DiaryExtraSubmissionsPanel extends StatelessWidget {
  const DiaryExtraSubmissionsPanel({super.key, required this.controller});

  final DiaryEventDetailController controller;

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final d = controller.detail.value;
      if (d == null) return const SizedBox.shrink();
      if (controller.phase == DiaryVisitUiPhase.cancelled) {
        return const SizedBox.shrink();
      }
      final list = d.extraSubmissions;
      return _DetailGlassPanel(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: _accentTitleLocal('Extra photos, videos & notes'),
                ),
                Material(
                  color: AppColors.primary,
                  borderRadius: BorderRadius.circular(12),
                  child: InkWell(
                    onTap: controller.submittingExtra.value
                        ? null
                        : () => _openAddSheet(context),
                    borderRadius: BorderRadius.circular(12),
                    child: const Padding(
                      padding: EdgeInsets.all(10),
                      child: Icon(
                        Icons.add_rounded,
                        color: Colors.white,
                        size: 22,
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              'Add notes and/or media (compressed on send). Videos max $kMaxExtraVideoDurationSeconds s — record or upload.',
              style: GoogleFonts.inter(
                fontSize: 12,
                height: 1.35,
                color: AppColors.slate400,
              ),
            ),
            if (list.isEmpty) ...[
              const SizedBox(height: 12),
              Text(
                'No extra submissions yet.',
                style: GoogleFonts.inter(
                  fontSize: 13,
                  color: AppColors.slate500,
                ),
              ),
            ] else ...[
              const SizedBox(height: 12),
              ...list.map((s) => _SubmissionCard(submission: s)),
            ],
          ],
        ),
      );
    });
  }

  void _openAddSheet(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _AddExtraSubmissionSheet(controller: controller),
    );
  }
}

class _AddExtraSubmissionSheet extends StatefulWidget {
  const _AddExtraSubmissionSheet({required this.controller});

  final DiaryEventDetailController controller;

  @override
  State<_AddExtraSubmissionSheet> createState() =>
      _AddExtraSubmissionSheetState();
}

class _AddExtraSubmissionSheetState extends State<_AddExtraSubmissionSheet> {
  final _notes = TextEditingController();
  final List<String> _imagePaths = [];
  final List<String> _videoPaths = [];
  final _picker = ImagePicker();

  int get _totalPicks => _imagePaths.length + _videoPaths.length;

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  void _toast(String m) {
    Get.snackbar(
      'Extra submission',
      m,
      snackPosition: SnackPosition.BOTTOM,
      margin: const EdgeInsets.all(16),
      borderRadius: 12,
    );
  }

  Future<void> _addPhotosGallery() async {
    if (_totalPicks >= _kMaxItemsPerSubmission) {
      _toast('At most $_kMaxItemsPerSubmission files per submission.');
      return;
    }
    final list = await _picker.pickMultiImage();
    if (list.isEmpty) return;
    setState(() {
      for (final f in list) {
        if (_imagePaths.length + _videoPaths.length >=
            _kMaxItemsPerSubmission) {
          break;
        }
        _imagePaths.add(f.path);
      }
    });
  }

  Future<void> _addPhotoCamera() async {
    if (_totalPicks >= _kMaxItemsPerSubmission) {
      _toast('At most $_kMaxItemsPerSubmission files per submission.');
      return;
    }
    final f = await _picker.pickImage(
      source: ImageSource.camera,
      maxWidth: 2000,
      imageQuality: 85,
    );
    if (f == null) return;
    setState(() => _imagePaths.add(f.path));
  }

  Future<void> _showVideoSourcePicker() async {
    if (_totalPicks >= _kMaxItemsPerSubmission) {
      _toast('At most $_kMaxItemsPerSubmission files per submission.');
      return;
    }
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: Icon(Icons.videocam_rounded, color: AppColors.slate900),
              title: Text(
                'Record video',
                style: GoogleFonts.inter(color: AppColors.slate900),
              ),
              subtitle: Text(
                'Max $kMaxExtraVideoDurationSeconds seconds',
                style: GoogleFonts.inter(color: AppColors.slate400, fontSize: 12),
              ),
              onTap: () {
                Navigator.pop(ctx);
                _pickVideo(ImageSource.camera);
              },
            ),
            ListTile(
              leading: Icon(Icons.video_library_outlined, color: AppColors.slate900),
              title: Text(
                'Choose from library',
                style: GoogleFonts.inter(color: AppColors.slate900),
              ),
              subtitle: Text(
                'Max $kMaxExtraVideoDurationSeconds seconds',
                style: GoogleFonts.inter(color: AppColors.slate400, fontSize: 12),
              ),
              onTap: () {
                Navigator.pop(ctx);
                _pickVideo(ImageSource.gallery);
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _pickVideo(ImageSource source) async {
    if (_totalPicks >= _kMaxItemsPerSubmission) {
      _toast('At most $_kMaxItemsPerSubmission files per submission.');
      return;
    }
    final f = await _picker.pickVideo(
      source: source,
      maxDuration: const Duration(seconds: kMaxExtraVideoDurationSeconds),
    );
    if (f == null) return;
    await _appendVideoIfAllowed(f.path);
  }

  Future<void> _appendVideoIfAllowed(String path) async {
    final info = await VideoCompress.getMediaInfo(path);
    final raw = info.duration ?? 0;
    final seconds = raw > 1000 ? raw / 1000.0 : raw;
    if (seconds > kMaxExtraVideoDurationSeconds) {
      _toast(
        'Video must be $kMaxExtraVideoDurationSeconds seconds or shorter.',
      );
      return;
    }
    setState(() => _videoPaths.add(path));
  }

  Future<void> _submit() async {
    final notes = _notes.text.trim();
    if (notes.isEmpty && _imagePaths.isEmpty && _videoPaths.isEmpty) {
      _toast('Add a note and/or at least one photo or video.');
      return;
    }
    final media = await buildExtraSubmissionMediaPayload(
      imagePaths: _imagePaths,
      videoPaths: _videoPaths,
    );
    if (notes.isEmpty && media.isEmpty) {
      _toast('Could not compress files small enough, or they were invalid.');
      return;
    }
    await widget.controller.submitExtraSubmission(
      notes: notes.isEmpty ? null : notes,
      media: media,
    );
  }

  @override
  Widget build(BuildContext context) {
    final safeBottom = MediaQuery.paddingOf(context).bottom;
    final keyboardHeight = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      padding: EdgeInsets.only(
        bottom: safeBottom + keyboardHeight,
        left: 12,
        right: 12,
        top: 8,
      ),
      child: Material(
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        color: Colors.white,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
          child: Obx(() {
            final busy = widget.controller.submittingExtra.value;
            return GestureDetector(
              onTap: () => FocusScope.of(context).unfocus(),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(
                        color: AppColors.slate500,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'New additional submission',
                    style: GoogleFonts.inter(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: AppColors.slate900,
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _notes,
                    minLines: 2,
                    maxLines: 6,
                    style: GoogleFonts.inter(color: AppColors.slate900, fontSize: 15),
                    decoration: InputDecoration(
                      hintText: 'Notes (optional if you add media)',
                      hintStyle: GoogleFonts.inter(color: AppColors.slate500),
                      filled: true,
                      fillColor: AppColors.slate100,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide(
                          color: AppColors.slate200,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      OutlinedButton.icon(
                        onPressed: busy ? null : _addPhotosGallery,
                        icon: Icon(
                          Icons.photo_library_outlined,
                          size: 18,
                        ),
                        label: const Text('Photos'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppColors.slate300,
                        ),
                      ),
                      OutlinedButton.icon(
                        onPressed: busy ? null : _addPhotoCamera,
                        icon: Icon(Icons.photo_camera_outlined, size: 18),
                        label: const Text('Camera'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppColors.slate300,
                        ),
                      ),
                      OutlinedButton.icon(
                        onPressed: busy ? null : _showVideoSourcePicker,
                        icon: Icon(Icons.videocam_outlined, size: 18),
                        label: Text(
                          'Video (max ${kMaxExtraVideoDurationSeconds}s)',
                        ),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppColors.slate300,
                        ),
                      ),
                    ],
                  ),
                  if (_totalPicks > 0) ...[
                    const SizedBox(height: 8),
                    Text(
                      '$_totalPicks / $_kMaxItemsPerSubmission files (compressed on send)',
                      style: GoogleFonts.inter(
                        fontSize: 12,
                        color: AppColors.slate400,
                      ),
                    ),
                    const SizedBox(height: 6),
                    ..._imagePaths.map(
                      (path) => ListTile(
                        dense: true,
                        leading: Icon(
                          Icons.image_outlined,
                          color: AppColors.primary,
                        ),
                        title: Text(
                          path.split('/').last,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.inter(
                            color: AppColors.slate300,
                            fontSize: 13,
                          ),
                        ),
                        trailing: IconButton(
                          icon: Icon(Icons.close_rounded, size: 20),
                          onPressed: busy
                              ? null
                              : () => setState(() => _imagePaths.remove(path)),
                        ),
                      ),
                    ),
                    ..._videoPaths.map(
                      (path) => ListTile(
                        dense: true,
                        leading: Icon(
                          Icons.movie_outlined,
                          color: AppColors.primary,
                        ),
                        title: Text(
                          path.split('/').last,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.inter(
                            color: AppColors.slate300,
                            fontSize: 13,
                          ),
                        ),
                        trailing: IconButton(
                          icon: Icon(Icons.close_rounded, size: 20),
                          onPressed: busy
                              ? null
                              : () => setState(() => _videoPaths.remove(path)),
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: busy ? null : _submit,
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    child: busy
                        ? const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : Text(
                            'Submit',
                            style: GoogleFonts.inter(
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                  ),
                ],
              ),
            ),
          );
        }),
      ),
    ),
  );
}
}

class _SubmissionCard extends StatelessWidget {
  const _SubmissionCard({required this.submission});

  final DiaryExtraSubmission submission;

  @override
  Widget build(BuildContext context) {
    final t = Get.find<StorageService>().authToken;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          color: AppColors.slate100,
          border: Border.all(color: AppColors.slate200),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (submission.isPendingSync) ...[
              Row(
                children: [
                  Icon(
                    Icons.schedule_rounded,
                    size: 16,
                    color: Colors.amber.shade200,
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      'Pending sync',
                      style: GoogleFonts.inter(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: Colors.amber.shade200,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
            ],
            Text(
              submission.createdAtIso.isNotEmpty
                  ? submission.createdAtIso
                  : '—',
              style: GoogleFonts.inter(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: AppColors.slate500,
              ),
            ),
            if (submission.displayName != null &&
                submission.displayName!.trim().isNotEmpty) ...[
              const SizedBox(height: 2),
              Text(
                submission.displayName!,
                style: GoogleFonts.inter(
                  fontSize: 12,
                  color: AppColors.slate400,
                ),
              ),
            ],
            if (submission.notes != null &&
                submission.notes!.trim().isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                submission.notes!,
                style: GoogleFonts.inter(
                  fontSize: 14,
                  height: 1.4,
                  color: AppColors.slate900,
                ),
              ),
            ],
            if (submission.isPendingSync &&
                submission.pendingMediaCount > 0) ...[
              const SizedBox(height: 8),
              Text(
                '${submission.pendingMediaCount} file${submission.pendingMediaCount == 1 ? '' : 's'} will upload when you are back online.',
                style: GoogleFonts.inter(
                  fontSize: 12,
                  height: 1.35,
                  color: AppColors.slate400,
                ),
              ),
            ],
            if (submission.media.isNotEmpty) ...[
              const SizedBox(height: 10),
              SizedBox(
                height: 88,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: submission.media.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                  itemBuilder: (context, i) {
                    final m = submission.media[i];
                    if (m.kind == 'video') {
                      final tok = t;
                      if (tok == null || tok.isEmpty) {
                        return Container(
                          width: 88,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(10),
                            color: AppColors.slate100,
                            border: Border.all(
                              color: AppColors.slate200,
                            ),
                          ),
                          child: Icon(
                            Icons.lock_outline,
                            color: AppColors.slate500,
                            size: 28,
                          ),
                        );
                      }
                      return DecoratedBox(
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: AppColors.slate200,
                          ),
                        ),
                        child: AuthVideoPosterTile(
                          url: m.fullUrl,
                          token: tok,
                          onTap: () {
                            showDialog<void>(
                              context: context,
                              builder: (ctx) => ExtraSubmissionVideoDialog(
                                url: m.fullUrl,
                                token: tok,
                              ),
                            );
                          },
                        ),
                      );
                    }
                    return GestureDetector(
                      onTap: () {
                        openFullscreenImage(
                          context,
                          m.fullUrl,
                          headers: t != null && t.isNotEmpty ? {'Authorization': 'Bearer $t'} : null,
                        );
                      },
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(10),
                        child: Image.network(
                          m.fullUrl,
                          width: 88,
                          height: 88,
                          fit: BoxFit.cover,
                          headers: t != null && t.isNotEmpty
                              ? {'Authorization': 'Bearer $t'}
                              : null,
                          errorBuilder: (_, __, ___) => Container(
                            width: 88,
                            color: AppColors.slate900,
                            child: Icon(
                              Icons.broken_image_outlined,
                              color: AppColors.slate500,
                            ),
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

Widget _accentTitleLocal(String t) {
  return Row(
    children: [
      Container(
        width: 4,
        height: 18,
        decoration: BoxDecoration(
          color: AppColors.primary,
          borderRadius: BorderRadius.circular(2),
        ),
      ),
      const SizedBox(width: 10),
      Expanded(
        child: Text(
          t,
          style: GoogleFonts.inter(
            fontSize: 15,
            fontWeight: FontWeight.w800,
            color: AppColors.slate900,
          ),
        ),
      ),
    ],
  );
}

class _DetailGlassPanel extends StatelessWidget {
  const _DetailGlassPanel({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        color: Colors.white,
        border: Border.all(color: AppColors.slate200, width: 0.8),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(18, 18, 18, 18),
        child: child,
      ),
    );
  }
}
