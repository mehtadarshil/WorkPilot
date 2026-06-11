
const double uo = 230.0;
const double cmin = 0.95;

const Map<String, double> mcbMultiplier = {
  'B': 5.0,
  'C': 10.0,
  'D': 20.0,
};

const Set<String> untestedZsValues = {
  '',
  '-',
  '--',
  '---',
  'lim',
  'n/v',
  'n/a',
  'na',
  'x'
};

const Map<String, String> cpcFromLive = {
  '1': '1',
  '1.0': '1',
  '1.5': '1',
  '2.5': '1.5',
  '4': '1.5',
  '6': '2.5',
  '10': '4',
  '16': '6',
  '25': '10',
  '35': '16',
};

double? parseNum(dynamic v) {
  if (v == null) return null;
  final s = v.toString().trim();
  if (s.isEmpty) return null;
  // Strip non-digits and non-dots, but preserve negative/decimal signs if any
  final cleaned = s.replaceAll(RegExp(r'[^\d.]'), '');
  if (cleaned.isEmpty) return null;
  return double.tryParse(cleaned);
}

String formatOhms(double n) {
  return n.toStringAsFixed(2);
}

String formatKa(double n) {
  if (n == n.roundToDouble()) {
    return n.round().toString();
  }
  return n.toStringAsFixed(1);
}

double inferMaxDisconnectTime(Map<String, dynamic> circuit, double? ratingA) {
  final explicit = parseNum(circuit['maxDisconnectTime']);
  if (explicit != null && explicit > 0) return explicit;
  final rating = ratingA ?? parseNum(circuit['ocpdRatingA']);
  if (rating != null && rating > 32) return 5.0;
  return 0.4;
}

String calcMaxDisconnectTime(Map<String, dynamic> circuit) {
  final rating = parseNum(circuit['ocpdRatingA']);
  return inferMaxDisconnectTime(circuit, rating).toString();
}

String calcBreakingCapacityKa(Map<String, dynamic> circuit, Map<String, dynamic> board) {
  final ipf = parseNum(board['ipfAtDb']);
  if (ipf == null || ipf <= 0) return '';
  final standard = [6.0, 10.0, 16.0, 25.0, 36.0, 50.0, 80.0, 100.0];
  final need = (ipf * 10).ceil() / 10.0;
  final pick = standard.firstWhere((k) => k >= need, orElse: () => standard.last);
  return formatKa(pick);
}

String calcMaxZs(
  Map<String, dynamic> circuit,
  Map<String, dynamic> board,
  bool use100Percent,
) {
  final In = parseNum(circuit['ocpdRatingA']);
  if (In == null || In <= 0) return '';

  final typeStr = (circuit['ocpdType'] ?? 'B').toString().trim().toUpperCase();
  final typeKey = typeStr.isNotEmpty ? typeStr.substring(0, 1) : 'B';
  final n = mcbMultiplier[typeKey];
  if (n == null) return '';

  final t = inferMaxDisconnectTime(circuit, In);
  double zs;
  if (t <= 0.5) {
    zs = (uo * cmin) / (n * In);
  } else {
    zs = (uo * cmin) / (1.44 * In);
  }
  if (!use100Percent) zs *= 0.8;
  return formatOhms(zs);
}

String calcCpcFromLive(String liveMm2) {
  final key = liveMm2.trim();
  return cpcFromLive[key] ?? '';
}

String calcR1PlusR2(Map<String, dynamic> circuit) {
  final r1 = parseNum(circuit['ringR1']);
  final r2 = parseNum(circuit['ringR2End']);
  if (r1 == null || r2 == null) return '';
  return formatOhms((r1 + r2) / 4.0);
}

String calcR1PlusR2FromZs(Map<String, dynamic> circuit, Map<String, dynamic> board) {
  final zs = parseNum(circuit['zs']);
  final zdb = parseNum(board['zsAtDb']);
  if (zs == null || zdb == null) return '';
  final value = zs - zdb;
  return value >= 0 ? formatOhms(value) : '';
}

String calcMeasuredZs(Map<String, dynamic> circuit, Map<String, dynamic> board) {
  final zdb = parseNum(board['zsAtDb']);
  if (zdb == null) return '';
  final r1r2 = parseNum(circuit['r1r2']);
  final r2 = parseNum(circuit['r2']);
  final loop = r1r2 ?? r2;
  if (loop == null) return '';
  return formatOhms(zdb + loop);
}

Map<String, dynamic> applyCircuitCalculations(
  Map<String, dynamic> circuit,
  Map<String, dynamic> board,
  bool use100Percent,
) {
  final next = Map<String, dynamic>.from(circuit);
  final rawOverrides = circuit['calcOverrides'];
  final overrides = rawOverrides is Map ? Map<String, dynamic>.from(rawOverrides) : <String, dynamic>{};

  if (overrides['maxDisconnectTime'] != true) {
    next['maxDisconnectTime'] = calcMaxDisconnectTime(next);
  }
  if (overrides['ocpdBreakingKa'] != true) {
    next['ocpdBreakingKa'] = calcBreakingCapacityKa(next, board);
  }
  if (overrides['maxZs'] != true) {
    next['maxZs'] = calcMaxZs(next, board, use100Percent);
  }
  final live = (next['liveMm2'] ?? '').toString().trim();
  final cpc = (next['cpcMm2'] ?? '').toString().trim();
  if (overrides['cpcMm2'] != true && cpc.isEmpty && live.isNotEmpty) {
    next['cpcMm2'] = calcCpcFromLive(live);
  }
  if (overrides['r1r2'] != true) {
    final r = calcR1PlusR2(circuit);
    final rFromZs = calcR1PlusR2FromZs(circuit, board);
    final finalR = r.isNotEmpty ? r : rFromZs;
    if (finalR.isNotEmpty) next['r1r2'] = finalR;
  }
  if (overrides['zs'] != true) {
    final zsVal = calcMeasuredZs(next, board);
    if (zsVal.isNotEmpty) next['zs'] = zsVal;
  }

  final zsString = (next['zs'] ?? '').toString().trim().toLowerCase();
  next['tested'] = !untestedZsValues.contains(zsString);

  return next;
}

List<Map<String, dynamic>> recalculateAllCircuits(
  List<Map<String, dynamic>> circuits,
  Map<String, dynamic> board,
  bool use100Percent, {
  bool clearOverrides = false,
}) {
  return circuits.map((c) {
    final nextC = Map<String, dynamic>.from(c);
    if (clearOverrides) {
      nextC['calcOverrides'] = <String, dynamic>{};
    }
    return applyCircuitCalculations(nextC, board, use100Percent);
  }).toList();
}
