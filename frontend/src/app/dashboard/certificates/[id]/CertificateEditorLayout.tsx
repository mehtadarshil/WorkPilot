'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { getJson } from '../../../apiClient';
import type { ElectricalCertificate } from '@/lib/electricalCertificates/types';
import { CertificateEditorProvider } from '../CertificateEditorContext';
import { CertificateEditorShell } from '../components/CertificateEditorShell';
import { PatCertificateEditor } from '../components/PatCertificateEditor';
import { FireAlarmCertificateEditor } from '../components/FireAlarmCertificateEditor';

export default function CertificateEditorLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const router = useRouter();
  const id = parseInt(String(params.id), 10);
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;
  const [certificate, setCertificate] = useState<ElectricalCertificate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !Number.isFinite(id)) {
      setError('Invalid certificate');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await getJson<{ certificate: ElectricalCertificate }>(`/electrical-certificates/${id}`, token);
      setCertificate(res.certificate);
      setError(null);
    } catch (e) {
      setCertificate(null);
      setError(e instanceof Error ? e.message : 'Failed to load certificate');
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <Loader2 className="size-8 animate-spin text-[#14B8A6]" />
      </div>
    );
  }

  if (error || !certificate) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-12">
        <p className="text-slate-600">{error ?? 'Certificate not found'}</p>
        <Link href="/dashboard/certificates" className="text-[#14B8A6] hover:underline">
          Back to certificates
        </Link>
      </div>
    );
  }

  return (
    <CertificateEditorProvider initial={certificate}>
      {certificate.type_slug === 'portable_appliance_test' ? (
        <PatCertificateEditor />
      ) : certificate.type_slug === 'fi_insp_2025' ? (
        <FireAlarmCertificateEditor />
      ) : (
        <CertificateEditorShell>{children}</CertificateEditorShell>
      )}
    </CertificateEditorProvider>
  );
}
