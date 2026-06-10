import 'package:flutter/widgets.dart';

import '../certificate_editor_controller.dart';
import 'generic_certificate_editor.dart';

class PatCertificateEditor extends StatelessWidget {
  const PatCertificateEditor({required this.controller, super.key});

  final CertificateEditorController controller;

  @override
  Widget build(BuildContext context) {
    return GenericCertificateEditor(controller: controller, sections: sections);
  }

  static final sections = [
    const CertificateSectionSpec(
      key: 'business',
      label: 'Registered business',
      fields: [
        JsonFieldSpec(
          path: 'pat.registeredBusiness.name',
          label: 'Business name',
        ),
        JsonFieldSpec(
          path: 'pat.registeredBusiness.address',
          label: 'Business address',
          maxLines: 3,
        ),
        JsonFieldSpec(path: 'pat.registeredBusiness.phone', label: 'Phone'),
      ],
    ),
    const CertificateSectionSpec(
      key: 'job-address',
      label: 'Job address',
      fields: [
        JsonFieldSpec(
          path: 'pat.jobAddress.customerName',
          label: 'Customer name',
        ),
        JsonFieldSpec(
          path: 'pat.jobAddress.address',
          label: 'Address',
          maxLines: 3,
        ),
        JsonFieldSpec(
          path: 'pat.jobAddress.landlordAgent',
          label: 'Landlord / agent',
        ),
        JsonFieldSpec(
          path: 'pat.certificateInfo.date',
          label: 'Certificate date',
        ),
      ],
    ),
    CertificateSectionSpec(
      key: 'appliances',
      label: 'Appliances',
      listSpec: applianceListSpec('pat.appliances'),
    ),
    const CertificateSectionSpec(
      key: 'test-equipment',
      label: 'Test equipment',
      fields: [
        JsonFieldSpec(path: 'pat.testEquipment.make', label: 'Make'),
        JsonFieldSpec(path: 'pat.testEquipment.serialNo', label: 'Serial no.'),
        JsonFieldSpec(
          path: 'pat.testEquipment.notes',
          label: 'Notes',
          maxLines: 3,
        ),
      ],
    ),
    const CertificateSectionSpec(
      key: 'engineer',
      label: 'Engineer',
      fields: [
        JsonFieldSpec(path: 'pat.engineer.name', label: 'Engineer name'),
        JsonFieldSpec(path: 'pat.engineer.notes', label: 'Notes', maxLines: 3),
        JsonFieldSpec(path: 'pat.engineer.signedAt', label: 'Signed date'),
      ],
    ),
  ];
}
