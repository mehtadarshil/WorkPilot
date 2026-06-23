'use client';

import { use } from 'react';
import { useSearchParams } from 'next/navigation';
import PpmContractWizard from '../../PpmContractWizard';

export default function EditPpmContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const contractId = parseInt(id, 10);
  const stepParam = searchParams.get('step');
  const parsedStep = stepParam ? parseInt(stepParam, 10) : 0;
  const initialStep = Number.isFinite(parsedStep) ? Math.max(0, Math.min(parsedStep, 6)) : 0;
  return <PpmContractWizard contractId={contractId} initialStep={initialStep} />;
}
