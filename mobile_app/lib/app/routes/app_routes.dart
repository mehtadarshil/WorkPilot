/// Route path constants (use with Get.toNamed, offNamed, etc.).
abstract class AppRoutes {
  AppRoutes._();

  static const String login = '/login';
  static const String home = '/home';
  static const String timesheetHistory = '/timesheet-history';
  static const String openJobs = '/open-jobs';
  static const String openJobDetail = '/open-job-detail';
  static const String diaryEventDetail = '/diary-event-detail';
  static const String diaryJobReport = '/diary-job-report';
  static const String diaryJobReportHistory = '/diary-job-report-history';
  static const String crmList = '/crm-list';
  static const String customersList = '/customers';
  static const String customerDetail = '/customers/detail';
  static const String customerForm = '/customers/form';
  static const String customerNewJob = '/customers/job-new';
  static const String customerWorkAddressForm = '/customers/work-address-form';
  static const String customerNewInvoice = '/customers/invoice-new';
  static const String customerAssetForm = '/customers/asset-form';
}
