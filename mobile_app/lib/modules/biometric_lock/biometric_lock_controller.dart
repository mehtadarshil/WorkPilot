import 'package:flutter/services.dart';
import 'package:get/get.dart';

import '../../app/routes/app_routes.dart';
import '../../core/services/biometric_service.dart';
import '../../core/services/storage_service.dart';

class BiometricLockController extends GetxController {
  BiometricLockController({
    BiometricService? biometric,
    StorageService? storage,
  })  : _biometric = biometric ?? Get.find<BiometricService>(),
        _storage = storage ?? Get.find<StorageService>();

  final BiometricService _biometric;
  final StorageService _storage;

  final isAuthenticating = false.obs;
  final errorMessage = RxnString();

  @override
  void onReady() {
    super.onReady();
    _attemptAuth();
  }

  Future<void> _attemptAuth() async {
    isAuthenticating.value = true;
    errorMessage.value = null;
    try {
      final success = await _biometric.authenticate();
      if (success) {
        Get.offAllNamed(AppRoutes.home);
      } else {
        errorMessage.value = 'Authentication failed. Please try again.';
      }
    } on PlatformException catch (e) {
      errorMessage.value = e.message ?? 'Biometric error. Please try again.';
    } catch (e) {
      errorMessage.value = 'Something went wrong. Please try again.';
    } finally {
      isAuthenticating.value = false;
    }
  }

  Future<void> retry() async {
    if (isAuthenticating.value) return;
    await _attemptAuth();
  }

  Future<void> logout() async {
    await _storage.clearSession();
    Get.offAllNamed(AppRoutes.login);
  }
}
