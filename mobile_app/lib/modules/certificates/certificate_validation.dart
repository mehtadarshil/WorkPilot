import '../../data/models/electrical_certificate_models.dart';
import 'constants/certificate_schedule_items.dart';
import 'editors/circuit_helpers.dart';

bool _isEmpty(dynamic v) => v == null || v.toString().trim().isEmpty;

ValidationIssue _req(
  String section,
  String label, {
  String? field,
  String? boardId,
  String? circuitId,
}) {
  return ValidationIssue(
    id: '$section:$label:${boardId ?? ''}:${circuitId ?? ''}',
    section: section,
    label: '$label: Is empty',
    field: field,
    boardId: boardId,
    circuitId: circuitId,
  );
}

List<ValidationIssue> validateElectricalCertificateDocument(Map<String, dynamic> doc) {
  final typeSlug = doc['typeSlug']?.toString() ?? '';
  const skipTypes = {
    'portable_appliance_test',
    'fi_insp_2025',
    'dfi_insp_2019_a1',
    'dfi_inst_2019_a1',
    'fi_extinsp_5306',
    'em_pir_2025',
    'eic_18e_a3',
    'mwc_18e_a3',
  };
  if (skipTypes.contains(typeSlug)) return const [];

  final issues = <ValidationIssue>[];
  final inst = Map<String, dynamic>.from(doc['installation'] as Map? ?? {});

  if (_isEmpty(inst['premisesType'])) issues.add(_req('installation', 'Description of premises', field: 'premisesType'));
  if (_isEmpty(inst['previousInspectionDate'])) {
    issues.add(_req('installation', 'Date of previous inspection', field: 'previousInspectionDate'));
  }
  if (_isEmpty(inst['previousCertNumber'])) {
    issues.add(_req('installation', 'Previous certificate number', field: 'previousCertNumber'));
  }
  if (_isEmpty(inst['estimatedAge'])) issues.add(_req('installation', 'Estimated age of installation', field: 'estimatedAge'));
  if (_isEmpty(inst['alterationsEvidence'])) {
    issues.add(_req('installation', 'Evidence of additions or alterations', field: 'alterationsEvidence'));
  }
  if (_isEmpty(inst['operationalLimitations'])) {
    issues.add(_req('installation', 'Operational limitations', field: 'operationalLimitations'));
  }
  if (_isEmpty(inst['agreedLimitations'])) issues.add(_req('installation', 'Agreed limitations', field: 'agreedLimitations'));
  if (_isEmpty(inst['agreedWith'])) issues.add(_req('installation', 'Agreed with', field: 'agreedWith'));
  if (_isEmpty(inst['generalCondition'])) {
    issues.add(_req('installation', 'General condition of the installation', field: 'generalCondition'));
  }
  if (_isEmpty(inst['inspectedBy'])) issues.add(_req('installation', 'Inspected and tested by', field: 'inspectedBy'));
  if (_isEmpty(inst['authorisedBy'])) issues.add(_req('installation', 'Authorised for issue by', field: 'authorisedBy'));
  if (_isEmpty(inst['authorisedDate'])) issues.add(_req('installation', 'Authorised for issue date', field: 'authorisedDate'));
  if (_isEmpty(inst['reinspectionPeriod'])) {
    issues.add(_req('installation', 'Recommended re-inspection date', field: 'reinspectionPeriod'));
  }

  final sup = Map<String, dynamic>.from(doc['supply'] as Map? ?? {});
  if (_isEmpty(sup['phases'])) issues.add(_req('supply', 'Number and type of live conductors', field: 'phases'));
  if (_isEmpty(sup['nominalU'])) issues.add(_req('supply', 'Nominal voltage (U)', field: 'nominalU'));
  if (_isEmpty(sup['polarityConfirmed'])) issues.add(_req('supply', 'Supply polarity confirmed', field: 'polarityConfirmed'));
  if (_isEmpty(sup['supplyDeviceBs'])) issues.add(_req('supply', 'Supply protective device BS(EN)', field: 'supplyDeviceBs'));
  if (_isEmpty(sup['supplyDeviceType'])) issues.add(_req('supply', 'Supply protective device type', field: 'supplyDeviceType'));
  if (_isEmpty(sup['supplyDeviceKa'])) {
    issues.add(_req('supply', 'Supply protective device short circuit capacity', field: 'supplyDeviceKa'));
  }
  if (_isEmpty(sup['supplyDeviceA'])) issues.add(_req('supply', 'Supply protective device rated current', field: 'supplyDeviceA'));
  if (_isEmpty(sup['mainSwitchBs'])) issues.add(_req('supply', 'Main switch type BS(EN)', field: 'mainSwitchBs'));
  if (_isEmpty(sup['mainSwitchPoles'])) issues.add(_req('supply', 'Main switch number of poles', field: 'mainSwitchPoles'));
  if (_isEmpty(sup['mainSwitchV'])) issues.add(_req('supply', 'Main switch voltage rating', field: 'mainSwitchV'));
  if (_isEmpty(sup['mainSwitchIn'])) issues.add(_req('supply', 'Main switch rated current', field: 'mainSwitchIn'));
  if (_isEmpty(sup['fuseSetting'])) issues.add(_req('supply', 'Fuse device setting', field: 'fuseSetting'));
  if (_isEmpty(sup['mainSwitchLocation'])) issues.add(_req('supply', 'Location of main switch', field: 'mainSwitchLocation'));
  if (_isEmpty(sup['conductorMaterial'])) issues.add(_req('supply', 'Main switch conductor material', field: 'conductorMaterial'));
  if (_isEmpty(sup['conductorCsa'])) issues.add(_req('supply', 'Main switch conductor CSA', field: 'conductorCsa'));
  if (_isEmpty(sup['rcdIdn'])) issues.add(_req('supply', 'RCD operating current IΔn', field: 'rcdIdn'));
  if (_isEmpty(sup['rcdDelay'])) issues.add(_req('supply', 'RCD time delay', field: 'rcdDelay'));
  if (_isEmpty(sup['rcdTime'])) issues.add(_req('supply', 'RCD operating time IΔn', field: 'rcdTime'));
  if (_isEmpty(sup['earthMaterial'])) issues.add(_req('supply', 'Earthing conductor material', field: 'earthMaterial'));
  if (_isEmpty(sup['earthCsa'])) issues.add(_req('supply', 'Earthing conductor CSA', field: 'earthCsa'));
  if (_isEmpty(sup['earthContinuity'])) issues.add(_req('supply', 'Earthing conductor continuity check', field: 'earthContinuity'));
  if (_isEmpty(sup['bondMaterial'])) issues.add(_req('supply', 'Main bonding conductor material', field: 'bondMaterial'));
  if (_isEmpty(sup['bondCsa'])) issues.add(_req('supply', 'Main bonding conductor CSA', field: 'bondCsa'));
  if (_isEmpty(sup['bondContinuity'])) issues.add(_req('supply', 'Main bonding conductor continuity check', field: 'bondContinuity'));
  if (_isEmpty(sup['bondWater'])) issues.add(_req('supply', 'Bonding — Water', field: 'bondWater'));
  if (_isEmpty(sup['bondGas'])) issues.add(_req('supply', 'Bonding — Gas', field: 'bondGas'));
  if (_isEmpty(sup['bondOil'])) issues.add(_req('supply', 'Bonding — Oil', field: 'bondOil'));
  if (_isEmpty(sup['bondSteel'])) issues.add(_req('supply', 'Bonding — Structural Steel', field: 'bondSteel'));
  if (_isEmpty(sup['bondLightning'])) issues.add(_req('supply', 'Bonding — Lightning', field: 'bondLightning'));

  final schedule = Map<String, dynamic>.from(doc['inspectionSchedule'] as Map? ?? {});
  final sectionIncomplete = <String, int>{};
  for (final item in inspectionScheduleItems) {
    if (_isEmpty(schedule[item.id])) {
      sectionIncomplete[item.section] = (sectionIncomplete[item.section] ?? 0) + 1;
    }
  }
  for (final entry in sectionIncomplete.entries) {
    if (entry.value > 0) {
      final title = inspectionSectionLabels[entry.key] ?? 'Section ${entry.key}';
      issues.add(
        ValidationIssue(
          id: 'inspection:section:${entry.key}',
          section: 'inspection',
          label: 'Section ${entry.key}: $title: ${entry.value} item${entry.value == 1 ? '' : 's'} incomplete',
          field: 'section_${entry.key}',
        ),
      );
    }
  }

  final boards = (doc['boards'] as List<dynamic>? ?? []).cast<Map>();
  for (final rawBoard in boards) {
    final board = Map<String, dynamic>.from(rawBoard);
    final bid = board['id']?.toString() ?? '';
    if (_isEmpty(board['phases'])) issues.add(_req('boards', 'Number of Phases', field: 'phases', boardId: bid));
    if (_isEmpty(board['polarityConfirmed'])) {
      issues.add(_req('boards', 'Supply Polarity Confirmed', field: 'polarityConfirmed', boardId: bid));
    }
    if (_isEmpty(board['phaseSequence'])) {
      issues.add(_req('boards', 'Phase Sequence Confirmed', field: 'phaseSequence', boardId: bid));
    }
    if (_isEmpty(board['ipfAtDb'])) {
      issues.add(_req('boards', 'Prospective Fault Current (Ipf at DB)', field: 'ipfAtDb', boardId: bid));
    }
    if (_isEmpty(board['mainSwitchBs'])) issues.add(_req('boards', 'Main Switch - BS (EN)', field: 'mainSwitchBs', boardId: bid));
    if (_isEmpty(board['mainSwitchRating'])) {
      issues.add(_req('boards', 'Main Switch - Rated Current', field: 'mainSwitchRating', boardId: bid));
    }
    if (_isEmpty(board['mainSwitchIpf'])) {
      issues.add(_req('boards', 'Main Switch - IPF Rating', field: 'mainSwitchIpf', boardId: bid));
    }
    if (_isEmpty(board['rcdRating'])) issues.add(_req('boards', 'Main Switch - RCD Rating', field: 'rcdRating', boardId: bid));
    if (_isEmpty(board['rcdTripTime'])) {
      issues.add(_req('boards', 'Main Switch - RCD Trip Time', field: 'rcdTripTime', boardId: bid));
    }
    if (_isEmpty(board['spdType'])) issues.add(_req('boards', 'SPD - Type', field: 'spdType', boardId: bid));
    if (_isEmpty(board['spdStatus'])) {
      issues.add(_req('boards', 'SPD - Operation Status Confirmed', field: 'spdStatus', boardId: bid));
    }
    if (_isEmpty(board['ocpdBs'])) issues.add(_req('boards', 'Overcurrent Device - BS (EN)', field: 'ocpdBs', boardId: bid));
    if (_isEmpty(board['ocpdVoltage'])) {
      issues.add(_req('boards', 'Overcurrent Device - Voltage Rating', field: 'ocpdVoltage', boardId: bid));
    }
    if (_isEmpty(board['ocpdRating'])) {
      issues.add(_req('boards', 'Overcurrent Device - Rated Current', field: 'ocpdRating', boardId: bid));
    }

    var incompleteCircuitFields = 0;
    final circuits = (board['circuits'] as List<dynamic>? ?? []).cast<Map>();
    for (final rawCircuit in circuits) {
      final c = Map<String, dynamic>.from(rawCircuit);
      final cid = c['id']?.toString() ?? '';
      final circuitNo = c['circuitNumber']?.toString() ?? '?';
      if (_isEmpty(c['description'])) {
        incompleteCircuitFields++;
        issues.add(_req('boards', 'Circuit $circuitNo: Description', field: 'description', boardId: bid, circuitId: cid));
      }
      if (!isNaDescription(c['description']?.toString() ?? '')) {
        if (_isEmpty(c['ocpdBs'])) {
          incompleteCircuitFields++;
          issues.add(_req('boards', 'Circuit $circuitNo: OCPD BS', field: 'ocpdBs', boardId: bid, circuitId: cid));
        }
        if (_isEmpty(c['ocpdRatingA'])) {
          incompleteCircuitFields++;
          issues.add(_req('boards', 'Circuit $circuitNo: OCPD rating', field: 'ocpdRatingA', boardId: bid, circuitId: cid));
        }
        if (_isEmpty(c['zs'])) {
          incompleteCircuitFields++;
          issues.add(_req('boards', 'Circuit $circuitNo: Measured Zs', field: 'zs', boardId: bid, circuitId: cid));
        }
      }
    }
    if (circuits.isEmpty) {
      incompleteCircuitFields += 6;
      issues.add(
        ValidationIssue(
          id: 'boards:$bid:empty',
          section: 'boards',
          label: '${board['name'] ?? 'Board'}: No circuits added',
          boardId: bid,
        ),
      );
    } else if (incompleteCircuitFields > 0) {
      issues.add(
        ValidationIssue(
          id: 'boards:$bid:circuits',
          section: 'boards',
          label: '${board['name'] ?? 'Board'}: $incompleteCircuitFields circuit field(s) incomplete',
          boardId: bid,
        ),
      );
    }
  }

  return issues;
}

Map<String, int> countIssuesBySection(List<ValidationIssue> issues) {
  final counts = <String, int>{};
  for (final issue in issues) {
    counts[issue.section] = (counts[issue.section] ?? 0) + 1;
  }
  return counts;
}

int issueCountForSectionKey(String sectionKey, Map<String, int> counts) {
  switch (sectionKey) {
    case 'installation':
    case 'declaration':
      return counts['installation'] ?? 0;
    case 'supply':
      return counts['supply'] ?? 0;
    case 'inspection-schedule':
      return counts['inspection'] ?? 0;
    case 'observations':
      return counts['observations'] ?? 0;
    case 'boards':
    case 'circuits':
      return counts['boards'] ?? 0;
    default:
      return 0;
  }
}
