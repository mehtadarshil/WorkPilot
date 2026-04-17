class ActiveTimesheet {
  ActiveTimesheet({
    required this.id,
    required this.clockInIso,
    this.notes,
  });

  factory ActiveTimesheet.fromJson(Map<String, dynamic> json) {
    return ActiveTimesheet(
      id: (json['id'] as num).toInt(),
      clockInIso: json['clock_in'] as String,
      notes: json['notes'] as String?,
    );
  }

  final int id;
  final String clockInIso;
  final String? notes;

  DateTime get clockInUtc => DateTime.parse(clockInIso).toUtc();
}
