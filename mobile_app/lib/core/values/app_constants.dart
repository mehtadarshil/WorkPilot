import 'package:flutter/foundation.dart';

/// App-wide constants (API base URL, timeouts, storage keys).
abstract class AppConstants {
  AppConstants._();

  static const String _productionApiBaseUrl = 'https://api.work-pilot.co/api';

  /// Set via `--dart-define=API_BASE_URL=...` to override debug/release defaults.
  static const String _apiBaseUrlFromEnv = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: '',
  );

  static const String appName = 'WorkPilot';

  /// In-app legal copy (Profile → Legal). Not loaded from an external browser.
  static const String privacyPolicyInAppText = String.fromEnvironment(
    'PRIVACY_POLICY_TEXT',
    defaultValue:
        'WorkPilot — Privacy summary\n\n'
        'We collect account and usage data needed to run your tenancy (sign-in, jobs, diary, CRM, and billing). '
        'We process data to provide the service, secure your account, and meet legal obligations. '
        'We do not sell your personal data.\n\n'
        'You can request access, correction, or deletion of personal data where applicable by contacting your organisation administrator or WorkPilot support. '
        'Retention follows your organisation’s policies and backup cycles.\n\n'
        'For the full published policy, your organisation may provide a separate document; this in-app summary is provided for convenience while using the mobile app.',
  );

  static const String termsOfServiceInAppText = String.fromEnvironment(
    'TERMS_OF_SERVICE_TEXT',
    defaultValue:
        'WorkPilot — Terms of use summary\n\n'
        'By using this application you agree to use it only for lawful business purposes and in line with your organisation’s instructions. '
        'You must keep credentials confidential and not attempt to disrupt, reverse engineer, or exceed authorised access.\n\n'
        'The service is provided “as is” to the extent permitted by law; limits of liability and governing law are set out in your organisation’s agreement with WorkPilot where applicable.\n\n'
        'If you do not agree, discontinue use and contact your administrator.',
  );

  /// Branding (same file as web `public/logo.jpg`).
  static const String assetLogo = 'assets/images/logo.jpg';

  /// Backend `/api` root.
  /// - **Release** (`flutter run --release`, store builds): production API.
  /// - **Debug** (`flutter run`): local backend (emulator-friendly host on Android).
  /// - **Override**: `--dart-define=API_BASE_URL=https://custom.example/api`
  static String get apiBaseUrl {
    final fromEnv = _apiBaseUrlFromEnv.trim();
    if (fromEnv.isNotEmpty) return fromEnv;
    if (kReleaseMode) return _productionApiBaseUrl;
    return _debugApiBaseUrl;
  }

  static String get _debugApiBaseUrl {
    if (defaultTargetPlatform == TargetPlatform.android) {
      return 'http://10.0.2.2:4000/api';
    }
    return 'http://127.0.0.1:4000/api';
  }

  /// Optional full origin for public quotation links (`/public/quotations/...`).
  /// When empty, `/api` is stripped from [apiBaseUrl] (works when web and API share one host).
  static const String webAppBaseUrl = String.fromEnvironment(
    'WEB_APP_BASE_URL',
    defaultValue: '',
  );

  /// Base URL for opening customer-facing pages in the browser (no trailing slash).
  static String get resolvedWebAppOrigin {
    final fromEnv = webAppBaseUrl.trim();
    if (fromEnv.isNotEmpty) {
      return fromEnv.replaceAll(RegExp(r'/$'), '');
    }
    final api = apiBaseUrl.trim().replaceAll(RegExp(r'/$'), '');
    var base = api;
    if (api.endsWith('/api')) {
      base = api.substring(0, api.length - 4);
    }
    if (base.contains(':4000')) {
      base = base.replaceAll(':4000', ':3001');
    }
    return base;
  }

  static const Duration connectTimeout = Duration(seconds: 30);
  static const Duration receiveTimeout = Duration(seconds: 30);

  /// GetStorage keys
  static const String storageAuthToken = 'auth_token';
  static const String storageRefreshToken = 'refresh_token';
  static const String storageUserJson = 'user_json';
  static const String storageBiometricEnabled = 'biometric_enabled';
}
