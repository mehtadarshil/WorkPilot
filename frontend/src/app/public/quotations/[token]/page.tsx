'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Printer, AlertCircle } from 'lucide-react';
import Image from 'next/image';
import { getJson } from '../../../apiClient';
import QuotationPrintTemplate from '@/app/dashboard/quotations/[id]/QuotationPrintTemplate';
import type { QuotationPrintSettings } from '@/app/dashboard/quotations/[id]/QuotationPrintTemplate';

type LineItem = {
  id: number;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  sort_order: number;
};

type PublicQuotationPayload = {
  quotation: {
    quotation_number: string;
    customer_full_name: string | null;
    customer_email: string | null;
    customer_phone: string | null;
    customer_address: string | null;
    quotation_date: string;
    valid_until: string;
    subtotal: number;
    tax_amount: number;
    total_amount: number;
    currency: string;
    notes: string | null;
    billing_address: string | null;
    state: string;
    settings?: QuotationPrintSettings;
  };
  line_items: LineItem[];
  business: { logo: string | null; name: string; address: string | null };
};

export default function PublicQuotationPage() {
  const params = useParams();
  const token = params?.token as string;
  const [data, setData] = useState<PublicQuotationPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    getJson<PublicQuotationPayload>(`/public/quotations/${token}`)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Quotation not found'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#14B8A6] border-t-transparent" />
        <p className="mt-4 font-medium text-slate-500">Loading quotation…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-xl">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-rose-50 text-rose-500">
            <AlertCircle className="size-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Unable to load quotation</h2>
          <p className="mt-2 text-slate-600">{error || 'This link might have expired or is incorrect.'}</p>
        </div>
      </div>
    );
  }

  const { quotation, line_items, business } = data;
  const settings = quotation.settings;

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-8">
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media print {
          html, body {
            background: white !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          .no-print { display: none !important; }
          #quotation-print {
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            max-width: none !important;
            overflow: visible !important;
            display: block !important;
          }
          #quotation-print, #quotation-print * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          @page { margin: 12mm; }
        }
      `,
        }}
      />

      <div className="no-print mx-auto mb-8 flex max-w-4xl items-center justify-between px-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <Image src="/logo.jpg" alt="WorkPilot" width={40} height={40} className="object-contain" />
          </div>
          <h2 className="text-[13px] font-bold tracking-tight text-slate-600">Quotation</h2>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-lg bg-[#14B8A6] px-5 py-2 text-sm font-bold text-white shadow-md transition-all hover:bg-[#13a89a] active:scale-95"
        >
          <Printer className="size-4" />
          Print / Save PDF
        </button>
      </div>

      <div className="mx-auto max-w-4xl">
        <QuotationPrintTemplate
          quotation={{
            quotation_number: quotation.quotation_number,
            customer_full_name: quotation.customer_full_name,
            customer_email: quotation.customer_email,
            customer_phone: quotation.customer_phone,
            customer_address: quotation.customer_address,
            quotation_date: quotation.quotation_date,
            valid_until: quotation.valid_until,
            subtotal: quotation.subtotal,
            tax_amount: quotation.tax_amount,
            total_amount: quotation.total_amount,
            currency: quotation.currency,
            notes: quotation.notes,
            billing_address: quotation.billing_address,
            line_items,
          }}
          settings={
            {
              company_name: business.name || settings?.company_name || 'WorkPilot',
              company_address: business.address ?? settings?.company_address ?? null,
              company_phone: settings?.company_phone ?? null,
              company_email: settings?.company_email ?? null,
              company_logo: business.logo ?? settings?.company_logo ?? null,
              company_website: settings?.company_website ?? null,
              company_tax_id: settings?.company_tax_id ?? null,
              tax_label: settings?.tax_label ?? 'Tax',
              terms_and_conditions: settings?.terms_and_conditions ?? null,
              footer_text: settings?.footer_text ?? null,
              quotation_accent_color: settings?.quotation_accent_color ?? null,
              quotation_accent_end_color: settings?.quotation_accent_end_color ?? null,
              payment_terms: settings?.payment_terms ?? null,
              bank_details: settings?.bank_details ?? null,
            } satisfies QuotationPrintSettings
          }
          shellClassName="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
        />
      </div>

      <div className="no-print mt-10 text-center text-[11px] font-semibold text-slate-400">POWERED BY WORKPILOT</div>
    </div>
  );
}
