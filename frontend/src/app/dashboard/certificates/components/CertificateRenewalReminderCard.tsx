'use client';

import { useEffect, useState } from 'react';
import { Bell, Loader2 } from 'lucide-react';
import dayjs from 'dayjs';
import { patchJson } from '../../../apiClient';
import type { ElectricalCertificate } from '@/lib/electricalCertificates/types';
import { useCertificateEditor } from '../CertificateEditorContext';

export function CertificateRenewalReminderCard() {
  const { certificate, applyCertificate } = useCertificateEditor();
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;
  const [enabled, setEnabled] = useState(certificate.renewal_reminder_enabled);
  const [anchor, setAnchor] = useState(certificate.renewal_anchor_date || '');
  const [intervalYears, setIntervalYears] = useState(String(certificate.renewal_interval_years || 1));
  const [earlyDays, setEarlyDays] = useState(String(certificate.renewal_early_days || 30));
  const [linkJobId, setLinkJobId] = useState<number | null>(certificate.renewal_job_id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    setEnabled(certificate.renewal_reminder_enabled);
    setAnchor(certificate.renewal_anchor_date || '');
    setIntervalYears(String(certificate.renewal_interval_years || 1));
    setEarlyDays(String(certificate.renewal_early_days || 30));
    setLinkJobId(certificate.renewal_job_id);
  }, [
    certificate.id,
    certificate.renewal_reminder_enabled,
    certificate.renewal_anchor_date,
    certificate.renewal_interval_years,
    certificate.renewal_early_days,
    certificate.renewal_job_id,
  ]);

  const parsedJobId = certificate.job_id != null ? Number(certificate.job_id) : NaN;
  const canLinkThisJob = Number.isFinite(parsedJobId);

  const handleToggle = (next: boolean) => {
    setEnabled(next);
    if (next && !anchor.trim()) {
      const d = dayjs(certificate.updated_at);
      setAnchor(d.isValid() ? d.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'));
    }
  };

  const save = async () => {
    if (!token) return;
    setSaving(true);
    setError(null);
    setOk(false);
    const anchorYmd = anchor.trim() || null;
    if (enabled && !anchorYmd) {
      setError('Set the last certificate date before turning reminders on.');
      setSaving(false);
      return;
    }
    let iy = parseInt(intervalYears, 10);
    let ed = parseInt(earlyDays, 10);
    if (!Number.isFinite(iy) || iy < 1) iy = 1;
    if (iy > 10) iy = 10;
    if (!Number.isFinite(ed) || ed < 1) ed = 30;
    if (ed > 120) ed = 120;

    try {
      const res = await patchJson<{ certificate: ElectricalCertificate }>(
        `/electrical-certificates/${certificate.id}/renewal-reminder`,
        {
          renewal_reminder_enabled: enabled,
          renewal_anchor_date: anchorYmd,
          renewal_interval_years: iy,
          renewal_early_days: ed,
          renewal_job_id: linkJobId,
        },
        token,
      );
      applyCertificate(res.certificate);
      setOk(true);
      window.setTimeout(() => setOk(false), 2200);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save reminder settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="shrink-0 border-b border-amber-200/80 bg-amber-50/70 px-4 py-3 print:hidden">
      <div className="mx-auto flex max-w-6xl flex-wrap items-start gap-3">
        <div className="rounded-lg bg-amber-100 p-2 text-amber-800">
          <Bell className="size-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-800">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => handleToggle(e.target.checked)}
                className="rounded border-slate-300 text-[#14B8A6] focus:ring-[#14B8A6]"
              />
              Send renewal reminders for this certificate
            </label>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Last certificate date
              <input
                type="date"
                value={anchor}
                onChange={(e) => setAnchor(e.target.value)}
                disabled={!enabled}
                className="ml-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-normal text-slate-900 disabled:opacity-50"
              />
            </label>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Renew every
              <input
                type="number"
                min={1}
                max={10}
                value={intervalYears}
                onChange={(e) => setIntervalYears(e.target.value)}
                disabled={!enabled}
                className="ml-2 w-16 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-normal text-slate-900 disabled:opacity-50"
              />{' '}
              years
            </label>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              First reminder
              <input
                type="number"
                min={1}
                max={120}
                value={earlyDays}
                onChange={(e) => setEarlyDays(e.target.value)}
                disabled={!enabled}
                className="ml-2 w-16 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-normal text-slate-900 disabled:opacity-50"
              />{' '}
              days before
            </label>
            {canLinkThisJob ? (
              <button
                type="button"
                disabled={!enabled}
                onClick={() => setLinkJobId(linkJobId === parsedJobId ? null : parsedJobId)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-[#0d9488] hover:bg-slate-50 disabled:opacity-50"
              >
                {linkJobId === parsedJobId ? `Using job #${parsedJobId}` : `Use job #${parsedJobId} contact`}
              </button>
            ) : null}
            <button
              type="button"
              disabled={saving || !token}
              onClick={() => void save()}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Save reminder
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-600">
            Uses Settings → Service reminders delivery rules and appears on the customer Service reminders view.
          </p>
          {error ? <p className="mt-1 text-xs text-rose-700">{error}</p> : null}
          {ok ? <p className="mt-1 text-xs font-medium text-emerald-700">Reminder settings saved.</p> : null}
        </div>
      </div>
    </section>
  );
}
