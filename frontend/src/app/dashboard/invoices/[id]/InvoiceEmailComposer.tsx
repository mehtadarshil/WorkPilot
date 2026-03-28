'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  X,
  Paperclip,
  Send,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Link as LinkIcon,
  RemoveFormatting,
  ChevronDown,
} from 'lucide-react';
import { getJson, postJson } from '../../../apiClient';

type ComposeDraft = {
  subject: string;
  body_html: string;
  signature_html: string | null;
  from_display: string;
  reply_to: string | null;
  smtp_ready: boolean;
  can_send: boolean;
  invoice_state: string;
  default_to: string;
  customer_name: string;
  to_email_options?: { email: string; label: string }[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  invoiceId: string;
  onSent: () => void;
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = r.result;
      if (typeof s !== 'string') {
        reject(new Error('Read failed'));
        return;
      }
      const idx = s.indexOf(',');
      resolve(idx >= 0 ? s.slice(idx + 1) : s);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isBodyEmpty(html: string): boolean {
  if (!html.trim()) return true;
  const d = document.createElement('div');
  d.innerHTML = html;
  return !(d.textContent && d.textContent.replace(/\u00a0/g, ' ').trim());
}

export default function InvoiceEmailComposer({ open, onClose, invoiceId, onSent }: Props) {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  const loadGenerationRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const toFieldRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<ComposeDraft | null>(null);
  const [composeSession, setComposeSession] = useState(0);
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [includeSignature, setIncludeSignature] = useState(true);
  const [files, setFiles] = useState<File[]>([]);
  const [scheduleAfterSend, setScheduleAfterSend] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [toPickerOpen, setToPickerOpen] = useState(false);

  const loadDraft = useCallback(async () => {
    if (!token || !invoiceId) return;
    const gen = ++loadGenerationRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await getJson<ComposeDraft>(`/invoices/${invoiceId}/email-compose`, token);
      if (gen !== loadGenerationRef.current) return;
      setDraft(res);
      setTo(res.default_to || '');
      setSubject(res.subject);
      setShowCc(false);
      setShowBcc(false);
      setCc('');
      setBcc('');
      setIncludeSignature(true);
      setScheduleAfterSend(false);
      setComposeSession((s) => s + 1);
      setToPickerOpen(false);
    } catch (e) {
      if (gen === loadGenerationRef.current) {
        setError(e instanceof Error ? e.message : 'Failed to load compose draft');
      }
    } finally {
      if (gen === loadGenerationRef.current) {
        setLoading(false);
      }
    }
  }, [token, invoiceId]);

  useEffect(() => {
    if (!open) return;
    setFiles([]);
    loadDraft();
  }, [open, loadDraft]);

  useEffect(() => {
    if (!open || !draft || loading) return;
    const el = bodyRef.current;
    if (!el) return;
    el.innerHTML = draft.body_html || '';
  }, [open, draft, loading, composeSession]);

  useEffect(() => {
    if (!toPickerOpen) return;
    const onDocDown = (e: MouseEvent) => {
      if (toFieldRef.current && !toFieldRef.current.contains(e.target as Node)) {
        setToPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [toPickerOpen]);

  const addFilesFromList = (list: FileList | File[] | null) => {
    if (!list?.length) return;
    const arr = Array.from(list);
    setFiles((prev) => [...prev, ...arr]);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFilesFromList(e.target.files);
    e.target.value = '';
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const runFormat = (command: string, value?: string) => {
    bodyRef.current?.focus();
    try {
      document.execCommand(command, false, value);
    } catch {
      /* ignore */
    }
  };

  const handleLink = () => {
    const url = typeof window !== 'undefined' ? window.prompt('Link URL', 'https://') : null;
    if (url === null) return;
    const trimmed = url.trim();
    if (!trimmed) return;
    runFormat('createLink', trimmed);
  };

  const handleDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (e.dataTransfer.files?.length) {
      addFilesFromList(e.dataTransfer.files);
    }
  };

  const handleSend = async () => {
    if (!token || !draft) return;
    if (!draft.can_send) {
      setError('Issue the invoice before sending email.');
      return;
    }
    if (!draft.smtp_ready) {
      setError('Configure Email Settings before sending.');
      return;
    }
    if (!to.trim()) {
      setError('Recipient (To) is required.');
      return;
    }
    if (!subject.trim()) {
      setError('Subject is required.');
      return;
    }
    const bodyHtml = bodyRef.current?.innerHTML?.trim() ?? '';
    if (isBodyEmpty(bodyHtml)) {
      setError('Message is required.');
      return;
    }

    setSending(true);
    setError(null);
    try {
      const attachments: { filename: string; content_base64: string; content_type: string }[] = [];
      for (const f of files) {
        const b64 = await fileToBase64(f);
        attachments.push({
          filename: f.name,
          content_base64: b64,
          content_type: f.type || 'application/octet-stream',
        });
      }

      await postJson(
        `/invoices/${invoiceId}/send-email`,
        {
          to: to.trim(),
          cc: cc.trim() || undefined,
          bcc: bcc.trim() || undefined,
          subject: subject.trim(),
          body_html: bodyHtml,
          append_signature: includeSignature,
          attachments: attachments.length ? attachments : undefined,
        },
        token,
      );

      if (scheduleAfterSend) {
        try {
          await postJson(
            `/invoices/${invoiceId}/communications`,
            {
              type: 'note',
              text: `Follow-up suggested after emailing invoice. Subject: ${subject.trim()}`,
            },
            token,
          );
        } catch {
          /* non-fatal */
        }
      }

      onSent();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  return (
    <div className="no-print fixed inset-0 z-[100] bg-black/45" onClick={() => !sending && onClose()}>
      <div
        className="absolute bottom-0 right-0 top-0 flex w-full max-w-[720px] flex-col overflow-hidden border-l border-slate-200 bg-[#f6f8fc] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Compose email"
      >
        {/* Gmail-style chrome */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200/80 bg-white px-3 py-2 shadow-sm">
          <div className="min-w-0 text-sm font-medium text-slate-800">
            New message
            {draft?.from_display ? (
              <span className="ml-2 font-normal text-slate-500">· {draft.from_display}</span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => !sending && onClose()}
            className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-500">Loading…</div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col bg-white">
            {error && <div className="shrink-0 border-b border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">{error}</div>}

            {!draft?.smtp_ready && (
              <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
                Email connection is not configured or incomplete. Open <strong>Settings → Email</strong> to connect your mailbox.
              </div>
            )}

            {!draft?.can_send && (
              <div className="shrink-0 border-b border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-900">
                This invoice is <strong>{draft?.invoice_state?.replace(/_/g, ' ') ?? 'not issued'}</strong>. Issue it before you can send email.
              </div>
            )}

            {/* Recipients — Gmail-like stacked rows */}
            <div className="shrink-0 divide-y divide-slate-100 border-b border-slate-100 px-3">
              <div ref={toFieldRef} className="relative py-1">
                <div className="flex min-h-[44px] items-center gap-2">
                  <span className="w-9 shrink-0 text-right text-xs text-slate-500">To</span>
                  <input
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    onFocus={() => {
                      if ((draft?.to_email_options?.length ?? 0) > 0) setToPickerOpen(true);
                    }}
                    className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                    placeholder={draft?.default_to || 'Recipients'}
                    autoComplete="off"
                  />
                  {(draft?.to_email_options?.length ?? 0) > 0 && (
                    <button
                      type="button"
                      onClick={() => setToPickerOpen((v) => !v)}
                      className="shrink-0 rounded p-1 text-slate-500 hover:bg-slate-100"
                      aria-expanded={toPickerOpen}
                      aria-label="Choose email from contacts"
                    >
                      <ChevronDown className={`size-4 transition-transform ${toPickerOpen ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowCc((v) => !v)}
                    className="shrink-0 text-xs font-medium text-[#1a73e8] hover:underline"
                  >
                    Cc
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowBcc((v) => !v)}
                    className="shrink-0 text-xs font-medium text-[#1a73e8] hover:underline"
                  >
                    Bcc
                  </button>
                </div>
                {toPickerOpen && draft?.to_email_options && draft.to_email_options.length > 0 && (
                  <ul
                    className="absolute left-0 right-0 top-full z-[60] mt-1 max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
                    role="listbox"
                  >
                    {draft.to_email_options.map((opt, optIdx) => (
                      <li key={`${opt.email}-${optIdx}`} role="option">
                        <button
                          type="button"
                          className="w-full px-3 py-2.5 text-left hover:bg-slate-50"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setTo(opt.email);
                            setToPickerOpen(false);
                          }}
                        >
                          <span className="block truncate text-sm font-medium text-slate-900">{opt.email}</span>
                          <span className="block truncate text-xs text-slate-500">{opt.label}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {showCc && (
                <div className="flex min-h-[40px] items-center gap-2 py-1">
                  <span className="w-9 shrink-0 text-right text-xs text-slate-500">Cc</span>
                  <input
                    value={cc}
                    onChange={(e) => setCc(e.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                    placeholder="Cc"
                    autoComplete="off"
                  />
                </div>
              )}
              {showBcc && (
                <div className="flex min-h-[40px] items-center gap-2 py-1">
                  <span className="w-9 shrink-0 text-right text-xs text-slate-500">Bcc</span>
                  <input
                    value={bcc}
                    onChange={(e) => setBcc(e.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                    placeholder="Bcc"
                    autoComplete="off"
                  />
                </div>
              )}
              <div className="flex min-h-[44px] items-center gap-2 py-1">
                <span className="w-9 shrink-0 text-right text-xs text-slate-500">Subject</span>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400"
                  placeholder="Subject"
                  autoComplete="off"
                />
              </div>
            </div>

            {/* Formatting toolbar */}
            <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-slate-100 bg-slate-50/90 px-2 py-1">
              {(
                [
                  { icon: Bold, cmd: 'bold', label: 'Bold' },
                  { icon: Italic, cmd: 'italic', label: 'Italic' },
                  { icon: Underline, cmd: 'underline', label: 'Underline' },
                ] as const
              ).map(({ icon: Icon, cmd, label }) => (
                <button
                  key={cmd}
                  type="button"
                  title={label}
                  aria-label={label}
                  className="rounded p-1.5 text-slate-600 hover:bg-slate-200/80"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => runFormat(cmd)}
                >
                  <Icon className="size-4" />
                </button>
              ))}
              <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden />
              <button
                type="button"
                title="Bulleted list"
                aria-label="Bulleted list"
                className="rounded p-1.5 text-slate-600 hover:bg-slate-200/80"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => runFormat('insertUnorderedList')}
              >
                <List className="size-4" />
              </button>
              <button
                type="button"
                title="Numbered list"
                aria-label="Numbered list"
                className="rounded p-1.5 text-slate-600 hover:bg-slate-200/80"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => runFormat('insertOrderedList')}
              >
                <ListOrdered className="size-4" />
              </button>
              <button
                type="button"
                title="Link"
                aria-label="Insert link"
                className="rounded p-1.5 text-slate-600 hover:bg-slate-200/80"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleLink}
              >
                <LinkIcon className="size-4" />
              </button>
              <button
                type="button"
                title="Remove formatting"
                aria-label="Remove formatting"
                className="rounded p-1.5 text-slate-600 hover:bg-slate-200/80"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => runFormat('removeFormat')}
              >
                <RemoveFormatting className="size-4" />
              </button>
            </div>

            {/* Message body */}
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
              <div
                ref={bodyRef}
                contentEditable={!sending}
                suppressContentEditableWarning
                className="min-h-[220px] rounded-sm border border-transparent px-1 py-2 text-sm leading-relaxed text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8]/30 [&_a]:text-[#1a73e8] [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6"
              />
            </div>

            {draft?.signature_html ? (
              <div className="shrink-0 border-t border-slate-100 bg-[#fafafa] px-4 py-2">
                <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={includeSignature}
                    onChange={(e) => setIncludeSignature(e.target.checked)}
                    className="rounded border-slate-300 text-[#1a73e8] focus:ring-[#1a73e8]"
                  />
                  Insert signature
                </label>
                {includeSignature && (
                  <div
                    className="mt-2 max-h-32 overflow-y-auto rounded border border-slate-200 bg-white p-2 text-xs text-slate-600 [&_a]:text-[#1a73e8]"
                    dangerouslySetInnerHTML={{ __html: draft.signature_html }}
                  />
                )}
              </div>
            ) : null}

            {/* Attachments + invoice PDF note */}
            <div
              className={`shrink-0 border-t border-slate-200 px-3 py-2 ${dragOver ? 'bg-[#e8f0fe]' : 'bg-[#f6f8fc]'}`}
              onDragEnter={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
              }}
              onDrop={handleDrop}
            >
              <p className="mb-2 text-[11px] leading-snug text-slate-600">
                Drag files here or use the paperclip to add more attachments.
              </p>
              <div className="mb-2 flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="sr-only"
                    multiple
                    onChange={handleFileInputChange}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    <Paperclip className="size-4 text-slate-500" />
                    Attach files
                  </button>
                </div>
                {files.length > 0 && (
                  <ul className="flex w-full flex-col gap-1.5 text-xs text-slate-700">
                    {files.map((f, i) => (
                      <li
                        key={`${f.name}-${i}-${f.size}`}
                        className="flex max-w-full items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2 py-1.5 shadow-sm"
                      >
                        <span className="min-w-0 truncate font-medium" title={f.name}>
                          {f.name}
                        </span>
                        <span className="shrink-0 text-slate-500">{formatFileSize(f.size)}</span>
                        <button
                          type="button"
                          className="shrink-0 rounded p-0.5 text-rose-600 hover:bg-rose-50"
                          aria-label={`Remove ${f.name}`}
                          onClick={() => removeFile(i)}
                        >
                          <X className="size-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 pt-2">
                <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={scheduleAfterSend}
                    onChange={(e) => setScheduleAfterSend(e.target.checked)}
                    className="rounded border-slate-300 text-[#1a73e8] focus:ring-[#1a73e8]"
                  />
                  Log follow-up note after send
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onClose()}
                    disabled={sending}
                    className="rounded-full px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={sending || !draft?.smtp_ready || !draft?.can_send}
                    className="inline-flex items-center gap-2 rounded-full bg-[#1a73e8] px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#1557b0] disabled:opacity-50"
                  >
                    <Send className="size-4" />
                    {sending ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
