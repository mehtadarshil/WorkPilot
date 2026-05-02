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
  'settings_master_data',
] as const;

export type TenantPermissionKey = (typeof TENANT_PERMISSION_KEYS)[number];

export type TenantPermissionsMap = Record<TenantPermissionKey, boolean>;

export function emptyPermissions(): TenantPermissionsMap {
  const o = {} as TenantPermissionsMap;
  for (const k of TENANT_PERMISSION_KEYS) o[k] = false;
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
  o.certifications = true;
  return o;
}

/** Keys that can affect the field mobile app (diary, jobs, job context, certs). Web-only flags are hidden for field-only accounts. */
export const FIELD_MOBILE_PERMISSION_KEYS: readonly TenantPermissionKey[] = [
  'jobs',
  'scheduling',
  'certifications',
  'customers',
  'quotations',
  'invoices',
  'parts_catalog',
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
    id: 'libraries',
    title: 'Libraries',
    description: 'Reference data when planning work and visits.',
    keys: ['certifications', 'parts_catalog'],
  },
  {
    id: 'admin',
    title: 'Team & settings',
    description: 'Manage other users and company configuration (web only).',
    keys: ['field_users', 'settings_company', 'settings_master_data'],
  },
] as const;

export const PERMISSION_LABELS: Record<TenantPermissionKey, string> = {
  customers: 'Customers & sites',
  jobs: 'Jobs & service work',
  quotations: 'Quotations & proposals',
  invoices: 'Invoices & payments',
  scheduling: 'Diary & dispatch',
  certifications: 'Certification library',
  parts_catalog: 'Parts & kits catalog',
  field_users: 'Field team & assignments',
  settings_company: 'Branding & document defaults',
  settings_master_data: 'Import, templates & master lists',
};

/** One-line hint under each checkbox in settings. */
export const PERMISSION_HINTS: Record<TenantPermissionKey, string> = {
  customers: 'Open customer records, sites, and notes in CRM.',
  jobs: 'Create and edit jobs, assignments, and job-related workflows.',
  quotations: 'Build and send quotations.',
  invoices: 'Issue invoices and payment-related views.',
  scheduling: 'Calendar, diary visits, and dispatch (also drives field visit list on the app when linked).',
  certifications: 'Certification types and officer compliance records.',
  parts_catalog: 'Parts lists and kits used on jobs.',
  field_users: 'Field officers list, mobile access, and job assignment pickers.',
  settings_company: 'Logo, invoice/quote layout, company details, email footer.',
  settings_master_data: 'Price books, job descriptions, import CSV, report templates.',
};
