'use client';

import Image from 'next/image';

/**
 * Legacy job portal URLs (`/public/jobs/:token`) are no longer used.
 * Staff create a per-selection printable link from the job → Client panel in the dashboard.
 */
export default function PublicJobPortalLegacyPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-lg">
        <div className="mx-auto flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
          <Image src="/logo.jpg" alt="" width={48} height={48} className="object-contain" />
        </div>
        <h1 className="mt-4 text-lg font-bold text-slate-900">Link no longer used</h1>
        <p className="mt-2 text-sm text-slate-600">
          Your service provider now sends a <strong>direct link to the visit report</strong> from their office system.
          If you need the report, please ask them for the latest shared link.
        </p>
      </div>
    </div>
  );
}
