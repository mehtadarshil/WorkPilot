Set<String> hiddenSiteReportFieldIds(
  List<Map<String, dynamic>> fields,
  Map<String, String> values,
) {
  final hidden = <String>{};
  for (var i = 0; i < fields.length; i++) {
    final field = fields[i];
    final rule = field['hide_following_when'];
    if (rule is! Map) continue;
    final whenRaw = rule['when_values'];
    final whenValues = whenRaw is List
        ? whenRaw
            .whereType<String>()
            .map((v) => v.trim().toLowerCase())
            .where((v) => v.isNotEmpty)
            .toList()
        : <String>[];
    final hideNext = (rule['hide_next_count'] as num?)?.toInt() ?? 0;
    if (whenValues.isEmpty || hideNext <= 0) continue;

    final fieldId = (field['id'] as String?) ?? '';
    if (fieldId.isEmpty) continue;
    final answer = (values[fieldId] ?? '').trim().toLowerCase();
    if (!whenValues.contains(answer)) continue;

    for (var j = 1; j <= hideNext && i + j < fields.length; j++) {
      final nextId = (fields[i + j]['id'] as String?) ?? '';
      if (nextId.isNotEmpty) hidden.add(nextId);
    }
  }
  return hidden;
}

List<Map<String, dynamic>> visibleSiteReportFields(
  List<Map<String, dynamic>> fields,
  Map<String, String> values,
) {
  final hidden = hiddenSiteReportFieldIds(fields, values);
  return fields.where((f) {
    final id = (f['id'] as String?) ?? '';
    return id.isNotEmpty && !hidden.contains(id);
  }).toList();
}