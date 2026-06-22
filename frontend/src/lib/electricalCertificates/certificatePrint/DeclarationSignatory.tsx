'use client';

import { resolveSignatureSrc } from './signatureUtils';

export function SignatureBlock({
  imageSrc,
  typedSignature,
  label,
}: {
  imageSrc: string;
  typedSignature?: string;
  label?: string;
}) {
  const resolved = resolveSignatureSrc(imageSrc);
  return (
    <div className="cp-signature-block">
      {label && <p className="cp-signature-label">{label}</p>}
      <div className="cp-signature-box">
        {resolved ? (
          <img src={resolved} alt={label ?? 'Signature'} className="cp-signature-img" />
        ) : typedSignature?.trim() ? (
          <span className="cp-signature-typed">{typedSignature}</span>
        ) : (
          <span className="cp-signature-empty">—</span>
        )}
      </div>
    </div>
  );
}

export function DeclarationSignatoryRow({
  title,
  name,
  position,
  date,
  signatureDataUrl,
  typedSignature,
}: {
  title: string;
  name: string;
  position: string;
  date: string;
  signatureDataUrl: string;
  typedSignature?: string;
}) {
  if (!name.trim() && !position.trim() && !date.trim() && !signatureDataUrl.trim()) return null;
  return (
    <div className="cp-signatory-card">
      <h4 className="cp-signatory-title">{title}</h4>
      <table className="cp-signatory-meta">
        <tbody>
          {name.trim() && (
            <tr>
              <td>Name</td>
              <td>{name}</td>
            </tr>
          )}
          {position.trim() && (
            <tr>
              <td>Position</td>
              <td>{position}</td>
            </tr>
          )}
          {date.trim() && (
            <tr>
              <td>Date</td>
              <td>{date}</td>
            </tr>
          )}
        </tbody>
      </table>
      <SignatureBlock imageSrc={signatureDataUrl} typedSignature={typedSignature ?? name} label="Signature" />
    </div>
  );
}
