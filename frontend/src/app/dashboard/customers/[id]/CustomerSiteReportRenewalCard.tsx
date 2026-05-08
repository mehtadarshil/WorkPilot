'use client';

import { useEffect, useState } from 'react';
import { Bell, Loader2 } from 'lucide-react';
import dayjs from 'dayjs';
import { patchJson } from '../../../apiClient';

export type SiteReportRenewalState = {
  renewal_reminder_enabled: boolean;
  renewal_anchor_date: string | null;
  renewal_interval_years: number;
  renewal_early_days: number;
  renewal_job_id: number | null;
};

type Props = {
  token: string;
  customerId: string;
  workAddressId?: string;
  reportId: number;
  initial: SiteReportRenewalState;
  reportUpdatedAt: string;
  jobId?: string | null;
  onApplied: (next: SiteReportRenewalState) => void;
};

export default function CustomerSiteReportRenewalCard({
  token,
  customerId,
  workAddressId,
  reportId,
  initial,
  reportUpdatedAt,
  jobId,
  onApplied,
}: Props) {
  const [enabled, setEnabled] = useState(initial.renewal_reminder_enabled);
  const [anchor, setAnchor] = useState(initial.renewal_anchor_date || '');
  const [intervalYears, setIntervalYears] = useState(String(initial.renewal_interval_years));
  const [earlyDays, setEarlyDays] = useState(String(initial.renewal_early_days));
  const [linkJobId, setLinkJobId] = useState<number | null>(initial.renewal_job_id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    setEnabled(initial.renewal_reminder_enabled);
    setAnchor(initial.renewal_anchor_date || '');
    setIntervalYears(String(initial.renewal_interval_years));
    setEarlyDays(String(initial.renewal_early_days));
    setLinkJobId(initial.renewal_job_id);
  }, [
    initial.renewal_reminder_enabled,
    initial.renewal_anchor_date,
    initial.renewal_interval_years,
    initial.renewal_early_days,
    initial.renewal_job_id,
    reportId,
  ]);

  const parsedJobId = jobId && String(jobId).trim() ? parseInt(String(jobId), 10) : NaN;
  const canLinkThisJob = Number.isFinite(parsedJobId);

  const handleToggle = (next: boolean) => {
    setEnabled(next);
    if (next && !anchor.trim()) {
      const d = dayjs(reportUpdatedAt);
      setAnchor(d.isValid() ? d.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'));
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setOk(false);
    const anchorYmd = anchor.trim() || null;
    if (enabled && !anchorYmd) {
      setError('Set the “last assessment” date before turning reminders on.');
      setSaving(false);
      return;
    }
    let iy = parseInt(intervalYears, 10);
    let ed = parseInt(earlyDays, 10);
    if (!Number.isFinite(iy) || iy < 1) iy = 1;
    if (iy > 10) iy = 10;
    if (!Number.isFinite(ed) || ed < 1) ed = 14;
    if (ed > 120) ed = 120;
    try {
      const res = await patchJson<{ report: SiteReportRenewalState & { id: number } }>(
        `/customers/${customerId}/site-report/renewal-reminder`,
        {
          report_id: reportId,
          work_address_id: workAddressId ? Number(workAddressId) : null,
          renewal_reminder_enabled: enabled,
          renewal_anchor_date: anchorYmd,
          renewal_interval_years: iy,
          renewal_early_days: ed,
          renewal_job_id: linkJobId,
        },
        token,
      );
      const r = res.report;
      const next: SiteReportRenewalState = {
        renewal_reminder_enabled: r.renewal_reminder_enabled,
        renewal_anchor_date: r.renewal_anchor_date,
        renewal_interval_years: r.renewal_interval_years,
        renewal_early_days: r.renewal_early_days,
        renewal_job_id: r.renewal_job_id,
      };
      onApplied(next);
      setOk(true);
      window.setTimeout(() => setOk(false), 2200);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save reminder settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-amber-200/80 bg-amber-50/40 p-5 shadow-sm print:hidden">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-amber-100 p-2 text-amber-800">
          <Bell className="size-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Renewal email reminders</h3>
            <p className="mt-1 text-xs text-slate-600 leading-relaxed">
              Separate from service job checklists: we email the customer before and on the next renewal date, based on
              the date of the last assessment. Recipient rules match{' '}
              <span className="font-semibold text-slate-800">Settings → Service reminders</span> (and per-customer
              overrides). Edit the <code className="rounded bg-white/80 px-1">site_report_renewal</code> template under{' '}
              <span className="font-semibold text-slate-800">Settings → Email</span>.
            </p>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-800">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => handleToggle(e.target.checked)}
              className="rounded border-slate-300 text-[#14B8A6] focus:ring-[#14B8A6]"
            />
            Send automated renewal reminders for this report
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Last assessment date (anchor)
              <input
                type="date"
                value={anchor}
                onChange={(e) => setAnchor(e.target.value)}
                disabled={!enabled}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm font-normal text-slate-900 outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30 disabled:opacity-50"
              />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Renew every (years)
              <input
                type="number"
                min={1}
                max={10}
                value={intervalYears}
                onChange={(e) => setIntervalYears(e.target.value)}
                disabled={!enabled}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm font-normal text-slate-900 outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30 disabled:opacity-50"
              />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 sm:col-span-2">
              First reminder (days before due)
              <input
                type="number"
                min={1}
                max={120}
                value={earlyDays}
                onChange={(e) => setEarlyDays(e.target.value)}
                disabled={!enabled}
                className="mt-1 w-full max-w-xs rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm font-normal text-slate-900 outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30 disabled:opacity-50"
              />
            </label>
          </div>

          {canLinkThisJob ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span className="font-medium text-slate-700">Job contact for “job contact” mode:</span>
              {linkJobId === parsedJobId ? (
                <span className="rounded-md bg-white px-2 py-1 font-mono text-slate-800">Job #{parsedJobId}</span>
              ) : (
                <button
                  type="button"
                  disabled={!enabled}
                  onClick={() => setLinkJobId(parsedJobId)}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 font-semibold text-[#0d9488] hover:bg-slate-50 disabled:opacity-50"
                >
                  Use this job (#{parsedJobId})
                </button>
              )}
              {linkJobId != null ? (
                <button
                  type="button"
                  disabled={!enabled}
                  onClick={() => setLinkJobId(null)}
                  className="text-rose-600 font-semibold hover:underline disabled:opacity-50"
                >
                  Clear job link
                </button>
              ) : null}
            </div>
          ) : null}

          {error ? <p className="text-xs text-rose-700">{error}</p> : null}
          {ok ? <p className="text-xs font-medium text-emerald-700">Reminder settings saved.</p> : null}

          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Save reminder settings
          </button>
        </div>
      </div>
    </section>
  );
}
