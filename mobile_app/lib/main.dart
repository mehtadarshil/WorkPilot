import 'package:flutter/material.dart';
import 'package:get_storage/get_storage.dart';

import 'app.dart';
import 'app/routes/app_routes.dart';
import 'core/services/biometric_service.dart';
import 'core/values/app_constants.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await GetStorage.init();
  await GetStorage.init('wp_offline_queue');
  final box = GetStorage();
  final token = box.read(AppConstants.storageAuthToken) as String?;
  final hasSession = token != null && token.isNotEmpty;

  String initialRoute = AppRoutes.login;
  if (hasSession) {
    final biometric = BiometricService();
    final canAuth = await biometric.canAuthenticate();
    final enabled = biometric.isBiometricEnabled;
    if (canAuth && enabled) {
      initialRoute = AppRoutes.biometricLock;
    } else {
      initialRoute = AppRoutes.home;
    }
  }

  runApp(App(initialRoute: initialRoute));
}
