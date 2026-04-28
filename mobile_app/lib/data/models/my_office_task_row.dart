import 'open_job_summary.dart';

/// Open or completed office task assigned to the signed-in officer (from `/api/mobile/home`).
class MyOfficeTaskRow {
  MyOfficeTaskRow({
    required this.id,
    required this.jobId,
    required this.description,
    required this.createdByName,
    required this.jobTitle,
    required this.jobState,
    required this.jobUpdatedAt,
    required this.createdAt,
    this.completedAt,
  });

  factory MyOfficeTaskRow.fromJson(Map<String, dynamic> json) {
    return MyOfficeTaskRow(
      id: (json['id'] as num).toInt(),
      jobId: (json['job_id'] as num).toInt(),
      description: json['description'] as String? ?? '',
      createdByName: json['created_by_name'] as String? ?? 'System',
      jobTitle: json['job_title'] as String? ?? 'Job',
      jobState: json['job_state'] as String? ?? '',
      jobUpdatedAt: json['job_updated_at'] as String? ?? '',
      createdAt: json['created_at'] as String? ?? '',
      completedAt: json['completed_at'] as String?,
    );
  }

  final int id;
  final int jobId;
  final String description;
  final String createdByName;
  final String jobTitle;
  final String jobState;
  final String jobUpdatedAt;
  final String createdAt;
  final String? completedAt;

  OpenJobSummary toOpenJobSummary() {
    return OpenJobSummary(
      id: jobId,
      title: jobTitle,
      state: jobState,
      updatedAt: jobUpdatedAt.isNotEmpty
          ? jobUpdatedAt
          : DateTime.now().toUtc().toIso8601String(),
    );
  }
}
