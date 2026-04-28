'use client';

import Link from 'next/link';

export default function PrivacyPolicyPage() {
  const updated = '28 April 2026';
  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      <div className="mx-auto w-full max-w-4xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between gap-4">
          <h1 className="text-3xl font-bold text-slate-900">Privacy Policy</h1>
          <Link
            href="/login"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            Back
          </Link>
        </div>
        <p className="mb-8 text-sm text-slate-500">Last updated: {updated}</p>

        <section className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm leading-6 text-slate-700">
            WorkPilot collects only the information required to operate job management, invoicing,
            diary scheduling, and field service workflows. We process personal and business data
            with access controls, audit logging, and encryption in transit.
          </p>

          <div>
            <h2 className="mb-2 text-lg font-semibold text-slate-900">Data We Collect</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">
              <li>Account information (name, email, role, contact details).</li>
              <li>Customer and work-address records entered by authorized users.</li>
              <li>Job, diary, timesheet, invoice, quotation, and office task data.</li>
              <li>Files uploaded for operational use (images, notes, signatures, documents).</li>
            </ul>
          </div>

          <div>
            <h2 className="mb-2 text-lg font-semibold text-slate-900">How We Use Data</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">
              <li>Provide and improve WorkPilot services and support.</li>
              <li>Enable scheduling, reporting, invoicing, and operational collaboration.</li>
              <li>Maintain service security, integrity, and compliance obligations.</li>
            </ul>
          </div>

          <div>
            <h2 className="mb-2 text-lg font-semibold text-slate-900">Storage and Security</h2>
            <p className="text-sm leading-6 text-slate-700">
              Data is stored in secured infrastructure. Access is role-based and restricted to
              authorized users. Offline mobile submissions are stored locally on device until
              synchronized.
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-lg font-semibold text-slate-900">Retention</h2>
            <p className="text-sm leading-6 text-slate-700">
              Data is retained for active operational, legal, and accounting requirements, and then
              archived or removed according to your organization&apos;s policy.
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-lg font-semibold text-slate-900">Your Rights</h2>
            <p className="text-sm leading-6 text-slate-700">
              You may request access, correction, export, or deletion of applicable personal data
              through your organization&apos;s administrator or support contact.
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-lg font-semibold text-slate-900">Contact</h2>
            <p className="text-sm leading-6 text-slate-700">
              For privacy requests, contact your account administrator or official WorkPilot support
              channel.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
