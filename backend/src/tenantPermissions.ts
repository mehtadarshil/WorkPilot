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
] as const;

export type TenantPermissionKey = (typeof TENANT_PERMISSION_KEYS)[number];

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
] as const;

export function pickFieldPermissionsFromStaff(
  staff: Record<TenantPermissionKey, boolean>,
): Record<TenantPermissionKey, boolean> {
  const o = emptyPermissions();
  for (const k of FIELD_MOBILE_PERMISSION_KEYS) {
    if (staff[k] === true) o[k] = true;
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
  }
  return base;
}
