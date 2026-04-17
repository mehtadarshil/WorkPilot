class TimesheetHistoryEntry {
  TimesheetHistoryEntry({
    required this.id,
    required this.officerId,
    required this.clockInIso,
    this.clockOutIso,
    this.notes,
    required this.durationSeconds,
  });

  factory TimesheetHistoryEntry.fromJson(Map<String, dynamic> json) {
    return TimesheetHistoryEntry(
      id: (json['id'] as num).toInt(),
      officerId: (json['officer_id'] as num).toInt(),
      clockInIso: json['clock_in'] as String,
      clockOutIso: json['clock_out'] as String?,
      notes: json['notes'] as String?,
      durationSeconds: (json['duration_seconds'] as num?)?.toInt() ?? 0,
    );
  }

  final int id;
  final int officerId;
  final String clockInIso;
  final String? clockOutIso;
  final String? notes;
  final int durationSeconds;

  DateTime? get clockIn => DateTime.tryParse(clockInIso);
  DateTime? get clockOut =>
      clockOutIso != null ? DateTime.tryParse(clockOutIso!) : null;

  bool get isOpen => clockOutIso == null;
}
