import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/values/app_colors.dart';
import 'certificate_catalog.dart';
import 'certificate_type_picker_controller.dart';
import '../../widgets/searchable_select_field.dart';
import 'widgets/cert_form_widgets.dart';

class CertificateTypePickerView
    extends GetView<CertificateTypePickerController> {
  const CertificateTypePickerView({super.key});

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light.copyWith(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: AppColors.gradientStart,
        systemNavigationBarIconBrightness: Brightness.light,
      ),
      child: CertificateGradientScaffold(
        appBar: AppBar(
          title: Text(
            'New certificate',
            style: GoogleFonts.inter(fontWeight: FontWeight.w700),
          ),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_ios_new_rounded),
            onPressed: Get.back,
          ),
        ),
        child: SafeArea(
          child: Obx(
            () => Column(
              children: [
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                    children: [
                      if (controller.customerLocked)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 16),
                          child: CertSectionCard(
                            title: controller.customerName.value,
                            subtitle:
                                [controller.jobNumber, controller.jobTitle]
                                    .where(
                                      (part) =>
                                          part != null &&
                                          part.trim().isNotEmpty,
                                    )
                                    .join(' - '),
                            children: const [],
                          ),
                        )
                      else
                        Padding(
                          padding: const EdgeInsets.only(bottom: 16),
                          child: CertSectionCard(
                            title: 'Customer & Site',
                            subtitle: 'Select client and address',
                            children: [
                              SearchableSelectField<int>(
                                label: 'Customer *',
                                hint: 'Choose customer',
                                sheetTitle: 'Customer',
                                value: controller.customerId.value > 0 ? controller.customerId.value : null,
                                options: controller.customerOptions,
                                decoration: _inputDecoration('Choose customer'),
                                onChanged: controller.onCustomerChanged,
                              ),
                              if (controller.customerId.value > 0) ...[
                                const SizedBox(height: 16),
                                SearchableSelectField<int>(
                                  label: 'Site / work address (optional)',
                                  hint: 'Use customer address',
                                  sheetTitle: 'Site / work address',
                                  value: controller.workAddressId.value,
                                  allowClear: true,
                                  clearLabel: 'Use customer address',
                                  options: controller.workAddressOptions,
                                  decoration: _inputDecoration('Use customer address'),
                                  onChanged: controller.onWorkAddressChanged,
                                ),
                              ],
                            ],
                          ),
                        ),
                      if (controller.errorMessage.value.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: Text(
                            controller.errorMessage.value,
                            style: GoogleFonts.inter(color: Colors.redAccent),
                          ),
                        ),
                      ...certificateTypeCatalog.map((type) {
                        final selected =
                            controller.selectedTypeSlug.value == type.slug;
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: InkWell(
                            borderRadius: BorderRadius.circular(18),
                            onTap: () =>
                                controller.selectedTypeSlug.value = type.slug,
                            child: DecoratedBox(
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(18),
                                color: selected
                                    ? AppColors.primary.withValues(alpha: 0.2)
                                    : const Color(0xB30F172A),
                                border: Border.all(
                                  color: selected
                                      ? AppColors.primary
                                      : AppColors.whiteOverlay(0.12),
                                ),
                              ),
                              child: Padding(
                                padding: const EdgeInsets.all(16),
                                child: Row(
                                  children: [
                                    CircleAvatar(
                                      backgroundColor: selected
                                          ? AppColors.primary
                                          : AppColors.whiteOverlay(0.08),
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
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            type.title,
                                            style: GoogleFonts.inter(
                                              color: Colors.white,
                                              fontWeight: FontWeight.w800,
                                            ),
                                          ),
                                          const SizedBox(height: 4),
                                          Text(
                                            type.subtitle,
                                            style: GoogleFonts.inter(
                                              color: AppColors.slate400,
                                              fontSize: 12,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                    if (selected)
                                      const Icon(
                                        Icons.check_circle_rounded,
                                        color: AppColors.primary,
                                      ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        );
                      }),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
                  child: SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: controller.creating.value
                          ? null
                          : controller.createSelectedCertificate,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                      child: controller.creating.value
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : Text(
                              'Create certificate',
                              style: GoogleFonts.inter(
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  InputDecoration _inputDecoration(String hint) {
    return InputDecoration(
      hintText: hint,
      hintStyle: GoogleFonts.inter(color: AppColors.slate500, fontSize: 14),
      filled: true,
      fillColor: AppColors.whiteOverlay(0.06),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: AppColors.whiteOverlay(0.12)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: AppColors.primary),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    );
  }
}
