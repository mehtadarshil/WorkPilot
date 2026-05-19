import 'package:get/get.dart';

import '../../modules/home/bindings/home_binding.dart';
import '../../modules/home/views/home_view.dart';
import '../../modules/login/bindings/login_binding.dart';
import '../../modules/login/views/login_view.dart';
import '../../modules/diary_event/diary_event_detail_binding.dart';
import '../../modules/diary_event/diary_event_detail_view.dart';
import '../../modules/diary_event/job_report_history_binding.dart';
import '../../modules/diary_event/job_report_history_view.dart';
import '../../modules/job_report/job_report_binding.dart';
import '../../modules/job_report/job_report_view.dart';
import '../../modules/open_jobs/open_job_detail_view.dart';
import '../../modules/open_jobs/open_jobs_binding.dart';
import '../../modules/open_jobs/open_jobs_view.dart';
import '../../modules/timesheet/timesheet_history_binding.dart';
import '../../modules/timesheet/timesheet_history_view.dart';
import '../../modules/crm/crm_list_binding.dart';
import '../../modules/crm/crm_list_view.dart';
import '../../modules/jobs/job_detail_binding.dart';
import '../../modules/jobs/job_detail_view.dart';
import '../../modules/quotations/quotation_detail_page.dart';
import '../../modules/quotations/quotation_form_page.dart';
import '../../modules/quotations/quotations_list_binding.dart';
import '../../modules/quotations/quotations_list_view.dart';
import '../../modules/invoices/invoice_detail_page.dart';
import '../../modules/invoices/invoice_form_page.dart';
import '../../modules/invoices/invoices_list_binding.dart';
import '../../modules/invoices/invoices_list_view.dart';
import '../../modules/customers/customer_detail_binding.dart';
import '../../modules/customers/customer_detail_view.dart';
import '../../modules/customers/customer_form_binding.dart';
import '../../modules/customers/customer_form_view.dart';
import '../../modules/customers/customer_new_job_binding.dart';
import '../../modules/customers/customer_new_job_view.dart';
import '../../modules/customers/customer_asset_form_binding.dart';
import '../../modules/customers/customer_asset_form_view.dart';
import '../../modules/customers/customer_new_invoice_binding.dart';
import '../../modules/customers/customer_new_invoice_view.dart';
import '../../modules/customers/customer_work_address_form_binding.dart';
import '../../modules/customers/customer_work_address_form_view.dart';
import '../../modules/customers/customers_list_binding.dart';
import '../../modules/customers/customers_list_view.dart';
import '../../modules/profile/id_card_binding.dart';
import '../../modules/profile/id_card_view.dart';
import '../../modules/profile/profile_edit_binding.dart';
import '../../modules/profile/profile_edit_view.dart';
import 'app_routes.dart';

class AppPages {
  AppPages._();

  static final List<GetPage<dynamic>> routes = <GetPage<dynamic>>[
    GetPage<void>(
      name: AppRoutes.login,
      page: () => const LoginView(),
      binding: LoginBinding(),
    ),
    GetPage<void>(
      name: AppRoutes.home,
      page: () => const HomeView(),
      binding: HomeBinding(),
    ),
    GetPage<void>(
      name: AppRoutes.profileEdit,
      page: () => const ProfileEditView(),
      binding: ProfileEditBinding(),
    ),
    GetPage<void>(
      name: AppRoutes.idCard,
      page: () => const IdCardView(),
      binding: IdCardBinding(),
    ),
    GetPage<void>(
      name: AppRoutes.timesheetHistory,
      page: () => const TimesheetHistoryView(),
      binding: TimesheetHistoryBinding(),
    ),
    GetPage<void>(
      name: AppRoutes.openJobs,
      page: () => const OpenJobsView(),
      binding: OpenJobsBinding(),
    ),
    GetPage<void>(
      name: AppRoutes.openJobDetail,
      page: () => const OpenJobDetailPage(),
    ),
    GetPage<void>(
      name: AppRoutes.diaryEventDetail,
      page: () => const DiaryEventDetailView(),
      binding: DiaryEventDetailBinding(),
    ),
    GetPage<void>(
      name: AppRoutes.diaryJobReport,
      page: () => const JobReportView(),
      binding: JobReportBinding(),
    ),
    GetPage<void>(
      name: AppRoutes.diaryJobReportHistory,
      page: () => const JobReportHistoryView(),
      binding: JobReportHistoryBinding(),
    ),
    GetPage<void>(
      name: AppRoutes.crmList,
      page: () => const CrmListView(),
      binding: CrmListBinding(),
    ),
    GetPage<void>(
      name: AppRoutes.jobDetail,
      page: () => JobDetailView(),
      binding: JobDetailBinding(),
    ),
    GetPage<void>(
      name: AppRoutes.quotations,
      page: () => const QuotationsListView(),
      binding: QuotationsListBinding(),
    ),
    GetPage<void>(
      name: AppRoutes.quotationDetail,
      page: () => const QuotationDetailPage(),
    ),
    GetPage<void>(
      name: AppRoutes.quotationForm,
      page: () => const QuotationFormPage(),
    ),
    GetPage<void>(
      name: AppRoutes.invoices,
      page: () => const InvoicesListView(),
      binding: InvoicesListBinding(),
    ),
    GetPage<void>(
      name: AppRoutes.invoiceDetail,
      page: () => const InvoiceDetailPage(),
    ),
    GetPage<void>(
      name: AppRoutes.invoiceForm,
      page: () => const InvoiceFormPage(),
    ),
    GetPage<void>(
      name: AppRoutes.customersList,
      page: () => const CustomersListView(),
      binding: CustomersListBinding(),
    ),
    GetPage<void>(
      name: AppRoutes.customerDetail,
      page: () => const CustomerDetailView(),
      binding: CustomerDetailBinding(),
    ),
    GetPage<void>(
      name: AppRoutes.customerForm,
      page: () => const CustomerFormView(),
      binding: CustomerFormBinding(),
    ),
    GetPage<void>(
      name: AppRoutes.customerNewJob,
      page: () => const CustomerNewJobView(),
      binding: CustomerNewJobBinding(),
    ),
    GetPage<void>(
      name: AppRoutes.customerWorkAddressForm,
      page: () => const CustomerWorkAddressFormView(),
      binding: CustomerWorkAddressFormBinding(),
    ),
    GetPage<void>(
      name: AppRoutes.customerNewInvoice,
      page: () => const CustomerNewInvoiceView(),
      binding: CustomerNewInvoiceBinding(),
    ),
    GetPage<void>(
      name: AppRoutes.customerAssetForm,
      page: () => const CustomerAssetFormView(),
      binding: CustomerAssetFormBinding(),
    ),
  ];
}
