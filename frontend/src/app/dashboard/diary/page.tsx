'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

function DiaryRedirectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const jobId = searchParams.get('jobId');
    const q = jobId ? `?jobId=${encodeURIComponent(jobId)}` : '';
    router.replace(`/dashboard/calendar${q}`);
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center text-slate-400">
      <Loader2 className="size-6 animate-spin" />
    </div>
  );
}

export default function DiaryRedirectPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-slate-400">
          <Loader2 className="size-6 animate-spin" />
        </div>
      }
    >
      <DiaryRedirectInner />
    </Suspense>
  );
}
