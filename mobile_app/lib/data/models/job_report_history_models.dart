import 'diary_extra_submission.dart';

class JobReportHistoryAnswer {
  JobReportHistoryAnswer({
    required this.questionId,
    required this.prompt,
    required this.questionType,
    required this.value,
    this.helperText,
  });

  factory JobReportHistoryAnswer.fromJson(Map<String, dynamic> m) {
    final rawHelp = m['helper_text'];
    final help = rawHelp is String && rawHelp.trim().isNotEmpty ? rawHelp.trim() : null;
    return JobReportHistoryAnswer(
      questionId: (m['question_id'] as num).toInt(),
      prompt: (m['prompt'] as String?)?.trim().isNotEmpty == true
          ? (m['prompt'] as String).trim()
          : 'Question',
      questionType: (m['question_type'] as String?)?.trim().isNotEmpty == true
          ? (m['question_type'] as String).trim()
          : 'text',
      value: m['value'] is String ? m['value'] as String : '${m['value'] ?? ''}',
      helperText: help,
    );
  }

  final int questionId;
  final String prompt;
  final String questionType;
  final String value;
  final String? helperText;
}

class JobReportHistorySubmission {
  JobReportHistorySubmission({
    required this.diaryEventId,
    required this.startTimeIso,
    this.officerFullName,
    required this.answers,
    this.extraSubmissions = const [],
  });

  factory JobReportHistorySubmission.fromJson(Map<String, dynamic> m) {
    final raw = m['answers'];
    final answers = <JobReportHistoryAnswer>[];
    if (raw is List) {
      for (final e in raw) {
        if (e is Map<String, dynamic>) {
          answers.add(JobReportHistoryAnswer.fromJson(e));
        }
      }
    }
    final rawExtras = m['extra_submissions'];
    final extras = <DiaryExtraSubmission>[];
    if (rawExtras is List) {
      for (final e in rawExtras) {
        if (e is Map<String, dynamic>) {
          extras.add(DiaryExtraSubmission.fromJson(e));
        }
      }
    }
    return JobReportHistorySubmission(
      diaryEventId: (m['diary_event_id'] as num).toInt(),
      startTimeIso: m['start_time'] as String? ?? '',
      officerFullName: (m['officer_full_name'] as String?)?.trim(),
      answers: answers,
      extraSubmissions: extras,
    );
  }

  final int diaryEventId;
  final String startTimeIso;
  final String? officerFullName;
  final List<JobReportHistoryAnswer> answers;
  final List<DiaryExtraSubmission> extraSubmissions;
}
