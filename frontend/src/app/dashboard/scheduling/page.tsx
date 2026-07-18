'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

function SchedulingRedirectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const jobId = searchParams.get('jobId');
    const params = new URLSearchParams({ mode: 'dispatch' });
    if (jobId) params.set('jobId', jobId);
    router.replace(`/dashboard/calendar?${params.toString()}`);
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center text-slate-400">
      <Loader2 className="size-6 animate-spin" />
    </div>
  );
}

export default function SchedulingRedirectPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-slate-400">
          <Loader2 className="size-6 animate-spin" />
        </div>
      }
    >
      <SchedulingRedirectInner />
    </Suspense>
  );
}
