'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getJson } from '../../apiClient';
import JobReportTab from '../jobs/[id]/JobReportTab';

type JobDescriptionRow = { id: number; name: string };

export default function JobReportTemplateSettings({ token }: { token: string }) {
  const [descriptions, setDescriptions] = useState<JobDescriptionRow[]>([]);
  const [descLoading, setDescLoading] = useState(true);
  const [selectedDescId, setSelectedDescId] = useState<string>('');

  const loadDescriptions = useCallback(async () => {
    setDescLoading(true);
    try {
      const rows = await getJson<JobDescriptionRow[]>('/settings/job-descriptions', token);
      setDescriptions(Array.isArray(rows) ? rows : []);
    } catch {
      setDescriptions([]);
    } finally {
      setDescLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadDescriptions();
  }, [loadDescriptions]);

  return (
    <div className="divide-y divide-slate-200">
      <div className="p-2 sm:p-4">
        <p className="mb-4 max-w-3xl text-sm text-slate-600 px-2 sm:px-4 pt-2">
          <strong className="text-slate-800">Default form</strong> — every new job starts with these questions.{' '}
          <strong className="text-slate-800">Job-type extras</strong> — pick a job description below to add questions
          that are merged <em>after</em> the default when that type is chosen on a new job (e.g. electrical-only
          fields). Manage description names under{' '}
          <Link href="/dashboard/settings?tab=job-descriptions" className="font-semibold text-[#14B8A6] hover:underline">
            Settings → Job descriptions
          </Link>
          .
        </p>
        <JobReportTab token={token} templateTarget="default" />
      </div>

      <div className="bg-slate-50/80 p-4 sm:p-6">
        <h3 className="text-base font-bold text-slate-900">Extra job report fields by job type</h3>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Optional. Leave unselected to only use the default form above. Extras apply to <strong>new</strong> jobs
          created with that job description.
        </p>
        <div className="mt-4 max-w-md">
          <label htmlFor="job-report-desc-pick" className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Job description (job type)
          </label>
          <select
            id="job-report-desc-pick"
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
            value={selectedDescId}
            onChange={(e) => setSelectedDescId(e.target.value)}
            disabled={descLoading}
          >
            <option value="">— None (default only) —</option>
            {descriptions.map((d) => (
              <option key={d.id} value={String(d.id)}>
                {d.name}
              </option>
            ))}
          </select>
          {descLoading ? (
            <p className="mt-2 text-xs text-slate-500">Loading job types…</p>
          ) : descriptions.length === 0 ? (
            <p className="mt-2 text-xs text-slate-600">
              No job descriptions yet. Add one under{' '}
              <Link href="/dashboard/settings?tab=job-descriptions" className="font-semibold text-[#14B8A6] hover:underline">
                Job descriptions
              </Link>
              .
            </p>
          ) : null}
        </div>

        {selectedDescId ? (
          <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <JobReportTab
              token={token}
              templateTarget="job-description"
              jobDescriptionId={selectedDescId}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
