'use client';

import { useParams } from 'next/navigation';
import { QuotationEditorPage } from '../../QuotationEditorPage';

export default function EditQuotationPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  return <QuotationEditorPage quotationId={id} />;
}
