import 'package:get/get.dart';

import '../../core/services/biometric_service.dart';
import 'biometric_lock_controller.dart';

class BiometricLockBinding extends Bindings {
  @override
  void dependencies() {
    Get.put<BiometricService>(BiometricService());
    Get.lazyPut<BiometricLockController>(BiometricLockController.new);
  }
}
