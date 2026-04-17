class OfficerProfile {
  OfficerProfile({
    required this.id,
    required this.fullName,
    this.email,
    this.phone,
    this.department,
    this.rolePosition,
    this.state,
  });

  factory OfficerProfile.fromJson(Map<String, dynamic> json) {
    return OfficerProfile(
      id: json['id'] as int,
      fullName: json['full_name'] as String? ?? '',
      email: json['email'] as String?,
      phone: json['phone'] as String?,
      department: json['department'] as String?,
      rolePosition: json['role_position'] as String?,
      state: json['state'] as String?,
    );
  }

  final int id;
  final String fullName;
  final String? email;
  final String? phone;
  final String? department;
  final String? rolePosition;
  final String? state;
}
