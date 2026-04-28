import 'dart:convert';
import 'dart:io';

import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:video_compress/video_compress.dart';

/// Must stay under server per-file limit (see backend `DIARY_EXTRA_FILE_MAX_BYTES`).
const int kServerMaxFileBytes = 6 * 1024 * 1024;

/// Max video length for extra submissions (picker + server-side checks).
const int kMaxExtraVideoDurationSeconds = 30;

/// Compress images (JPEG) and videos for extra visit submissions.
Future<List<Map<String, dynamic>>> buildExtraSubmissionMediaPayload({
  required List<String> imagePaths,
  List<String> videoPaths = const [],
}) async {
  final out = <Map<String, dynamic>>[];
  var i = 0;
  for (final p in imagePaths) {
    i++;
    final u = await FlutterImageCompress.compressWithFile(
      p,
      minWidth: 1280,
      minHeight: 1280,
      quality: 68,
      format: CompressFormat.jpeg,
    );
    if (u == null) continue;
    if (u.length > kServerMaxFileBytes) continue;
    out.add({
      'filename': 'photo_${DateTime.now().millisecondsSinceEpoch}_$i.jpg',
      'content_type': 'image/jpeg',
      'content_base64': base64Encode(u),
    });
  }

  var v = 0;
  for (final p in videoPaths) {
    v++;
    final MediaInfo? compressed = await VideoCompress.compressVideo(
      p,
      quality: VideoQuality.MediumQuality,
      deleteOrigin: false,
    );
    final pathOut = compressed?.path;
    if (pathOut == null || pathOut.isEmpty) continue;
    final file = File(pathOut);
    if (!await file.exists()) continue;
    final bytes = await file.readAsBytes();
    if (bytes.isEmpty || bytes.length > kServerMaxFileBytes) continue;
    out.add({
      'filename': 'video_${DateTime.now().millisecondsSinceEpoch}_$v.mp4',
      'content_type': 'video/mp4',
      'content_base64': base64Encode(bytes),
    });
  }

  return out;
}
