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
    default:
      return Array.from(new Set([...COMMON, '{{customer_name}}', '{{customer_address}}', '{{work_address}}']));
  }
}
