class JobReportQuestion {
  JobReportQuestion({
    required this.id,
    required this.questionType,
    required this.prompt,
    this.helperText,
    required this.required,
  });

  factory JobReportQuestion.fromJson(Map<String, dynamic> m) {
    return JobReportQuestion(
      id: (m['id'] as num).toInt(),
      questionType: (m['question_type'] as String?)?.trim() ?? 'text',
      prompt: (m['prompt'] as String?)?.trim().isNotEmpty == true
          ? (m['prompt'] as String).trim()
          : 'Question',
      helperText: (m['helper_text'] as String?)?.trim(),
      required: m['required'] != false,
    );
  }

  final int id;
  final String questionType;
  final String prompt;
  final String? helperText;
  final bool required;
}

class JobReportBundle {
  JobReportBundle({
    required this.diaryEventId,
    required this.jobId,
    this.eventStatus,
    required this.questions,
    required this.answersByQuestionId,
  });

  factory JobReportBundle.fromJson(Map<String, dynamic> json) {
    final qraw = json['questions'];
    final questions = <JobReportQuestion>[];
    if (qraw is List) {
      for (final e in qraw) {
        if (e is Map<String, dynamic>) {
          questions.add(JobReportQuestion.fromJson(Map<String, dynamic>.from(e)));
        }
      }
    }
    final answers = <int, String>{};
    final araw = json['answers'];
    if (araw is Map) {
      araw.forEach((k, v) {
        final id = int.tryParse(k.toString());
        if (id != null && v != null) {
          answers[id] = v.toString();
        }
      });
    }
    return JobReportBundle(
      diaryEventId: (json['diary_event_id'] as num?)?.toInt() ?? 0,
      jobId: (json['job_id'] as num?)?.toInt() ?? 0,
      eventStatus: json['event_status'] as String?,
      questions: questions,
      answersByQuestionId: answers,
    );
  }

  final int diaryEventId;
  final int jobId;
  final String? eventStatus;
  final List<JobReportQuestion> questions;
  final Map<int, String> answersByQuestionId;
}
