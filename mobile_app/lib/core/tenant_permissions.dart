const jobDetailTabPermissionKeys = [
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
];

const customerTabPermissionKeys = [
  'customer_tab_invoices',
  'customer_tab_communications',
  'customer_tab_contacts',
  'customer_tab_branches',
  'customer_tab_assets',
  'customer_tab_files',
  'customer_tab_site_images',
];

bool _isAdminRole(String? role) {
  final r = (role ?? '').toUpperCase();
  return r == 'ADMIN' || r == 'SUPER_ADMIN';
}

bool _tabsCustomized(Map<String, bool> perms, List<String> keys) {
  return keys.any((k) => perms.containsKey(k));
}

bool canViewJobDetailTab(Map<String, bool> perms, String tabKey, {String? role}) {
  if (_isAdminRole(role)) return true;
  if (perms['jobs'] != true) return false;
  if (!_tabsCustomized(perms, jobDetailTabPermissionKeys)) return true;
  return perms[tabKey] == true;
}

bool canViewCustomerTab(Map<String, bool> perms, String tabKey, {String? role}) {
  if (_isAdminRole(role)) return true;
  if (perms['customers'] != true && perms['jobs'] != true) return false;
  if (!_tabsCustomized(perms, customerTabPermissionKeys)) return true;
  return perms[tabKey] == true;
}

bool canViewInvoicesModule(Map<String, bool> perms, {String? role}) {
  if (_isAdminRole(role)) return true;
  return perms['invoices'] == true;
}

bool canSendInvoices(Map<String, bool> perms, {String? role}) {
  if (_isAdminRole(role)) return true;
  return perms['invoice_send'] == true;
}

bool canViewQuotationsModule(Map<String, bool> perms, {String? role}) {
  if (_isAdminRole(role)) return true;
  return perms['quotations'] == true;
}
