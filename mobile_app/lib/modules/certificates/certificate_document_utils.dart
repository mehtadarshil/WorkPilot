import 'dart:convert';
import 'dart:math';

String newId(String prefix) {
  final now = DateTime.now().millisecondsSinceEpoch.toRadixString(36);
  final rand = Random().nextInt(0xFFFFFF).toRadixString(36).padLeft(4, '0');
  return '${prefix}_${now}_$rand';
}

Map<String, dynamic> deepCloneDocument(Map<String, dynamic> document) {
  return Map<String, dynamic>.from(jsonDecode(jsonEncode(document)) as Map);
}

dynamic getDocumentPath(Map<String, dynamic> document, String path) {
  dynamic current = document;
  for (final part in path.split('.')) {
    if (current is Map) {
      current = current[part];
    } else if (current is List) {
      final index = int.tryParse(part);
      if (index == null || index < 0 || index >= current.length) return null;
      current = current[index];
    } else {
      return null;
    }
  }
  return current;
}

Map<String, dynamic> setDocumentPath(
  Map<String, dynamic> document,
  String path,
  dynamic value,
) {
  final next = deepCloneDocument(document);
  final parts = path.split('.').where((part) => part.isNotEmpty).toList();
  if (parts.isEmpty) return next;

  dynamic current = next;
  for (var i = 0; i < parts.length - 1; i++) {
    final part = parts[i];
    final upcoming = parts[i + 1];
    final upcomingIsIndex = int.tryParse(upcoming) != null;
    if (current is Map<String, dynamic>) {
      current = current.putIfAbsent(
        part,
        () => upcomingIsIndex ? <dynamic>[] : <String, dynamic>{},
      );
    } else if (current is List) {
      final index = int.tryParse(part);
      if (index == null || index < 0) return next;
      while (current.length <= index) {
        current.add(upcomingIsIndex ? <dynamic>[] : <String, dynamic>{});
      }
      current = current[index];
    } else {
      return next;
    }
  }

  final last = parts.last;
  if (current is Map<String, dynamic>) {
    current[last] = value;
  } else if (current is List) {
    final index = int.tryParse(last);
    if (index == null || index < 0) return next;
    while (current.length <= index) {
      current.add(null);
    }
    current[index] = value;
  }
  return next;
}

String stringAtPath(Map<String, dynamic> document, String path) {
  return getDocumentPath(document, path)?.toString() ?? '';
}

List<Map<String, dynamic>> listAtPath(
  Map<String, dynamic> document,
  String path,
) {
  final raw = getDocumentPath(document, path);
  if (raw is! List) return const [];
  return raw
      .whereType<Map>()
      .map((item) => Map<String, dynamic>.from(item))
      .toList();
}
