import 'package:flutter/widgets.dart';

import '../certificate_editor_controller.dart';
import '../widgets/cert_form_widgets.dart';
import 'generic_certificate_editor.dart';

class MinorWorksCertificateEditor extends StatelessWidget {
  const MinorWorksCertificateEditor({required this.controller, super.key});

  final CertificateEditorController controller;

  @override
  Widget build(BuildContext context) {
    return GenericCertificateEditor(controller: controller, sections: sections);
  }

  static const _bondingOptions = [
    CertOption('', '-'),
    CertOption('pass', 'Pass'),
    CertOption('fail', 'Fail'),
    CertOption('lim', 'LIM'),
    CertOption('na', 'N/A'),
  ];

  static const sections = [
    CertificateSectionSpec(
      key: 'works',
      label: 'Works',
      fields: [
        JsonFieldSpec(
          path: 'minorWorks.description',
          label: 'Description',
          maxLines: 4,
        ),
        JsonFieldSpec(
          path: 'minorWorks.dateCompleted',
          label: 'Date completed',
        ),
        JsonFieldSpec(
          path: 'minorWorks.earthingArrangement',
          label: 'Earthing arrangement',
        ),
        JsonFieldSpec(
          path: 'minorWorks.methodOfProtection',
          label: 'Method of protection',
        ),
        JsonFieldSpec(
          path: 'minorWorks.departuresAndExceptions',
          label: 'Departures and exceptions',
          maxLines: 3,
        ),
        JsonFieldSpec(
          path: 'minorWorks.commentsOnExistingInstallation',
          label: 'Existing installation comments',
          maxLines: 3,
        ),
      ],
    ),
    CertificateSectionSpec(
      key: 'earthing',
      label: 'Earthing and bonding',
      fields: [
        JsonFieldSpec(
          path: 'minorWorks.earthingDetails.earthingConductor',
          label: 'Earthing conductor',
          options: _bondingOptions,
        ),
        JsonFieldSpec(
          path: 'minorWorks.earthingDetails.water',
          label: 'Water',
          options: _bondingOptions,
        ),
        JsonFieldSpec(
          path: 'minorWorks.earthingDetails.gas',
          label: 'Gas',
          options: _bondingOptions,
        ),
        JsonFieldSpec(
          path: 'minorWorks.earthingDetails.oil',
          label: 'Oil',
          options: _bondingOptions,
        ),
        JsonFieldSpec(
          path: 'minorWorks.earthingDetails.structuralSteel',
          label: 'Structural steel',
          options: _bondingOptions,
        ),
        JsonFieldSpec(path: 'minorWorks.earthingDetails.other', label: 'Other'),
      ],
    ),
    CertificateSectionSpec(
      key: 'declaration',
      label: 'Declaration',
      fields: [
        JsonFieldSpec(
          path: 'minorWorks.declaration.inspectedBy',
          label: 'Inspected by',
        ),
        JsonFieldSpec(
          path: 'minorWorks.declaration.inspectedPosition',
          label: 'Position',
        ),
        JsonFieldSpec(
          path: 'minorWorks.declaration.inspectedDate',
          label: 'Inspection date',
        ),
        JsonFieldSpec(
          path: 'minorWorks.declaration.authorisedBy',
          label: 'Authorised by',
        ),
        JsonFieldSpec(
          path: 'minorWorks.declaration.authorisedDate',
          label: 'Authorised date',
        ),
      ],
    ),
    CertificateSectionSpec(
      key: 'boards',
      label: 'Boards & Circuits',
    ),
    CertificateSectionSpec(
      key: 'appendix',
      label: 'Appendix & Photos',
    ),
  ];
}
