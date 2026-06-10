import 'package:get/get.dart';

import 'certificate_editor_controller.dart';

class CertificateEditorBinding extends Bindings {
  @override
  void dependencies() {
    Get.lazyPut<CertificateEditorController>(
      () => CertificateEditorController(),
    );
  }
}
