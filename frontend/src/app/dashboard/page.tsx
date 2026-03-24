'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const userJson = window.localStorage.getItem('wp_user');
    if (!userJson) {
      router.replace('/login');
      return;
    }
    try {
      const user = JSON.parse(userJson) as { role?: string };
      setReady(true);
      router.replace(user.role === 'SUPER_ADMIN' ? '/dashboard/clients' : '/dashboard/jobs');
    } catch {
      router.replace('/login');
    }
  }, [router]);

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-slate-500">{ready ? 'Redirecting…' : 'Loading…'}</div>
    </div>
  );
}
