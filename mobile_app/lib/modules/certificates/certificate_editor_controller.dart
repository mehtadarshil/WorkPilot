import 'dart:io';

import 'package:get/get.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';

import '../../core/network/api_exception.dart';
import '../../data/models/electrical_certificate_models.dart';
import '../../data/repositories/mobile_repository.dart';
import 'certificate_catalog.dart';
import 'certificate_document_utils.dart';

class CertificateEditorController extends GetxController {
  CertificateEditorController({MobileRepository? mobile})
    : _mobile = mobile ?? Get.find<MobileRepository>();

  final MobileRepository _mobile;

  late final int certificateId;
  final Rxn<ElectricalCertificate> certificate = Rxn<ElectricalCertificate>();
  final RxMap<String, dynamic> document = <String, dynamic>{}.obs;
  final RxList<ValidationIssue> validationIssues = <ValidationIssue>[].obs;
  final RxList<Map<String, dynamic>> engineers = <Map<String, dynamic>>[].obs;
  final RxBool loading = true.obs;
  final RxBool saving = false.obs;
  final RxBool validating = false.obs;
  final RxBool exporting = false.obs;
  final RxString errorMessage = ''.obs;
  final RxString activeSectionKey = ''.obs;

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
      Get.snackbar(
        issues.isEmpty ? 'Valid' : 'Validation issues',
        issues.isEmpty
            ? 'No certificate issues found.'
            : '${issues.length} issue(s) need attention.',
      );
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
