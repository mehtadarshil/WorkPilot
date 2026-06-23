export type PpmContractStatus = 'draft' | 'active' | 'suspended' | 'expired';
export type PpmRenewalType = 'fixed' | 'open_ended';
export type PpmIntervalUnit = 'days' | 'weeks' | 'months' | 'years';
export type PpmListFilter = 'active' | 'due_soon' | 'overdue' | 'expired' | 'all';

export type PpmCommunicationsConfig = {
  reminder_days_before?: number[];
  email_enabled?: boolean;
};

export type PpmInvoicingConfig = {
  charge_type?: 'chargeable' | 'free' | 'callback';
  invoice_description_template?: string;
  auto_invoice_on_complete?: boolean;
};

export type PpmRateOverrides = {
  travel_hourly_rate?: number | null;
  first_hour_labour_rate?: number | null;
  additional_hour_labour_rate?: number | null;
};

export type PpmContractTask = {
  id?: number;
  name: string;
  asset_id?: number | null;
  interval_n: number;
  interval_unit: PpmIntervalUnit;
  next_due_date: string;
  sort_order?: number;
  is_active?: boolean;
  asset_name?: string | null;
  days_until_due?: number | null;
  is_overdue?: boolean;
  calendar_occurrences?: string[];
};

export type PpmContract = {
  id: number;
  customer_id: number;
  customer_name?: string | null;
  work_address_id?: number | null;
  work_address_name?: string | null;
  title: string;
  reference?: string | null;
  status: PpmContractStatus;
  start_date?: string | null;
  end_date?: string | null;
  renewal_type: PpmRenewalType;
  renewal_notice_days: number;
  price_book_id?: number | null;
  job_description_id?: number | null;
  default_officer_id?: number | null;
  sla_response_minutes?: number | null;
  sla_completion_minutes?: number | null;
  auto_create_jobs_days_before: number;
  asset_ids?: number[];
  communications_json?: PpmCommunicationsConfig;
  invoicing_json?: PpmInvoicingConfig;
  rate_overrides_json?: PpmRateOverrides;
  earliest_next_due?: string | null;
  days_until_expiry?: number | null;
  days_until_due?: number | null;
  task_count?: number;
  compliance_percent?: number | null;
  invoiced_total?: number;
};

export type PpmWizardState = {
  customer_id: number | null;
  work_address_id: number | null;
  title: string;
  reference: string;
  status: PpmContractStatus;
  start_date: string;
  end_date: string;
  renewal_type: PpmRenewalType;
  renewal_notice_days: number;
  price_book_id: number | null;
  job_description_id: number | null;
  default_officer_id: number | null;
  sla_response_minutes: string;
  sla_completion_minutes: string;
  auto_create_jobs_days_before: number;
  asset_ids: number[];
  tasks: PpmContractTask[];
  communications_json: PpmCommunicationsConfig;
  invoicing_json: PpmInvoicingConfig;
  rate_overrides_json: PpmRateOverrides;
};

export const EMPTY_PPM_WIZARD: PpmWizardState = {
  customer_id: null,
  work_address_id: null,
  title: '',
  reference: '',
  status: 'draft',
  start_date: new Date().toISOString().slice(0, 10),
  end_date: '',
  renewal_type: 'open_ended',
  renewal_notice_days: 60,
  price_book_id: null,
  job_description_id: null,
  default_officer_id: null,
  sla_response_minutes: '',
  sla_completion_minutes: '',
  auto_create_jobs_days_before: 14,
  asset_ids: [],
  tasks: [{ name: '', interval_n: 6, interval_unit: 'months', next_due_date: '' }],
  communications_json: { reminder_days_before: [60, 30, 7], email_enabled: true },
  invoicing_json: { charge_type: 'chargeable', auto_invoice_on_complete: false },
  rate_overrides_json: {},
};

export const PPM_FILTER_TABS: { value: PpmListFilter; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'due_soon', label: 'Due soon' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'expired', label: 'Expired' },
];

export const PPM_WIZARD_STEPS = [
  'Basic details',
  'Renewal',
  'Assets',
  'PPM tasks',
  'Billable rates',
  'Invoicing',
  'Communications',
] as const;
