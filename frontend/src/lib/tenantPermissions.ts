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
  'todos',
  'job_tab_parts',
  'job_tab_job_report',
  'job_tab_reports',
  'job_tab_client_panel',
  'job_tab_reminders',
  'job_tab_notes',
  'job_tab_files',
  'job_tab_invoices',
  'job_tab_costs',
  'job_tab_expenses',
  'job_tab_items_to_invoice',
  'customer_tab_invoices',
  'customer_tab_communications',
  'customer_tab_contacts',
  'customer_tab_branches',
  'customer_tab_assets',
  'customer_tab_files',
  'customer_tab_site_images',
] as const;

export type TenantPermissionKey = (typeof TENANT_PERMISSION_KEYS)[number];

export const JOB_DETAIL_TAB_PERMISSION_KEYS = [
  'job_tab_parts',
  'job_tab_job_report',
  'job_tab_reports',
  'job_tab_client_panel',
  'job_tab_reminders',
  'job_tab_notes',
  'job_tab_files',
  'job_tab_invoices',
  'job_tab_costs',
  'job_tab_expenses',
  'job_tab_items_to_invoice',
] as const;

export const CUSTOMER_TAB_PERMISSION_KEYS = [
  'customer_tab_invoices',
  'customer_tab_communications',
  'customer_tab_contacts',
  'customer_tab_branches',
  'customer_tab_assets',
  'customer_tab_files',
  'customer_tab_site_images',
] as const;

export const JOB_DETAIL_TAB_LABELS: Record<(typeof JOB_DETAIL_TAB_PERMISSION_KEYS)[number], string> = {
  job_tab_parts: 'Parts',
  job_tab_job_report: 'Job report',
  job_tab_reports: 'Reports',
  job_tab_client_panel: 'Client panel',
  job_tab_reminders: 'Reminders',
  job_tab_notes: 'Notes',
  job_tab_files: 'Files',
  job_tab_invoices: 'Invoices',
  job_tab_costs: 'Costs',
  job_tab_expenses: 'Expenses',
  job_tab_items_to_invoice: 'Items to invoice',
};

export const CUSTOMER_TAB_LABELS: Record<(typeof CUSTOMER_TAB_PERMISSION_KEYS)[number], string> = {
  customer_tab_invoices: 'Invoices tab',
  customer_tab_communications: 'Communications tab',
  customer_tab_contacts: 'Contacts tab',
  customer_tab_branches: 'Branches tab',
  customer_tab_assets: 'Assets tab',
  customer_tab_files: 'Files tab',
  customer_tab_site_images: 'Site images tab',
};

function jobTabsCustomized(raw: Partial<Record<TenantPermissionKey, boolean>> | null | undefined): boolean {
  if (!raw) return false;
  return JOB_DETAIL_TAB_PERMISSION_KEYS.some((k) => raw[k] === true || raw[k] === false);
}

function customerTabsCustomized(raw: Partial<Record<TenantPermissionKey, boolean>> | null | undefined): boolean {
  if (!raw) return false;
  return CUSTOMER_TAB_PERMISSION_KEYS.some((k) => raw[k] === true || raw[k] === false);
}

function isAdminRole(role?: string | null): boolean {
  const r = (role ?? '').toUpperCase();
  return r === 'ADMIN' || r === 'SUPER_ADMIN';
}

export function canViewJobDetailTab(
  raw: Partial<Record<TenantPermissionKey, boolean>> | null | undefined,
  tabKey: (typeof JOB_DETAIL_TAB_PERMISSION_KEYS)[number],
  role?: string | null,
): boolean {
  if (isAdminRole(role)) return true;
  const p = normalizePermissions(raw);
  if (!p.jobs) return false;
  if (!jobTabsCustomized(raw)) return true;
  return p[tabKey] === true;
}

export function canViewCustomerTab(
  raw: Partial<Record<TenantPermissionKey, boolean>> | null | undefined,
  tabKey: (typeof CUSTOMER_TAB_PERMISSION_KEYS)[number],
  role?: string | null,
): boolean {
  if (isAdminRole(role)) return true;
  const p = normalizePermissions(raw);
  if (!p.customers && !p.jobs) return false;
  if (!customerTabsCustomized(raw)) return true;
  return p[tabKey] === true;
}

export function canViewInvoicesModule(
  raw: Partial<Record<TenantPermissionKey, boolean>> | null | undefined,
  role?: string | null,
): boolean {
  if (isAdminRole(role)) return true;
  return normalizePermissions(raw).invoices === true;
}

export function canViewQuotationsModule(
  raw: Partial<Record<TenantPermissionKey, boolean>> | null | undefined,
  role?: string | null,
): boolean {
  if (isAdminRole(role)) return true;
  return normalizePermissions(raw).quotations === true;
}

export type TenantPermissionsMap = Record<TenantPermissionKey, boolean>;

export function emptyPermissions(): TenantPermissionsMap {
  const o = {} as TenantPermissionsMap;
  for (const k of TENANT_PERMISSION_KEYS) o[k] = false;
  return o;
}

export function normalizePermissions(p?: Partial<Record<TenantPermissionKey, boolean>> | null): TenantPermissionsMap {
  const o = emptyPermissions();
  if (p) {
    for (const k of TENANT_PERMISSION_KEYS) {
      if (p[k] === true) o[k] = true;
      else if (p[k] === false) o[k] = false;
    }
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
  'todos',
  ...JOB_DETAIL_TAB_PERMISSION_KEYS,
  ...CUSTOMER_TAB_PERMISSION_KEYS,
] as const;

/** For field-only (or linked officer) rows: only mobile-relevant flags are stored; web-only keys are forced off. */
export function stripToFieldMobilePermissions(p: TenantPermissionsMap): TenantPermissionsMap {
  const o = emptyPermissions();
  for (const k of FIELD_MOBILE_PERMISSION_KEYS) {
    o[k] = p[k] === true;
    if (p[k] === false) o[k] = false;
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
    description: 'Certificates, site reports, and staff certification compliance.',
    keys: ['certifications'],
  },
  {
    id: 'admin',
    title: 'Team & settings',
    description: 'Manage other users and each Settings tab separately.',
    keys: [
      'field_users',
      'todos',
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
  todos: 'Todos & tasks',
  job_tab_parts: 'Job tab: Parts',
  job_tab_job_report: 'Job tab: Job report',
  job_tab_reports: 'Job tab: Reports',
  job_tab_client_panel: 'Job tab: Client panel',
  job_tab_reminders: 'Job tab: Reminders',
  job_tab_notes: 'Job tab: Notes',
  job_tab_files: 'Job tab: Files',
  job_tab_invoices: 'Job tab: Invoices',
  job_tab_costs: 'Job tab: Costs',
  job_tab_expenses: 'Job tab: Expenses',
  job_tab_items_to_invoice: 'Job tab: Items to invoice',
  customer_tab_invoices: 'Customer tab: Invoices',
  customer_tab_communications: 'Customer tab: Communications',
  customer_tab_contacts: 'Customer tab: Contacts',
  customer_tab_branches: 'Customer tab: Branches',
  customer_tab_assets: 'Customer tab: Assets',
  customer_tab_files: 'Customer tab: Files',
  customer_tab_site_images: 'Customer tab: Site images',
};

/** One-line hint under each checkbox in settings. */
export const PERMISSION_HINTS: Record<TenantPermissionKey, string> = {
  customers: 'Open customer records, sites, and notes in CRM.',
  jobs: 'Create and edit jobs, assignments, and job-related workflows.',
  quotations: 'Build and send quotations.',
  invoices: 'Issue invoices and payment-related views.',
  scheduling: 'Calendar, diary visits, and dispatch (also drives field visit list on the app when linked).',
  certifications: 'Certificates, site/FRA reports, and officer compliance records.',
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
  todos: 'Create and manage personal tasks with due dates. Admins can see all team tasks.',
  job_tab_parts: 'Job page: Parts tab',
  job_tab_job_report: 'Job page: Job report tab',
  job_tab_reports: 'Job page: Site/FRA Reports tab',
  job_tab_client_panel: 'Job page: Client panel tab',
  job_tab_reminders: 'Job page: Reminders tab',
  job_tab_notes: 'Job page: Notes tab',
  job_tab_files: 'Job page: Files tab',
  job_tab_invoices: 'Job page: Invoices tab',
  job_tab_costs: 'Job page: Costs tab',
  job_tab_expenses: 'Job page: Expenses tab',
  job_tab_items_to_invoice: 'Job page: Items to invoice tab',
  customer_tab_invoices: 'Customer page: Invoices tab',
  customer_tab_communications: 'Customer page: Communications tab',
  customer_tab_contacts: 'Customer page: Contacts tab',
  customer_tab_branches: 'Customer page: Branches tab',
  customer_tab_assets: 'Customer page: Assets tab',
  customer_tab_files: 'Customer page: Files tab',
  customer_tab_site_images: 'Customer page: Site images tab',
};
