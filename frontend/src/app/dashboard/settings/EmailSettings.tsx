'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mail, Plus, Send, Trash2, X } from 'lucide-react';
import { deleteRequest, getJson, patchJson, postJson } from '../../apiClient';
import { EmailTemplateRichEditor } from './EmailTemplateRichEditor';
import { placeholderTagsForTemplate } from './emailTemplatePlaceholders';

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

const BUILTIN_TEMPLATE_KEYS = new Set(['invoice', 'quotation', 'general']);

const VARS_HELP: Record<string, string> = {
  invoice:
    '{{company_name}}, {{customer_name}}, {{customer_address}}, {{work_address}}, {{invoice_number}}, {{invoice_total}}, {{currency}}, {{invoice_date}}, {{due_date}}',
  quotation:
    '{{company_name}}, {{customer_name}}, {{customer_address}}, {{work_address}}, {{quotation_number}}, {{quotation_total}}, {{currency}}, {{quotation_date}}, {{valid_until}}',
  general: '{{company_name}}, {{message}}',
};

function templateVarsHint(templateKey: string): string {
  return VARS_HELP[templateKey] ?? '{{company_name}}, {{message}}, plus tags supported by the feature that uses this template.';
}

/** Documented for subject + body HTML; must match keys passed in backend when sending. */
const PLACEHOLDER_REFERENCE: {
  templateKey: string;
  title: string;
  whenUsed: string;
  tags: { tag: string; purpose: string }[];
}[] = [
  {
    templateKey: 'invoice',
    title: 'Invoice template',
    whenUsed: 'When sending an invoice by email (or loading the invoice email composer). The invoice PDF is attached separately; it does not use these placeholders.',
    tags: [
      { tag: '{{company_name}}', purpose: "Your organisation name from Invoice settings (fallback: 'WorkPilot')." },
      { tag: '{{customer_name}}', purpose: 'The customer display name on the invoice.' },
      { tag: '{{invoice_number}}', purpose: 'Invoice number (e.g. INV-000042).' },
      { tag: '{{invoice_total}}', purpose: 'Grand total as a decimal string with two places (e.g. 120.00).' },
      { tag: '{{currency}}', purpose: 'ISO currency code (e.g. GBP, USD).' },
      { tag: '{{invoice_date}}', purpose: "Invoice date in your app's display format." },
      { tag: '{{due_date}}', purpose: 'Payment due date in the same format.' },
      { tag: '{{customer_address}}', purpose: 'Customer billing address as one comma-separated line (address lines, town, county, postcode).' },
      { tag: '{{work_address}}', purpose: 'Work/site address when the invoice is linked to a work address; empty if billing uses only the customer address.' },
    ],
  },
  {
    templateKey: 'quotation',
    title: 'Quotation template',
    whenUsed: 'When sending a quotation by email to the customer.',
    tags: [
      { tag: '{{company_name}}', purpose: "Your organisation name from Invoice settings (fallback: 'WorkPilot')." },
      { tag: '{{customer_name}}', purpose: 'The customer display name on the quotation.' },
      { tag: '{{quotation_number}}', purpose: 'Quotation reference number.' },
      { tag: '{{quotation_total}}', purpose: 'Total amount as a decimal string with two places.' },
      { tag: '{{currency}}', purpose: 'ISO currency code.' },
      { tag: '{{quotation_date}}', purpose: 'Quotation date (YYYY-MM-DD).' },
      { tag: '{{valid_until}}', purpose: 'Validity / expiry date (YYYY-MM-DD).' },
      { tag: '{{customer_address}}', purpose: 'Customer address as one comma-separated line.' },
      { tag: '{{work_address}}', purpose: 'Currently empty for quotations; reserved if site linkage is added later.' },
    ],
  },
  {
    templateKey: 'general',
    title: 'General template',
    whenUsed: 'Reserved for generic or automated messages that pass a free-text body; use when integrations supply {{message}}.',
    tags: [
      { tag: '{{company_name}}', purpose: 'Your organisation name from Invoice settings.' },
      { tag: '{{message}}', purpose: 'Arbitrary plain or HTML-safe text provided for that send (e.g. notification body).' },
    ],
  },
  {
    templateKey: 'user_templates',
    title: 'Templates you add',
    whenUsed:
      'Extra templates are saved for copy/paste or future automations. Only invoice and quotation sends substitute invoice/quotation placeholders automatically. Use {{company_name}} and {{message}} where the sender supplies them.',
    tags: [
      { tag: '{{company_name}}', purpose: 'Organisation name from Invoice settings when provided by the send flow.' },
      { tag: '{{message}}', purpose: 'Body text when the integration passes it.' },
    ],
  },
];

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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'add' | 'edit'>('edit');
  const [activeTemplateKey, setActiveTemplateKey] = useState<string | null>(null);
  const [drawerSession, setDrawerSession] = useState(0);
  const [formKey, setFormKey] = useState('');
  const [formName, setFormName] = useState('');
  const [formSubject, setFormSubject] = useState('');
  const [formBody, setFormBody] = useState('');
  const [savingTpl, setSavingTpl] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const subjectInputRef = useRef<HTMLInputElement>(null);

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

  const openDrawerAdd = () => {
    setError(null);
    setDrawerMode('add');
    setActiveTemplateKey(null);
    setFormKey('');
    setFormName('');
    setFormSubject('Message from {{company_name}}');
    setFormBody('<p>{{message}}</p>');
    setDrawerSession((s) => s + 1);
    setDrawerOpen(true);
  };

  const openDrawerEdit = (t: EmailTemplateRow) => {
    setError(null);
    setDrawerMode('edit');
    setActiveTemplateKey(t.template_key);
    setFormKey(t.template_key);
    setFormName(t.name);
    setFormSubject(t.subject);
    setFormBody(t.body_html || '<p></p>');
    setDrawerSession((s) => s + 1);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setActiveTemplateKey(null);
  };

  const insertIntoSubject = (text: string) => {
    const el = subjectInputRef.current;
    if (el && typeof el.selectionStart === 'number') {
      const start = el.selectionStart;
      const end = el.selectionEnd ?? start;
      setFormSubject((prev) => prev.slice(0, start) + text + prev.slice(end));
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + text.length;
        el.setSelectionRange(pos, pos);
      });
    } else {
      setFormSubject((prev) => prev + text);
    }
  };

  const handleDrawerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (!formName.trim()) {
      setError('Name is required.');
      return;
    }
    if (!formSubject.trim()) {
      setError('Subject is required.');
      return;
    }
    const bodyHtml = formBody.trim() || '<p></p>';
    setSavingTpl(true);
    setError(null);
    try {
      if (drawerMode === 'add') {
        const slug = formKey
          .trim()
          .toLowerCase()
          .replace(/\s+/g, '_')
          .replace(/[^a-z0-9_-]/g, '');
        if (!slug) {
          setError('Enter a template key (letters, numbers, underscores, hyphens).');
          setSavingTpl(false);
          return;
        }
        await postJson('/settings/email-templates', {
          template_key: slug,
          name: formName.trim(),
          subject: formSubject,
          body_html: bodyHtml,
        }, token);
      } else if (activeTemplateKey) {
        await patchJson(`/settings/email-templates/${encodeURIComponent(activeTemplateKey)}`, {
          name: formName.trim() || activeTemplateKey,
          subject: formSubject,
          body_html: bodyHtml,
        }, token);
      }
      closeDrawer();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setSavingTpl(false);
    }
  };

  const handleDeleteTemplate = async (key: string) => {
    if (!token || BUILTIN_TEMPLATE_KEYS.has(key)) return;
    if (!window.confirm(`Delete template "${key}"? This cannot be undone.`)) return;
    setDeletingKey(key);
    setError(null);
    try {
      await deleteRequest(`/settings/email-templates/${encodeURIComponent(key)}`, token);
      if (activeTemplateKey === key) closeDrawer();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete template');
    } finally {
      setDeletingKey(null);
    }
  };

  const drawerPlaceholders = placeholderTagsForTemplate(activeTemplateKey, drawerMode);

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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h3 className="text-lg font-bold text-slate-900">Email templates</h3>
          <button
            type="button"
            onClick={openDrawerAdd}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
          >
            <Plus className="size-4" />
            Add template
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Subject and body support <code className="rounded bg-slate-100 px-1 text-xs">{'{{variable}}'}</code> placeholders
          (double curly braces). Only the tags listed below are replaced for each template; anything else stays literal. Invoice
          and quotation sends merge these into the subject and HTML body before your default signature is appended.
        </p>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/90 p-4">
          <h4 className="text-sm font-semibold text-slate-900">Placeholder tags reference</h4>
          <p className="mt-1 text-xs text-slate-600">
            Use the exact tag names (case-sensitive) in subject or body HTML. Tags are not replaced in the default signature
            field above unless you paste the same placeholders there and the send path provides those variables.
          </p>
          <div className="mt-4 space-y-5">
            {PLACEHOLDER_REFERENCE.map((block) => (
              <div key={block.templateKey} className="border-t border-slate-200 pt-4 first:border-t-0 first:pt-0">
                <p className="text-sm font-medium text-slate-800">{block.title}</p>
                <p className="mt-0.5 text-xs text-slate-600">{block.whenUsed}</p>
                <dl className="mt-2 space-y-2">
                  {block.tags.map((row) => (
                    <div key={row.tag} className="grid gap-1 sm:grid-cols-[minmax(0,220px)_1fr] sm:gap-3">
                      <dt>
                        <code className="rounded bg-white px-1.5 py-0.5 text-xs text-slate-800 ring-1 ring-slate-200">{row.tag}</code>
                      </dt>
                      <dd className="text-xs text-slate-700">{row.purpose}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {templates.map((t) => (
            <div key={t.template_key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900">{t.name}</p>
                  <p className="text-xs text-slate-500">
                    Key: <code className="rounded bg-slate-100 px-1">{t.template_key}</code>
                    <span className="mt-1 block text-slate-600">Placeholders: {templateVarsHint(t.template_key)}</span>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {!BUILTIN_TEMPLATE_KEYS.has(t.template_key) && (
                    <button
                      type="button"
                      onClick={() => handleDeleteTemplate(t.template_key)}
                      disabled={deletingKey === t.template_key}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                      aria-label={`Delete template ${t.template_key}`}
                    >
                      <Trash2 className="size-3.5" />
                      {deletingKey === t.template_key ? '…' : 'Delete'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openDrawerEdit(t)}
                    className="text-sm font-medium text-[#14B8A6] hover:underline"
                  >
                    Edit
                  </button>
                </div>
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-slate-600">{t.subject}</p>
            </div>
          ))}
        </div>

        {drawerOpen && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <button
              type="button"
              className="absolute inset-0 bg-slate-900/40"
              aria-label="Close"
              onClick={() => !savingTpl && closeDrawer()}
            />
            <div
              className="relative flex h-full w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="email-template-drawer-title"
            >
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div>
                  <h4 id="email-template-drawer-title" className="text-lg font-semibold text-slate-900">
                    {drawerMode === 'add' ? 'Add email template' : 'Edit email template'}
                  </h4>
                  <p className="mt-1 text-xs text-slate-500">
                    Edit the template and use placeholders where needed. The message uses a visual editor; saved content is HTML for
                    email clients.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => !savingTpl && closeDrawer()}
                  className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
                  aria-label="Close"
                >
                  <X className="size-5" />
                </button>
              </div>

              <form onSubmit={handleDrawerSubmit} className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                  <div className="space-y-4">
                    {drawerMode === 'add' && (
                      <div>
                        <label className="text-xs font-semibold text-slate-700">
                          Template key <span className="text-rose-600">*</span>
                        </label>
                        <input
                          value={formKey}
                          onChange={(e) => setFormKey(e.target.value)}
                          placeholder="e.g. job_complete"
                          className={inputClass}
                          autoComplete="off"
                        />
                        <p className="mt-0.5 text-xs text-slate-500">Lowercase letters, numbers, underscores, hyphens.</p>
                      </div>
                    )}
                    {drawerMode === 'edit' && (
                      <div>
                        <label className="text-xs font-semibold text-slate-600">Template key</label>
                        <p className="mt-1 font-mono text-sm text-slate-800">{formKey}</p>
                      </div>
                    )}
                    <div>
                      <label className="text-xs font-semibold text-slate-700">
                        Name <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="text"
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        placeholder="e.g. Invoice — send to customer"
                        className={inputClass}
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-700">
                        Subject <span className="text-rose-600">*</span>
                      </label>
                      <input
                        ref={subjectInputRef}
                        type="text"
                        value={formSubject}
                        onChange={(e) => setFormSubject(e.target.value)}
                        className={inputClass}
                        required
                      />
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Subject</span>
                        {drawerPlaceholders.map((tag) => (
                          <button
                            key={`sub-${tag}`}
                            type="button"
                            onClick={() => insertIntoSubject(tag)}
                            className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-700 hover:border-[#14B8A6]"
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Message <span className="text-rose-600">*</span>
                      </label>
                      <EmailTemplateRichEditor
                        value={formBody}
                        onChange={setFormBody}
                        placeholderTags={drawerPlaceholders}
                        remountKey={drawerSession}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 justify-end gap-3 border-t border-slate-200 px-5 py-4">
                  <button
                    type="button"
                    onClick={() => !savingTpl && closeDrawer()}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingTpl}
                    className="rounded-lg bg-violet-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
                  >
                    {savingTpl ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
