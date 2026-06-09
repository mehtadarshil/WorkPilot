/// Row from GET `/api/mobile/open-jobs`.
class OpenJobSummary {
  OpenJobSummary({
    required this.id,
    this.jobNumber,
    required this.title,
    this.description,
    required this.state,
    this.priority,
    this.location,
    this.customerFullName,
    this.customerId,
    this.scheduleStart,
    this.durationMinutes,
    this.schedulingNotes,
    this.jobNotes,
    this.dispatchedAt,
    required this.updatedAt,
    this.startDate,
    this.deadline,
  });

  factory OpenJobSummary.fromJson(Map<String, dynamic> json) {
    return OpenJobSummary(
      id: (json['id'] as num).toInt(),
      jobNumber: json['job_number'] as String?,
      title: json['title'] as String? ?? 'Untitled',
      description: json['description'] as String?,
      state: json['state'] as String? ?? '',
      priority: json['priority'] as String?,
      location: json['location'] as String?,
      customerFullName: json['customer_full_name'] as String?,
      customerId: (json['customer_id'] as num?)?.toInt(),
      scheduleStart: json['schedule_start'] as String?,
      durationMinutes: (json['duration_minutes'] as num?)?.toInt(),
      schedulingNotes: json['scheduling_notes'] as String?,
      jobNotes: json['job_notes'] as String?,
      dispatchedAt: json['dispatched_at'] as String?,
      updatedAt: json['updated_at'] as String? ?? '',
      startDate: json['start_date'] as String?,
      deadline: json['deadline'] as String?,
    );
  }

  final int id;
  final String? jobNumber;
  final String title;
  final String? description;
  final String state;
  final String? priority;
  final String? location;
  final String? customerFullName;
  final int? customerId;
  final String? scheduleStart;
  final int? durationMinutes;
  final String? schedulingNotes;
  final String? jobNotes;
  final String? dispatchedAt;
  final String updatedAt;
  final String? startDate;
  final String? deadline;
}
