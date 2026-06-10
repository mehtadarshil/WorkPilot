import '../../data/models/electrical_certificate_models.dart';

const List<CertificateTypeInfo> certificateTypeCatalog = [
  CertificateTypeInfo(
    slug: 'eic_18e_a3',
    title: 'Electrical Installation Certificate',
    subtitle: 'BS 7671 - 18th Edition Amendment 3',
    shortLabel: 'EIC',
    standard: 'BS 7671',
    revision: '18th Edition Amendment 3',
  ),
  CertificateTypeInfo(
    slug: 'eicr_18e_a3',
    title: 'Electrical Installation Condition Report',
    subtitle: 'BS 7671 - 18th Edition Amendment 3',
    shortLabel: 'EICR',
    standard: 'BS 7671',
    revision: '18th Edition Amendment 3',
  ),
  CertificateTypeInfo(
    slug: 'portable_appliance_test',
    title: 'Portable Appliance Test Certificate',
    subtitle: 'PAT certificate with appliance Pass/Fail results',
    shortLabel: 'PAT',
    standard: 'IET Code of Practice',
  ),
  CertificateTypeInfo(
    slug: 'fi_insp_2025',
    title: 'Fire Alarm Inspection and Servicing Report',
    subtitle: 'BS 5839-1:2025',
    shortLabel: 'FI-INSP',
    standard: 'BS 5839-1',
    revision: '2025',
  ),
  CertificateTypeInfo(
    slug: 'dfi_insp_2019_a1',
    title: 'Domestic Fire Alarm Inspection and Servicing Report',
    subtitle: 'Standard: BS 5839-6 | Revision: 2019:A1',
    shortLabel: 'DFI-INSP',
    standard: 'BS 5839-6',
    revision: '2019:A1',
  ),
  CertificateTypeInfo(
    slug: 'dfi_inst_2019_a1',
    title: 'Domestic Fire Alarm Installation Certificate',
    subtitle: 'Standard: BS 5839-6 | Revision: 2019:A1',
    shortLabel: 'DFI-INST',
    standard: 'BS 5839-6',
    revision: '2019:A1',
  ),
  CertificateTypeInfo(
    slug: 'fi_extinsp_5306',
    title: 'Fire Extinguisher Inspection Certificate',
    subtitle: 'Standard: BS 5306 | Revision: Parts 3, 8, 9',
    shortLabel: 'FI-EXTINSP',
    standard: 'BS 5306',
    revision: 'Parts 3, 8, 9',
  ),
  CertificateTypeInfo(
    slug: 'em_pir_2025',
    title: 'Emergency Lighting - Periodic Inspection Report',
    subtitle: 'Standard: BS 5266-1:2025 | BS EN 50172 / BS 5266-8',
    shortLabel: 'EM-PIR',
    standard: 'BS 5266-1',
    revision: '2025',
  ),
  CertificateTypeInfo(
    slug: 'mwc_18e_a3',
    title: 'Minor Works Certificate',
    subtitle: 'BS 7671 - 18th Edition Amendment 3',
    shortLabel: 'MWC',
    standard: 'BS 7671',
    revision: '18th Edition Amendment 3',
  ),
];

CertificateTypeInfo certificateTypeForSlug(String slug) {
  return certificateTypeCatalog.firstWhere(
    (item) => item.slug == slug,
    orElse: () => certificateTypeCatalog[1],
  );
}
