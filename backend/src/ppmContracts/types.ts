export type PpmContractStatus = 'draft' | 'active' | 'suspended' | 'expired';
export type PpmRenewalType = 'fixed' | 'open_ended';
export type PpmIntervalUnit = 'days' | 'weeks' | 'months' | 'years';

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
