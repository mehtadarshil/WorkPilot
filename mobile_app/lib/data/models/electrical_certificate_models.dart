class CertificateTypeInfo {
  const CertificateTypeInfo({
    required this.slug,
    required this.title,
    required this.subtitle,
    required this.shortLabel,
    this.standard = '',
    this.revision = '',
  });

  final String slug;
  final String title;
  final String subtitle;
  final String shortLabel;
  final String standard;
  final String revision;
}

class ElectricalCertificate {
  ElectricalCertificate({
    required this.id,
    required this.certificateNumber,
    this.jobNumber,
    required this.typeSlug,
    required this.status,
    required this.customerId,
    this.workAddressId,
    this.jobId,
    required this.document,
    this.customerFullName,
    this.installationLabel,
    this.updatedAt,
  });

  factory ElectricalCertificate.fromJson(Map<String, dynamic> json) {
    final cert = json['certificate'];
    final m = cert is Map ? Map<String, dynamic>.from(cert) : json;
    final doc = m['document'];
    return ElectricalCertificate(
      id: (m['id'] as num).toInt(),
      certificateNumber: (m['certificate_number'] as String?) ?? '',
      jobNumber: m['job_number'] as String?,
      typeSlug: (m['type_slug'] as String?) ?? '',
      status: (m['status'] as String?) ?? 'in_progress',
      customerId: (m['customer_id'] as num).toInt(),
      workAddressId: (m['work_address_id'] as num?)?.toInt(),
      jobId: (m['job_id'] as num?)?.toInt(),
      document: doc is Map
          ? Map<String, dynamic>.from(doc)
          : <String, dynamic>{},
      customerFullName: m['customer_full_name'] as String?,
      installationLabel: m['installation_label'] as String?,
      updatedAt: m['updated_at'] as String?,
    );
  }

  final int id;
  final String certificateNumber;
  final String? jobNumber;
  final String typeSlug;
  final String status;
  final int customerId;
  final int? workAddressId;
  final int? jobId;
  final Map<String, dynamic> document;
  final String? customerFullName;
  final String? installationLabel;
  final String? updatedAt;

  bool get isCompleted => status == 'completed';
}

class ValidationIssue {
  ValidationIssue({
    required this.id,
    required this.section,
    required this.label,
    this.field,
    this.boardId,
    this.circuitId,
  });

  factory ValidationIssue.fromJson(Map<String, dynamic> m) {
    return ValidationIssue(
      id: (m['id'] as String?) ?? '',
      section: (m['section'] as String?) ?? '',
      label: (m['label'] as String?) ?? '',
      field: m['field'] as String?,
      boardId: m['boardId'] as String?,
      circuitId: m['circuitId'] as String?,
    );
  }

  final String id;
  final String section;
  final String label;
  final String? field;
  final String? boardId;
  final String? circuitId;
}

class JobLinkedCertificateSummary {
  JobLinkedCertificateSummary({
    required this.id,
    required this.certificateNumber,
    required this.typeSlug,
    required this.status,
    this.updatedAt,
  });

  factory JobLinkedCertificateSummary.fromJson(Map<String, dynamic> m) {
    return JobLinkedCertificateSummary(
      id: (m['id'] as num).toInt(),
      certificateNumber: (m['certificate_number'] as String?) ?? '',
      typeSlug: (m['type_slug'] as String?) ?? '',
      status: (m['status'] as String?) ?? '',
      updatedAt: m['updated_at'] as String?,
    );
  }

  final int id;
  final String certificateNumber;
  final String typeSlug;
  final String status;
  final String? updatedAt;
}

class JobLinkedSiteReportSummary {
  JobLinkedSiteReportSummary({
    required this.id,
    this.reportTitle,
    this.certificateNumber,
    this.templateId,
    this.templateName,
    this.updatedAt,
  });

  factory JobLinkedSiteReportSummary.fromJson(Map<String, dynamic> m) {
    return JobLinkedSiteReportSummary(
      id: (m['id'] as num).toInt(),
      reportTitle: m['report_title'] as String?,
      certificateNumber: m['certificate_number'] as String?,
      templateId: (m['template_id'] as num?)?.toInt(),
      templateName: m['template_name'] as String?,
      updatedAt: m['updated_at'] as String?,
    );
  }

  final int id;
  final String? reportTitle;
  final String? certificateNumber;
  final int? templateId;
  final String? templateName;
  final String? updatedAt;
}

class JobCompletionDocuments {
  JobCompletionDocuments({
    required this.jobId,
    this.customerId,
    this.workAddressId,
    this.jobTitle,
    this.jobNumber,
    this.certificates = const [],
    this.siteReports = const [],
  });

  factory JobCompletionDocuments.fromJson(Map<String, dynamic> json) {
    final job = json['job'];
    final jm = job is Map
        ? Map<String, dynamic>.from(job)
        : <String, dynamic>{};
    final certsRaw = json['certificates'];
    final reportsRaw = json['site_reports'];
    return JobCompletionDocuments(
      jobId: (jm['id'] as num?)?.toInt() ?? 0,
      customerId: (jm['customer_id'] as num?)?.toInt(),
      workAddressId: (jm['work_address_id'] as num?)?.toInt(),
      jobTitle: jm['title'] as String?,
      jobNumber: jm['job_number'] as String?,
      certificates: certsRaw is List
          ? certsRaw
                .whereType<Map>()
                .map(
                  (e) => JobLinkedCertificateSummary.fromJson(
                    Map<String, dynamic>.from(e),
                  ),
                )
                .toList()
          : const [],
      siteReports: reportsRaw is List
          ? reportsRaw
                .whereType<Map>()
                .map(
                  (e) => JobLinkedSiteReportSummary.fromJson(
                    Map<String, dynamic>.from(e),
                  ),
                )
                .toList()
          : const [],
    );
  }

  final int jobId;
  final int? customerId;
  final int? workAddressId;
  final String? jobTitle;
  final String? jobNumber;
  final List<JobLinkedCertificateSummary> certificates;
  final List<JobLinkedSiteReportSummary> siteReports;
}
