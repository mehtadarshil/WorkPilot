import 'package:dio/dio.dart';
import 'package:get/get.dart' hide Response;

import '../../app/routes/app_routes.dart';
import '../services/storage_service.dart';
import '../values/app_constants.dart';

/// Attaches `Authorization: Bearer …` when a token exists in [StorageService].
///
/// On **401** from the API (e.g. expired JWT), checks if a refresh token is present.
/// If yes, performs a background token refresh, updates storage, and transparently
/// retries the request. Otherwise, clears the session and navigates to login.
class AuthInterceptor extends Interceptor {
  AuthInterceptor(this._storage);

  final StorageService _storage;

  static bool _logoutInProgress = false;
  static Future<Map<String, String?>>? _activeRefreshFuture;

  /// Paths under [AppConstants.apiBaseUrl] that return 401 without meaning
  /// "session expired" (wrong password, etc.).
  static bool _isPublicAuthFailurePath(String path) {
    return path == '/auth/login' || path.endsWith('/auth/login') || path.endsWith('/auth/refresh');
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
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    final status = err.response?.statusCode;
    final path = err.requestOptions.path;
    final isRetry = err.requestOptions.extra['isRetry'] == true;

    if (status == 401 &&
        !_isPublicAuthFailurePath(path) &&
        !isRetry &&
        !_logoutInProgress) {
      final refreshToken = _storage.refreshToken;
      if (refreshToken != null && refreshToken.isNotEmpty) {
        try {
          // Share a single active refresh future for all concurrent 401 requests
          _activeRefreshFuture ??= _performTokenRefresh(refreshToken);
          final tokens = await _activeRefreshFuture!;

          final newToken = tokens['token'];
          if (newToken != null && newToken.isNotEmpty) {
            final options = err.requestOptions;
            options.headers['Authorization'] = 'Bearer $newToken';
            options.extra['isRetry'] = true;

            final dio = Dio(BaseOptions(
              baseUrl: AppConstants.apiBaseUrl,
              connectTimeout: AppConstants.connectTimeout,
              receiveTimeout: AppConstants.receiveTimeout,
            ));

            final response = await dio.request(
              options.path,
              data: options.data,
              queryParameters: options.queryParameters,
              options: Options(
                method: options.method,
                headers: options.headers,
                contentType: options.contentType,
              ),
            );

            return handler.resolve(response);
          }
        } catch (refreshError) {
          Get.log('Token refresh error in interceptor: $refreshError');
        } finally {
          _activeRefreshFuture = null;
        }
      }

      // If refresh failed or no refresh token was present, clear session and log out
      _logoutInProgress = true;
      await _storage.clearSession();
      if (Get.currentRoute != AppRoutes.login) {
        Get.offAllNamed(AppRoutes.login);
      }
      _logoutInProgress = false;
    }

    handler.next(err);
  }

  Future<Map<String, String?>> _performTokenRefresh(String refreshToken) async {
    final dio = Dio(BaseOptions(
      baseUrl: AppConstants.apiBaseUrl,
      connectTimeout: AppConstants.connectTimeout,
      receiveTimeout: AppConstants.receiveTimeout,
    ));
    final res = await dio.post<Map<String, dynamic>>(
      '/auth/refresh',
      data: {'refreshToken': refreshToken},
    );
    final data = res.data;
    if (data == null) throw Exception('Empty refresh response');

    final newToken = data['token'] as String?;
    final newRefreshToken = data['refreshToken'] as String?;

    if (newToken != null) {
      await _storage.setAuthToken(newToken);
    }
    if (newRefreshToken != null) {
      await _storage.setRefreshToken(newRefreshToken);
    }

    return {
      'token': newToken,
      'refreshToken': newRefreshToken,
    };
  }
}
