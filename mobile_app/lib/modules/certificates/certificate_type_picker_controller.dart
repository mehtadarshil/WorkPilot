import 'package:get/get.dart';

import '../../app/routes/app_routes.dart';
import '../../core/network/api_exception.dart';
import '../../data/repositories/mobile_repository.dart';
import 'certificate_catalog.dart';

class CertificateTypePickerController extends GetxController {
  CertificateTypePickerController({MobileRepository? mobile})
    : _mobile = mobile ?? Get.find<MobileRepository>();

  final MobileRepository _mobile;

  final RxBool creating = false.obs;
  final RxString selectedTypeSlug = certificateTypeCatalog.first.slug.obs;
  final RxString errorMessage = ''.obs;

  late final int customerId;
  int? workAddressId;
  int? jobId;
  String? jobNumber;
  String? customerName;
  String? jobTitle;

  @override
  void onInit() {
    super.onInit();
    final args = Get.arguments;
    final map = args is Map
        ? Map<String, dynamic>.from(args)
        : <String, dynamic>{};
    customerId = _readInt(map['customerId'] ?? map['customer_id']) ?? 0;
    workAddressId = _readInt(map['workAddressId'] ?? map['work_address_id']);
    jobId = _readInt(map['jobId'] ?? map['job_id']);
    jobNumber = map['jobNumber']?.toString() ?? map['job_number']?.toString();
    customerName =
        map['customerName']?.toString() ?? map['customer_name']?.toString();
    jobTitle = map['jobTitle']?.toString() ?? map['job_title']?.toString();
    if (customerId <= 0) {
      errorMessage.value = 'Missing customer for certificate creation.';
    }
  }

  Future<void> createSelectedCertificate() async {
    if (customerId <= 0 || creating.value) return;
    creating.value = true;
    errorMessage.value = '';
    try {
      final cert = await _mobile.createElectricalCertificate(
        customerId: customerId,
        workAddressId: workAddressId,
        jobId: jobId,
        jobNumber: jobNumber,
        typeSlug: selectedTypeSlug.value,
      );
      await Get.offNamed(
        AppRoutes.certificateEditor,
        arguments: {'id': cert.id},
      );
    } on ApiException catch (e) {
      errorMessage.value = e.message;
    } catch (e) {
      errorMessage.value = e.toString();
    } finally {
      creating.value = false;
    }
  }

  int? _readInt(dynamic value) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    return int.tryParse(value?.toString() ?? '');
  }
}
