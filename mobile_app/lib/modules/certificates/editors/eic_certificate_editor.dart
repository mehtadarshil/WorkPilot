import 'package:flutter/widgets.dart';

import '../certificate_editor_controller.dart';
import '../constants/certificate_schedule_items.dart';
import 'generic_certificate_editor.dart';

class EicCertificateEditor extends StatelessWidget {
  const EicCertificateEditor({required this.controller, super.key});

  final CertificateEditorController controller;

  @override
  Widget build(BuildContext context) {
    return GenericCertificateEditor(controller: controller, sections: sections);
  }

  static const sections = [
    CertificateSectionSpec(
      key: 'details',
      label: 'Installation details',
      fields: [
        JsonFieldSpec(
          path: 'electricalInstallation.details.workType',
          label: 'Work type',
        ),
        JsonFieldSpec(
          path: 'electricalInstallation.details.premisesType',
          label: 'Premises type',
        ),
        JsonFieldSpec(
          path: 'electricalInstallation.details.description',
          label: 'Description',
          maxLines: 3,
        ),
        JsonFieldSpec(
          path: 'electricalInstallation.details.extent',
          label: 'Extent',
          maxLines: 3,
        ),
        JsonFieldSpec(
          path: 'installation.occupierName',
          label: 'Occupier name',
        ),
      ],
    ),
    CertificateSectionSpec(
      key: 'design',
      label: 'Design',
      fields: [
        JsonFieldSpec(
          path: 'electricalInstallation.design.departures',
          label: 'Departures',
          maxLines: 3,
        ),
        JsonFieldSpec(
          path: 'electricalInstallation.design.permittedExceptions',
          label: 'Permitted exceptions',
          maxLines: 3,
        ),
        JsonFieldSpec(
          path: 'electricalInstallation.design.riskAssessment',
          label: 'Risk assessment',
        ),
        JsonFieldSpec(
          path: 'electricalInstallation.design.designer1.name',
          label: 'Designer',
        ),
        JsonFieldSpec(
          path: 'electricalInstallation.design.designer1.company',
          label: 'Company',
        ),
        JsonFieldSpec(
          path: 'electricalInstallation.design.designer1.date',
          label: 'Date',
        ),
      ],
    ),
    CertificateSectionSpec(
      key: 'construction',
      label: 'Construction',
      fields: [
        JsonFieldSpec(
          path: 'electricalInstallation.construction.departures',
          label: 'Departures',
          maxLines: 3,
        ),
        JsonFieldSpec(
          path: 'electricalInstallation.construction.constructorSignatory.name',
          label: 'Constructor',
        ),
        JsonFieldSpec(
          path:
              'electricalInstallation.construction.constructorSignatory.company',
          label: 'Company',
        ),
        JsonFieldSpec(
          path: 'electricalInstallation.construction.constructorSignatory.date',
          label: 'Date',
        ),
      ],
    ),
    CertificateSectionSpec(
      key: 'inspection',
      label: 'Inspection & testing',
      fields: [
        JsonFieldSpec(
          path: 'electricalInstallation.inspection.departures',
          label: 'Departures',
          maxLines: 3,
        ),
        JsonFieldSpec(
          path: 'electricalInstallation.inspection.inspector.name',
          label: 'Inspector',
        ),
        JsonFieldSpec(
          path: 'electricalInstallation.inspection.inspector.company',
          label: 'Company',
        ),
        JsonFieldSpec(
          path: 'electricalInstallation.inspection.inspector.date',
          label: 'Date',
        ),
        JsonFieldSpec(
          path: 'electricalInstallation.inspection.nextInspectionInterval',
          label: 'Next inspection interval',
        ),
      ],
    ),
    CertificateSectionSpec(
      key: 'supply',
      label: 'Supply',
      fields: [
        JsonFieldSpec(path: 'supply.earthing', label: 'Earthing arrangement'),
        JsonFieldSpec(path: 'supply.ze', label: 'Ze'),
        JsonFieldSpec(path: 'supply.ipf', label: 'IPF'),
        JsonFieldSpec(path: 'supply.nominalU', label: 'Nominal U'),
        JsonFieldSpec(path: 'supply.frequency', label: 'Frequency'),
      ],
    ),
    CertificateSectionSpec(
      key: 'inspection-schedule',
      label: 'Inspection schedule',
      schedulePath: 'inspectionSchedule',
      scheduleItems: inspectionScheduleItems,
    ),
  ];
}
