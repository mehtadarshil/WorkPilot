'use client';

import Link from 'next/link';

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      <div className="mx-auto w-full max-w-4xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between gap-4">
          <h1 className="text-3xl font-bold text-slate-900">Support</h1>
          <Link
            href="/login"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            Back
          </Link>
        </div>

        <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm leading-6 text-slate-700">
            If you need help with WorkPilot, contact us and include any relevant details (what you
            were trying to do, screenshots, and the time it occurred).
          </p>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Support email
            </div>
            <a
              href="mailto:info@ultimate-london.com"
              className="mt-1 inline-block text-sm font-semibold text-[#14B8A6] hover:underline"
            >
              info@ultimate-london.com
            </a>
          </div>

          <div className="text-sm text-slate-600">
            <div className="font-semibold text-slate-800">Helpful links</div>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <Link href="/privacy-policy" className="text-[#14B8A6] hover:underline">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms-of-service" className="text-[#14B8A6] hover:underline">
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}

