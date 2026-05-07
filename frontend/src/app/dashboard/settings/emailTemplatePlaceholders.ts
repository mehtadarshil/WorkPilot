/** Tags available for {{}} substitution in email templates (invoice / quotation sends). */

const COMMON = ['{{company_name}}', '{{message}}'] as const;

const INVOICE_TAGS = [
  '{{company_name}}',
  '{{customer_name}}',
  '{{customer_address}}',
  '{{work_address}}',
  '{{invoice_number}}',
  '{{invoice_total}}',
  '{{currency}}',
  '{{invoice_date}}',
  '{{due_date}}',
  '{{invoice_link}}',
] as const;

const QUOTATION_TAGS = [
  '{{company_name}}',
  '{{customer_name}}',
  '{{customer_address}}',
  '{{work_address}}',
  '{{quotation_number}}',
  '{{quotation_total}}',
  '{{currency}}',
  '{{quotation_date}}',
  '{{valid_until}}',
  '{{quotation_link}}',
] as const;

const GENERAL_TAGS = ['{{company_name}}', '{{message}}'] as const;

/** Same substitution set as automated service reminder sends (per job’s linked work address). */
const SERVICE_REMINDER_TAGS = [
  '{{company_name}}',
  '{{customer_name}}',
  '{{customer_surname}}',
  '{{customer_account_no}}',
  '{{customer_email}}',
  '{{customer_telephone}}',
  '{{customer_mobile}}',
  '{{customer_address}}',
  '{{customer_address_line_1}}',
  '{{customer_address_line_2}}',
  '{{customer_address_line_3}}',
  '{{customer_town}}',
  '{{customer_county}}',
  '{{customer_postcode}}',
  '{{work_address}}',
  '{{site_address}}',
  '{{work_address_name}}',
  '{{work_address_branch}}',
  '{{work_address_line_1}}',
  '{{work_address_line_2}}',
  '{{work_address_line_3}}',
  '{{work_address_town}}',
  '{{work_address_county}}',
  '{{work_address_postcode}}',
  '{{service_name}}',
  '{{service_reminder_name}}',
  '{{service_contact}}',
  '{{service_reminder_booking_portal_url}}',
  '{{job_title}}',
  '{{job_id}}',
  '{{due_date}}',
  '{{service_due_date}}',
  '{{phase_label}}',
] as const;

export function placeholderTagsForTemplate(templateKey: string | null, mode: 'add' | 'edit'): string[] {
  if (mode === 'add') {
    return Array.from(new Set([...COMMON, '{{customer_name}}', '{{customer_address}}', '{{work_address}}']));
  }
  if (!templateKey) return [...GENERAL_TAGS];
  switch (templateKey) {
    case 'invoice':
      return [...INVOICE_TAGS];
    case 'quotation':
      return [...QUOTATION_TAGS];
    case 'general':
      return [...GENERAL_TAGS];
    case 'service_reminder':
      return [...SERVICE_REMINDER_TAGS];
    default:
      return Array.from(new Set([...COMMON, '{{customer_name}}', '{{customer_address}}', '{{work_address}}']));
  }
}
