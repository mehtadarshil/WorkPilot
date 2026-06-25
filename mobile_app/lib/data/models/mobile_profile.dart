/// Self-service profile from GET/PATCH `/api/mobile/profile`.
class MobileProfile {
  MobileProfile({
    required this.subjectKind,
    required this.id,
    required this.fullName,
    this.email,
    this.phone,
    this.mobilePhone,
    this.landlinePhone,
    this.department,
    this.rolePosition,
    this.state,
    this.profileAddress,
    this.profileNotes,
    this.nextOfKinName,
    this.nextOfKinPhone,
    this.nextOfKinRelationship,
    this.hasProfilePhoto = false,
    this.signatureDataUrl,
  });

  factory MobileProfile.fromJson(Map<String, dynamic> json) {
    return MobileProfile(
      subjectKind: (json['subject_kind'] as String?) ?? 'officer',
      id: (json['id'] as num?)?.toInt() ?? 0,
      fullName: (json['full_name'] as String?)?.trim() ?? '',
      email: (json['email'] as String?)?.trim(),
      phone: _optStr(json['phone']),
      mobilePhone: _optStr(json['mobile_phone']),
      landlinePhone: _optStr(json['landline_phone']),
      department: _optStr(json['department']),
      rolePosition: _optStr(json['role_position']),
      state: _optStr(json['state']),
      profileAddress: _optStr(json['profile_address']),
      profileNotes: _optStr(json['profile_notes']),
      nextOfKinName: _optStr(json['next_of_kin_name']),
      nextOfKinPhone: _optStr(json['next_of_kin_phone']),
      nextOfKinRelationship: _optStr(json['next_of_kin_relationship']),
      hasProfilePhoto: json['has_profile_photo'] == true,
      signatureDataUrl: _optStr(json['signature_data_url']),
    );
  }

  static String? _optStr(dynamic v) {
    if (v is! String) return null;
    final t = v.trim();
    return t.isEmpty ? null : t;
  }

  final String subjectKind;
  final int id;
  final String fullName;
  final String? email;
  final String? phone;
  final String? mobilePhone;
  final String? landlinePhone;
  final String? department;
  final String? rolePosition;
  final String? state;
  final String? profileAddress;
  final String? profileNotes;
  final String? nextOfKinName;
  final String? nextOfKinPhone;
  final String? nextOfKinRelationship;
  final bool hasProfilePhoto;
  final String? signatureDataUrl;

  bool get isOfficer => subjectKind == 'officer';

  Map<String, dynamic> toPatchBody() {
    return <String, dynamic>{
      'full_name': fullName.trim().isEmpty ? null : fullName.trim(),
      'email': email?.trim().isEmpty == true ? null : email?.trim(),
      'phone': phone,
      'mobile_phone': mobilePhone,
      'landline_phone': landlinePhone,
      'profile_address': profileAddress,
      'profile_notes': profileNotes,
      'next_of_kin_name': nextOfKinName,
      'next_of_kin_phone': nextOfKinPhone,
      'next_of_kin_relationship': nextOfKinRelationship,
      'signature_data_url': signatureDataUrl,
      if (isOfficer) ...<String, dynamic>{
        'department': department,
        'role_position': rolePosition,
      },
    };
  }
}
