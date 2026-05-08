'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, Loader2, Play } from 'lucide-react';
import { getJson, patchJson, postJson } from '../../apiClient';

type RecipientMode = 'customer_account' | 'job_contact' | 'primary_contact';

type ServiceReminderSettings = {
  automated_enabled: boolean;
  recipient_mode: RecipientMode;
};

const inputClass =
  'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30';

export default function ServiceRemindersSettings({ token }: { token: string | null }) {
  const [settings, setSettings] = useState<ServiceReminderSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getJson<{ settings: ServiceReminderSettings }>('/settings/service-reminders', token);
      setSettings(data.settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
      setSettings(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !settings) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const data = await patchJson<{ settings: ServiceReminderSettings }>(
        '/settings/service-reminders',
        {
          automated_enabled: settings.automated_enabled,
          recipient_mode: settings.recipient_mode,
        },
        token,
      );
      setSettings(data.settings);
      setMessage('Saved.');
      setTimeout(() => setMessage(null), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    if (!token) return;
    setRunning(true);
    setError(null);
    setMessage(null);
    try {
      const r = await postJson<{
        service_reminders: { sent: number; skipped: number; errors: string[] };
        site_report_renewals: { sent: number; skipped: number; errors: string[] };
        job_office_task_reminders: { sent: number; errors: string[] };
        staff_reminders: { sent: number; errors: string[] };
      }>('/settings/service-reminders/run-now', {}, token);
      const svc = r.service_reminders;
      const srr = r.site_report_renewals;
      const job = r.job_office_task_reminders;
      const st = r.staff_reminders;
      const allErr = [...svc.errors, ...srr.errors, ...job.errors, ...st.errors];
      const errPart = allErr.length ? ` Errors: ${allErr.slice(0, 5).join('; ')}` : '';
      setMessage(
        `Run finished. Service renewals: sent ${svc.sent}, skipped ${svc.skipped}. Site report renewals: sent ${srr.sent}, skipped ${srr.skipped}. Job reminders: sent ${job.sent}. Staff reminders: sent ${st.sent}.${errPart}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Run failed');
    } finally {
      setRunning(false);
    }
  };

  if (!token) {
    return <p className="text-sm text-slate-500">Sign in to manage reminders.</p>;
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-600">
        <Loader2 className="size-5 animate-spin" />
        Loading…
      </div>
    );
  }

  if (!settings) {
    return <p className="text-sm text-red-600">{error || 'Could not load settings.'}</p>;
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#14B8A6]/10 text-[#14B8A6]">
          <Bell className="size-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Service renewal reminders</h2>
          <p className="mt-1 text-sm text-slate-500">
            Automated customer emails use each service&apos;s repeat interval and timing from{' '}
            <strong>Settings → Job descriptions</strong> (service checklist, including optional per-service email
            overrides). Only completed service jobs with an expected completion date and services ticked for reminder
            emails are considered. Per-customer opt-out is on the customer record. Use <strong>Run pending reminders now</strong>{' '}
            to also process job assignee reminders and staff (user) reminders for the whole tenant.
          </p>
        </div>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {message && <p className="mb-3 text-sm text-emerald-700">{message}</p>}

      <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-700">
        <p className="font-semibold text-slate-900">Where customer &quot;per service&quot; reminders are configured</p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-slate-600">
          <li>
            <Link href="/dashboard/settings?tab=job-descriptions#wp-service-checklist" className="font-medium text-[#14B8A6] hover:underline">
              Settings → Job descriptions → Service checklist
            </Link>
            : add each service type (e.g. Power Flush), repeat interval, weeks-before-due (or early window), and optional subject/body overrides. The checklist <strong>service name</strong> must match the name on the completed job.
          </li>
          <li>
            On each <strong>service job</strong>, when marking complete, tick the services performed and leave &quot;remind by email&quot; on for those that should trigger renewal emails for that customer.
          </li>
          <li>
            This page controls <strong>automation on/off</strong>, the <strong>default who gets the email</strong> (account vs job contact vs primary contact), and running the processor. On each{' '}
            <strong>customer</strong> you can turn reminders off, set a <strong>custom reminder address</strong>, or override the recipient rule — open the customer and expand <strong>Service reminders → View</strong>.
          </li>
          <li>
            Email wording defaults under Settings → Email → Templates (<code className="rounded bg-white px-0.5">service_reminder</code>).
          </li>
          <li>
            <strong>Site reports</strong> (e.g. FRA on the job <strong>Reports</strong> tab): renewal reminders are configured on the report itself and use the{' '}
            <code className="rounded bg-white px-0.5">site_report_renewal</code> template. The recipient options above apply there too (link a job on the report if you use job contact).
          </li>
        </ol>
        <p className="mt-3 text-xs text-slate-500">
          Staff reminders (about an employee, to tenant admins) are managed under{' '}
          <Link href="/dashboard/settings?tab=users" className="font-medium text-[#14B8A6] hover:underline">
            Settings → Users
          </Link>
          : open a user, then the <strong>Reminders</strong> tab.
        </p>
      </div>

      <form onSubmit={save} className="space-y-5">
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            className="size-4 rounded border-slate-300"
            checked={settings.automated_enabled}
            onChange={(e) => setSettings({ ...settings, automated_enabled: e.target.checked })}
          />
          <span className="text-sm font-medium text-slate-800">Send automated reminder emails</span>
        </label>

        <div>
          <label className="block text-sm font-medium text-slate-700">Send reminders to</label>
          <select
            className={inputClass}
            value={settings.recipient_mode}
            onChange={(e) =>
              setSettings({ ...settings, recipient_mode: e.target.value as RecipientMode })
            }
          >
            <option value="customer_account">Customer account email</option>
            <option value="job_contact">Job contact (the contact selected on the job)</option>
            <option value="primary_contact">Primary customer contact (falls back to account email)</option>
          </select>
          <p className="mt-1 text-xs text-slate-500">
            Choose whether renewal emails go to the billing/account address, the job&apos;s linked contact, or your
            primary CRM contact for that customer.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#0d9488] disabled:opacity-60"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Save
          </button>
          <button
            type="button"
            onClick={runNow}
            disabled={running}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-60"
          >
            {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            Run pending reminders now
          </button>
        </div>
      </form>

      <p className="mt-6 border-t border-slate-100 pt-4 text-xs text-slate-500">
        Edit <strong>service_reminder</strong> and <strong>site_report_renewal</strong> under Settings → Email → Templates. Optional: call{' '}
        <code className="rounded bg-slate-100 px-1">POST /api/internal/reminders</code> (or{' '}
        <code className="rounded bg-slate-100 px-1">POST /api/internal/service-reminders</code>) with header{' '}
        <code className="rounded bg-slate-100 px-1">x-cron-secret</code> (same value as <code className="rounded bg-slate-100 px-1">CRON_SECRET</code>
        ) to run service renewals, site report renewals, job reminder emails, and staff reminder emails. The server also runs this on a timer
        (override interval with <code className="rounded bg-slate-100 px-1">SERVICE_REMINDER_INTERVAL_MS</code>).
      </p>
    </div>
  );
}
