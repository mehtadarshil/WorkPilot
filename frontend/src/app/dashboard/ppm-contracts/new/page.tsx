'use client';

import { useSearchParams } from 'next/navigation';
import PpmContractWizard from '../PpmContractWizard';

export default function NewPpmContractPage() {
  const searchParams = useSearchParams();
  const customerIdRaw = searchParams.get('customer_id');
  const parsed = customerIdRaw ? parseInt(customerIdRaw, 10) : NaN;
  const initialCustomerId = Number.isFinite(parsed) ? parsed : null;
  return <PpmContractWizard initialCustomerId={initialCustomerId} />;
}
