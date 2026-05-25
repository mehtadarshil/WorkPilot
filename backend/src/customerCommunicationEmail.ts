import type { Pool } from 'pg';
import {
  createMailTransport,
  formatFromHeader,
  wrapEmailHtml,
  type EmailSettingsPayload,
} from './emailHelpers';

type EmailConfig = EmailSettingsPayload & { smtp_password_set: boolean };

export type CustomerEmailDeps = {
  pool: Pool;
  loadEmailSettingsPayload: (userId: number) => Promise<EmailConfig>;
  sendUserEmail: (
    pool: Pool,
    userId: number,
    emailCfg: EmailConfig,
    opts: Record<string, unknown>,
  ) => Promise<void>;
};

export type CustomerEmailDraftCustomer = {
  full_name: string;
  email: string | null;
  contact_email: string | null;
};

export type CustomerEmailSendInput = {
  toValue: string | null;
  ccValue: string | null;
  bccValue: string | null;
  subject: string | null;
  message: string | null;
  bodyHtml: string;
  appendSignature: boolean;
  attachments: unknown;
};

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 10 * 1024 * 1024;

function escapeHtmlForEmail(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function canSend(emailCfg: EmailConfig): boolean {
  return Boolean(emailCfg.oauth_provider || (emailCfg.smtp_enabled && createMailTransport(emailCfg)));
}

export async function buildCustomerEmailComposeDraft(
  deps: CustomerEmailDeps,
  userId: number,
  customer: CustomerEmailDraftCustomer,
) {
  const emailCfg = await deps.loadEmailSettingsPayload(userId);
  const smtpReady = canSend(emailCfg) && Boolean(emailCfg.from_email?.trim());
  const name = customer.full_name || 'there';

  return {
    signature_html: emailCfg.default_signature_html,
    from_display: formatFromHeader(emailCfg.from_name, emailCfg.from_email) || emailCfg.from_email || '',
    from_email: emailCfg.from_email || '',
    reply_to: emailCfg.reply_to,
    smtp_ready: smtpReady,
    default_to: customer.contact_email || customer.email || '',
    subject: `Regarding ${name}`,
    body_html: `<p>Hi ${escapeHtmlForEmail(name)},</p><p><br></p>`,
  };
}

export async function sendCustomerCommunicationEmail(
  deps: CustomerEmailDeps,
  userId: number,
  input: CustomerEmailSendInput,
): Promise<string[]> {
  if (!input.toValue) throw new Error('Recipient (To) is required');
  if (!input.subject) throw new Error('Subject is required');

  const emailCfg = await deps.loadEmailSettingsPayload(userId);
  if (!canSend(emailCfg)) throw new Error('Configure Email Settings before sending.');
  if (!emailCfg.from_email?.trim()) throw new Error('Set From email in Settings -> Email.');

  const userAttachments: { filename: string; content: Buffer; contentType?: string }[] = [];
  const sentAttachmentNames: string[] = [];
  let totalBytes = 0;
  const rawAttachments = Array.isArray(input.attachments) ? input.attachments : [];
  for (const item of rawAttachments) {
    const a = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const filename = typeof a.filename === 'string' ? a.filename.trim() : '';
    const contentBase64 = typeof a.content_base64 === 'string' ? a.content_base64.trim() : '';
    const contentType = typeof a.content_type === 'string' ? a.content_type.trim() : undefined;
    if (!filename || !contentBase64) continue;

    const content = Buffer.from(contentBase64, 'base64');
    if (content.length > MAX_ATTACHMENT_BYTES) {
      throw new Error(`Attachment "${filename}" exceeds 8 MB.`);
    }
    totalBytes += content.length;
    if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
      throw new Error('Total attachments exceed 10 MB.');
    }

    sentAttachmentNames.push(filename);
    userAttachments.push({ filename, content, contentType });
  }

  const fallbackHtml = input.message
    ? `<p>${escapeHtmlForEmail(input.message).replace(/\n/g, '<br/>')}</p>`
    : '';
  const html = wrapEmailHtml(input.bodyHtml || fallbackHtml, input.appendSignature ? emailCfg.default_signature_html : null);

  await deps.sendUserEmail(deps.pool, userId, emailCfg, {
    from: formatFromHeader(emailCfg.from_name, emailCfg.from_email),
    to: input.toValue,
    cc: input.ccValue || undefined,
    bcc: input.bccValue || undefined,
    subject: input.subject,
    html,
    replyTo: emailCfg.reply_to,
    attachments: userAttachments.length > 0 ? userAttachments : undefined,
  });

  return sentAttachmentNames;
}
