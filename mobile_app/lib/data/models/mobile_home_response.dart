import 'active_timesheet.dart';
import 'diary_event_row.dart';
import 'my_office_task_row.dart';
import 'officer_profile.dart';

class HomeStats {
  HomeStats({required this.assignedJobsOpen, required this.diaryUpcomingWeek});

  factory HomeStats.fromJson(Map<String, dynamic>? json) {
    if (json == null) {
      return HomeStats(assignedJobsOpen: 0, diaryUpcomingWeek: 0);
    }
    return HomeStats(
      assignedJobsOpen: (json['assigned_jobs_open'] as num?)?.toInt() ?? 0,
      diaryUpcomingWeek: (json['diary_upcoming_week'] as num?)?.toInt() ?? 0,
    );
  }

  final int assignedJobsOpen;
  final int diaryUpcomingWeek;
}

class MobileHomeResponse {
  MobileHomeResponse({
    required this.officerFeatures,
    required this.role,
    this.email,
    this.profile,
    required this.stats,
    required this.upcomingDiary,
    this.nextDiaryEvent,
    this.activeTimesheet,
    this.myOfficeTasksOpen = const [],
    this.myOfficeTasksCompleted = const [],
  });

  factory MobileHomeResponse.fromJson(Map<String, dynamic> json) {
    final upcoming = json['upcoming_diary'];
    final list = <DiaryEventRow>[];
    if (upcoming is List) {
      for (final e in upcoming) {
        if (e is Map<String, dynamic>) {
          list.add(DiaryEventRow.fromJson(e));
        }
      }
    }

    DiaryEventRow? next;
    final rawNext = json['next_diary_event'];
    if (rawNext is Map<String, dynamic>) {
      next = DiaryEventRow.fromJson(rawNext);
    }

    OfficerProfile? profile;
    final rawProfile = json['profile'];
    if (rawProfile is Map<String, dynamic>) {
      profile = OfficerProfile.fromJson(rawProfile);
    }

    ActiveTimesheet? active;
    final rawActive = json['active_timesheet'];
    if (rawActive is Map<String, dynamic>) {
      active = ActiveTimesheet.fromJson(rawActive);
    }

    final openRaw = json['my_office_tasks_open'];
    final openList = <MyOfficeTaskRow>[];
    if (openRaw is List) {
      for (final e in openRaw) {
        if (e is Map<String, dynamic>) {
          openList.add(MyOfficeTaskRow.fromJson(e));
        }
      }
    }
    final doneRaw = json['my_office_tasks_completed'];
    final doneList = <MyOfficeTaskRow>[];
    if (doneRaw is List) {
      for (final e in doneRaw) {
        if (e is Map<String, dynamic>) {
          doneList.add(MyOfficeTaskRow.fromJson(e));
        }
      }
    }

    return MobileHomeResponse(
      officerFeatures: json['officer_features'] as bool? ?? false,
      role: json['role'] as String? ?? '',
      email: json['email'] as String?,
      profile: profile,
      stats: HomeStats.fromJson(json['stats'] as Map<String, dynamic>?),
      upcomingDiary: list,
      nextDiaryEvent: next ?? (list.isNotEmpty ? list.first : null),
      activeTimesheet: active,
      myOfficeTasksOpen: openList,
      myOfficeTasksCompleted: doneList,
    );
  }

  final bool officerFeatures;
  final String role;
  final String? email;
  final OfficerProfile? profile;
  final HomeStats stats;
  final List<DiaryEventRow> upcomingDiary;
  final DiaryEventRow? nextDiaryEvent;
  final ActiveTimesheet? activeTimesheet;
  final List<MyOfficeTaskRow> myOfficeTasksOpen;
  final List<MyOfficeTaskRow> myOfficeTasksCompleted;

  MobileHomeResponse copyWith({
    List<MyOfficeTaskRow>? myOfficeTasksOpen,
    List<MyOfficeTaskRow>? myOfficeTasksCompleted,
  }) {
    return MobileHomeResponse(
      officerFeatures: officerFeatures,
      role: role,
      email: email,
      profile: profile,
      stats: stats,
      upcomingDiary: upcomingDiary,
      nextDiaryEvent: nextDiaryEvent,
      activeTimesheet: activeTimesheet,
      myOfficeTasksOpen: myOfficeTasksOpen ?? this.myOfficeTasksOpen,
      myOfficeTasksCompleted: myOfficeTasksCompleted ?? this.myOfficeTasksCompleted,
    );
  }
}
