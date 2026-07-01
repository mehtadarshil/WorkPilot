class JobCompletionSibling {
  JobCompletionSibling({
    required this.diaryEventId,
    this.officerFullName,
    this.visitStatus,
    this.nextJobState,
    required this.jobReportSubmitted,
    required this.isCurrentVisit,
    required this.visitIsOpen,
  });

  factory JobCompletionSibling.fromJson(Map<String, dynamic> json) {
    return JobCompletionSibling(
      diaryEventId: (json['diary_event_id'] as num).toInt(),
      officerFullName: json['officer_full_name'] as String?,
      visitStatus: json['visit_status'] as String?,
      nextJobState: json['next_job_state'] as String?,
      jobReportSubmitted: json['job_report_submitted'] == true,
      isCurrentVisit: json['is_current_visit'] == true,
      visitIsOpen: json['visit_is_open'] == true,
    );
  }

  final int diaryEventId;
  final String? officerFullName;
  final String? visitStatus;
  final String? nextJobState;
  final bool jobReportSubmitted;
  final bool isCurrentVisit;
  final bool visitIsOpen;
}

class FinishedSiblingChoice {
  FinishedSiblingChoice({
    this.officerFullName,
    this.nextJobState,
  });

  factory FinishedSiblingChoice.fromJson(Map<String, dynamic> json) {
    return FinishedSiblingChoice(
      officerFullName: json['officer_full_name'] as String?,
      nextJobState: json['next_job_state'] as String?,
    );
  }

  final String? officerFullName;
  final String? nextJobState;
}

class JobCompletionContext {
  JobCompletionContext({
    required this.hasMultipleEngineers,
    required this.openVisitCount,
    required this.siblings,
    required this.hasStageConflict,
    required this.distinctChosenStates,
    this.currentJobState,
    required this.isLastEngineerToComplete,
    required this.finishedSiblingChoices,
  });

  factory JobCompletionContext.fromJson(Map<String, dynamic>? json) {
    if (json == null) {
      return JobCompletionContext.empty();
    }
    final raw = json['siblings'];
    final siblings = <JobCompletionSibling>[];
    if (raw is List) {
      for (final e in raw) {
        if (e is Map) {
          siblings.add(
            JobCompletionSibling.fromJson(Map<String, dynamic>.from(e)),
          );
        }
      }
    }
    final statesRaw = json['distinct_chosen_states'];
    final states = <String>[];
    if (statesRaw is List) {
      for (final s in statesRaw) {
        if (s != null && s.toString().trim().isNotEmpty) {
          states.add(s.toString().trim());
        }
      }
    }
    final finishedRaw = json['finished_sibling_choices'];
    final finished = <FinishedSiblingChoice>[];
    if (finishedRaw is List) {
      for (final e in finishedRaw) {
        if (e is Map) {
          finished.add(
            FinishedSiblingChoice.fromJson(Map<String, dynamic>.from(e)),
          );
        }
      }
    }
    return JobCompletionContext(
      hasMultipleEngineers: json['has_multiple_engineers'] == true,
      openVisitCount: (json['open_visit_count'] as num?)?.toInt() ?? 0,
      siblings: siblings,
      hasStageConflict: json['has_stage_conflict'] == true,
      distinctChosenStates: states,
      currentJobState: json['current_job_state'] as String?,
      isLastEngineerToComplete: json['is_last_engineer_to_complete'] == true,
      finishedSiblingChoices: finished,
    );
  }

  factory JobCompletionContext.empty() {
    return JobCompletionContext(
      hasMultipleEngineers: false,
      openVisitCount: 0,
      siblings: const [],
      hasStageConflict: false,
      distinctChosenStates: const [],
      isLastEngineerToComplete: false,
      finishedSiblingChoices: const [],
    );
  }

  final bool hasMultipleEngineers;
  final int openVisitCount;
  final List<JobCompletionSibling> siblings;
  final bool hasStageConflict;
  final List<String> distinctChosenStates;
  final String? currentJobState;
  final bool isLastEngineerToComplete;
  final List<FinishedSiblingChoice> finishedSiblingChoices;

  List<JobCompletionSibling> get otherOpenSiblings => siblings
      .where((s) => !s.isCurrentVisit && s.visitIsOpen)
      .toList();

  List<JobCompletionSibling> get otherSiblingsWithStageChoice => siblings
      .where(
        (s) =>
            !s.isCurrentVisit &&
            s.nextJobState != null &&
            s.nextJobState!.trim().isNotEmpty,
      )
      .toList();
}
