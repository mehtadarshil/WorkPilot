import 'package:flutter/material.dart';
import 'package:get_storage/get_storage.dart';

import 'app.dart';
import 'app/routes/app_routes.dart';
import 'core/values/app_constants.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await GetStorage.init();
  final box = GetStorage();
  final token = box.read(AppConstants.storageAuthToken) as String?;
  final hasSession = token != null && token.isNotEmpty;
  runApp(App(initialRoute: hasSession ? AppRoutes.home : AppRoutes.login));
}
