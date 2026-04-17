/// App-wide constants (API base URL, timeouts, storage keys).
abstract class AppConstants {
  AppConstants._();

  static const String appName = 'WorkPilot';

  /// Branding (same file as web `public/logo.jpg`).
  static const String assetLogo = 'assets/images/logo.jpg';

  /// Backend `/api` root. Use `--dart-define=API_BASE_URL=...` per environment.
  /// Android emulator: `http://10.0.2.2:4000/api` · iOS simulator: `http://127.0.0.1:4000/api`
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://127.0.0.1:4000/api',
  );

  static const Duration connectTimeout = Duration(seconds: 30);
  static const Duration receiveTimeout = Duration(seconds: 30);

  /// GetStorage keys
  static const String storageAuthToken = 'auth_token';
  static const String storageUserJson = 'user_json';
}
