'use client';

import Link from 'next/link';

export default function TermsOfServicePage() {
  const updated = '28 April 2026';
  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      <div className="mx-auto w-full max-w-4xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between gap-4">
          <h1 className="text-3xl font-bold text-slate-900">Terms of Service</h1>
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
            These Terms of Service govern the use of WorkPilot by authorized organizations and
            users. By accessing or using WorkPilot, you agree to these terms.
          </p>

          <div>
            <h2 className="mb-2 text-lg font-semibold text-slate-900">Service Use</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">
              <li>Use the platform only for lawful business operations.</li>
              <li>Keep account credentials secure and confidential.</li>
              <li>Do not misuse, reverse engineer, or disrupt the service.</li>
            </ul>
          </div>

          <div>
            <h2 className="mb-2 text-lg font-semibold text-slate-900">User Responsibilities</h2>
            <p className="text-sm leading-6 text-slate-700">
              You are responsible for the accuracy and legality of data entered into WorkPilot,
              including customer records, notes, files, and job updates.
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-lg font-semibold text-slate-900">Data and Availability</h2>
            <p className="text-sm leading-6 text-slate-700">
              We aim to provide reliable uptime and secure processing, but service may be
              interrupted for maintenance, upgrades, or events outside our control.
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-lg font-semibold text-slate-900">Intellectual Property</h2>
            <p className="text-sm leading-6 text-slate-700">
              WorkPilot software, branding, and associated materials remain the property of their
              respective owners. Your organization retains ownership of your operational data.
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-lg font-semibold text-slate-900">Limitation of Liability</h2>
            <p className="text-sm leading-6 text-slate-700">
              To the extent permitted by law, WorkPilot is provided on an &quot;as is&quot; basis without
              warranties of uninterrupted or error-free operation.
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-lg font-semibold text-slate-900">Changes to Terms</h2>
            <p className="text-sm leading-6 text-slate-700">
              Terms may be updated from time to time. Continued use of WorkPilot after updates
              constitutes acceptance of the revised terms.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
