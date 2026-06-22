export function isSignatureImageSrc(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (v.startsWith('data:image')) return true;
  if (v.startsWith('http://') || v.startsWith('https://')) return true;
  if (v.includes('/electrical-certificates/') && v.includes('/files/')) return true;
  return false;
}

export function signatureBlockHtml(
  imageSrc: string,
  esc: (s: string) => string,
  typedSignature?: string,
  label?: string,
): string {
  const labelHtml = label ? `<p class="cp-signature-label">${esc(label)}</p>` : '';
  let inner = '<span class="cp-signature-empty">—</span>';
  if (imageSrc.trim() && isSignatureImageSrc(imageSrc)) {
    const src = imageSrc.startsWith('/') && process.env.API_PUBLIC_URL
      ? `${process.env.API_PUBLIC_URL.replace(/\/+$/, '')}${imageSrc}`
      : imageSrc;
    inner = `<img src="${esc(src)}" alt="${esc(label ?? 'Signature')}" class="cp-signature-img"/>`;
  } else if (typedSignature?.trim()) {
    inner = `<span class="cp-signature-typed">${esc(typedSignature)}</span>`;
  }
  return `<div class="cp-signature-block">${labelHtml}<div class="cp-signature-box">${inner}</div></div>`;
}

export function declarationSignatoryHtml(
  title: string,
  name: string,
  position: string,
  date: string,
  signatureDataUrl: string,
  esc: (s: string) => string,
  typedSignature?: string,
): string {
  if (!name.trim() && !position.trim() && !date.trim() && !signatureDataUrl.trim()) return '';
  const rows = [
    name.trim() ? `<tr><td>Name</td><td>${esc(name)}</td></tr>` : '',
    position.trim() ? `<tr><td>Position</td><td>${esc(position)}</td></tr>` : '',
    date.trim() ? `<tr><td>Date</td><td>${esc(date)}</td></tr>` : '',
  ].join('');
  return `<div class="cp-signatory-card">
    <h4 class="cp-signatory-title">${esc(title)}</h4>
    ${rows ? `<table class="cp-signatory-meta"><tbody>${rows}</tbody></table>` : ''}
    ${signatureBlockHtml(signatureDataUrl, esc, typedSignature ?? name, 'Signature')}
  </div>`;
}
