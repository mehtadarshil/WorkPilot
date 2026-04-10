import { Suspense } from 'react';
import QuotationPrintClient from './QuotationPrintClient';

export default function QuotationPrintPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white p-8 text-sm text-slate-500">Loading…</div>}>
      <QuotationPrintClient />
    </Suspense>
  );
}
