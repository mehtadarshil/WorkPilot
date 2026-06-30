'use client';

import { useParams } from 'next/navigation';
import { InvoiceEditorPage } from '../../InvoiceEditorPage';

export default function EditInvoicePage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  return <InvoiceEditorPage invoiceId={id} />;
}
