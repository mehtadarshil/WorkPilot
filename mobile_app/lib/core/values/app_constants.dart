/// App-wide constants (API base URL, timeouts, storage keys).
abstract class AppConstants {
  AppConstants._();

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

  /// Backend `/api` root. Use `--dart-define=API_BASE_URL=...` per environment.
  /// Android emulator: `http://10.0.2.2:4000/api` · iOS simulator: `http://127.0.0.1:4000/api`
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    // defaultValue: 'https://api.work-pilot.co/api',
    defaultValue: 'http://127.0.0.1:4000/api',
  );

  static const Duration connectTimeout = Duration(seconds: 30);
  static const Duration receiveTimeout = Duration(seconds: 30);

  /// GetStorage keys
  static const String storageAuthToken = 'auth_token';
  static const String storageUserJson = 'user_json';
}
