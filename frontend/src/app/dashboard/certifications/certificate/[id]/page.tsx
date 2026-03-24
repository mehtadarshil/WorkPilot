'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Printer } from 'lucide-react';
import { getJson } from '../../../../apiClient';

interface CertificateData {
  id: number;
  officer_name: string;
  officer_role: string | null;
  officer_department: string | null;
  certification_name: string;
  certification_description: string | null;
  issued_date: string;
  expiry_date: string;
  certificate_number: string | null;
  issued_by: string | null;
  notes: string | null;
}

interface CompanyData {
  company_name: string;
  company_address: string | null;
  company_phone: string | null;
  company_email: string | null;
  company_logo: string | null;
  company_website: string | null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function CertificatePage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : String(params.id);
  const [certificate, setCertificate] = useState<CertificateData | null>(null);
  const [company, setCompany] = useState<CompanyData | null>(null);
  const [loading, setLoading] = useState(true);

  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  const fetchCertificate = useCallback(async () => {
    if (!token || !id) return;
    try {
      const data = await getJson<{ certificate: CertificateData; company: CompanyData }>(
        `/officer-certifications/${id}`,
        token,
      );
      setCertificate(data.certificate);
      setCompany(data.company);
    } catch {
      setCertificate(null);
      setCompany(null);
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useEffect(() => {
    fetchCertificate();
  }, [fetchCertificate]);

  const handlePrint = () => window.print();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-slate-500">Loading certificate…</p>
      </div>
    );
  }

  if (!certificate || !company) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-slate-500">Certificate not found.</p>
        <Link href="/dashboard/certifications" className="text-[#14B8A6] hover:underline">
          Back to Certifications
        </Link>
      </div>
    );
  }

  const companyName = company.company_name || 'WorkPilot';

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          .no-print { display: none !important; }
          aside { display: none !important; }
          main { padding: 0 !important; }
          body { background: white !important; }
          #certificate-print { box-shadow: none !important; margin: 0 !important; }
          @page { size: A4 landscape; margin: 12mm; }
        }
      `}} />
      <div className="flex min-h-screen items-center justify-center p-8 print:p-0">
        <div className="no-print absolute left-4 top-4 flex gap-2">
          <Link
            href="/dashboard/certifications"
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
          >
            <ArrowLeft className="size-4" />
            Back
          </Link>
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-2 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#13a89a]"
          >
            <Printer className="size-4" />
            Print / Save as PDF
          </button>
        </div>

        {/* Certificate - formal diploma style, landscape */}
        <div
          id="certificate-print"
          className="relative w-full max-w-[900px] aspect-[3/2] bg-white print:max-w-none print:aspect-auto print:h-[calc(100vh-24mm)] print:w-[calc(100vw-24mm)]"
          style={{ minHeight: '500px' }}
        >
          {/* Outer ornate border */}
          <div className="absolute inset-0 border-[3px] border-amber-800/40" />
          <div className="absolute inset-3 border border-amber-700/30" />
          <div className="absolute inset-6 border border-slate-300/60" />

          {/* Corner ornaments */}
          <div className="absolute left-4 top-4 size-12 border-l-2 border-t-2 border-amber-700/50" />
          <div className="absolute right-4 top-4 size-12 border-r-2 border-t-2 border-amber-700/50" />
          <div className="absolute bottom-4 left-4 size-12 border-b-2 border-l-2 border-amber-700/50" />
          <div className="absolute bottom-4 right-4 size-12 border-b-2 border-r-2 border-amber-700/50" />

          {/* Content - centered */}
          <div className="absolute inset-8 flex flex-col items-center justify-center text-center print:inset-12">
            {/* Logo */}
            <div className="mb-4 flex justify-center">
              {company.company_logo ? (
                <img src={company.company_logo} alt="" className="h-14 w-auto object-contain" />
              ) : (
                <div className="relative h-14 w-14">
                  <Image src="/logo.jpg" alt="" fill className="object-contain" />
                </div>
              )}
            </div>

            {/* Organization name */}
            <p className="mb-1 text-sm font-semibold uppercase tracking-[0.2em] text-slate-600">
              {companyName}
            </p>
            {(company.company_address || company.company_website) && (
              <p className="mb-6 text-xs text-slate-500">
                {[company.company_address, company.company_website].filter(Boolean).join(' • ')}
              </p>
            )}

            {/* Main title */}
            <p className="mb-2 text-4xl font-bold tracking-wide text-amber-900/90 print:text-5xl" style={{ fontFamily: 'Georgia, serif' }}>
              CERTIFICATE
            </p>
            <p className="mb-6 text-sm font-medium uppercase tracking-[0.25em] text-slate-500">
              of Achievement
            </p>

            {/* Decorative line */}
            <div className="mb-6 h-0.5 w-32 bg-gradient-to-r from-transparent via-amber-600/60 to-transparent" />

            {/* Certification statement */}
            <p className="mb-3 text-base text-slate-600">
              This is to certify that
            </p>
            <h2 className="mb-4 text-3xl font-bold text-slate-900 print:text-4xl" style={{ fontFamily: 'Georgia, serif' }}>
              {certificate.officer_name}
            </h2>
            {(certificate.officer_role || certificate.officer_department) && (
              <p className="mb-4 text-sm italic text-slate-500">
                {[certificate.officer_role, certificate.officer_department].filter(Boolean).join(' • ')}
              </p>
            )}
            <p className="mb-2 text-base text-slate-600">
              has successfully completed the requirements and is hereby awarded
            </p>
            <h3 className="mb-4 text-2xl font-bold text-amber-800 print:text-3xl" style={{ fontFamily: 'Georgia, serif' }}>
              {certificate.certification_name}
            </h3>
            {certificate.certification_description && (
              <p className="mb-6 max-w-lg text-sm text-slate-500">
                {certificate.certification_description}
              </p>
            )}

            {/* Dates and number */}
            <div className="mb-8 flex flex-wrap justify-center gap-8 text-sm">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Date of Issue</p>
                <p className="font-medium text-slate-800">{formatDate(certificate.issued_date)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Valid Until</p>
                <p className="font-medium text-slate-800">{formatDate(certificate.expiry_date)}</p>
              </div>
              {certificate.certificate_number && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Certificate No.</p>
                  <p className="font-mono font-medium text-slate-800">{certificate.certificate_number}</p>
                </div>
              )}
            </div>

            {/* Signature line */}
            <div className="mt-auto w-48 border-t-2 border-slate-400 pt-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Authorized Signature
              </p>
            </div>

            {/* Issued by & verification */}
            <div className="mt-4 space-y-1">
              {certificate.issued_by && (
                <p className="text-xs text-slate-500">Issued by {certificate.issued_by}</p>
              )}
              {company.company_website && (
                <p className="text-xs text-slate-400">Verify at {company.company_website}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
