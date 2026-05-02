import type { Application, Request, Response } from 'express';
import type { Pool } from 'pg';
import {
  wrapEmailHtml,
  createMailTransport,
  formatFromHeader,
  type EmailSettingsPayload,
} from './emailHelpers';
import { getTenantScopeUserId, requireTenantCrmAccess } from './tenantAccess';
import type { TenantAuthUser } from './tenantAccess';

type AuthUser = TenantAuthUser;
type AuthReq = Request & { user?: AuthUser };

export type JobEmailRouteDeps = {
  pool: Pool;
  authenticate: (req: Request, res: Response, next: () => void) => void;
  loadEmailSettingsPayload: (userId: number) => Promise<EmailSettingsPayload & { smtp_password_set: boolean }>;
  sendUserEmail: (
    pool: Pool,
    userId: number,
    emailCfg: EmailSettingsPayload & { smtp_password_set?: boolean },
    opts: Record<string, unknown>,
  ) => Promise<void>;
};

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export function mountJobEmailRoutes(app: Application, deps: JobEmailRouteDeps): void {
  const { pool, authenticate, loadEmailSettingsPayload, sendUserEmail } = deps;

  app.get('/api/jobs/:id/email-compose', authenticate, requireTenantCrmAccess('jobs'), async (req: Request, res: Response) => {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const jobId = parseInt(String(idParam), 10);
    if (!Number.isFinite(jobId)) return res.status(400).json({ message: 'Invalid job id' });
    const userId = getTenantScopeUserId((req as AuthReq).user!);
    const isSuperAdmin = (req as AuthReq).user!.role === 'SUPER_ADMIN';

    const jobRes = await pool.query<{
      id: number;
      title: string;
      customer_id: number | null;
      customer_email: string | null;
      customer_full_name: string | null;
    }>(
      `SELECT j.id, j.title, j.customer_id, c.email AS customer_email, c.full_name AS customer_full_name
       FROM jobs j
       LEFT JOIN customers c ON c.id = j.customer_id
       WHERE j.id = $1${isSuperAdmin ? '' : ' AND j.created_by = $2'}`,
      isSuperAdmin ? [jobId] : [jobId, userId],
    );
    if ((jobRes.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Job not found' });
    const job = jobRes.rows[0];

    try {
      const emailCfg = await loadEmailSettingsPayload(userId);
      const transport = createMailTransport(emailCfg);
      const smtpReady =
        !!((emailCfg.smtp_enabled && transport) || emailCfg.oauth_provider) && !!emailCfg.from_email?.trim();

      const customerEmailRaw = (job.customer_email ?? '').trim();
      const toEmailOptions: { email: string; label: string }[] = [];
      const seenTo = new Set<string>();
      const pushToOption = (email: string, label: string) => {
        const e = email.trim().toLowerCase();
        if (!e || seenTo.has(e)) return;
        seenTo.add(e);
        toEmailOptions.push({ email: email.trim(), label });
      };
      if (customerEmailRaw) {
        pushToOption(customerEmailRaw, `Customer (${job.customer_full_name?.trim() || 'account'})`);
      }
      if (job.customer_id != null) {
        const contactsForTo = await pool.query<{ email: string; first_name: string | null; surname: string }>(
          `SELECT email, first_name, surname FROM customer_contacts
           WHERE customer_id = $1 AND COALESCE(TRIM(email), '') <> ''
           ORDER BY is_primary DESC, created_at ASC`,
          [job.customer_id],
        );
        for (const c of contactsForTo.rows) {
          const name = [c.first_name, c.surname].filter(Boolean).join(' ').trim() || 'Contact';
          pushToOption(c.email, name);
        }
      }

      const title = (job.title || 'Job').trim();
      const subject = `Job files — ${title} (#${job.id})`;
      const who = job.customer_full_name?.trim() || 'there';
      const bodyInner = `<p>Hi ${who},</p><p>Please find the selected files from this job attached.</p><p>Kind regards,</p>`;

      return res.json({
        subject,
        body_html: bodyInner,
        signature_html: emailCfg.default_signature_html,
        from_display: formatFromHeader(emailCfg.from_name, emailCfg.from_email) || emailCfg.from_email || '',
        reply_to: emailCfg.reply_to,
        smtp_ready: smtpReady,
        can_send: smtpReady,
        default_to: job.customer_email ?? '',
        customer_name: job.customer_full_name ?? '',
        to_email_options: toEmailOptions,
      });
    } catch (error) {
      console.error('Job email compose draft error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.post('/api/jobs/:id/send-email', authenticate, requireTenantCrmAccess('jobs'), async (req: Request, res: Response) => {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const jobId = parseInt(String(idParam), 10);
    if (!Number.isFinite(jobId)) return res.status(400).json({ message: 'Invalid job id' });
    const userId = getTenantScopeUserId((req as AuthReq).user!);
    const isSuperAdmin = (req as AuthReq).user!.role === 'SUPER_ADMIN';

    const body = req.body as {
      to?: string;
      cc?: string;
      bcc?: string;
      subject?: string;
      body_html?: string;
      append_signature?: boolean;
      attachments?: { filename?: string; content_base64?: string; content_type?: string }[];
    };

    const jobCheck = await pool.query<{ id: number }>(
      `SELECT id FROM jobs WHERE id = $1${isSuperAdmin ? '' : ' AND created_by = $2'}`,
      isSuperAdmin ? [jobId] : [jobId, userId],
    );
    if ((jobCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Job not found' });

    const to = typeof body.to === 'string' ? body.to.trim() : '';
    const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
    const bodyHtmlRaw = typeof body.body_html === 'string' ? body.body_html.trim() : '';
    const cc = typeof body.cc === 'string' ? body.cc.trim() : '';
    const bcc = typeof body.bcc === 'string' ? body.bcc.trim() : '';
    const appendSig = body.append_signature !== false;

    if (!to) return res.status(400).json({ message: 'Recipient (To) is required' });
    if (!subject) return res.status(400).json({ message: 'Subject is required' });
    if (!bodyHtmlRaw) return res.status(400).json({ message: 'Message body is required' });

    const emailCfg = await loadEmailSettingsPayload(userId);
    const canSendMail = emailCfg.oauth_provider || (emailCfg.smtp_enabled && createMailTransport(emailCfg));
    if (!canSendMail) {
      return res.status(400).json({
        message: 'Configure Email Settings before sending.',
      });
    }
    if (!emailCfg.from_email?.trim()) {
      return res.status(400).json({ message: 'Set From email in Settings → Email.' });
    }

    try {
      const sigHtml = appendSig ? emailCfg.default_signature_html : null;
      const html = wrapEmailHtml(bodyHtmlRaw, sigHtml);
      const from = formatFromHeader(emailCfg.from_name, emailCfg.from_email);

      const userAttachments: { filename: string; content: Buffer; contentType?: string }[] = [];
      let totalBytes = 0;
      if (Array.isArray(body.attachments)) {
        for (const a of body.attachments) {
          const fn = typeof a.filename === 'string' ? a.filename.trim() : '';
          const b64 = typeof a.content_base64 === 'string' ? a.content_base64.trim() : '';
          if (!fn || !b64) continue;
          try {
            const buf = Buffer.from(b64, 'base64');
            if (buf.length === 0 && b64.length > 0) {
              return res.status(400).json({ message: `Invalid base64 attachment data for ${fn}` });
            }
            if (buf.length > MAX_ATTACHMENT_BYTES) {
              return res.status(400).json({
                message: `Attachment "${fn}" exceeds the maximum size of ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB.`,
              });
            }
            totalBytes += buf.length;
            if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
              return res.status(400).json({
                message: `Total attachments exceed the maximum of ${MAX_TOTAL_ATTACHMENT_BYTES / (1024 * 1024)} MB.`,
              });
            }
            userAttachments.push({
              filename: fn,
              content: buf,
              contentType: typeof a.content_type === 'string' ? a.content_type : undefined,
            });
          } catch {
            return res.status(400).json({ message: `Invalid attachment data for ${fn}` });
          }
        }
      }

      await sendUserEmail(pool, userId, emailCfg, {
        from,
        to,
        cc: cc || undefined,
        bcc: bcc || undefined,
        subject,
        html,
        replyTo: emailCfg.reply_to,
        attachments: userAttachments.length > 0 ? userAttachments : undefined,
      });

      return res.json({ success: true, message: 'Email sent.' });
    } catch (error) {
      console.error('Send job email error:', error);
      const msg = error instanceof Error ? error.message : 'Internal server error';
      return res.status(500).json({ message: msg });
    }
  });
}
