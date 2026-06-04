import 'package:get/get.dart';
import 'package:get_storage/get_storage.dart';
import 'package:local_auth/local_auth.dart';

import '../values/app_constants.dart';

class BiometricService extends GetxService {
  final LocalAuthentication _localAuth = LocalAuthentication();
  final GetStorage _box = GetStorage();

  /// Whether the user has explicitly disabled biometric lock.
  bool get isBiometricEnabled {
    return _box.read(AppConstants.storageBiometricEnabled) != false;
  }

  Future<void> setBiometricEnabled(bool value) async {
    await _box.write(AppConstants.storageBiometricEnabled, value);
  }

  /// True if the device supports local authentication (biometrics or
  /// device screen lock — PIN / password / pattern).
  Future<bool> canAuthenticate() async {
    final isAvailable = await _localAuth.isDeviceSupported();
    if (!isAvailable) return false;
    final canCheck = await _localAuth.canCheckBiometrics;
    if (canCheck) {
      final availableBiometrics = await _localAuth.getAvailableBiometrics();
      if (availableBiometrics.isNotEmpty) return true;
    }
    // Even if no biometrics are enrolled, device credentials
    // (PIN / password / pattern) may still work because
    // authenticate() uses biometricOnly: false.
    return true;
  }

  /// Trigger the system biometric prompt.
  /// Returns `true` if the user successfully authenticated.
  Future<bool> authenticate() async {
    try {
      return await _localAuth.authenticate(
        localizedReason: 'Authenticate to access WorkPilot',
        options: const AuthenticationOptions(
          biometricOnly: false,
          stickyAuth: true,
          useErrorDialogs: true,
        ),
      );
    } catch (_) {
      return false;
    }
  }
}
