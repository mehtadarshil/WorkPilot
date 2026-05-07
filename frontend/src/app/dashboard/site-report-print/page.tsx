'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Download, Loader2, Printer } from 'lucide-react';
import { pdfFilenameFromTitle } from '../customers/[id]/customerSiteReportShared';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '/api';

function SiteReportPrintInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const customerId = searchParams.get('customer_id')?.trim() || '';
  const reportId = searchParams.get('report_id')?.trim() || '';
  const titleParam = searchParams.get('title')?.trim() || '';
  const mode = (searchParams.get('mode') || 'preview').toLowerCase();
  const autoprint = searchParams.get('autoprint') === '1';

  const [html, setHtml] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!customerId || !reportId) {
      setLoadError('Missing customer_id or report_id.');
      return;
    }
    const token = window.localStorage.getItem('wp_token');
    if (!token) {
      setLoadError('Please sign in.');
      return;
    }
    let cancelled = false;
    setLoadError(null);
    setHtml(null);
    const url = `${API_BASE.replace(/\/$/, '')}/customers/${encodeURIComponent(customerId)}/site-report/${encodeURIComponent(reportId)}/print.html`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        if (!r.ok) {
          let msg = 'Failed to load report';
          try {
            const j = (await r.json()) as { message?: string };
            if (j?.message) msg = j.message;
          } catch {
            try {
              const t = await r.text();
              if (t && t.length < 400) msg = t;
            } catch {
              /* ignore */
            }
          }
          throw new Error(msg);
        }
        return r.text();
      })
      .then((t) => {
        if (!cancelled) {
          setIframeLoaded(false);
          setHtml(t);
        }
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Error');
      });
    return () => {
      cancelled = true;
    };
  }, [customerId, reportId]);

  const pdfFilename = pdfFilenameFromTitle(titleParam || 'Site report');

  const runPrint = useCallback(() => {
    iframeRef.current?.contentWindow?.focus();
    iframeRef.current?.contentWindow?.print();
  }, []);

  const runClientPdf = useCallback(async () => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    const body = doc?.body;
    const root = doc?.documentElement;
    if (!body || !root) {
      setPdfError('Report layout is not ready yet. Wait a moment and try again.');
      return;
    }
    setPdfBusy(true);
    setPdfError(null);
    try {
      await new Promise<void>((r) => {
        requestAnimationFrame(() => requestAnimationFrame(() => r()));
      });
      await new Promise<void>((r) => window.setTimeout(r, 150));
      const html2pdf = (await import('html2pdf.js')).default;
      const w = Math.max(body.scrollWidth, root.scrollWidth, 794);
      const h = Math.max(body.scrollHeight, root.scrollHeight, 400);
      await html2pdf()
        .set({
          margin: [6, 6, 6, 6],
          filename: pdfFilename,
          image: { type: 'jpeg', quality: 0.95 },
          html2canvas: {
            scale: Math.min(2, 1400 / w),
            useCORS: true,
            allowTaint: true,
            logging: false,
            width: w,
            height: h,
            windowWidth: w,
            windowHeight: h,
            scrollX: 0,
            scrollY: 0,
            backgroundColor: '#ffffff',
          },
          pagebreak: { mode: ['css', 'legacy'] },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .from(body)
        .save();
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : 'Could not build PDF. Use Print / Save as PDF instead.');
    } finally {
      setPdfBusy(false);
    }
  }, [pdfFilename]);

  useEffect(() => {
    if (!html || !iframeLoaded || mode !== 'download') return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      if (!cancelled) void runClientPdf();
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [html, iframeLoaded, mode, runClientPdf]);

  useEffect(() => {
    if (!html || !iframeLoaded || !autoprint) return;
    const t = window.setTimeout(() => runPrint(), 450);
    return () => window.clearTimeout(t);
  }, [html, iframeLoaded, autoprint, runPrint]);

  if (loadError && !html) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-6">
        <p className="max-w-md text-center font-medium text-rose-700">{loadError}</p>
        <button type="button" onClick={() => router.back()} className="font-semibold text-[#14B8A6] hover:underline">
          Go back
        </button>
      </div>
    );
  }

  if (!html) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50">
        <Loader2 className="size-8 animate-spin text-[#14B8A6]" />
        <p className="text-sm font-medium text-slate-600">Loading report…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media print {
          .srp-no-print { display: none !important; }
          html, body { background: white !important; margin: 0 !important; }
          #srp-frame-wrap { padding: 0 !important; margin: 0 !important; }
          #srp-frame { position: static !important; width: 100% !important; height: auto !important; min-height: 0 !important; box-shadow: none !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          @page { margin: 12mm; size: auto; }
        }
      `,
        }}
      />
      <div className="srp-no-print sticky top-0 z-20 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="size-4" />
          Back
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => runPrint()}
            className="inline-flex items-center gap-2 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-bold text-white shadow hover:bg-[#13a89a]"
          >
            <Printer className="size-4 shrink-0" />
            Print / Save as PDF
          </button>
          <button
            type="button"
            disabled={pdfBusy}
            onClick={() => void runClientPdf()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            {pdfBusy ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <Download className="size-4 shrink-0" />}
            Download PDF file
          </button>
        </div>
      </div>
      {pdfError ? (
        <div className="srp-no-print border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-950">{pdfError}</div>
      ) : null}
      {mode === 'download' && pdfBusy ? (
        <div className="srp-no-print border-b border-slate-200 bg-white px-4 py-2 text-sm text-slate-600">Building PDF…</div>
      ) : null}
      <div id="srp-frame-wrap" className="p-2 md:p-4">
        <iframe
          id="srp-frame"
          ref={iframeRef}
          title="Site report"
          srcDoc={html}
          onLoad={() => setIframeLoaded(true)}
          className="mx-auto block w-full max-w-[210mm] border-0 bg-white shadow-md"
          style={{ minHeight: '85vh', width: '100%' }}
        />
      </div>
    </div>
  );
}

export default function SiteReportPrintPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <Loader2 className="size-8 animate-spin text-[#14B8A6]" />
        </div>
      }
    >
      <SiteReportPrintInner />
    </Suspense>
  );
}
