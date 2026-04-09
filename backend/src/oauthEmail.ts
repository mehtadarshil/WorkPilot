import axios from 'axios';

// Ensure these are set in your .env
// GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI
// MS_CLIENT_ID, MS_CLIENT_SECRET, MS_REDIRECT_URI

export async function getGoogleAuthUrl() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !redirectUri) throw new Error('Google OAuth env variables missing');
  
  const scopes = [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/userinfo.email'
  ].join(' ');

  return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${encodeURIComponent(scopes)}&access_type=offline&prompt=consent`;
}

export async function getMicrosoftAuthUrl() {
  const clientId = process.env.MS_CLIENT_ID;
  const redirectUri = process.env.MS_REDIRECT_URI;
  if (!clientId || !redirectUri) throw new Error('Microsoft OAuth env variables missing');

  const scopes = ['offline_access', 'Mail.Send', 'User.Read'].join(' ');
  
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&response_mode=query&scope=${encodeURIComponent(scopes)}`;
}

export async function exchangeGoogleCode(code: string) {
  const { data } = await axios.post('https://oauth2.googleapis.com/token', {
    code,
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    grant_type: 'authorization_code',
  });
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expiry: Date.now() + data.expires_in * 1000,
  };
}

export async function exchangeMicrosoftCode(code: string) {
  const params = new URLSearchParams();
  params.append('client_id', process.env.MS_CLIENT_ID!);
  params.append('scope', 'offline_access Mail.Send User.Read');
  params.append('code', code);
  params.append('redirect_uri', process.env.MS_REDIRECT_URI!);
  params.append('grant_type', 'authorization_code');
  params.append('client_secret', process.env.MS_CLIENT_SECRET!);

  const { data } = await axios.post('https://login.microsoftonline.com/common/oauth2/v2.0/token', params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expiry: Date.now() + data.expires_in * 1000,
  };
}

export async function refreshGoogleToken(refreshToken: string) {
  const { data } = await axios.post('https://oauth2.googleapis.com/token', {
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  return {
    access_token: data.access_token,
    expiry: Date.now() + data.expires_in * 1000,
  };
}

export async function refreshMicrosoftToken(refreshToken: string) {
  const params = new URLSearchParams();
  params.append('client_id', process.env.MS_CLIENT_ID!);
  params.append('scope', 'offline_access Mail.Send User.Read');
  params.append('refresh_token', refreshToken);
  params.append('grant_type', 'refresh_token');
  params.append('client_secret', process.env.MS_CLIENT_SECRET!);

  const { data } = await axios.post('https://login.microsoftonline.com/common/oauth2/v2.0/token', params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken, // MS might return a new refresh token
    expiry: Date.now() + data.expires_in * 1000,
  };
}

interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

interface SendEmailOpts {
  to: string;
  subject: string;
  html: string;
  cc?: string;
  bcc?: string;
  attachments?: EmailAttachment[];
}

// RFC822 builder for Gmail API – supports multipart/mixed with attachments
function buildRawEmail(opts: SendEmailOpts): string {
  const boundary = 'foo_bar_baz_mixed';
  const altBoundary = 'foo_bar_baz_alt';
  const hasAttachments = opts.attachments && opts.attachments.length > 0;

  let raw = `To: ${opts.to}\r\n`;
  if (opts.cc) raw += `Cc: ${opts.cc}\r\n`;
  if (opts.bcc) raw += `Bcc: ${opts.bcc}\r\n`;
  raw += `Subject: ${opts.subject}\r\n`;
  raw += `MIME-Version: 1.0\r\n`;

  if (hasAttachments) {
    // multipart/mixed envelope (body + attachments)
    raw += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;
    // HTML body part
    raw += `--${boundary}\r\n`;
    raw += `Content-Type: text/html; charset="UTF-8"\r\n\r\n`;
    raw += `${opts.html}\r\n\r\n`;
    // Attachment parts
    for (const att of opts.attachments!) {
      const ct = att.contentType || 'application/octet-stream';
      raw += `--${boundary}\r\n`;
      raw += `Content-Type: ${ct}; name="${att.filename}"\r\n`;
      raw += `Content-Disposition: attachment; filename="${att.filename}"\r\n`;
      raw += `Content-Transfer-Encoding: base64\r\n\r\n`;
      raw += att.content.toString('base64') + '\r\n\r\n';
    }
    raw += `--${boundary}--`;
  } else {
    // Simple HTML-only email
    raw += `Content-Type: multipart/alternative; boundary="${altBoundary}"\r\n\r\n`;
    raw += `--${altBoundary}\r\n`;
    raw += `Content-Type: text/html; charset="UTF-8"\r\n\r\n`;
    raw += `${opts.html}\r\n\r\n`;
    raw += `--${altBoundary}--`;
  }

  return Buffer.from(raw).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sendEmailViaGoogle(accessToken: string, opts: SendEmailOpts) {
  const rawMsg = buildRawEmail(opts);
  await axios.post(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    { raw: rawMsg },
    { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
  );
}

export async function sendEmailViaMicrosoft(accessToken: string, opts: SendEmailOpts) {
  const message: any = {
    subject: opts.subject,
    body: { contentType: 'HTML', content: opts.html },
    toRecipients: opts.to.split(',').map(e => ({ emailAddress: { address: e.trim() } })),
  };

  if (opts.cc) {
    message.ccRecipients = opts.cc.split(',').map(e => ({ emailAddress: { address: e.trim() } }));
  }
  if (opts.bcc) {
    message.bccRecipients = opts.bcc.split(',').map(e => ({ emailAddress: { address: e.trim() } }));
  }

  // Add file attachments
  if (opts.attachments && opts.attachments.length > 0) {
    message.attachments = opts.attachments.map(att => ({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: att.filename,
      contentType: att.contentType || 'application/octet-stream',
      contentBytes: att.content.toString('base64'),
    }));
  }

  await axios.post(
    'https://graph.microsoft.com/v1.0/me/sendMail',
    { message, saveToSentItems: 'true' },
    { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
  );
}
