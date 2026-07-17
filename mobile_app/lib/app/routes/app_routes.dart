/// Route path constants (use with Get.toNamed, offNamed, etc.).
abstract class AppRoutes {
  AppRoutes._();

  static const String login = '/login';
  static const String biometricLock = '/biometric-lock';
  static const String home = '/home';
  static const String timesheetHistory = '/timesheet-history';
  static const String openJobs = '/open-jobs';
  static const String openJobDetail = '/open-job-detail';
  static const String diaryEventDetail = '/diary-event-detail';
  static const String diaryJobReport = '/diary-job-report';
  static const String diaryJobReportHistory = '/diary-job-report-history';
  static const String crmList = '/crm-list';
  static const String jobDetail = '/jobs/detail';
  static const String editJob = '/jobs/edit';
  static const String quotations = '/quotations';
  static const String quotationDetail = '/quotations/detail';
  static const String quotationForm = '/quotations/form';
  static const String quotationVisitDetail = '/quotation-visits/detail';
  static const String invoices = '/invoices';
  static const String invoiceDetail = '/invoices/detail';
  static const String invoiceForm = '/invoices/form';
  static const String customersList = '/customers';
  static const String customerDetail = '/customers/detail';
  static const String customerForm = '/customers/form';
  static const String customerNewJob = '/customers/job-new';
  static const String customerWorkAddressForm = '/customers/work-address-form';
  static const String customerNewInvoice = '/customers/invoice-new';
  static const String customerAssetForm = '/customers/asset-form';
  static const String settings = '/settings';
  static const String sitesList = '/sites';
  static const String siteReportsList = '/site-reports';
  static const String siteReportEditor = '/site-reports/editor';
  static const String certificateTypePicker = '/certificates/picker';
  static const String certificateEditor = '/certificates/editor';
  static const String profileEdit = '/profile/edit';
  static const String idCard = '/profile/id-card';
  static const String holidays = '/holidays';
  static const String stockTools = '/stock-tools';
  static const String todos = '/todos';
  static const String docuCenter = '/docu-center';
  static const String calendarSync = '/calendar-sync';
}
