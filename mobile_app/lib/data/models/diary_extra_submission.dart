import '../../core/values/app_constants.dart';

class ExtraSubmissionMedia {
  ExtraSubmissionMedia({
    required this.originalFilename,
    required this.contentType,
    required this.kind,
    required this.byteSize,
    required this.filePath,
  });

  factory ExtraSubmissionMedia.fromJson(Map<String, dynamic> json) {
    return ExtraSubmissionMedia(
      originalFilename: json['original_filename'] as String? ?? 'file',
      contentType:
          json['content_type'] as String? ?? 'application/octet-stream',
      kind: json['kind'] as String? ?? 'image',
      byteSize: (json['byte_size'] as num?)?.toInt() ?? 0,
      filePath: json['file_path'] as String? ?? '',
    );
  }

  final String originalFilename;
  final String contentType;
  final String kind;
  final int byteSize;
  final String filePath;

  /// Absolute URL for [Image.network] (uses [AppConstants.apiBaseUrl], which includes `/api`).
  String get fullUrl {
    final p = filePath.startsWith('/') ? filePath : '/$filePath';
    var base = AppConstants.apiBaseUrl;
    if (base.endsWith('/')) {
      base = base.substring(0, base.length - 1);
    }
    return '$base$p';
  }
}

class DiaryExtraSubmission {
  DiaryExtraSubmission({
    required this.id,
    this.notes,
    required this.createdAtIso,
    this.createdByName,
    this.displayName,
    this.media = const [],
    this.isPendingSync = false,
    this.pendingMediaCount = 0,
  });

  factory DiaryExtraSubmission.fromJson(Map<String, dynamic> json) {
    final raw = json['media'];
    final list = <ExtraSubmissionMedia>[];
    if (raw is List) {
      for (final e in raw) {
        if (e is Map<String, dynamic>) {
          list.add(ExtraSubmissionMedia.fromJson(e));
        }
      }
    }
    return DiaryExtraSubmission(
      id: (json['id'] as num).toInt(),
      notes: json['notes'] as String?,
      createdAtIso: json['created_at'] as String? ?? '',
      createdByName: json['created_by_name'] as String?,
      displayName:
          (json['display_name'] as String?) ??
          (json['created_by_name'] as String?),
      media: list,
      isPendingSync: json['is_pending_sync'] == true,
      pendingMediaCount: (json['pending_media_count'] as num?)?.toInt() ?? 0,
    );
  }

  final int id;
  final String? notes;
  final String createdAtIso;
  final String? createdByName;

  /// Set from API: visit engineer when known, else uploader account.
  final String? displayName;
  final List<ExtraSubmissionMedia> media;

  /// Local-only row shown after queuing an extra submission offline.
  final bool isPendingSync;

  /// When [isPendingSync], how many files will upload when online (no inline previews).
  final int pendingMediaCount;
}
