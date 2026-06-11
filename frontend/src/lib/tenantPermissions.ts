/** Keep in sync with backend/src/tenantPermissions.ts */
export const TENANT_PERMISSION_KEYS = [
  'customers',
  'jobs',
  'quotations',
  'invoices',
  'scheduling',
  'certifications',
  'parts_catalog',
  'field_users',
  'settings_company',
  'settings_invoice',
  'settings_quotation',
  'settings_email',
  'settings_service_reminders',
  'settings_customer_types',
  'settings_price_books',
  'settings_job_descriptions',
  'settings_job_report_template',
  'settings_site_report_templates',
  'settings_diary_abort_reasons',
  'settings_business_units',
  'settings_user_groups',
  'settings_users',
  'settings_import',
  'settings_master_data',
] as const;

export type TenantPermissionKey = (typeof TENANT_PERMISSION_KEYS)[number];

export type TenantPermissionsMap = Record<TenantPermissionKey, boolean>;

export function emptyPermissions(): TenantPermissionsMap {
  const o = {} as TenantPermissionsMap;
  for (const k of TENANT_PERMISSION_KEYS) o[k] = false;
  return o;
}

export function normalizePermissions(p?: Partial<Record<TenantPermissionKey, boolean>> | null): TenantPermissionsMap {
  const o = emptyPermissions();
  if (p) {
    for (const k of TENANT_PERMISSION_KEYS) o[k] = p[k] === true;
  }
  if (o.customers && o.jobs && o.quotations && o.invoices && o.scheduling) {
    o.certifications = true;
  }
  return o;
}

export function presetManagerPermissions(): TenantPermissionsMap {
  const o = emptyPermissions();
  for (const k of TENANT_PERMISSION_KEYS) o[k] = true;
  return o;
}

export function presetDeskOfficerPermissions(): TenantPermissionsMap {
  const o = emptyPermissions();
  o.customers = true;
  o.jobs = true;
  o.scheduling = true;
  return o;
}

export function presetFieldOfficerPermissions(): TenantPermissionsMap {
  const o = emptyPermissions();
  o.jobs = true;
  o.scheduling = true;
  return o;
}

/** Keys that can affect the field mobile app (diary, jobs, job context). Web-only flags are hidden for field-only accounts. */
export const FIELD_MOBILE_PERMISSION_KEYS: readonly TenantPermissionKey[] = [
  'jobs',
  'scheduling',
  'customers',
  'quotations',
  'invoices',
] as const;

/** For field-only (or linked officer) rows: only mobile-relevant flags are stored; web-only keys are forced off. */
export function stripToFieldMobilePermissions(p: TenantPermissionsMap): TenantPermissionsMap {
  const o = emptyPermissions();
  for (const k of FIELD_MOBILE_PERMISSION_KEYS) {
    o[k] = p[k] === true;
  }
  return o;
}

/** Grouped for dashboard/staff permission editor (web CRM; mobile uses a subset on linked field profiles). */
export const PERMISSION_UI_GROUPS: readonly {
  id: string;
  title: string;
  description: string;
  keys: readonly TenantPermissionKey[];
}[] = [
  {
    id: 'pipeline',
    title: 'Pipeline & visits',
    description: 'Customers, jobs, quotes, invoices, and the schedule/diary in the browser.',
    keys: ['customers', 'jobs', 'quotations', 'invoices', 'scheduling'],
  },
  {
    id: 'compliance',
    title: 'Certificates & compliance',
    description: 'Electrical certificates, site reports, and staff certification compliance.',
    keys: ['certifications'],
  },
  {
    id: 'admin',
    title: 'Team & settings',
    description: 'Manage other users and each Settings tab separately.',
    keys: [
      'field_users',
      'settings_company',
      'settings_invoice',
      'settings_quotation',
      'settings_email',
      'settings_service_reminders',
      'settings_customer_types',
      'settings_price_books',
      'settings_job_descriptions',
      'settings_job_report_template',
      'settings_site_report_templates',
      'settings_diary_abort_reasons',
      'settings_business_units',
      'settings_user_groups',
      'settings_users',
      'settings_import',
      'settings_master_data',
    ],
  },
] as const;

export const PERMISSION_LABELS: Record<TenantPermissionKey, string> = {
  customers: 'Customers & sites',
  jobs: 'Jobs & service work',
  quotations: 'Quotations & proposals',
  invoices: 'Invoices & payments',
  scheduling: 'Diary & dispatch',
  certifications: 'Certificates & reports',
  parts_catalog: 'Parts & kits catalog',
  field_users: 'Field team & assignments',
  settings_company: 'Settings: Company',
  settings_invoice: 'Settings: Invoice',
  settings_quotation: 'Settings: Quotation',
  settings_email: 'Settings: Email',
  settings_service_reminders: 'Settings: Service reminders',
  settings_customer_types: 'Settings: Customer types',
  settings_price_books: 'Settings: Price books',
  settings_job_descriptions: 'Settings: Job descriptions',
  settings_job_report_template: 'Settings: Job report template',
  settings_site_report_templates: 'Settings: Site report templates',
  settings_diary_abort_reasons: 'Settings: Visit abort reasons',
  settings_business_units: 'Settings: Business units',
  settings_user_groups: 'Settings: User groups',
  settings_users: 'Settings: Users',
  settings_import: 'Settings: Import',
  settings_master_data: 'Settings: Master data (legacy)',
};

/** One-line hint under each checkbox in settings. */
export const PERMISSION_HINTS: Record<TenantPermissionKey, string> = {
  customers: 'Open customer records, sites, and notes in CRM.',
  jobs: 'Create and edit jobs, assignments, and job-related workflows.',
  quotations: 'Build and send quotations.',
  invoices: 'Issue invoices and payment-related views.',
  scheduling: 'Calendar, diary visits, and dispatch (also drives field visit list on the app when linked).',
  certifications: 'Electrical certificates, site/FRA reports, and officer compliance records.',
  parts_catalog: 'Parts lists and kits used on jobs.',
  field_users: 'Field officers list, mobile access, and job assignment pickers.',
  settings_company: 'Company logo, address, branding, and document defaults.',
  settings_invoice: 'Invoice defaults, payment terms, tax and numbering.',
  settings_quotation: 'Quotation defaults, terms, validity and layout.',
  settings_email: 'Mailbox connection, sending identity and templates.',
  settings_service_reminders: 'Automated service reminder configuration.',
  settings_customer_types: 'Customer type master list.',
  settings_price_books: 'Price books and configured rates.',
  settings_job_descriptions: 'Job descriptions and service checklists.',
  settings_job_report_template: 'Default final job report template.',
  settings_site_report_templates: 'Site/FRA report templates.',
  settings_diary_abort_reasons: 'Visit cancellation/abort reason list.',
  settings_business_units: 'Business unit master list.',
  settings_user_groups: 'User group master list.',
  settings_users: 'User and team settings tab.',
  settings_import: 'CSV/data import tools.',
  settings_master_data: 'Legacy broad access for master data.',
};
