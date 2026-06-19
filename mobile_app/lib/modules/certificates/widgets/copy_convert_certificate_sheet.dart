import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/values/app_colors.dart';
import '../certificate_catalog.dart';
import '../certificate_editor_controller.dart';

Future<void> showCopyConvertCertificateSheet(CertificateEditorController controller) async {
  var mode = 'copy';
  var selectedSlug = controller.certificate.value?.typeSlug ?? controller.document['typeSlug']?.toString() ?? 'eicr_18e_a3';

  await Get.bottomSheet<void>(
    StatefulBuilder(
      builder: (context, setModalState) {
        return Container(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 28),
          decoration: const BoxDecoration(
            color: Color(0xFF0F172A),
            borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Copy / convert certificate',
                style: GoogleFonts.inter(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: ChoiceChip(
                      label: const Text('Copy'),
                      selected: mode == 'copy',
                      onSelected: (_) => setModalState(() => mode = 'copy'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: ChoiceChip(
                      label: const Text('Convert type'),
                      selected: mode == 'convert',
                      onSelected: (_) => setModalState(() => mode = 'convert'),
                    ),
                  ),
                ],
              ),
              if (mode == 'convert') ...[
                const SizedBox(height: 16),
                DropdownButtonFormField<String>(
                  value: selectedSlug,
                  dropdownColor: const Color(0xFF0F172A),
                  style: GoogleFonts.inter(color: Colors.white),
                  decoration: const InputDecoration(labelText: 'Target certificate type'),
                  items: certificateTypeCatalog
                      .map(
                        (type) => DropdownMenuItem(
                          value: type.slug,
                          child: Text('${type.shortLabel} — ${type.title}'),
                        ),
                      )
                      .toList(),
                  onChanged: (value) {
                    if (value != null) setModalState(() => selectedSlug = value);
                  },
                ),
              ],
              const SizedBox(height: 20),
              Obx(
                () => ElevatedButton(
                  style: ElevatedButton.styleFrom(backgroundColor: AppColors.primary),
                  onPressed: controller.duplicating.value
                      ? null
                      : () async {
                          Get.back();
                          final slug = mode == 'copy'
                              ? controller.certificate.value?.typeSlug
                              : selectedSlug;
                          await controller.duplicateCertificate(targetTypeSlug: slug);
                        },
                  child: controller.duplicating.value
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : Text(mode == 'copy' ? 'Create copy' : 'Convert & create'),
                ),
              ),
            ],
          ),
        );
      },
    ),
    isScrollControlled: true,
  );
}
