'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Download, Printer } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '/api';

export default function PublicJobClientReportPage() {
  const params = useParams();
  const token = typeof params?.token === 'string' ? params.token : '';
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reportApiUrl = useMemo(
    () =>
      token
        ? `${API_BASE.replace(/\/$/, '')}/public/job-client-report/${encodeURIComponent(token)}`
        : '',
    [token],
  );

  useEffect(() => {
    if (!token || !reportApiUrl) {
      setError('Invalid link');
      return;
    }
    let cancelled = false;
    fetch(reportApiUrl)
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 404 ? 'Report not found' : 'Failed to load');
        return r.text();
      })
      .then((t) => {
        if (!cancelled) setHtml(t);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error');
      });
    return () => {
      cancelled = true;
    };
  }, [token, reportApiUrl]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-700">{error}</div>
    );
  }
  if (!html) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#14B8A6] border-t-transparent" />
        <p className="mt-4 text-sm font-medium text-slate-500">Loading report…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media print {
          html, body { background: white !important; margin: 0 !important; padding: 0 !important; }
          .no-print { display: none !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          @page { margin: 12mm; size: auto; }
        }
      `,
        }}
      />
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-end gap-2 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <a
          href={`${reportApiUrl}?pdf=1`}
          download
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 shadow-sm hover:bg-slate-50"
        >
          <Download className="size-4 shrink-0" />
          Download PDF
        </a>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-bold text-white shadow hover:bg-[#13a89a]"
        >
          <Printer className="size-4 shrink-0" />
          Print / Save as PDF
        </button>
      </div>
      <div
        className="job-client-report-root"
        dangerouslySetInnerHTML={{ __html: html }}
        suppressHydrationWarning
      />
    </div>
  );
}
