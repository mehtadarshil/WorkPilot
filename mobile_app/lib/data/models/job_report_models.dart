import 'job_completion_context.dart';

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
    this.customerId,
    this.workAddressId,
    this.jobNumber,
    this.jobTitle,
    this.customerFullName,
    this.isQuotationVisit = false,
    required this.questions,
    required this.answersByQuestionId,
    JobCompletionContext? jobCompletionContext,
  }) : jobCompletionContext = jobCompletionContext ?? JobCompletionContext.empty();

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
      customerId: (json['customer_id'] as num?)?.toInt(),
      workAddressId: (json['work_address_id'] as num?)?.toInt(),
      jobNumber: json['job_number'] as String?,
      jobTitle: json['job_title'] as String?,
      customerFullName: json['customer_full_name'] as String?,
      isQuotationVisit: json['is_quotation_visit'] == true,
      questions: questions,
      answersByQuestionId: answers,
      jobCompletionContext: JobCompletionContext.fromJson(
        json['job_completion_context'] is Map
            ? Map<String, dynamic>.from(json['job_completion_context'] as Map)
            : null,
      ),
    );
  }

  final int diaryEventId;
  final int jobId;
  final String? eventStatus;
  final int? customerId;
  final int? workAddressId;
  final String? jobNumber;
  final String? jobTitle;
  final String? customerFullName;
  final bool isQuotationVisit;
  final List<JobReportQuestion> questions;
  final Map<int, String> answersByQuestionId;
  final JobCompletionContext jobCompletionContext;
}
