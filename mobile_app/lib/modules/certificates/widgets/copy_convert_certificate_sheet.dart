import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../app/routes/app_routes.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/values/app_colors.dart';
import '../../../data/repositories/customers_repository.dart';
import '../../../data/repositories/mobile_repository.dart';
import '../../../widgets/searchable_select_field.dart';
import '../certificate_catalog.dart';
import '../certificate_editor_controller.dart';

typedef CertificateDuplicateHandler = Future<void> Function({
  String? targetTypeSlug,
  required int customerId,
  int? workAddressId,
});

/// Copy / convert from the certificate editor (saves first, replaces current route).
Future<void> showCopyConvertCertificateSheet(CertificateEditorController controller) {
  final currentCert = controller.certificate.value;
  return showCopyConvertCertificateOptionsSheet(
    initialTypeSlug: currentCert?.typeSlug ?? controller.document['typeSlug']?.toString() ?? 'eicr_18e_a3',
    initialCustomerId: currentCert?.customerId ?? (controller.document['customerId'] as num?)?.toInt(),
    initialWorkAddressId: currentCert?.workAddressId ?? (controller.document['workAddressId'] as num?)?.toInt(),
    onConfirm: ({targetTypeSlug, required customerId, workAddressId}) => controller.duplicateCertificate(
      targetTypeSlug: targetTypeSlug,
      customerId: customerId,
      workAddressId: workAddressId,
    ),
    isBusy: () => controller.duplicating.value,
  );
}

/// Copy / convert from the certificates list (same flow as web row menu).
Future<void> showCopyConvertCertificateFromList({
  required int certificateId,
  required String typeSlug,
  int? customerId,
  int? workAddressId,
  VoidCallback? onCopied,
}) {
  return showCopyConvertCertificateOptionsSheet(
    initialTypeSlug: typeSlug,
    initialCustomerId: customerId,
    initialWorkAddressId: workAddressId,
    onConfirm: ({targetTypeSlug, required customerId, workAddressId}) async {
      final mobile = Get.find<MobileRepository>();
      try {
        final cert = await mobile.duplicateElectricalCertificate(
          certificateId,
          typeSlug: targetTypeSlug,
          customerId: customerId,
          workAddressId: workAddressId,
        );
        await Get.toNamed(
          AppRoutes.certificateEditor,
          arguments: {'id': cert.id},
        );
        Get.snackbar('Created', 'Certificate copy opened.');
        onCopied?.call();
      } on ApiException catch (e) {
        Get.snackbar('Copy failed', e.message);
      } catch (e) {
        Get.snackbar('Copy failed', e.toString());
      }
    },
  );
}

Future<void> showCopyConvertCertificateOptionsSheet({
  required String initialTypeSlug,
  int? initialCustomerId,
  int? initialWorkAddressId,
  required CertificateDuplicateHandler onConfirm,
  bool Function()? isBusy,
}) async {
  var mode = 'copy';
  var selectedSlug = initialTypeSlug;
  var submitting = false;

  final customersRepo = Get.find<CustomersRepository>();

  var firstLoad = true;
  List<Map<String, dynamic>> customers = [];
  List<Map<String, dynamic>> workAddresses = [];
  var loadingOptions = true;

  int? selectedCustomerId = initialCustomerId;
  int? selectedWorkAddressId = initialWorkAddressId;

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

        final busy = submitting || (isBusy?.call() ?? false);

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
              ElevatedButton(
                style: ElevatedButton.styleFrom(backgroundColor: AppColors.primary),
                onPressed: busy || selectedCustomerId == null
                    ? null
                    : () async {
                        final customerId = selectedCustomerId!;
                        final slug = mode == 'copy' ? initialTypeSlug : selectedSlug;
                        Get.back();
                        setModalState(() => submitting = true);
                        await onConfirm(
                          targetTypeSlug: slug,
                          customerId: customerId,
                          workAddressId: selectedWorkAddressId,
                        );
                        setModalState(() => submitting = false);
                      },
                child: busy
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : Text(mode == 'copy' ? 'Create copy' : 'Convert & create'),
              ),
            ],
          ),
        );
      },
    ),
    isScrollControlled: true,
  );
}
