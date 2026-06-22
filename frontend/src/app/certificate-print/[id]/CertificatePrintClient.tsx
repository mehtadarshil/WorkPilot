'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { getJson } from '@/app/apiClient';
import type { ElectricalCertificate } from '@/lib/electricalCertificates/types';
import { CertificatePrintTemplate } from '@/app/dashboard/certificates/components/CertificatePrintTemplate';
import {
  DEFAULT_COMPANY_BRANDING,
  type CompanyBranding,
} from '@/lib/electricalCertificates/companyBranding';

export default function CertificatePrintClient() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  const token = searchParams.get('token');
  const embed = searchParams.get('embed') === '1';
  const [certificate, setCertificate] = useState<ElectricalCertificate | null>(null);
  const [branding, setBranding] = useState<CompanyBranding>(DEFAULT_COMPANY_BRANDING);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setError('Invalid certificate');
      setLoading(false);
      return;
    }
    if (!token) {
      setError('Missing access token');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setError(null);
    setCertificate(null);
    setLoading(true);
    Promise.all([
      getJson<{ certificate: ElectricalCertificate }>(`/electrical-certificates/${id}`, token),
      getJson<{ branding: CompanyBranding }>('/electrical-certificates/branding', token).catch(() => ({
        branding: DEFAULT_COMPANY_BRANDING,
      })),
    ])
      .then(([certRes, brandingRes]) => {
        if (cancelled) return;
        setCertificate(certRes.certificate);
        setBranding({ ...DEFAULT_COMPANY_BRANDING, ...brandingRes.branding });
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load certificate');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, token]);

  useEffect(() => {
    if (!certificate || loading || embed) return;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [certificate, loading, embed]);

  if (error) {
    return <p className="p-8 text-sm text-rose-600">{error}</p>;
  }
  if (!certificate || loading) {
    return <p className="p-8 text-sm text-slate-500">Loading…</p>;
  }

  return (
    <div className={`min-h-screen bg-[#f6f8f8] print:bg-white print:p-0 ${embed ? 'p-0' : 'p-6'}`}>
      <CertificatePrintTemplate certificate={certificate} branding={branding} />
    </div>
  );
}
