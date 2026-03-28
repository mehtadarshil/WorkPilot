import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import formData from 'form-data';
import Mailgun from 'mailgun.js';

export type EmailSettingsPayload = {
  smtp_enabled: boolean;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_secure: boolean;
  smtp_user: string | null;
  smtp_password: string | null;
  smtp_reject_unauthorized: boolean;
  from_name: string | null;
  from_email: string | null;
  reply_to: string | null;
  default_signature_html: string | null;
  oauth_provider?: 'google' | 'microsoft' | null;
  oauth_access_token?: string | null;
  oauth_refresh_token?: string | null;
  oauth_expiry?: number | null;
};

export type MailTransport = 
  | { type: 'nodemailer'; client: Transporter }
  | { type: 'mailgun'; client: any; domain?: string };

/** Replace {{key}} placeholders (simple, no nested logic). */
export function applyTemplateVars(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    const safe = v ?? '';
    out = out.split(`{{${k}}}`).join(safe);
  }
  return out;
}

export function wrapEmailHtml(bodyHtml: string, signatureHtml: string | null): string {
  const sig = signatureHtml?.trim()
    ? `<div style="margin-top:1.5em;padding-top:1em;border-top:1px solid #e2e8f0;">${signatureHtml}</div>`
    : '';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="font-family:system-ui,-apple-system,sans-serif;line-height:1.6;color:#1e293b;max-width:600px">${bodyHtml}${sig}</body></html>`;
}

export function createMailTransport(settings: EmailSettingsPayload): MailTransport | null {
  if (!settings.smtp_enabled) return null;

  // Use Mailgun API as a global relay if environment variables are set (to bypass blocked ports on production).
  if (process.env.MAILGUN_API_KEY) {
    const mailgun = new Mailgun(formData as any);
    const mg = mailgun.client({ username: 'api', key: process.env.MAILGUN_API_KEY });
    return { type: 'mailgun', client: mg, domain: process.env.MAILGUN_DOMAIN };
  }

  // Fallback to standard Nodemailer and use the user's normal SMTP credentials
  if (!settings.smtp_host || !settings.smtp_port) return null;

  const transporter = nodemailer.createTransport({
    host: settings.smtp_host,
    port: settings.smtp_port,
    secure: settings.smtp_secure,
    auth:
      settings.smtp_user || settings.smtp_password
        ? { user: settings.smtp_user || '', pass: settings.smtp_password || '' }
        : undefined,
    tls: { rejectUnauthorized: settings.smtp_reject_unauthorized },
  });

  return { type: 'nodemailer', client: transporter };
}

export function formatFromHeader(fromName: string | null, fromEmail: string | null): string {
  const email = (fromEmail || '').trim();
  const name = (fromName || '').trim();
  if (!email) return '';
  if (!name) return email;
  const escaped = name.replace(/"/g, '\\"');
  return `"${escaped}" <${email}>`;
}

export async function sendSmtpMessage(
  transport: MailTransport,
  opts: {
    from: string;
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    html: string;
    replyTo?: string | null;
    attachments?: { filename: string; content: Buffer; contentType?: string }[];
  },
): Promise<void> {
  if (transport.type === 'mailgun') {
    const messageData: any = {
      from: opts.from,
      to: opts.to.split(',').map((e) => e.trim()).filter(Boolean),
      subject: opts.subject,
      html: opts.html,
    };

    if (opts.cc) messageData.cc = opts.cc.split(',').map((e) => e.trim()).filter(Boolean);
    if (opts.bcc) messageData.bcc = opts.bcc.split(',').map((e) => e.trim()).filter(Boolean);
    if (opts.replyTo) messageData['h:Reply-To'] = opts.replyTo.trim();

    if (opts.attachments && opts.attachments.length > 0) {
      messageData.attachment = opts.attachments.map((a) => ({
        filename: a.filename,
        data: a.content,
      }));
    }

    // Extract domain from the "From" address if no domain is explicitly configured
    let requestDomain = transport.domain;
    if (!requestDomain) {
      const match = opts.from.match(/<([^>]+)>/);
      const rawEmail = match ? match[1] : opts.from;
      requestDomain = rawEmail.split('@').pop()?.trim() || 'sandbox.mailgun.org';
    }

    await transport.client.messages.create(requestDomain, messageData);
  } else {
    // Standard nodemailer fallback
    await transport.client.sendMail({
      from: opts.from,
      to: opts.to,
      cc: opts.cc?.trim() || undefined,
      bcc: opts.bcc?.trim() || undefined,
      subject: opts.subject,
      html: opts.html,
      replyTo: opts.replyTo?.trim() || undefined,
      attachments: opts.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType || 'application/octet-stream',
      })),
    });
  }
}
