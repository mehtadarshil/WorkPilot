import 'package:flutter/widgets.dart';

import '../certificate_editor_controller.dart';
import '../constants/fire_alarm_inspection_schedule_items.dart';
import '../widgets/cert_form_widgets.dart';
import 'generic_certificate_editor.dart';

class FireAlarmCertificateEditor extends StatelessWidget {
  const FireAlarmCertificateEditor({required this.controller, super.key});

  final CertificateEditorController controller;

  @override
  Widget build(BuildContext context) {
    return GenericCertificateEditor(controller: controller, sections: sections);
  }

  static const sections = [
    CertificateSectionSpec(
      key: 'installation',
      label: 'Installation',
      fields: [
        JsonFieldSpec(
          path: 'fireAlarm.installation.occupierName',
          label: 'Occupier name',
        ),
        JsonFieldSpec(
          path: 'fireAlarm.installation.detailsOfSystem',
          label: 'Details of system',
          maxLines: 3,
        ),
        JsonFieldSpec(
          path: 'fireAlarm.installation.extentOfSystem',
          label: 'Extent of system',
          maxLines: 3,
        ),
        JsonFieldSpec(
          path: 'fireAlarm.installation.previousServiceDate',
          label: 'Previous service date',
        ),
      ],
    ),
    CertificateSectionSpec(
      key: 'limitations',
      label: 'Limitations',
      fields: [
        JsonFieldSpec(
          path: 'fireAlarm.limitations.limitationsText',
          label: 'Limitations',
          maxLines: 4,
        ),
        JsonFieldSpec(
          path: 'fireAlarm.limitations.relatedDocuments',
          label: 'Related documents',
          maxLines: 3,
        ),
        JsonFieldSpec(
          path: 'fireAlarm.limitations.essentialReferenceDocs',
          label: 'Essential reference documents',
          maxLines: 3,
        ),
      ],
    ),
    CertificateSectionSpec(
      key: 'condition',
      label: 'Condition',
      fields: [
        JsonFieldSpec(
          path: 'fireAlarm.condition.generalCondition',
          label: 'General condition',
          maxLines: 4,
        ),
        JsonFieldSpec(
          path: 'fireAlarm.condition.inspectionDate',
          label: 'Inspection date',
        ),
        JsonFieldSpec(
          path: 'fireAlarm.condition.outstandingDefectsReported',
          label: 'Defects reported',
          options: yesNoNaOptions,
        ),
        JsonFieldSpec(
          path: 'fireAlarm.condition.logBookUpdated',
          label: 'Log book updated',
          options: yesNoNaOptions,
        ),
      ],
    ),
    CertificateSectionSpec(
      key: 'schedule',
      label: 'Inspection schedule',
      schedulePath: 'fireAlarm.inspectionSchedule',
      scheduleItems: fireAlarmInspectionScheduleItems,
      scheduleOptions: passFailNaOptions,
    ),
    CertificateSectionSpec(
      key: 'declaration',
      label: 'Declaration',
      fields: [
        JsonFieldSpec(
          path: 'fireAlarm.declaration.inspectedBy',
          label: 'Inspected by',
        ),
        JsonFieldSpec(
          path: 'fireAlarm.declaration.inspectedPosition',
          label: 'Position',
        ),
        JsonFieldSpec(
          path: 'fireAlarm.declaration.inspectionDate',
          label: 'Inspection date',
        ),
        JsonFieldSpec(
          path: 'fireAlarm.declaration.authorisedBy',
          label: 'Authorised by',
        ),
        JsonFieldSpec(
          path: 'fireAlarm.declaration.authorisedDate',
          label: 'Authorised date',
        ),
      ],
    ),
  ];
}
