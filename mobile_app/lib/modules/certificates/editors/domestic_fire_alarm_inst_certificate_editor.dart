import 'package:flutter/widgets.dart';

import '../certificate_editor_controller.dart';
import '../constants/certificate_schedule_items.dart';
import '../widgets/cert_form_widgets.dart';
import 'generic_certificate_editor.dart';

class DomesticFireAlarmInstCertificateEditor extends StatelessWidget {
  const DomesticFireAlarmInstCertificateEditor({
    required this.controller,
    super.key,
  });

  final CertificateEditorController controller;

  @override
  Widget build(BuildContext context) {
    return GenericCertificateEditor(controller: controller, sections: sections);
  }

  static const _systemIs = [
    CertOption('', '-'),
    CertOption('new', 'New'),
    CertOption('modification', 'Modification'),
    CertOption('alteration', 'Alteration'),
  ];

  static const _passNa = [
    CertOption('', '-'),
    CertOption('pass', 'Pass'),
    CertOption('na', 'N/A'),
  ];

  static const sections = [
    CertificateSectionSpec(
      key: 'installation',
      label: 'Installation',
      fields: [
        JsonFieldSpec(
          path: 'domesticFireAlarmInst.installation.occupierName',
          label: 'Occupier name',
        ),
        JsonFieldSpec(
          path: 'domesticFireAlarmInst.installation.systemIs',
          label: 'System is',
          options: _systemIs,
        ),
        JsonFieldSpec(
          path: 'domesticFireAlarmInst.installation.systemGrade',
          label: 'System grade',
        ),
        JsonFieldSpec(
          path: 'domesticFireAlarmInst.installation.systemCategory',
          label: 'System category',
        ),
      ],
    ),
    CertificateSectionSpec(
      key: 'documentation',
      label: 'Documentation',
      fields: [
        JsonFieldSpec(
          path: 'domesticFireAlarmInst.documentation.relatedReferenceDocuments',
          label: 'Related reference documents',
          maxLines: 4,
        ),
        JsonFieldSpec(
          path: 'domesticFireAlarmInst.extent.extentOfSystem',
          label: 'Extent of system',
          maxLines: 4,
        ),
        JsonFieldSpec(
          path: 'domesticFireAlarmInst.specification.specificationText',
          label: 'Specification',
          maxLines: 4,
        ),
        JsonFieldSpec(
          path: 'domesticFireAlarmInst.variationsFromSpec.variationsText',
          label: 'Variations from specification',
          maxLines: 4,
        ),
      ],
    ),
    CertificateSectionSpec(
      key: 'tests',
      label: 'Test schedule',
      fields: [
        JsonFieldSpec(
          path: 'domesticFireAlarmInst.testSchedule.wiringTested',
          label: 'Wiring tested',
          options: _passNa,
        ),
        JsonFieldSpec(
          path: 'domesticFireAlarmInst.testSchedule.testResultsRecorded',
          label: 'Test results recorded',
        ),
      ],
      schedulePath: 'domesticFireAlarmInst.testSchedule',
      scheduleItems: domesticFireAlarmInstItems,
      scheduleOptions: _passNa,
    ),
    CertificateSectionSpec(
      key: 'declaration',
      label: 'Declaration',
      fields: [
        JsonFieldSpec(
          path: 'domesticFireAlarmInst.declaration.installedBy',
          label: 'Installed by',
        ),
        JsonFieldSpec(
          path: 'domesticFireAlarmInst.declaration.installedPosition',
          label: 'Position',
        ),
        JsonFieldSpec(
          path: 'domesticFireAlarmInst.declaration.installedDate',
          label: 'Installed date',
        ),
        JsonFieldSpec(
          path: 'domesticFireAlarmInst.declaration.authorisedBy',
          label: 'Authorised by',
        ),
        JsonFieldSpec(
          path: 'domesticFireAlarmInst.declaration.authorisedDate',
          label: 'Authorised date',
        ),
      ],
    ),
  ];
}
