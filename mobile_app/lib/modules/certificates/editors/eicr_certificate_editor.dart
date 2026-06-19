import 'package:flutter/widgets.dart';

import '../certificate_editor_controller.dart';
import '../constants/certificate_schedule_items.dart';
import 'generic_certificate_editor.dart';

class EicrCertificateEditor extends StatelessWidget {
  const EicrCertificateEditor({required this.controller, super.key});

  final CertificateEditorController controller;

  @override
  Widget build(BuildContext context) {
    return GenericCertificateEditor(controller: controller, sections: sections);
  }

  static const sections = [
    CertificateSectionSpec(
      key: 'installation',
      label: 'Installation details',
      fields: [
        JsonFieldSpec(
          path: 'installation.occupierName',
          label: 'Occupier name',
        ),
        JsonFieldSpec(
          path: 'installation.premisesType',
          label: 'Premises type',
        ),
        JsonFieldSpec(
          path: 'installation.inspectionDate',
          label: 'Inspection date',
        ),
        JsonFieldSpec(
          path: 'installation.extent',
          label: 'Extent of installation',
          maxLines: 3,
        ),
        JsonFieldSpec(
          path: 'installation.operationalLimitations',
          label: 'Operational limitations',
          maxLines: 3,
        ),
        JsonFieldSpec(
          path: 'installation.generalCondition',
          label: 'General condition',
          maxLines: 3,
        ),
        JsonFieldSpec(
          path: 'installation.reinspectionPeriod',
          label: 'Recommended re-inspection period',
        ),
      ],
    ),
    CertificateSectionSpec(
      key: 'supply',
      label: 'Supply characteristics',
      fields: [
        JsonFieldSpec(path: 'supply.earthing', label: 'Earthing arrangement'),
        JsonFieldSpec(path: 'supply.ze', label: 'Ze'),
        JsonFieldSpec(path: 'supply.ipf', label: 'IPF'),
        JsonFieldSpec(path: 'supply.nominalU', label: 'Nominal U'),
        JsonFieldSpec(path: 'supply.frequency', label: 'Frequency'),
        JsonFieldSpec(
          path: 'supply.polarityConfirmed',
          label: 'Polarity confirmed',
        ),
      ],
    ),
    CertificateSectionSpec(
      key: 'inspection-schedule',
      label: 'Inspection schedule',
      schedulePath: 'inspectionSchedule',
      scheduleItems: inspectionScheduleItems,
    ),
    CertificateSectionSpec(
      key: 'observations',
      label: 'Observations',
    ),
    CertificateSectionSpec(
      key: 'boards',
      label: 'Boards & Circuits',
    ),
    CertificateSectionSpec(
      key: 'declaration',
      label: 'Declaration',
      fields: [
        JsonFieldSpec(path: 'installation.inspectedBy', label: 'Inspected by'),
        JsonFieldSpec(
          path: 'installation.inspectedPosition',
          label: 'Position',
        ),
        JsonFieldSpec(path: 'installation.inspectedDate', label: 'Date'),
        JsonFieldSpec(
          path: 'installation.authorisedBy',
          label: 'Authorised by',
        ),
        JsonFieldSpec(
          path: 'installation.authorisedPosition',
          label: 'Authorised position',
        ),
        JsonFieldSpec(
          path: 'installation.authorisedDate',
          label: 'Authorised date',
        ),
      ],
    ),
    CertificateSectionSpec(
      key: 'appendix',
      label: 'Appendix & Photos',
    ),
  ];
}
