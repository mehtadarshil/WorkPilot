import 'package:get/get.dart';
import 'package:get_storage/get_storage.dart';

import '../values/app_constants.dart';

/// Key-value persistence (tokens, flags). Initialized in [main] via `GetStorage.init()`.
class StorageService extends GetxService {
  final GetStorage _box = GetStorage();

  String? get authToken => _box.read(AppConstants.storageAuthToken) as String?;

  Future<void> setAuthToken(String? value) async {
    if (value == null || value.isEmpty) {
      await _box.remove(AppConstants.storageAuthToken);
    } else {
      await _box.write(AppConstants.storageAuthToken, value);
    }
  }

  String? get userJson => _box.read(AppConstants.storageUserJson) as String?;

  Future<void> setUserJson(String? value) async {
    if (value == null || value.isEmpty) {
      await _box.remove(AppConstants.storageUserJson);
    } else {
      await _box.write(AppConstants.storageUserJson, value);
    }
  }

  Future<void> clearSession() async {
    await _box.remove(AppConstants.storageAuthToken);
    await _box.remove(AppConstants.storageUserJson);
  }
}
