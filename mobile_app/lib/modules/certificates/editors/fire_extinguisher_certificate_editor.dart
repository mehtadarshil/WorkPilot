import 'package:flutter/widgets.dart';

import '../certificate_editor_controller.dart';
import '../constants/certificate_schedule_items.dart';
import '../widgets/cert_form_widgets.dart';
import 'generic_certificate_editor.dart';

class FireExtinguisherCertificateEditor extends StatelessWidget {
  const FireExtinguisherCertificateEditor({
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
          path: 'fireExtinguisher.installation.occupierName',
          label: 'Occupier name',
        ),
        JsonFieldSpec(
          path: 'fireExtinguisher.installation.occupierType',
          label: 'Occupier type',
        ),
        JsonFieldSpec(
          path: 'fireExtinguisher.installation.premisesType',
          label: 'Premises type',
        ),
        JsonFieldSpec(
          path: 'fireExtinguisher.installation.nextInspectionDate',
          label: 'Next inspection date',
        ),
      ],
    ),
    CertificateSectionSpec(
      key: 'extinguishers',
      label: 'Extinguishers',
      listSpec: simpleAssetListSpec(
        path: 'fireExtinguisher.extinguishers',
        title: 'Extinguishers',
        itemTitle: 'Extinguisher',
        includeOutcome: false,
      ),
    ),
    const CertificateSectionSpec(
      key: 'checklist',
      label: 'Checklist',
      schedulePath: 'fireExtinguisher.checklist',
      scheduleItems: fireExtinguisherItems,
      scheduleOptions: yesNoNaOptions,
    ),
    const CertificateSectionSpec(
      key: 'remedial',
      label: 'Remedial actions',
      fields: [
        JsonFieldSpec(
          path: 'fireExtinguisher.remedialActions',
          label: 'Remedial actions',
          maxLines: 5,
        ),
      ],
    ),
    const CertificateSectionSpec(
      key: 'declaration',
      label: 'Declaration',
      fields: [
        JsonFieldSpec(
          path: 'fireExtinguisher.declaration.inspectedBy',
          label: 'Inspected by',
        ),
        JsonFieldSpec(
          path: 'fireExtinguisher.declaration.inspectedPosition',
          label: 'Position',
        ),
        JsonFieldSpec(
          path: 'fireExtinguisher.declaration.inspectedDate',
          label: 'Inspection date',
        ),
        JsonFieldSpec(
          path: 'fireExtinguisher.declaration.authorisedBy',
          label: 'Authorised by',
        ),
        JsonFieldSpec(
          path: 'fireExtinguisher.declaration.authorisedDate',
          label: 'Authorised date',
        ),
      ],
    ),
  ];
}
