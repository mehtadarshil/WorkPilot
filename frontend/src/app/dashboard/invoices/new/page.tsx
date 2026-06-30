'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { InvoiceEditorPage } from '../InvoiceEditorPage';
import AddInvoiceFromJobPage from './AddInvoiceFromJobPage';

function NewInvoiceRouter() {
  const searchParams = useSearchParams();
  const jobId = searchParams?.get('jobId');
  const customerId = searchParams?.get('customerId');
  if (jobId || customerId) {
    return <AddInvoiceFromJobPage />;
  }
  return <InvoiceEditorPage />;
}

export default function AddInvoicePage() {
  return (
    <Suspense fallback={<div className="p-8">Loading...</div>}>
      <NewInvoiceRouter />
    </Suspense>
  );
}
