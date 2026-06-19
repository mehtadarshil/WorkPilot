import { Suspense } from 'react';
import CertificatePrintClient from './CertificatePrintClient';

export default function CertificatePrintPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white p-8 text-sm text-slate-500">Loading…</div>}>
      <CertificatePrintClient />
    </Suspense>
  );
}
