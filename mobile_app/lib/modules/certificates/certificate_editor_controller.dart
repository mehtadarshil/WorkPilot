import 'dart:io';

import 'package:get/get.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';

import '../../app/routes/app_routes.dart';

import '../../core/network/api_exception.dart';
import '../../data/models/electrical_certificate_models.dart';
import '../../data/repositories/mobile_repository.dart';
import 'certificate_catalog.dart';
import 'certificate_document_utils.dart';
import 'certificate_validation.dart';
import 'widgets/validate_issues_sheet.dart';

class CertificateEditorController extends GetxController {
  CertificateEditorController({MobileRepository? mobile})
    : _mobile = mobile ?? Get.find<MobileRepository>();

  final MobileRepository _mobile;

  late final int certificateId;
  final Rxn<ElectricalCertificate> certificate = Rxn<ElectricalCertificate>();
  final RxMap<String, dynamic> document = <String, dynamic>{}.obs;
  final RxMap<String, dynamic> companyBranding = <String, dynamic>{}.obs;
  final RxList<ValidationIssue> validationIssues = <ValidationIssue>[].obs;
  final RxList<Map<String, dynamic>> engineers = <Map<String, dynamic>>[].obs;
  final RxBool loading = true.obs;
  final RxBool saving = false.obs;
  final RxBool validating = false.obs;
  final RxBool exporting = false.obs;
  final RxString errorMessage = ''.obs;
  final RxString activeSectionKey = ''.obs;

  final RxBool duplicating = false.obs;

  Map<String, int> get sectionIssueCounts =>
      countIssuesBySection(validateElectricalCertificateDocument(Map<String, dynamic>.from(document)));

  @override
  void onInit() {
    super.onInit();
    certificateId = _readCertificateId(Get.arguments);
    if (certificateId <= 0) {
      errorMessage.value = 'Invalid certificate.';
      loading.value = false;
      return;
    }
    load();
  }

  CertificateTypeInfo get typeInfo {
    return certificateTypeForSlug(
      certificate.value?.typeSlug ?? document['typeSlug']?.toString() ?? '',
    );
  }

  Future<void> load() async {
    loading.value = true;
    errorMessage.value = '';
    try {
      final cert = await _mobile.fetchElectricalCertificate(certificateId);
      certificate.value = cert;
      document.assignAll(deepCloneDocument(cert.document));
      activeSectionKey.value = defaultSectionFor(cert.typeSlug);
      await loadEngineers();
      await loadBranding();
    } on ApiException catch (e) {
      errorMessage.value = e.message;
    } catch (e) {
      errorMessage.value = e.toString();
    } finally {
      loading.value = false;
    }
  }

  Future<void> loadEngineers() async {
    try {
      engineers.assignAll(await _mobile.fetchCertificateEngineers());
    } catch (_) {
      engineers.clear();
    }
  }

  Future<void> loadBranding() async {
    try {
      final branding = await _mobile.fetchCertificateBranding();
      companyBranding.assignAll(branding);

      if (branding.isNotEmpty && (certificate.value?.typeSlug == 'eic_18e_a3' || document['typeSlug'] == 'eic_18e_a3')) {
        final eic = document['electricalInstallation'] as Map<String, dynamic>?;
        if (eic != null) {
          final nextEic = deepCloneDocument(eic);
          final design = nextEic['design'] as Map<String, dynamic>? ?? {};
          final constr = nextEic['construction'] as Map<String, dynamic>? ?? {};
          final insp = nextEic['inspection'] as Map<String, dynamic>? ?? {};

          design['designer1'] = withCompanyDefaults(Map<String, dynamic>.from(design['designer1'] ?? {}));
          if (design['designer2NotApplicable'] != true) {
            design['designer2'] = withCompanyDefaults(Map<String, dynamic>.from(design['designer2'] ?? {}));
          }
          constr['constructorSignatory'] = withCompanyDefaults(Map<String, dynamic>.from(constr['constructorSignatory'] ?? {}));
          insp['inspector'] = withCompanyDefaults(Map<String, dynamic>.from(insp['inspector'] ?? {}));

          nextEic['design'] = design;
          nextEic['construction'] = constr;
          nextEic['inspection'] = insp;

          updatePath('electricalInstallation', nextEic);
        }
      }
    } catch (_) {
      companyBranding.clear();
    }
  }

  Map<String, dynamic> withCompanyDefaults(Map<String, dynamic> value) {
    if (companyBranding.isEmpty) return value;
    final valCompany = (value['company'] ?? '').toString().trim();
    final valPhone = (value['phone'] ?? '').toString().trim();
    final valAddress = (value['address'] ?? '').toString().trim();
    final valPostcode = (value['postcode'] ?? '').toString().trim();

    final valueAddress = splitUkPostcode(valAddress);
    final brandingAddress = splitUkPostcode((companyBranding['company_address'] ?? '').toString());
    final address = valueAddress['address']!.isNotEmpty ? valueAddress['address']! : brandingAddress['address']!;

    return {
      ...value,
      'company': valCompany.isNotEmpty ? valCompany : (companyBranding['company_name'] ?? '').toString(),
      'phone': valPhone.isNotEmpty ? valPhone : (companyBranding['company_phone'] ?? '').toString(),
      'address': address,
      'postcode': valPostcode.isNotEmpty 
          ? valPostcode 
          : (valueAddress['postcode']!.isNotEmpty ? valueAddress['postcode']! : brandingAddress['postcode']!),
    };
  }

  Map<String, String> splitUkPostcode(String raw) {
    final trimmed = raw.trim();
    final regExp = RegExp(r'\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b$', caseSensitive: false);
    final match = regExp.firstMatch(trimmed);
    if (match == null) return {'address': trimmed, 'postcode': ''};
    final postcode = match.group(1)!.toUpperCase().replaceAll(RegExp(r'\s+'), ' ');
    final address = trimmed.substring(0, match.start).replaceAll(RegExp(r'[,\s]+$'), '');
    return {'address': address, 'postcode': postcode};
  }

  Future<void> save() async {
    if (saving.value) return;
    saving.value = true;
    try {
      final cert = await _mobile.patchElectricalCertificate(
        certificateId,
        document: Map<String, dynamic>.from(document),
      );
      certificate.value = cert;
      document.assignAll(deepCloneDocument(cert.document));
      Get.snackbar('Saved', 'Certificate changes saved.');
    } on ApiException catch (e) {
      Get.snackbar('Save failed', e.message);
    } catch (e) {
      Get.snackbar('Save failed', e.toString());
    } finally {
      saving.value = false;
    }
  }

  Future<void> validateCertificate() async {
    if (validating.value) return;
    validating.value = true;
    try {
      await save();
      final issues = await _mobile.validateElectricalCertificate(certificateId);
      validationIssues.assignAll(issues);
      await showValidateIssuesSheet(this);
    } on ApiException catch (e) {
      Get.snackbar('Validation failed', e.message);
    } catch (e) {
      Get.snackbar('Validation failed', e.toString());
    } finally {
      validating.value = false;
    }
  }

  Future<void> exportPdf() async {
    if (exporting.value) return;
    exporting.value = true;
    try {
      await save();
      final bytes = await _mobile.fetchElectricalCertificatePdf(certificateId);
      if (bytes.isEmpty) throw ApiException('No PDF data returned');
      final dir = await getTemporaryDirectory();
      final filename = _safePdfName(
        certificate.value?.certificateNumber ?? 'certificate-$certificateId',
      );
      final file = File('${dir.path}/$filename.pdf');
      await file.writeAsBytes(bytes, flush: true);
      await OpenFilex.open(file.path);
    } on ApiException catch (e) {
      Get.snackbar('Export failed', e.message);
    } catch (e) {
      Get.snackbar('Export failed', e.toString());
    } finally {
      exporting.value = false;
    }
  }

  Future<void> duplicateCertificate({
    String? targetTypeSlug,
    int? customerId,
    int? workAddressId,
  }) async {
    if (duplicating.value) return;
    duplicating.value = true;
    try {
      await save();
      final cert = await _mobile.duplicateElectricalCertificate(
        certificateId,
        typeSlug: targetTypeSlug,
        customerId: customerId,
        workAddressId: workAddressId,
      );
      Get.offNamed(
        AppRoutes.certificateEditor,
        arguments: {'id': cert.id},
      );
      Get.snackbar('Created', 'Certificate copy opened.');
    } on ApiException catch (e) {
      Get.snackbar('Copy failed', e.message);
    } catch (e) {
      Get.snackbar('Copy failed', e.toString());
    } finally {
      duplicating.value = false;
    }
  }

  void updatePath(String path, dynamic value) {
    document.assignAll(
      setDocumentPath(Map<String, dynamic>.from(document), path, value),
    );
  }

  String valueAt(String path) {
    return stringAtPath(Map<String, dynamic>.from(document), path);
  }

  List<Map<String, dynamic>> listAt(String path) {
    return listAtPath(Map<String, dynamic>.from(document), path);
  }

  String defaultSectionFor(String typeSlug) {
    switch (typeSlug) {
      case 'portable_appliance_test':
        return 'business';
      case 'fi_insp_2025':
      case 'dfi_insp_2019_a1':
      case 'dfi_inst_2019_a1':
      case 'fi_extinsp_5306':
      case 'em_pir_2025':
        return 'installation';
      case 'eic_18e_a3':
        return 'details';
      case 'mwc_18e_a3':
        return 'works';
      default:
        return 'installation';
    }
  }

  int _readCertificateId(dynamic args) {
    if (args is int) return args;
    if (args is num) return args.toInt();
    if (args is String) return int.tryParse(args) ?? 0;
    if (args is Map) {
      final value =
          args['id'] ?? args['certificateId'] ?? args['certificate_id'];
      if (value is int) return value;
      if (value is num) return value.toInt();
      return int.tryParse(value?.toString() ?? '') ?? 0;
    }
    return 0;
  }

  String _safePdfName(String raw) {
    final base = raw.trim().isEmpty ? 'certificate-$certificateId' : raw.trim();
    return base.replaceAll(RegExp(r'[^A-Za-z0-9._-]+'), '-');
  }
}
