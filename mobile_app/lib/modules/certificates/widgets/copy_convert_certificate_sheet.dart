import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/values/app_colors.dart';
import '../../../data/repositories/customers_repository.dart';
import '../../../widgets/searchable_select_field.dart';
import '../certificate_catalog.dart';
import '../certificate_editor_controller.dart';

Future<void> showCopyConvertCertificateSheet(CertificateEditorController controller) async {
  var mode = 'copy';
  var selectedSlug = controller.certificate.value?.typeSlug ?? controller.document['typeSlug']?.toString() ?? 'eicr_18e_a3';

  final customersRepo = Get.find<CustomersRepository>();
  final currentCert = controller.certificate.value;

  var firstLoad = true;
  List<Map<String, dynamic>> customers = [];
  List<Map<String, dynamic>> workAddresses = [];
  var loadingOptions = true;

  int? selectedCustomerId = currentCert?.customerId ?? (controller.document['customerId'] as num?)?.toInt();
  int? selectedWorkAddressId = currentCert?.workAddressId ?? (controller.document['workAddressId'] as num?)?.toInt();

  await Get.bottomSheet<void>(
    StatefulBuilder(
      builder: (context, setModalState) {
        Future<void> loadOptions() async {
          try {
            final res = await customersRepo.listCustomers(page: 1, limit: 5000);
            final rows = res['customers'];
            final list = rows is List
                ? rows.map((e) => e is Map ? Map<String, dynamic>.from(e) : <String, dynamic>{}).toList()
                : <Map<String, dynamic>>[];

            List<Map<String, dynamic>> wa = [];
            if (selectedCustomerId != null) {
              wa = await customersRepo.getWorkAddresses(selectedCustomerId!, status: 'active');
            }

            setModalState(() {
              customers = list;
              workAddresses = wa;
              loadingOptions = false;
            });
          } catch (_) {
            setModalState(() {
              loadingOptions = false;
            });
          }
        }

        if (firstLoad) {
          firstLoad = false;
          loadOptions();
        }

        InputDecoration inputDeco(String hint) {
          return InputDecoration(
            hintText: hint.isEmpty ? null : hint,
            hintStyle: GoogleFonts.inter(color: Colors.white38),
            labelStyle: GoogleFonts.inter(color: Colors.white70),
            border: const UnderlineInputBorder(borderSide: BorderSide(color: Colors.white24)),
            enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Colors.white24)),
          );
        }

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
                  decoration: const InputDecoration(
                    labelText: 'Target certificate type',
                    labelStyle: TextStyle(color: Colors.white70),
                  ),
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
              const SizedBox(height: 16),
              if (loadingOptions)
                const Center(child: Padding(padding: EdgeInsets.all(8.0), child: CircularProgressIndicator(color: AppColors.primary)))
              else ...[
                SearchableSelectField<int>(
                  label: 'Customer *',
                  hint: 'Choose customer',
                  sheetTitle: 'Customer',
                  value: selectedCustomerId,
                  decoration: inputDeco('').copyWith(
                    labelText: 'Customer *',
                    floatingLabelBehavior: FloatingLabelBehavior.always,
                  ),
                  options: [
                    for (final c in customers)
                      if ((c['id'] as num?) != null)
                        SelectOption<int>(
                          value: (c['id'] as num).toInt(),
                          label: (c['full_name'] as String?)?.trim().isNotEmpty == true
                              ? c['full_name'] as String
                              : 'Customer #${c['id']}',
                        ),
                  ],
                  onChanged: (v) async {
                    if (v == null) return;
                    setModalState(() {
                      selectedCustomerId = v;
                      selectedWorkAddressId = null;
                      workAddresses = [];
                    });
                    try {
                      final wa = await customersRepo.getWorkAddresses(v, status: 'active');
                      setModalState(() {
                        workAddresses = wa;
                      });
                    } catch (_) {}
                  },
                ),
                if (selectedCustomerId != null) ...[
                  const SizedBox(height: 16),
                  DropdownButtonFormField<int?>(
                    isExpanded: true,
                    value: selectedWorkAddressId,
                    dropdownColor: const Color(0xFF0F172A),
                    style: GoogleFonts.inter(color: Colors.white),
                    decoration: inputDeco('').copyWith(
                      labelText: 'Work / site (optional)',
                      floatingLabelBehavior: FloatingLabelBehavior.always,
                    ),
                    items: [
                      DropdownMenuItem<int?>(
                        value: null,
                        child: Text('None', style: GoogleFonts.inter(color: Colors.white)),
                      ),
                      for (final w in workAddresses)
                        DropdownMenuItem<int?>(
                          value: (w['id'] as num?)?.toInt(),
                          child: Text(
                            '${(w['name'] as String?)?.trim().isNotEmpty == true ? w['name'] : 'Site #${w['id']}'}',
                            overflow: TextOverflow.ellipsis,
                            maxLines: 1,
                          ),
                        ),
                    ],
                    onChanged: (v) => setModalState(() => selectedWorkAddressId = v),
                  ),
                ],
              ],
              const SizedBox(height: 20),
              Obx(
                () => ElevatedButton(
                  style: ElevatedButton.styleFrom(backgroundColor: AppColors.primary),
                  onPressed: controller.duplicating.value || selectedCustomerId == null
                      ? null
                      : () async {
                          Get.back();
                          final slug = mode == 'copy'
                              ? controller.certificate.value?.typeSlug
                              : selectedSlug;
                          await controller.duplicateCertificate(
                            targetTypeSlug: slug,
                            customerId: selectedCustomerId,
                            workAddressId: selectedWorkAddressId,
                          );
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
