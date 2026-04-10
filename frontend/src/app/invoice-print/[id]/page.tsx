import { Suspense } from 'react';
import InvoicePrintClient from './InvoicePrintClient';

export default function InvoicePrintPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white p-8 text-sm text-slate-500">Loading…</div>}>
      <InvoicePrintClient />
    </Suspense>
  );
}
