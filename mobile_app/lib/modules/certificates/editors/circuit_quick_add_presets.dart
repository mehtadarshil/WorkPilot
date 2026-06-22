import 'circuit_calculations.dart';
import 'circuit_helpers.dart';
import '../certificate_document_utils.dart';

Map<String, dynamic> _emptyCircuitMap() {
  return {
    'id': newId('c'),
    'circuitNumber': '',
    'description': '',
    'points': '',
    'wiringType': '',
    'refMethod': '',
    'liveMm2': '',
    'cpcMm2': '',
    'maxDisconnectTime': '',
    'ocpdBs': '',
    'ocpdType': '',
    'ocpdRatingA': '',
    'ocpdBreakingKa': '',
    'maxZs': '',
    'rcdBs': '',
    'rcdType': '',
    'rcdRatingMa': '',
    'rcdRatingA': '',
    'ringR1': '',
    'ringRn': '',
    'ringR2End': '',
    'r1r2': '',
    'r2': '',
    'insulationTestVoltage': '',
    'insulationLL': '',
    'insulationLE': '',
    'polarity': '',
    'zs': '',
    'rcdTripMs': '',
    'afdd': '',
    'remarks': '',
    'tested': false,
    'calcOverrides': <String, dynamic>{},
  };
}

class CircuitQuickAddPreset {
  const CircuitQuickAddPreset({
    required this.id,
    required this.tab,
    required this.category,
    required this.label,
    this.subtitle,
    this.spareOrUnknown = false,
    required this.patch,
  });

  final String id;
  final String tab;
  final String category;
  final String label;
  final String? subtitle;
  final bool spareOrUnknown;
  final Map<String, dynamic> patch;
}

const circuitQuickAddCategoryLabels = <String, String>{
  'distribution': 'Distribution',
  'submains': 'Submains',
  'lights': 'Lights',
  'sockets': 'Sockets',
  'kitchen': 'Kitchen',
  'bathroom': 'Bathroom',
  'ac_heating': 'AC & Heating',
  'misc': 'Misc',
};

const circuitQuickAddTabs = <Map<String, String>>[
  {'id': 'domestic', 'label': 'Domestic'},
  {'id': 'commercial', 'label': 'Commercial'},
  {'id': 'ultimate_london', 'label': 'Ultimate London'},
];

Map<String, dynamic> _mcb(
  String description,
  int ratingA,
  String std,
  String liveMm2, {
  String refMethod = 'C',
}) {
  final isRcbo = std.startsWith('61009');
  final typeMatch = RegExp(r'-([BCD])$').firstMatch(std);
  final bs = std.replaceAll(RegExp(r'-[BCD]$'), '');
  final ocpdType = typeMatch?.group(1) ?? 'B';
  return {
    'description': description,
    'wiringType': 'A',
    'refMethod': refMethod,
    'liveMm2': liveMm2,
    'ocpdBs': bs,
    'ocpdType': ocpdType,
    'ocpdRatingA': '$ratingA',
    if (isRcbo) ...{
      'rcdBs': '61009',
      'rcdType': ocpdType,
      'rcdRatingMa': '30',
      'rcdRatingA': '$ratingA',
    },
  };
}

Map<String, dynamic> _submain(String liveMm2, int ratingA, String std) =>
    _mcb('Submain', ratingA, std, liveMm2, refMethod: 'B2');

Map<String, dynamic> _distributionRcd(int ratingA) => {
      'description': 'RCD ${ratingA}A',
      'wiringType': 'N/A',
      'refMethod': 'N/A',
      'liveMm2': 'N/A',
      'ocpdBs': '61008',
      'ocpdType': 'N/A',
      'ocpdRatingA': '$ratingA',
      'rcdBs': '61008',
      'rcdType': 'AC',
      'rcdRatingMa': '30',
      'rcdRatingA': '$ratingA',
    };

CircuitQuickAddPreset _t(
  String id,
  String tab,
  String category,
  String label,
  Map<String, dynamic> patch, {
  String? subtitle,
  bool spareOrUnknown = false,
}) =>
    CircuitQuickAddPreset(
      id: id,
      tab: tab,
      category: category,
      label: label,
      subtitle: subtitle,
      spareOrUnknown: spareOrUnknown,
      patch: patch,
    );

List<CircuitQuickAddPreset> _lightingTemplates(String tab, String std) {
  final prefix = tab == 'commercial' ? 'com' : 'dom';
  final labels = tab == 'domestic'
      ? ['Lighting', 'Upstairs Lighting', 'Downstairs Lighting']
      : ['Lighting', 'Lighting'];
  final ratings = tab == 'domestic' ? [6, 6, 6] : [6, 10];
  return List.generate(labels.length, (i) {
    final label = labels[i];
    final slug = label.replaceAll(RegExp(r'\s+'), '-').toLowerCase();
    return _t(
      '$prefix-light-$slug-$std-$i',
      tab,
      'lights',
      label,
      _mcb(label, ratings[i], std, '1.5'),
      subtitle: '${ratings[i]}A $std',
    );
  });
}

List<CircuitQuickAddPreset> _socketTemplates(String tab, String std) {
  final prefix = tab == 'commercial' ? 'com' : 'dom';
  final rows = tab == 'domestic'
      ? [
          ['Ring final', 32, '2.5'],
          ['Upstairs sockets', 32, '2.5'],
          ['Downstairs sockets', 32, '2.5'],
          ['Radial', 20, '2.5'],
        ]
      : [
          ['Ring final', 32, '2.5'],
          ['Radial', 20, '2.5'],
        ];
  return List.generate(rows.length, (i) {
    final label = rows[i][0] as String;
    final rating = rows[i][1] as int;
    final live = rows[i][2] as String;
    final slug = label.replaceAll(RegExp(r'\s+'), '-').toLowerCase();
    return _t(
      '$prefix-sock-$slug-$std-$i',
      tab,
      'sockets',
      label,
      _mcb(label, rating, std, live),
      subtitle: '${rating}A $std',
    );
  });
}

List<CircuitQuickAddPreset> _dualStdKitchen(List<List<dynamic>> items) {
  return ['60898-B', '61009-B'].expand((std) {
    return List.generate(items.length, (i) {
      final label = items[i][0] as String;
      final rating = items[i][1] as int;
      final live = items[i][2] as String;
      final slug = label.replaceAll(RegExp(r'\s+'), '-').toLowerCase();
      return _t(
        'dom-kit-$slug-$rating-$std-$i',
        'domestic',
        'kitchen',
        label,
        _mcb(label, rating, std, live),
        subtitle: '${rating}A $std',
      );
    });
  }).toList();
}

List<CircuitQuickAddPreset> _dualStdBathroom() {
  return ['60898-B', '61009-B'].expand((std) {
    const showers = [
      ['Shower 32A', 32, '6'],
      ['Shower 40A', 40, '10'],
      ['Shower 50A', 50, '16'],
    ];
    return List.generate(showers.length, (i) {
      final label = showers[i][0] as String;
      final rating = showers[i][1] as int;
      final live = showers[i][2] as String;
      return _t(
        'dom-bath-$rating-$std-$i',
        'domestic',
        'bathroom',
        label,
        _mcb(label, rating, std, live),
        subtitle: std,
      );
    });
  }).toList();
}

List<CircuitQuickAddPreset> _dualStdHeating(List<List<dynamic>> items) {
  return ['60898-B', '61009-B'].expand((std) {
    return List.generate(items.length, (i) {
      final label = items[i][0] as String;
      final rating = items[i][1] as int;
      final live = items[i][2] as String;
      final slug = label.replaceAll(RegExp(r'\s+'), '-').toLowerCase();
      return _t(
        'dom-heat-$slug-$rating-$std-$i',
        'domestic',
        'ac_heating',
        label,
        _mcb(label, rating, std, live),
        subtitle: '${rating}A $std',
      );
    });
  }).toList();
}

final List<CircuitQuickAddPreset> _domesticDistribution = [
  _t('dom-spare', 'domestic', 'distribution', 'Spare', {'description': 'Spare'}, spareOrUnknown: true),
  _t('dom-unknown', 'domestic', 'distribution', 'Unknown', {'description': 'Unknown'}, spareOrUnknown: true),
  _t('dom-spd', 'domestic', 'distribution', 'SPD', {
    'description': 'SPD',
    'ocpdBs': '61643-11',
    'wiringType': 'N/A',
    'refMethod': 'N/A',
    'liveMm2': 'N/A',
    'ocpdType': 'N/A',
    'ocpdRatingA': 'N/A',
  }, subtitle: '61643-11'),
  _t('dom-afdd', 'domestic', 'distribution', 'AFDD', {
    'description': 'AFDD',
    'ocpdBs': '62606',
    'afdd': 'N/A',
    'wiringType': 'N/A',
    'refMethod': 'N/A',
    'liveMm2': 'N/A',
    'ocpdType': 'N/A',
    'ocpdRatingA': 'N/A',
  }, subtitle: '62606-AFDD'),
  _t('dom-rcd-63', 'domestic', 'distribution', 'RCD 63A', _distributionRcd(63)),
  _t('dom-rcd-80', 'domestic', 'distribution', 'RCD 80A', _distributionRcd(80)),
  _t('dom-rcd-100', 'domestic', 'distribution', 'RCD 100A', _distributionRcd(100)),
];

final List<CircuitQuickAddPreset> _domesticSubmains = [
  for (final row in [
    ['6', 32, '60898-B'],
    ['10', 40, '60898-B'],
    ['16', 63, '60898-B'],
    ['25', 80, '60898-B'],
    ['35', 100, '60898-B'],
    ['50', 100, '60898-B'],
    ['70', 125, '60898-B'],
  ])
    _t(
      'dom-sub-${row[0]}-${row[1]}',
      'domestic',
      'submains',
      'Submain ${row[0]}mm²',
      _submain(row[0] as String, row[1] as int, row[2] as String),
      subtitle: '${row[1]}A ${row[2]}',
    ),
];

final List<CircuitQuickAddPreset> _domesticKitchen = _dualStdKitchen([
  ['Hob', 20, '2.5'],
  ['Oven', 32, '6'],
  ['Cooker', 40, '10'],
]);

final List<CircuitQuickAddPreset> _domesticAcHeating = _dualStdHeating([
  ['Storage heater', 20, '2.5'],
  ['Immersion heater', 16, '2.5'],
  ['Boiler', 6, '1.5'],
  ['Heat pump', 32, '6'],
  ['Air conditioner', 32, '6'],
]);

final List<CircuitQuickAddPreset> _domesticMisc = [
  _t('dom-smoke', 'domestic', 'misc', 'Smoke alarm', _mcb('Smoke alarm', 6, '60898-B', '1.5'), subtitle: '6A 60898-B'),
  _t('dom-garage', 'domestic', 'misc', 'Garage', _mcb('Garage', 6, '60898-B', '1.5'), subtitle: '6A 60898-B'),
  _t('dom-ev', 'domestic', 'misc', 'EV Charger', _mcb('EV Charger', 32, '61009-B', '6'), subtitle: '32A 61009-B'),
  _t('dom-garden', 'domestic', 'misc', 'Garden sockets', _mcb('Garden sockets', 16, '60898-B', '2.5'), subtitle: '16A 60898-B'),
  _t('dom-shed', 'domestic', 'misc', 'Shed', _mcb('Shed', 16, '60898-B', '2.5'), subtitle: '16A 60898-B'),
];

List<CircuitQuickAddPreset> _commercialDistribution() {
  return _domesticDistribution
      .map(
        (t) => CircuitQuickAddPreset(
          id: t.id.replaceFirst('dom-', 'com-'),
          tab: 'commercial',
          category: t.category,
          label: t.label,
          subtitle: t.subtitle,
          spareOrUnknown: t.spareOrUnknown,
          patch: t.patch,
        ),
      )
      .toList();
}

final List<CircuitQuickAddPreset> _commercialSubmains = [
  for (final row in [
    ['10', 40, '60898-C'],
    ['16', 63, '60898-C'],
    ['25', 100, '60898-C'],
    ['35', 125, '60898-C'],
    ['50', 160, '60947-2'],
  ])
    _t(
      'com-sub-${row[0]}-${row[1]}',
      'commercial',
      'submains',
      'Submain ${row[0]}mm²',
      _submain(row[0] as String, row[1] as int, row[2] as String),
      subtitle: '${row[1]}A ${row[2]}',
    ),
];

final List<CircuitQuickAddPreset> _commercialKitchen = [
  for (final row in [
    ['Oven', 32, '6', '60898-C'],
    ['Hob', 32, '6', '60898-C'],
    ['Hot Plate', 20, '2.5', '60898-C'],
    ['Dishwasher', 20, '2.5', '60898-C'],
    ['Chiller', 20, '2.5', '60898-C'],
    ['Fridge', 16, '2.5', '60898-C'],
    ['Hand Dryer', 20, '2.5', '61009-C'],
  ])
    _t(
      'com-kit-${row[0]}-${row[1]}',
      'commercial',
      'kitchen',
      row[0] as String,
      _mcb(row[0] as String, row[1] as int, row[3] as String, row[2] as String),
      subtitle: '${row[1]}A ${row[3]}',
    ),
];

final List<CircuitQuickAddPreset> _commercialMisc = [
  for (final row in [
    ['Fire Alarm', 6, '1.5', '60898-C'],
    ['Burglar Alarm', 6, '1.5', '60898-C'],
    ['Disabled Alarm', 6, '1.5', '60898-C'],
    ['Forklift', 32, '6', '61009-C'],
    ['Machine', 32, '6', '60898-C'],
    ['Motor', 20, '2.5', '60898-C'],
    ['EV Charger', 32, '6', '61009-C'],
  ])
    _t(
      'com-misc-${row[0]}-${row[1]}',
      'commercial',
      'misc',
      row[0] as String,
      _mcb(row[0] as String, row[1] as int, row[3] as String, row[2] as String),
      subtitle: '${row[1]}A ${row[3]}',
    ),
];

final List<CircuitQuickAddPreset> circuitQuickAddPresets = [
  ..._domesticDistribution,
  ..._domesticSubmains,
  ..._lightingTemplates('domestic', '60898-B'),
  ..._lightingTemplates('domestic', '61009-B'),
  ..._socketTemplates('domestic', '60898-B'),
  ..._socketTemplates('domestic', '61009-B'),
  ..._domesticKitchen,
  ..._dualStdBathroom(),
  ..._domesticAcHeating,
  ..._domesticMisc,
  ..._commercialDistribution(),
  ..._commercialSubmains,
  ..._lightingTemplates('commercial', '60898-C'),
  ..._socketTemplates('commercial', '60898-C'),
  ..._socketTemplates('commercial', '61009-C'),
  ..._commercialKitchen,
  ..._commercialMisc,
];

List<CircuitQuickAddPreset> presetsForTab(String tab) {
  if (tab == 'ultimate_london') return [];
  return circuitQuickAddPresets.where((p) => p.tab == tab).toList();
}

List<String> categoriesForTab(String tab) {
  final seen = <String>{};
  final out = <String>[];
  for (final preset in presetsForTab(tab)) {
    if (seen.add(preset.category)) out.add(preset.category);
  }
  return out;
}

Map<String, dynamic> buildCircuitFromQuickAddPreset(
  CircuitQuickAddPreset preset,
  Map<String, dynamic> board,
  String circuitNumber,
) {
  final circuit = _emptyCircuitMap();
  circuit['circuitNumber'] = circuitNumber;
  circuit.addAll(preset.patch);
  if (preset.spareOrUnknown) {
    return applyNaCircuitDefaults(circuit);
  }
  final use100 = board['maxZsUse100Percent'] == true;
  return applyCircuitCalculations(circuit, board, use100);
}
