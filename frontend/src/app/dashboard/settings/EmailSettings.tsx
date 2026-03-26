'use client';

import { useCallback, useEffect, useState } from 'react';
import { Mail, Send } from 'lucide-react';
import { getJson, patchJson, postJson } from '../../apiClient';

interface EmailSettingsState {
  smtp_enabled: boolean;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_secure: boolean;
  smtp_user: string | null;
  smtp_password_set: boolean;
  smtp_reject_unauthorized: boolean;
  from_name: string | null;
  from_email: string | null;
  reply_to: string | null;
  default_signature_html: string | null;
}

interface EmailTemplateRow {
  template_key: string;
  name: string;
  subject: string;
  body_html: string;
  updated_at: string;
}

const VARS_HELP: Record<string, string> = {
  invoice:
    '{{company_name}}, {{customer_name}}, {{invoice_number}}, {{invoice_total}}, {{currency}}, {{invoice_date}}, {{due_date}}',
  quotation:
    '{{company_name}}, {{customer_name}}, {{quotation_number}}, {{quotation_total}}, {{currency}}, {{quotation_date}}, {{valid_until}}',
  general: '{{company_name}}, {{message}}',
};

export default function EmailSettings() {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [smtpEnabled, setSmtpEnabled] = useState(false);
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpPasswordSet, setSmtpPasswordSet] = useState(false);
  const [smtpRejectUnauthorized, setSmtpRejectUnauthorized] = useState(true);
  const [fromName, setFromName] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [signatureHtml, setSignatureHtml] = useState('');

  const [templates, setTemplates] = useState<EmailTemplateRow[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');
  const [savingTpl, setSavingTpl] = useState(false);

  const [testTo, setTestTo] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  const inputClass =
    'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30';

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [emailRes, tplRes] = await Promise.all([
        getJson<{ settings: EmailSettingsState }>('/settings/email', token),
        getJson<{ templates: EmailTemplateRow[] }>('/settings/email-templates', token),
      ]);
      const s = emailRes.settings;
      setSmtpEnabled(s.smtp_enabled);
      setSmtpHost(s.smtp_host ?? '');
      setSmtpPort(s.smtp_port ?? 587);
      setSmtpSecure(s.smtp_secure);
      setSmtpUser(s.smtp_user ?? '');
      setSmtpPassword('');
      setSmtpPasswordSet(s.smtp_password_set);
      setSmtpRejectUnauthorized(s.smtp_reject_unauthorized);
      setFromName(s.from_name ?? '');
      setFromEmail(s.from_email ?? '');
      setReplyTo(s.reply_to ?? '');
      setSignatureHtml(s.default_signature_html ?? '');
      setTemplates(tplRes.templates ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load email settings');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSaveSmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const body: Record<string, unknown> = {
        smtp_enabled: smtpEnabled,
        smtp_host: smtpHost.trim() || null,
        smtp_port: smtpPort,
        smtp_secure: smtpSecure,
        smtp_user: smtpUser.trim() || null,
        smtp_reject_unauthorized: smtpRejectUnauthorized,
        from_name: fromName.trim() || null,
        from_email: fromEmail.trim() || null,
        reply_to: replyTo.trim() || null,
        default_signature_html: signatureHtml || null,
      };
      if (smtpPassword.trim()) {
        body.smtp_password = smtpPassword;
      }
      await patchJson('/settings/email', body, token);
      setSaved(true);
      setSmtpPassword('');
      setTimeout(() => setSaved(false), 2500);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTemplate = async (key: string) => {
    if (!token) return;
    setSavingTpl(true);
    setError(null);
    try {
      await patchJson(`/settings/email-templates/${encodeURIComponent(key)}`, {
        subject: editSubject,
        body_html: editBody,
      }, token);
      setEditingKey(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setSavingTpl(false);
    }
  };

  const startEdit = (t: EmailTemplateRow) => {
    setEditingKey(t.template_key);
    setEditSubject(t.subject);
    setEditBody(t.body_html);
  };

  const handleTest = async () => {
    if (!token || !testTo.trim()) return;
    setTestSending(true);
    setTestMsg(null);
    setError(null);
    try {
      await postJson<{ success: boolean; message: string }>('/settings/email/test', { to: testTo.trim() }, token);
      setTestMsg('Test email sent. Check the inbox (and spam).');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test send failed');
    } finally {
      setTestSending(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Loading email settings…</p>;
  }

  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Email & SMTP</h2>
        <p className="mt-1 text-sm text-slate-500">
          Configure outgoing mail for invoices, quotations, and future automations. Use placeholders in templates below.
        </p>
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
      {saved && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Settings saved.</p>}
      {testMsg && <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">{testMsg}</p>}

      <form onSubmit={handleSaveSmtp} className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <Mail className="size-5 text-[#14B8A6]" />
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-800">
            <input
              type="checkbox"
              checked={smtpEnabled}
              onChange={(e) => setSmtpEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-[#14B8A6] focus:ring-[#14B8A6]"
            />
            Enable SMTP sending
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700">SMTP host</label>
            <input type="text" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.gmail.com" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Port</label>
            <input
              type="number"
              min={1}
              max={65535}
              value={smtpPort}
              onChange={(e) => setSmtpPort(parseInt(e.target.value, 10) || 587)}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-slate-500">Common: 587 (STARTTLS), 465 (SSL), 25 (often blocked).</p>
          </div>
          <div className="flex flex-col justify-end">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={smtpSecure}
                onChange={(e) => setSmtpSecure(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-[#14B8A6] focus:ring-[#14B8A6]"
              />
              Use SSL (secure: true — typical for port 465)
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Username</label>
            <input type="text" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} autoComplete="off" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Password / app password</label>
            <input
              type="password"
              value={smtpPassword}
              onChange={(e) => setSmtpPassword(e.target.value)}
              placeholder={smtpPasswordSet ? 'Leave blank to keep existing' : 'Optional if server allows open relay'}
              autoComplete="new-password"
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={smtpRejectUnauthorized}
                onChange={(e) => setSmtpRejectUnauthorized(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-[#14B8A6] focus:ring-[#14B8A6]"
              />
              Reject unauthorized TLS certificates (disable only for self-signed dev servers)
            </label>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-6">
          <h3 className="text-sm font-semibold text-slate-900">Sender identity</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">From name</label>
              <input type="text" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Your company" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">From email *</label>
              <input type="email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="billing@yourdomain.com" className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700">Reply-To (optional)</label>
              <input type="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="support@yourdomain.com" className={inputClass} />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Default email signature (HTML)</label>
          <p className="mt-0.5 text-xs text-slate-500">Appended to all outgoing template emails. You can use simple HTML.</p>
          <textarea
            rows={5}
            value={signatureHtml}
            onChange={(e) => setSignatureHtml(e.target.value)}
            placeholder={'<p>Best regards,<br/>Your Team</p>'}
            className={`${inputClass} font-mono text-xs`}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-[#14B8A6] px-5 py-2 text-sm font-semibold text-white hover:bg-[#13a89a] disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save email settings'}
          </button>
        </div>
      </form>

      <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-6">
        <h3 className="text-sm font-semibold text-slate-900">Send test email</h3>
        <p className="mt-1 text-xs text-slate-500">Uses your SMTP and signature above. Save settings first if you just changed them.</p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1">
            <input
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="your@email.com"
              className={inputClass}
            />
          </div>
          <button
            type="button"
            onClick={handleTest}
            disabled={testSending || !testTo.trim()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            <Send className="size-4" />
            {testSending ? 'Sending…' : 'Send test'}
          </button>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-bold text-slate-900">Email templates</h3>
        <p className="mt-1 text-sm text-slate-500">
          Subject and body support <code className="rounded bg-slate-100 px-1 text-xs">{'{{variable}}'}</code> placeholders. Invoice and quotation sends use these templates.
        </p>
        <div className="mt-4 space-y-4">
          {templates.map((t) => (
            <div key={t.template_key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900">{t.name}</p>
                  <p className="text-xs text-slate-500">
                    Key: <code className="rounded bg-slate-100 px-1">{t.template_key}</code>
                    {VARS_HELP[t.template_key] && (
                      <span className="mt-1 block text-slate-600">Placeholders: {VARS_HELP[t.template_key]}</span>
                    )}
                  </p>
                </div>
                {editingKey !== t.template_key ? (
                  <button
                    type="button"
                    onClick={() => startEdit(t)}
                    className="text-sm font-medium text-[#14B8A6] hover:underline"
                  >
                    Edit
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingKey(null)}
                      className="text-sm text-slate-600 hover:underline"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={savingTpl}
                      onClick={() => handleSaveTemplate(t.template_key)}
                      className="rounded-lg bg-[#14B8A6] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#13a89a] disabled:opacity-50"
                    >
                      {savingTpl ? 'Saving…' : 'Save template'}
                    </button>
                  </div>
                )}
              </div>
              {editingKey === t.template_key ? (
                <div className="mt-4 space-y-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600">Subject</label>
                    <input type="text" value={editSubject} onChange={(e) => setEditSubject(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">Body (HTML)</label>
                    <textarea rows={10} value={editBody} onChange={(e) => setEditBody(e.target.value)} className={`${inputClass} font-mono text-xs`} />
                  </div>
                </div>
              ) : (
                <p className="mt-2 line-clamp-2 text-sm text-slate-600">{t.subject}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
