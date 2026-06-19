import 'circuit_calculations.dart';
import 'circuit_columns.dart';

const Set<String> untestedZsValues = {
  '',
  '-',
  '--',
  '---',
  'lim',
  'n/v',
  'n/a',
  'na',
  'x',
};

const List<String> circuitNaFieldKeys = [
  'points',
  'wiringType',
  'refMethod',
  'liveMm2',
  'cpcMm2',
  'maxDisconnectTime',
  'ocpdBs',
  'ocpdType',
  'ocpdRatingA',
  'ocpdBreakingKa',
  'maxZs',
  'rcdBs',
  'rcdType',
  'rcdRatingMa',
  'rcdRatingA',
  'ringR1',
  'ringRn',
  'ringR2End',
  'r1r2',
  'r2',
  'insulationTestVoltage',
  'insulationLL',
  'insulationLE',
  'polarity',
  'zs',
  'rcdTripMs',
  'afdd',
  'remarks',
];

bool isNaDescription(String value) {
  final text = value.trim().toLowerCase();
  return text == 'spare' || text == 'unknown';
}

Map<String, dynamic> applyNaCircuitDefaults(Map<String, dynamic> circuit) {
  final next = Map<String, dynamic>.from(circuit);
  next['tested'] = false;
  final overrides = next['calcOverrides'];
  next['calcOverrides'] = overrides is Map ? Map<String, dynamic>.from(overrides) : <String, dynamic>{};
  for (final key in circuitNaFieldKeys) {
    next[key] = 'N/A';
  }
  return next;
}

bool isCircuitTested(Map<String, dynamic> circuit) {
  final zs = circuit['zs']?.toString().trim().toLowerCase() ?? '';
  return !untestedZsValues.contains(zs);
}

int countTestedCircuits(List<Map<String, dynamic>> circuits) {
  return circuits.where(isCircuitTested).length;
}

List<Map<String, dynamic>> replaceInCircuits(
  List<Map<String, dynamic>> circuits,
  String column,
  String find,
  String replace,
) {
  if (find.isEmpty) return circuits;
  return circuits.map((circuit) {
    final raw = circuit[column];
    if (raw is! String || !raw.contains(find)) return circuit;
    final next = Map<String, dynamic>.from(circuit);
    next[column] = raw.split(find).join(replace);
    return next;
  }).toList();
}

Map<String, dynamic> autofillCircuitFromPrevious(
  Map<String, dynamic> last,
  Map<String, dynamic> previous,
  Map<String, dynamic> board,
  bool use100Percent,
) {
  final filled = Map<String, dynamic>.from(last);
  void copyIfEmpty(String key) {
    final current = filled[key]?.toString().trim() ?? '';
    if (current.isEmpty) {
      filled[key] = previous[key] ?? '';
    }
  }

  copyIfEmpty('wiringType');
  copyIfEmpty('refMethod');
  copyIfEmpty('liveMm2');
  copyIfEmpty('cpcMm2');
  copyIfEmpty('ocpdBs');
  copyIfEmpty('ocpdType');
  copyIfEmpty('ocpdRatingA');

  return applyCircuitCalculations(filled, board, use100Percent);
}

String normalizeBoardStatus(String? status) {
  final value = status?.trim().toLowerCase() ?? '';
  if (value == 'complete' || value == 'done') return 'done';
  return 'in_progress';
}

bool isBoardDone(Map<String, dynamic> board) {
  return normalizeBoardStatus(board['status']?.toString()) == 'done';
}

String boardStatusLabel(String? status) {
  return isBoardDone({'status': status}) ? 'Done' : 'In progress';
}

List<CircuitColSpec> fillableCircuitColumns() {
  return CIRCUIT_COLUMNS_SPEC.where((col) {
    return !col.calculated && col.key != 'actions' && col.key != 'circuitNumber';
  }).toList();
}

const Map<String, int> circuitFieldMaxLengths = {
  'description': 80,
  'points': 8,
  'wiringType': 24,
  'refMethod': 8,
  'liveMm2': 8,
  'cpcMm2': 8,
  'maxDisconnectTime': 8,
  'ocpdBs': 16,
  'ocpdType': 8,
  'ocpdRatingA': 8,
  'ocpdBreakingKa': 8,
  'maxZs': 12,
  'rcdBs': 16,
  'rcdType': 8,
  'rcdRatingMa': 8,
  'rcdRatingA': 8,
  'ringR1': 12,
  'ringRn': 12,
  'ringR2End': 12,
  'r1r2': 12,
  'r2': 12,
  'insulationTestVoltage': 8,
  'insulationLL': 12,
  'insulationLE': 12,
  'polarity': 8,
  'zs': 12,
  'rcdTripMs': 12,
  'afdd': 8,
  'remarks': 200,
  'circuitNumber': 6,
};

const reinspectionQuickOptions = [
  '28 days',
  '6 months',
  '1 year',
  '3 years',
  '5 years',
  '10 years',
];

const observationCodeOrder = {'c1': 0, 'c2': 1, 'c3': 2, 'fi': 3};

bool isSpareOrUnknownCircuit(Map<String, dynamic> circuit) {
  return isNaDescription(circuit['description']?.toString() ?? '');
}

String clampCircuitField(String key, String value) {
  final max = circuitFieldMaxLengths[key];
  if (max == null || value.length <= max) return value;
  return value.substring(0, max);
}

List<String> getColumnQuickOptions(String key) {
  return circuitColumnOptions[key] ?? const [];
}

List<Map<String, dynamic>> renumberCircuitsSmart(List<Map<String, dynamic>> circuits) {
  return circuits.asMap().entries.map((entry) {
    final next = Map<String, dynamic>.from(entry.value);
    next['circuitNumber'] = (entry.key + 1).toString();
    return next;
  }).toList();
}

List<Map<String, dynamic>> fillColumnIntelligent(
  List<Map<String, dynamic>> circuits,
  String column,
  String value,
  Map<String, dynamic> board,
  bool use100Percent,
) {
  final trimmed = clampCircuitField(column, value.trim());
  return circuits.map((circuit) {
    if (isSpareOrUnknownCircuit(circuit)) return circuit;
    final next = Map<String, dynamic>.from(circuit);
    next[column] = trimmed;
    return applyCircuitCalculations(next, board, use100Percent);
  }).toList();
}

List<Map<String, dynamic>> clearColumnIntelligent(
  List<Map<String, dynamic>> circuits,
  String column,
  Map<String, dynamic> board,
  bool use100Percent,
) {
  return circuits.map((circuit) {
    if (isSpareOrUnknownCircuit(circuit)) return circuit;
    final next = Map<String, dynamic>.from(circuit);
    next[column] = '';
    return applyCircuitCalculations(next, board, use100Percent);
  }).toList();
}

List<List<String>> parsePastedGrid(String text) {
  final normalized = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n').trim();
  if (normalized.isEmpty) return [];
  var rows = normalized.split('\n').map((line) => line.split('\t')).toList();
  if (rows.length == 1 && rows.first.length == 1 && rows.first.first.contains(',')) {
    rows = normalized.split('\n').map((line) => line.split(',').map((c) => c.trim()).toList()).toList();
  }
  return rows;
}

List<Map<String, dynamic>> pasteIntoCircuits(
  List<Map<String, dynamic>> circuits,
  int startRow,
  int startColIndex,
  List<List<String>> grid,
  Map<String, dynamic> board,
  bool use100Percent,
) {
  final fillable = fillableCircuitColumns();
  final next = circuits.map((c) => Map<String, dynamic>.from(c)).toList();
  for (var r = 0; r < grid.length; r++) {
    final rowIndex = startRow + r;
    if (rowIndex < 0 || rowIndex >= next.length) break;
    final row = grid[r];
    for (var c = 0; c < row.length; c++) {
      final colIndex = startColIndex + c;
      if (colIndex < 0 || colIndex >= fillable.length) break;
      final key = fillable[colIndex].key;
      if (isSpareOrUnknownCircuit(next[rowIndex]) && key != 'description') continue;
      next[rowIndex][key] = clampCircuitField(key, row[c].trim());
    }
    next[rowIndex] = applyCircuitCalculations(next[rowIndex], board, use100Percent);
  }
  return next;
}

List<Map<String, dynamic>> sortObservationsByCodeAndLocation(List<Map<String, dynamic>> items) {
  final next = items.map((item) => Map<String, dynamic>.from(item)).toList();
  next.sort((a, b) {
    final codeA = observationCodeOrder[a['code']?.toString() ?? ''] ?? 99;
    final codeB = observationCodeOrder[b['code']?.toString() ?? ''] ?? 99;
    if (codeA != codeB) return codeA.compareTo(codeB);
    return (a['location']?.toString() ?? '').toLowerCase().compareTo((b['location']?.toString() ?? '').toLowerCase());
  });
  return next;
}

