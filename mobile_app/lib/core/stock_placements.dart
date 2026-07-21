String formatPlacementLabel(Map<String, dynamic> placement) {
  final parts = <String>[placement['location'] as String? ?? 'Store'];
  final quality = (placement['quality'] as String?)?.trim();
  if (quality != null && quality.isNotEmpty) parts.add(quality);
  final zone = (placement['zone'] as String?)?.trim();
  final aisle = (placement['aisle'] as String?)?.trim();
  final shelf = (placement['shelf'] as String?)?.trim();
  final box = ((placement['box'] as String?)?.trim().isNotEmpty == true
          ? placement['box']
          : placement['storage_code'])
      as String?;
  if (zone != null && zone.isNotEmpty) parts.add(zone);
  if (aisle != null && aisle.isNotEmpty) parts.add('Aisle $aisle');
  if (shelf != null && shelf.isNotEmpty) parts.add('Shelf $shelf');
  if (box != null && box.isNotEmpty) {
    parts.add(box.startsWith('Box') || box.startsWith('Cell') || box.startsWith('Tote') ? box : 'Box $box');
  }
  return parts.join(' · ');
}

List<Map<String, dynamic>> parsePlacementsFromItem(Map<String, dynamic> item) {
  final raw = item['locations'];
  if (raw is List && raw.isNotEmpty) {
    return raw.map((entry) {
      if (entry is! Map) return <String, dynamic>{'location': 'Store', 'quantity': 0, 'quality': 'Used - Good'};
      return {
        'location': entry['location'] as String? ?? item['location'] as String? ?? 'Store',
        'quantity': (entry['quantity'] as num?)?.toInt() ?? 0,
        'quality': entry['quality'] as String? ?? item['quality'] as String? ?? 'Used - Good',
        if (entry['zone'] != null) 'zone': '${entry['zone']}',
        if (entry['aisle'] != null) 'aisle': '${entry['aisle']}',
        if (entry['shelf'] != null) 'shelf': '${entry['shelf']}',
        if (entry['box'] != null) 'box': '${entry['box']}',
        if (entry['storage_code'] != null) 'storage_code': '${entry['storage_code']}',
        if (entry['notes'] != null) 'notes': '${entry['notes']}',
      };
    }).toList();
  }
  return [
    {
      'location': item['location'] as String? ?? 'Store',
      'quantity': (item['quantity'] as num?)?.toInt() ?? 0,
      'quality': item['quality'] as String? ?? 'Used - Good',
    },
  ];
}

String placementSearchBlob(Map<String, dynamic> placement) {
  return [
    placement['location'],
    placement['quality'],
    placement['zone'],
    placement['aisle'],
    placement['shelf'],
    placement['box'],
    placement['storage_code'],
    placement['notes'],
    formatPlacementLabel(placement),
  ].where((v) => v != null && '$v'.trim().isNotEmpty).join(' ').toLowerCase();
}

Map<String, dynamic> emptyPlacementRow(String defaultLocation) {
  return {
    'location': defaultLocation,
    'quantity': 0,
    'quality': 'Used - Good',
    'zone': '',
    'aisle': '',
    'shelf': '',
    'box': '',
    'storage_code': '',
    'notes': '',
  };
}

Map<String, dynamic> placementRowToApi(Map<String, dynamic> row) {
  final placement = <String, dynamic>{
    'location': row['location'] as String? ?? 'Store',
    'quantity': (row['quantity'] as num?)?.toInt() ?? int.tryParse('${row['quantity']}') ?? 0,
    'quality': row['quality'] as String? ?? 'Used - Good',
  };
  for (final key in ['zone', 'aisle', 'shelf', 'box', 'storage_code', 'notes']) {
    final val = (row[key] as String?)?.trim() ?? '';
    if (val.isNotEmpty) placement[key] = val;
  }
  return placement;
}

List<Map<String, dynamic>> placementRowsToApi(
  List<Map<String, dynamic>> rows,
  String quantityMode,
) {
  final parsed = rows.map(placementRowToApi).toList();
  if (quantityMode == 'level') {
    return parsed.map((p) => {...p, 'quantity': 0}).toList();
  }
  return parsed;
}

String? validatePlacementsRequireBin(List<Map<String, dynamic>> placements, List<String> requireSites) {
  final require = requireSites.map((s) => s.toLowerCase()).toSet();
  for (final p in placements) {
    final qty = (p['quantity'] as num?)?.toInt() ?? 0;
    if (qty <= 0) continue;
    final site = (p['location'] as String? ?? '').toLowerCase();
    if (!require.contains(site)) continue;
    final box = (p['box'] as String?)?.trim() ?? '';
    final code = (p['storage_code'] as String?)?.trim() ?? '';
    if (box.isEmpty && code.isEmpty) {
      return 'Box or storage code required for ${p['location']}';
    }
  }
  return null;
}

int pickDefaultPlacementIndex(List<Map<String, dynamic>> placements) {
  if (placements.isEmpty) return 0;
  var bestIdx = 0;
  var bestQty = (placements[0]['quantity'] as num?)?.toInt() ?? 0;
  for (var i = 1; i < placements.length; i++) {
    final q = (placements[i]['quantity'] as num?)?.toInt() ?? 0;
    if (q > bestQty) {
      bestQty = q;
      bestIdx = i;
    }
  }
  return bestIdx;
}

const jobPartStatuses = <String>[
  'requested',
  'on_order',
  'available',
  'picked_up',
  'installed',
  'cancelled',
  'returned',
];

String jobPartStatusLabel(String status) {
  switch (status) {
    case 'on_order':
      return 'On order';
    case 'picked_up':
      return 'Picked up';
    default:
      return status.replaceAll('_', ' ').split(' ').map((w) {
        if (w.isEmpty) return w;
        return '${w[0].toUpperCase()}${w.substring(1)}';
      }).join(' ');
  }
}

const quantityLevels = ['low', 'medium', 'high'];

String quantityLevelLabel(String? level) {
  switch (level) {
    case 'low':
      return 'Low';
    case 'medium':
      return 'Medium';
    case 'high':
      return 'High';
    default:
      return level ?? '';
  }
}
