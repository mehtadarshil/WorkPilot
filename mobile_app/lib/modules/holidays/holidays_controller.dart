import 'package:get/get.dart';

import '../../core/network/api_exception.dart';
import '../../data/repositories/mobile_repository.dart';

class HolidayRequest {
  final int id;
  final int officerId;
  final String? officerName;
  final String startDate;
  final String endDate;
  final bool allDay;
  final String leaveType;
  final String? reason;
  final String status;
  final int? approvedBy;
  final String? approvedByName;
  final String? approvedAt;
  final String? rejectionReason;
  final String? createdAt;
  final num? daysCount;

  HolidayRequest({
    required this.id,
    required this.officerId,
    this.officerName,
    required this.startDate,
    required this.endDate,
    this.allDay = true,
    required this.leaveType,
    this.reason,
    required this.status,
    this.approvedBy,
    this.approvedByName,
    this.approvedAt,
    this.rejectionReason,
    this.createdAt,
    this.daysCount,
  });

  factory HolidayRequest.fromJson(Map<String, dynamic> json) {
    return HolidayRequest(
      id: (json['id'] as num).toInt(),
      officerId: (json['officer_id'] as num).toInt(),
      officerName: json['officer_name'] as String?,
      startDate: json['start_date'] as String? ?? '',
      endDate: json['end_date'] as String? ?? '',
      allDay: json['all_day'] as bool? ?? true,
      leaveType: json['leave_type'] as String? ?? 'annual',
      reason: json['reason'] as String?,
      status: json['status'] as String? ?? 'pending',
      approvedBy: json['approved_by'] as int?,
      approvedByName: json['approved_by_name'] as String?,
      approvedAt: json['approved_at'] as String?,
      rejectionReason: json['rejection_reason'] as String?,
      createdAt: json['created_at'] as String?,
      daysCount: json['days_count'] as num?,
    );
  }
}

class CompanyHoliday {
  final int id;
  final String title;
  final String? description;
  final String holidayDate;
  final bool isRecurring;
  final int? createdBy;
  final String? createdAt;

  CompanyHoliday({
    required this.id,
    required this.title,
    this.description,
    required this.holidayDate,
    required this.isRecurring,
    this.createdBy,
    this.createdAt,
  });

  factory CompanyHoliday.fromJson(Map<String, dynamic> json) {
    return CompanyHoliday(
      id: (json['id'] as num).toInt(),
      title: json['title'] as String? ?? '',
      description: json['description'] as String?,
      holidayDate: json['holiday_date'] as String? ?? '',
      isRecurring: json['is_recurring'] as bool? ?? false,
      createdBy: json['created_by'] as int?,
      createdAt: json['created_at'] as String?,
    );
  }
}

class HolidaysController extends GetxController {
  HolidaysController({MobileRepository? mobile})
      : _mobile = mobile ?? Get.find<MobileRepository>();

  final MobileRepository _mobile;

  final RxList<HolidayRequest> requests = <HolidayRequest>[].obs;
  final RxList<CompanyHoliday> holidays = <CompanyHoliday>[].obs;
  final RxList<Map<String, dynamic>> officers = <Map<String, dynamic>>[].obs;
  final RxBool loading = false.obs;
  final RxString error = ''.obs;
  final RxInt selectedTab = 0.obs; // 0 = requests, 1 = company holidays

  @override
  void onInit() {
    super.onInit();
    fetchData();
  }

  Future<void> fetchData() async {
    loading.value = true;
    error.value = '';
    try {
      final results = await Future.wait([
        _mobile.api.get<Map<String, dynamic>>('/holiday-requests'),
        _mobile.api.get<Map<String, dynamic>>('/holidays'),
      ]);
      final reqData = results[0].data ?? {};
      final holData = results[1].data ?? {};

      final reqList = (reqData['requests'] as List<dynamic>?) ?? [];
      requests.value = reqList
          .map((e) => HolidayRequest.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList();

      final holList = (holData['holidays'] as List<dynamic>?) ?? [];
      holidays.value = holList
          .map((e) => CompanyHoliday.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList();

      try {
        final offRes = await _mobile.api.get<Map<String, dynamic>>('/officers/list');
        final offData = offRes.data ?? {};
        officers.value = List<Map<String, dynamic>>.from(
          (offData['officers'] as List<dynamic>?)?.map((e) => Map<String, dynamic>.from(e as Map)) ?? [],
        );
      } catch (_) {}
    } on ApiException catch (e) {
      error.value = e.message;
    } catch (e) {
      error.value = 'Could not load holidays';
    } finally {
      loading.value = false;
    }
  }

  Future<void> submitRequest({
    int? officerId,
    required String startDate,
    required String endDate,
    bool allDay = true,
    required String leaveType,
    String? reason,
  }) async {
    error.value = '';
    try {
      final payload = <String, dynamic>{
        'start_date': startDate,
        'end_date': endDate,
        'all_day': allDay,
        'leave_type': leaveType,
      };
      if (officerId != null) payload['officer_id'] = officerId;
      if (reason != null && reason.isNotEmpty) payload['reason'] = reason;
      await _mobile.api.post<Map<String, dynamic>>('/holiday-requests', data: payload);
      await fetchData();
    } on ApiException catch (e) {
      error.value = e.message;
    } catch (e) {
      error.value = 'Could not submit request';
    }
  }

  Future<void> updateRequestStatus(int id, String status, {String? rejectionReason}) async {
    error.value = '';
    try {
      final payload = <String, dynamic>{'status': status};
      if (rejectionReason != null) payload['rejection_reason'] = rejectionReason;
      await _mobile.api.patch<Map<String, dynamic>>('/holiday-requests/$id', data: payload);
      await fetchData();
    } on ApiException catch (e) {
      error.value = e.message;
    } catch (e) {
      error.value = 'Could not update request';
    }
  }

  Future<void> addCompanyHoliday({
    required String title,
    required String holidayDate,
    String? description,
    bool isRecurring = false,
  }) async {
    error.value = '';
    try {
      await _mobile.api.post<Map<String, dynamic>>('/holidays', data: {
        'title': title,
        'holiday_date': holidayDate,
        if (description != null && description.isNotEmpty) 'description': description,
        'is_recurring': isRecurring,
      });
      await fetchData();
    } on ApiException catch (e) {
      error.value = e.message;
    } catch (e) {
      error.value = 'Could not add holiday';
    }
  }

  Future<void> deleteCompanyHoliday(int id) async {
    error.value = '';
    try {
      await _mobile.api.delete<Map<String, dynamic>>('/holidays/$id');
      await fetchData();
    } on ApiException catch (e) {
      error.value = e.message;
    } catch (e) {
      error.value = 'Could not delete holiday';
    }
  }
}
