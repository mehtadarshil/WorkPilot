import 'package:get/get.dart';

import '../../modules/home/bindings/home_binding.dart';
import '../../modules/home/views/home_view.dart';
import '../../modules/login/bindings/login_binding.dart';
import '../../modules/login/views/login_view.dart';
import '../../modules/open_jobs/open_job_detail_view.dart';
import '../../modules/open_jobs/open_jobs_binding.dart';
import '../../modules/open_jobs/open_jobs_view.dart';
import '../../modules/timesheet/timesheet_history_binding.dart';
import '../../modules/timesheet/timesheet_history_view.dart';
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
  ];
}
