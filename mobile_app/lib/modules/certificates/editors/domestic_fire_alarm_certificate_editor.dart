import 'package:flutter/widgets.dart';

import '../certificate_editor_controller.dart';
import '../constants/certificate_schedule_items.dart';
import '../widgets/cert_form_widgets.dart';
import 'generic_certificate_editor.dart';

class DomesticFireAlarmCertificateEditor extends StatelessWidget {
  const DomesticFireAlarmCertificateEditor({
    required this.controller,
    super.key,
  });

  final CertificateEditorController controller;

  @override
  Widget build(BuildContext context) {
    return GenericCertificateEditor(controller: controller, sections: sections);
  }

  static const _grades = [
    CertOption('', '-'),
    CertOption('A', 'A'),
    CertOption('B', 'B'),
    CertOption('C', 'C'),
    CertOption('D1', 'D1'),
    CertOption('D2', 'D2'),
    CertOption('E', 'E'),
    CertOption('F1', 'F1'),
    CertOption('F2', 'F2'),
  ];

  static const _categories = [
    CertOption('', '-'),
    CertOption('LD1', 'LD1'),
    CertOption('LD2', 'LD2'),
    CertOption('LD3', 'LD3'),
    CertOption('PD1', 'PD1'),
    CertOption('PD2', 'PD2'),
  ];

  static const sections = [
    CertificateSectionSpec(
      key: 'installation',
      label: 'Installation',
      fields: [
        JsonFieldSpec(
          path: 'domesticFireAlarm.installation.occupierName',
          label: 'Occupier name',
        ),
        JsonFieldSpec(
          path: 'domesticFireAlarm.installation.systemGrade',
          label: 'System grade',
          options: _grades,
        ),
        JsonFieldSpec(
          path: 'domesticFireAlarm.installation.systemCategory',
          label: 'System category',
          options: _categories,
        ),
        JsonFieldSpec(
          path: 'domesticFireAlarm.installation.extentOfSystem',
          label: 'Extent of system',
          maxLines: 3,
        ),
        JsonFieldSpec(
          path: 'domesticFireAlarm.installation.limitations',
          label: 'Limitations',
          maxLines: 3,
        ),
        JsonFieldSpec(
          path: 'domesticFireAlarm.installation.generalCondition',
          label: 'General condition',
          maxLines: 3,
        ),
      ],
    ),
    CertificateSectionSpec(
      key: 'summary',
      label: 'Summary',
      fields: [
        JsonFieldSpec(
          path: 'domesticFireAlarm.summary.overallAssessment',
          label: 'Overall assessment',
        ),
        JsonFieldSpec(
          path: 'domesticFireAlarm.summary.nextInspectionDate',
          label: 'Next inspection date',
        ),
        JsonFieldSpec(
          path: 'domesticFireAlarm.remedialActions',
          label: 'Remedial actions',
          maxLines: 4,
        ),
      ],
    ),
    CertificateSectionSpec(
      key: 'checklist',
      label: 'Checklist',
      schedulePath: 'domesticFireAlarm.checklist',
      scheduleItems: domesticFireAlarmItems,
      scheduleOptions: passFailNaOptions,
    ),
    CertificateSectionSpec(
      key: 'instrument',
      label: 'Instruments',
      fields: [
        JsonFieldSpec(
          path: 'domesticFireAlarm.soundLevelInstrumentModel',
          label: 'Sound level model',
        ),
        JsonFieldSpec(
          path: 'domesticFireAlarm.soundLevelInstrumentSerial',
          label: 'Sound level serial',
        ),
      ],
    ),
    CertificateSectionSpec(
      key: 'declaration',
      label: 'Declaration',
      fields: [
        JsonFieldSpec(
          path: 'domesticFireAlarm.declaration.inspectedBy',
          label: 'Inspected by',
        ),
        JsonFieldSpec(
          path: 'domesticFireAlarm.declaration.inspectedPosition',
          label: 'Position',
        ),
        JsonFieldSpec(
          path: 'domesticFireAlarm.declaration.inspectionDate',
          label: 'Inspection date',
        ),
        JsonFieldSpec(
          path: 'domesticFireAlarm.declaration.authorisedBy',
          label: 'Authorised by',
        ),
        JsonFieldSpec(
          path: 'domesticFireAlarm.declaration.authorisedDate',
          label: 'Authorised date',
        ),
      ],
    ),
  ];
}
