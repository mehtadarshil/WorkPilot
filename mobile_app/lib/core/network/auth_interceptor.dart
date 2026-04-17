import 'package:dio/dio.dart';
import 'package:get/get.dart';

import '../../app/routes/app_routes.dart';
import '../services/storage_service.dart';

/// Attaches `Authorization: Bearer …` when a token exists in [StorageService].
///
/// On **401** from the API (e.g. expired JWT), clears the session and navigates
/// to login. The `/auth/login` path is excluded so invalid
/// credentials do not trigger a forced logout.
class AuthInterceptor extends Interceptor {
  AuthInterceptor(this._storage);

  final StorageService _storage;

  static bool _logoutInProgress = false;

  /// Paths under [AppConstants.apiBaseUrl] that return 401 without meaning
  /// "session expired" (wrong password, etc.).
  static bool _isPublicAuthFailurePath(String path) {
    return path == '/auth/login' || path.endsWith('/auth/login');
  }

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final token = _storage.authToken;
    if (token != null && token.isNotEmpty) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    final status = err.response?.statusCode;
    if (status == 401 &&
        !_isPublicAuthFailurePath(err.requestOptions.path) &&
        !_logoutInProgress) {
      _logoutInProgress = true;
      _storage.clearSession().then((_) {
        if (Get.currentRoute != AppRoutes.login) {
          Get.offAllNamed(AppRoutes.login);
        }
      }).whenComplete(() {
        _logoutInProgress = false;
      });
    }
    handler.next(err);
  }
}
