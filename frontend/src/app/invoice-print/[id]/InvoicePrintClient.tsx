'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { getJson } from '@/app/apiClient';
import InvoicePrintTemplate from '@/app/dashboard/invoices/[id]/InvoicePrintTemplate';
import type { InvoicePrintModel, InvoicePrintSettings } from '@/app/dashboard/invoices/[id]/InvoicePrintTemplate';

type InvoicePayload = InvoicePrintModel & { settings?: InvoicePrintSettings };

export default function InvoicePrintClient() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  const token = searchParams.get('token');
  const [invoice, setInvoice] = useState<InvoicePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError('Invalid invoice');
      return;
    }
    if (!token) {
      setError('Missing access token');
      return;
    }
    let cancelled = false;
    setError(null);
    setInvoice(null);
    getJson<{ invoice: InvoicePayload }>(`/invoices/${id}`, token)
      .then((r) => {
        if (!cancelled) setInvoice(r.invoice);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load invoice');
      });
    return () => {
      cancelled = true;
    };
  }, [id, token]);

  if (error) {
    return (
      <div className="min-h-screen bg-white p-8">
        <p className="text-sm text-rose-600">{error}</p>
      </div>
    );
  }
  if (!invoice) {
    return (
      <div className="min-h-screen bg-white p-8">
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f8f8] p-6 print:bg-white print:p-0">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            #invoice-print, #invoice-print * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              color-adjust: exact !important;
            }
            @page { margin: 12mm; size: auto; }
          `,
        }}
      />
      <div className="mx-auto max-w-4xl">
        <InvoicePrintTemplate invoice={invoice} settings={invoice.settings} />
      </div>
    </div>
  );
}
