'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { getJson } from '@/app/apiClient';
import QuotationPrintTemplate from '@/app/dashboard/quotations/[id]/QuotationPrintTemplate';
import type { QuotationPrintModel, QuotationPrintSettings } from '@/app/dashboard/quotations/[id]/QuotationPrintTemplate';

type QuotationPayload = QuotationPrintModel & { settings?: QuotationPrintSettings };

export default function QuotationPrintClient() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  const token = searchParams.get('token');
  const [quotation, setQuotation] = useState<QuotationPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError('Invalid quotation');
      return;
    }
    if (!token) {
      setError('Missing access token');
      return;
    }
    let cancelled = false;
    setError(null);
    setQuotation(null);
    getJson<{ quotation: QuotationPayload }>(`/quotations/${id}`, token)
      .then((r) => {
        if (!cancelled) setQuotation(r.quotation);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load quotation');
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
  if (!quotation) {
    return (
      <div className="min-h-screen bg-white p-8">
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  const q: QuotationPrintModel = {
    quotation_number: quotation.quotation_number,
    customer_full_name: quotation.customer_full_name,
    customer_email: quotation.customer_email,
    customer_phone: quotation.customer_phone,
    customer_address: quotation.customer_address,
    work_site_name: quotation.work_site_name,
    work_site_address: quotation.work_site_address,
    quotation_custom_address: quotation.quotation_custom_address,
    quotation_date: quotation.quotation_date,
    valid_until: quotation.valid_until,
    subtotal: quotation.subtotal,
    tax_amount: quotation.tax_amount,
    total_amount: quotation.total_amount,
    currency: quotation.currency,
    notes: quotation.notes,
    description: quotation.description ?? null,
    billing_address: quotation.billing_address,
    line_items: quotation.line_items,
  };

  return (
    <div className="min-h-screen bg-[#f6f8f8] p-6 print:bg-white print:p-0">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            #quotation-print, #quotation-print * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              color-adjust: exact !important;
            }
            @page { margin: 12mm; }
          `,
        }}
      />
      <div className="mx-auto max-w-4xl">
        <QuotationPrintTemplate quotation={q} settings={quotation.settings} />
      </div>
    </div>
  );
}
