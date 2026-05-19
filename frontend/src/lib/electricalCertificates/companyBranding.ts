export interface CompanyBranding {
  company_name: string;
  company_address: string | null;
  company_phone: string | null;
  company_email: string | null;
  company_logo: string | null;
  company_website: string | null;
  footer_text: string | null;
  accent_color: string;
  accent_end_color: string;
}

export const DEFAULT_COMPANY_BRANDING: CompanyBranding = {
  company_name: 'WorkPilot',
  company_address: null,
  company_phone: null,
  company_email: null,
  company_logo: null,
  company_website: null,
  footer_text: null,
  accent_color: '#14B8A6',
  accent_end_color: '#0d9488',
};
