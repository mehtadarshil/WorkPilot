'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getJson } from '@/app/apiClient';
import type { ElectricalCertificate } from '@/lib/electricalCertificates/types';
import { CertificatePrintTemplate } from '@/app/dashboard/certificates/components/CertificatePrintTemplate';
import { useCompanyBranding } from '@/app/dashboard/certificates/hooks/useCompanyBranding';

export default function CertificatePrintPage() {
  const params = useParams();
  const id = parseInt(String(params.id), 10);
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;
  const [certificate, setCertificate] = useState<ElectricalCertificate | null>(null);
  const { branding, loading: brandingLoading } = useCompanyBranding();

  useEffect(() => {
    if (!token || !Number.isFinite(id)) return;
    void getJson<{ certificate: ElectricalCertificate }>(`/electrical-certificates/${id}`, token).then(
      (res) => setCertificate(res.certificate),
    );
  }, [id, token]);

  useEffect(() => {
    if (!certificate) return;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [certificate]);

  if (!certificate || brandingLoading) {
    return <p className="p-8 text-slate-600">Loading…</p>;
  }

  return <CertificatePrintTemplate certificate={certificate} branding={branding} />;
}
