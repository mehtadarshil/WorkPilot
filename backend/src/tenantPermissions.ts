/** Granular CRM permissions for tenant STAFF users (sync with frontend/src/lib/tenantPermissions.ts). */
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

function jobTabsCustomized(raw: unknown): boolean {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const obj = raw as Record<string, unknown>;
  return JOB_DETAIL_TAB_PERMISSION_KEYS.some((k) => obj[k] === true || obj[k] === false);
}

function customerTabsCustomized(raw: unknown): boolean {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const obj = raw as Record<string, unknown>;
  return CUSTOMER_TAB_PERMISSION_KEYS.some((k) => obj[k] === true || obj[k] === false);
}

function isAdminRole(role?: string | null): boolean {
  const r = (role ?? '').toUpperCase();
  return r === 'ADMIN' || r === 'SUPER_ADMIN';
}

export function canViewJobDetailTab(
  raw: Record<string, boolean> | null | undefined,
  tabKey: (typeof JOB_DETAIL_TAB_PERMISSION_KEYS)[number],
  role?: string | null,
): boolean {
  if (isAdminRole(role)) return true;
  const p = normalizePermissionsJson(raw);
  if (!p.jobs) return false;
  if (!jobTabsCustomized(raw)) return true;
  return p[tabKey] === true;
}

export function canViewCustomerTab(
  raw: Record<string, boolean> | null | undefined,
  tabKey: (typeof CUSTOMER_TAB_PERMISSION_KEYS)[number],
  role?: string | null,
): boolean {
  if (isAdminRole(role)) return true;
  const p = normalizePermissionsJson(raw);
  if (!p.customers && !p.jobs) return false;
  if (!customerTabsCustomized(raw)) return true;
  return p[tabKey] === true;
}

export function isTenantPermissionKey(s: string): s is TenantPermissionKey {
  return (TENANT_PERMISSION_KEYS as readonly string[]).includes(s);
}

export function emptyPermissions(): Record<TenantPermissionKey, boolean> {
  const o = {} as Record<TenantPermissionKey, boolean>;
  for (const k of TENANT_PERMISSION_KEYS) o[k] = false;
  return o;
}

/** Full manager-style access (team management is owner-only via API, not a checkbox). */
export function presetManagerPermissions(): Record<TenantPermissionKey, boolean> {
  const o = emptyPermissions();
  for (const k of TENANT_PERMISSION_KEYS) o[k] = true;
  return o;
}

/** Desk officer: core ops only. */
export function presetDeskOfficerPermissions(): Record<TenantPermissionKey, boolean> {
  const o = emptyPermissions();
  o.customers = true;
  o.jobs = true;
  o.scheduling = true;
  return o;
}

/** Keys copied to a linked officer row from staff permissions (mobile-relevant only). */
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

export function pickFieldPermissionsFromStaff(
  staff: Record<TenantPermissionKey, boolean>,
): Record<TenantPermissionKey, boolean> {
  const o = emptyPermissions();
  for (const k of FIELD_MOBILE_PERMISSION_KEYS) {
    if (staff[k] === true) o[k] = true;
    else if (staff[k] === false) o[k] = false;
  }
  return o;
}

/** Field-only mobile accounts: visits and jobs. */
export function presetFieldOfficerPermissions(): Record<TenantPermissionKey, boolean> {
  const o = emptyPermissions();
  o.jobs = true;
  o.scheduling = true;
  return o;
}

export function normalizePermissionsJson(raw: unknown): Record<TenantPermissionKey, boolean> {
  const base = emptyPermissions();
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const obj = raw as Record<string, unknown>;
  for (const k of TENANT_PERMISSION_KEYS) {
    if (obj[k] === true) base[k] = true;
    else if (obj[k] === false) base[k] = false;
  }
  if (
    base.customers &&
    base.jobs &&
    base.quotations &&
    base.invoices &&
    base.scheduling
  ) {
    base.certifications = true;
  }
  return base;
}
