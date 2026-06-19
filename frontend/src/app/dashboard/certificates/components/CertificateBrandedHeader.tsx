'use client';

import type { CompanyBranding } from '@/lib/electricalCertificates/companyBranding';
import { resolveWorkpilotAssetUrl } from '@/lib/resolveWorkpilotAssetUrl';

type Props = {
  branding: CompanyBranding;
  title?: string;
  subtitle?: string;
  certificateNumber?: string;
};

export function CertificateBrandedHeader({
  branding,
  title = 'Electrical Installation Condition Report',
  subtitle = 'BS 7671 — 18th Edition Amendment 3',
  certificateNumber,
}: Props) {
  const accentStyle = {
    borderColor: branding.accent_color,
    background: `linear-gradient(90deg, ${branding.accent_color}, ${branding.accent_end_color})`,
  };

  return (
    <header
      className="mb-6 flex flex-wrap gap-4 border-b-4 pb-4"
      style={{ borderColor: branding.accent_color }}
    >
      {branding.company_logo && (
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white p-1">
          <img src={resolveWorkpilotAssetUrl(branding.company_logo) ?? branding.company_logo} alt="" className="max-h-full max-w-full object-contain" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p
          className="text-lg font-bold bg-clip-text text-transparent"
          style={{
            backgroundImage: `linear-gradient(90deg, ${branding.accent_color}, ${branding.accent_end_color})`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          {branding.company_name}
        </p>
        {branding.company_address && (
          <p className="whitespace-pre-wrap text-xs text-slate-600">{branding.company_address}</p>
        )}
        <p className="text-xs text-slate-500">
          {[branding.company_phone, branding.company_email, branding.company_website]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      <div className="text-right">
        <h1 className="text-base font-bold text-slate-900">{title}</h1>
        <p className="text-xs text-slate-600">{subtitle}</p>
        {certificateNumber && (
          <p className="mt-1 font-mono text-sm font-semibold text-slate-800">{certificateNumber}</p>
        )}
        <div className="mt-2 h-1 w-24 rounded-full ml-auto" style={accentStyle} />
      </div>
    </header>
  );
}
