import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/values/app_colors.dart';
import 'certificate_editor_controller.dart';
import 'certificate_print_webview_page.dart';
import 'certificate_validation.dart';
import 'editors/domestic_fire_alarm_certificate_editor.dart';
import 'editors/domestic_fire_alarm_inst_certificate_editor.dart';
import 'editors/eic_certificate_editor.dart';
import 'editors/eicr_certificate_editor.dart';
import 'editors/emergency_lighting_certificate_editor.dart';
import 'editors/fire_alarm_certificate_editor.dart';
import 'editors/fire_extinguisher_certificate_editor.dart';
import 'editors/generic_certificate_editor.dart';
import 'editors/minor_works_certificate_editor.dart';
import 'editors/pat_certificate_editor.dart';
import 'widgets/copy_convert_certificate_sheet.dart';
import 'widgets/cert_form_widgets.dart';

class CertificateEditorView extends GetView<CertificateEditorController> {
  const CertificateEditorView({super.key});

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark.copyWith(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: AppColors.gradientStart,
        systemNavigationBarIconBrightness: Brightness.light,
      ),
      child: CertificateGradientScaffold(
        appBar: AppBar(
          title: Text(
            'Certificate',
            style: GoogleFonts.inter(fontWeight: FontWeight.w700),
          ),
          leading: IconButton(
            icon: Icon(Icons.arrow_back_ios_new_rounded),
            onPressed: Get.back,
          ),
          actions: [
            PopupMenuButton<String>(
              icon: Icon(Icons.more_vert_rounded),
              onSelected: (value) async {
                switch (value) {
                  case 'print':
                    final id = controller.certificate.value?.id;
                    if (id != null) {
                      await Get.to(() => CertificatePrintWebViewPage(certificateId: id));
                    }
                    break;
                  case 'copy':
                    await showCopyConvertCertificateSheet(controller);
                    break;
                }
              },
              itemBuilder: (context) => const [
                PopupMenuItem(value: 'print', child: Text('Print layout')),
                PopupMenuItem(value: 'copy', child: Text('Copy / convert…')),
              ],
            ),
            Obx(
              () => IconButton(
                tooltip: 'Export PDF',
                onPressed: controller.exporting.value
                    ? null
                    : controller.exportPdf,
                icon: controller.exporting.value
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: AppColors.primary,
                        ),
                      )
                    : Icon(Icons.picture_as_pdf_rounded),
              ),
            ),
          ],
        ),
        child: Obx(() {
          if (controller.loading.value) {
            return const Center(
              child: CircularProgressIndicator(color: AppColors.primary),
            );
          }
          if (controller.errorMessage.value.isNotEmpty ||
              controller.certificate.value == null) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  controller.errorMessage.value.isEmpty
                      ? 'Certificate not found.'
                      : controller.errorMessage.value,
                  textAlign: TextAlign.center,
                  style: GoogleFonts.inter(color: AppColors.slate600),
                ),
              ),
            );
          }

          final sections = _sectionsFor(controller.certificate.value!.typeSlug);
          final active = controller.activeSectionKey.value;
          final issueCounts = controller.sectionIssueCounts;
          return Column(
            children: [
              _Header(controller: controller),
              SizedBox(
                height: 52,
                child: ListView.separated(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  scrollDirection: Axis.horizontal,
                  itemBuilder: (context, index) {
                    final section = sections[index];
                    final selected = active == section.key;
                    final issueCount = issueCountForSectionKey(section.key, issueCounts);
                    return ChoiceChip(
                      label: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(section.label),
                          if (issueCount > 0) ...[
                            const SizedBox(width: 6),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                              decoration: BoxDecoration(
                                color: Colors.amber.shade700,
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: Text(
                                '!',
                                style: GoogleFonts.inter(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w900,
                                  fontSize: 10,
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                      selected: selected,
                      selectedColor: AppColors.primary,
                      backgroundColor: AppColors.slate100,
                      labelStyle: GoogleFonts.inter(
                        color: selected ? Colors.white : AppColors.slate600,
                        fontWeight: FontWeight.w700,
                        fontSize: 12,
                      ),
                      side: BorderSide(
                        color: selected
                            ? AppColors.primary
                            : AppColors.slate200,
                      ),
                      onSelected: (_) =>
                          controller.activeSectionKey.value = section.key,
                    );
                  },
                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                  itemCount: sections.length,
                ),
              ),
              Expanded(
                child: _editorFor(controller.certificate.value!.typeSlug),
              ),
              _ActionBar(controller: controller),
            ],
          );
        }),
      ),
    );
  }

  List<CertificateSectionSpec> _sectionsFor(String typeSlug) {
    switch (typeSlug) {
      case 'eic_18e_a3':
        return EicCertificateEditor.sections;
      case 'portable_appliance_test':
        return PatCertificateEditor.sections;
      case 'fi_insp_2025':
        return FireAlarmCertificateEditor.sections;
      case 'dfi_insp_2019_a1':
        return DomesticFireAlarmCertificateEditor.sections;
      case 'dfi_inst_2019_a1':
        return DomesticFireAlarmInstCertificateEditor.sections;
      case 'fi_extinsp_5306':
        return FireExtinguisherCertificateEditor.sections;
      case 'em_pir_2025':
        return EmergencyLightingCertificateEditor.sections;
      case 'mwc_18e_a3':
        return MinorWorksCertificateEditor.sections;
      default:
        return EicrCertificateEditor.sections;
    }
  }

  Widget _editorFor(String typeSlug) {
    switch (typeSlug) {
      case 'eic_18e_a3':
        return EicCertificateEditor(controller: controller);
      case 'portable_appliance_test':
        return PatCertificateEditor(controller: controller);
      case 'fi_insp_2025':
        return FireAlarmCertificateEditor(controller: controller);
      case 'dfi_insp_2019_a1':
        return DomesticFireAlarmCertificateEditor(controller: controller);
      case 'dfi_inst_2019_a1':
        return DomesticFireAlarmInstCertificateEditor(controller: controller);
      case 'fi_extinsp_5306':
        return FireExtinguisherCertificateEditor(controller: controller);
      case 'em_pir_2025':
        return EmergencyLightingCertificateEditor(controller: controller);
      case 'mwc_18e_a3':
        return MinorWorksCertificateEditor(controller: controller);
      default:
        return EicrCertificateEditor(controller: controller);
    }
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.controller});

  final CertificateEditorController controller;

  @override
  Widget build(BuildContext context) {
    final cert = controller.certificate.value!;
    final type = controller.typeInfo;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 10),
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(18),
          color: Colors.white,
          border: Border.all(color: AppColors.slate200),
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              CircleAvatar(
                backgroundColor: AppColors.primary,
                child: Text(
                  type.shortLabel.split('-').first,
                  style: GoogleFonts.inter(
                    color: Colors.white,
                    fontWeight: FontWeight.w900,
                    fontSize: 11,
                  ),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      type.title,
                      style: GoogleFonts.inter(
                        color: AppColors.slate900,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      [
                            cert.certificateNumber,
                            cert.customerFullName,
                            cert.jobNumber,
                          ]
                          .where(
                            (part) => part != null && part.trim().isNotEmpty,
                          )
                          .join(' - '),
                      style: GoogleFonts.inter(
                        color: AppColors.slate400,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ActionBar extends StatelessWidget {
  const _ActionBar({required this.controller});

  final CertificateEditorController controller;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
        child: Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: controller.validating.value
                    ? null
                    : controller.validateCertificate,
                icon: controller.validating.value
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Icon(Icons.rule_rounded),
                label: const Text('Validate'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: ElevatedButton.icon(
                onPressed: controller.saving.value ? null : controller.save,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 13),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                icon: controller.saving.value
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : Icon(Icons.save_rounded),
                label: Text(
                  'Save',
                  style: GoogleFonts.inter(fontWeight: FontWeight.w800),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
