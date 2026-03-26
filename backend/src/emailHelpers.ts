import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

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
};

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

export function createMailTransport(settings: EmailSettingsPayload): Transporter | null {
  if (!settings.smtp_enabled || !settings.smtp_host || !settings.smtp_port) return null;
  return nodemailer.createTransport({
    host: settings.smtp_host,
    port: settings.smtp_port,
    secure: settings.smtp_secure,
    auth:
      settings.smtp_user || settings.smtp_password
        ? { user: settings.smtp_user || '', pass: settings.smtp_password || '' }
        : undefined,
    tls: { rejectUnauthorized: settings.smtp_reject_unauthorized },
  });
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
  transport: Transporter,
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
  await transport.sendMail({
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
