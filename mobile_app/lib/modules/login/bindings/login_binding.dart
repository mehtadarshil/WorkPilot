import 'package:get/get.dart';

import '../../../core/services/storage_service.dart';
import '../../../data/repositories/auth_repository.dart';
import '../controllers/login_controller.dart';

class LoginBinding extends Bindings {
  @override
  void dependencies() {
    Get.lazyPut<AuthRepository>(
      () => AuthRepository(Get.find()),
      fenix: true,
    );
    Get.lazyPut<LoginController>(
      () => LoginController(
        authRepository: Get.find<AuthRepository>(),
        storage: Get.find<StorageService>(),
      ),
      fenix: true,
    );
  }
}
