import 'package:flutter/widgets.dart';

import '../certificate_editor_controller.dart';
import '../widgets/cert_form_widgets.dart';
import 'generic_certificate_editor.dart';

class EmergencyLightingCertificateEditor extends StatelessWidget {
  const EmergencyLightingCertificateEditor({
    required this.controller,
    super.key,
  });

  final CertificateEditorController controller;

  @override
  Widget build(BuildContext context) {
    return GenericCertificateEditor(controller: controller, sections: sections);
  }

  static final sections = [
    const CertificateSectionSpec(
      key: 'installation',
      label: 'Installation',
      fields: [
        JsonFieldSpec(
          path: 'emergencyLighting.installation.occupierName',
          label: 'Occupier name',
        ),
        JsonFieldSpec(
          path: 'emergencyLighting.installation.premisesType',
          label: 'Premises type',
        ),
        JsonFieldSpec(
          path: 'emergencyLighting.installation.systemDescription',
          label: 'System description',
          maxLines: 3,
        ),
        JsonFieldSpec(
          path: 'emergencyLighting.installation.manufacturer',
          label: 'Manufacturer',
        ),
        JsonFieldSpec(
          path: 'emergencyLighting.installation.installer',
          label: 'Installer',
        ),
        JsonFieldSpec(
          path: 'emergencyLighting.installation.inspectionDate',
          label: 'Inspection date',
        ),
        JsonFieldSpec(
          path: 'emergencyLighting.installation.nextInspectionDate',
          label: 'Next inspection date',
        ),
        JsonFieldSpec(
          path: 'emergencyLighting.installation.overallAssessment',
          label: 'Overall assessment',
        ),
      ],
    ),
    CertificateSectionSpec(
      key: 'modifications',
      label: 'Modifications',
      listSpec: simpleAssetListSpec(
        path: 'emergencyLighting.modifications',
        title: 'Modifications',
        itemTitle: 'Modification',
        includeOutcome: false,
      ),
    ),
    CertificateSectionSpec(
      key: 'test-schedule',
      label: 'Test schedule',
      listSpec: JsonListSpec(
        path: 'emergencyLighting.testSchedule',
        title: 'Test schedule',
        itemTitle: 'Luminaire',
        fields: const [
          JsonFieldSpec(path: 'reference', label: 'Reference'),
          JsonFieldSpec(path: 'location', label: 'Location'),
          JsonFieldSpec(path: 'luminaireType', label: 'Luminaire type'),
          JsonFieldSpec(path: 'durationMinutes', label: 'Duration minutes'),
          JsonFieldSpec(
            path: 'chargeIndicator',
            label: 'Charge indicator',
            options: passFailNaOptions,
          ),
          JsonFieldSpec(
            path: 'functionalTest',
            label: 'Functional test',
            options: passFailNaOptions,
          ),
          JsonFieldSpec(
            path: 'durationTest',
            label: 'Duration test',
            options: passFailNaOptions,
          ),
          JsonFieldSpec(
            path: 'result',
            label: 'Result',
            options: passFailNaOptions,
          ),
          JsonFieldSpec(path: 'notes', label: 'Notes', maxLines: 3),
        ],
        newItem: (index) => {
          'id': 'el_${index + 1}',
          'reference': 'EL-${(index + 1).toString().padLeft(2, '0')}',
          'location': '',
          'luminaireType': '',
          'supplyMode': '',
          'batteryType': '',
          'lampType': '',
          'durationMinutes': '',
          'chargeIndicator': '',
          'functionalTest': '',
          'durationTest': '',
          'result': '',
          'notes': '',
          'photos': <dynamic>[],
        },
      ),
    ),
    CertificateSectionSpec(
      key: 'faults',
      label: 'Faults and repairs',
      listSpec: simpleAssetListSpec(
        path: 'emergencyLighting.faultsAndRepairs',
        title: 'Faults and repairs',
        itemTitle: 'Fault',
      ),
    ),
    const CertificateSectionSpec(
      key: 'declaration',
      label: 'Declaration',
      fields: [
        JsonFieldSpec(
          path: 'emergencyLighting.declaration.inspectedBy',
          label: 'Inspected by',
        ),
        JsonFieldSpec(
          path: 'emergencyLighting.declaration.inspectedPosition',
          label: 'Position',
        ),
        JsonFieldSpec(
          path: 'emergencyLighting.declaration.inspectedDate',
          label: 'Inspection date',
        ),
        JsonFieldSpec(
          path: 'emergencyLighting.declaration.authorisedBy',
          label: 'Authorised by',
        ),
        JsonFieldSpec(
          path: 'emergencyLighting.declaration.authorisedDate',
          label: 'Authorised date',
        ),
      ],
    ),
  ];
}
