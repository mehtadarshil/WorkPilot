import 'package:get/get.dart';

import 'certificate_type_picker_controller.dart';

class CertificateTypePickerBinding extends Bindings {
  @override
  void dependencies() {
    Get.lazyPut<CertificateTypePickerController>(
      () => CertificateTypePickerController(),
    );
  }
}
