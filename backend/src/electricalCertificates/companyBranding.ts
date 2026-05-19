import type { Pool } from 'pg';

export type CompanyBranding = {
  company_name: string;
  company_address: string | null;
  company_phone: string | null;
  company_email: string | null;
  company_logo: string | null;
  company_website: string | null;
  footer_text: string | null;
  accent_color: string;
  accent_end_color: string;
};

function parseHexColor(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const t = raw.trim();
  return /^#[0-9A-Fa-f]{6}$/.test(t) ? t : fallback;
}

export async function loadCompanyBranding(pool: Pool, userId: number): Promise<CompanyBranding> {
  const r = await pool.query(
    `SELECT company_name, company_address, company_phone, company_email, company_logo,
            company_website, footer_text, invoice_accent_color, invoice_accent_end_color
     FROM invoice_settings WHERE created_by = $1`,
    [userId],
  );
  if ((r.rowCount ?? 0) === 0) {
    return {
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
  }
  const row = r.rows[0] as Record<string, unknown>;
  return {
    company_name: (row.company_name as string) ?? 'WorkPilot',
    company_address: (row.company_address as string | null) ?? null,
    company_phone: (row.company_phone as string | null) ?? null,
    company_email: (row.company_email as string | null) ?? null,
    company_logo: (row.company_logo as string | null) ?? null,
    company_website: (row.company_website as string | null) ?? null,
    footer_text: (row.footer_text as string | null) ?? null,
    accent_color: parseHexColor(row.invoice_accent_color, '#14B8A6'),
    accent_end_color: parseHexColor(row.invoice_accent_end_color, '#0d9488'),
  };
}
