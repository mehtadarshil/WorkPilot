import path from 'path';
import { loadWorkpilotFile, writeWorkpilotFile } from '../workpilotFileStorage';
import { contentTypeFromFilename, parseInlineDataUrl } from '../inlineBlobStorage';

function certificateFileApiPath(certificateId: number, filename: string): string {
  return `/electrical-certificates/${certificateId}/files/${encodeURIComponent(filename)}`;
}

function fileNameFromCertificatePath(value: string, certificateId: number): string | null {
  const prefix = `/electrical-certificates/${certificateId}/files/`;
  if (!value.startsWith(prefix)) return null;
  const tail = value.slice(prefix.length);
  if (!tail) return null;
  return path.basename(decodeURIComponent(tail));
}

export async function storeCertificateDocumentInlineFiles(certificateId: number, raw: unknown): Promise<unknown> {
  async function walk(value: unknown, keyHint: string): Promise<unknown> {
    if (typeof value === 'string' && (keyHint === 'dataUrl' || keyHint === 'signatureDataUrl' || /SignatureDataUrl$/i.test(keyHint)) && value.startsWith('data:')) {
      const parsed = parseInlineDataUrl(value);
      if (!parsed) return value;
      const filename = `${keyHint}_${Date.now()}_${Math.random().toString(16).slice(2)}${parsed.extension}`;
      await writeWorkpilotFile('electrical-certificate-files', [certificateId], filename, parsed.buffer, parsed.contentType);
      return certificateFileApiPath(certificateId, filename);
    }
    if (Array.isArray(value)) {
      const out = [];
      for (let i = 0; i < value.length; i += 1) out.push(await walk(value[i], keyHint));
      return out;
    }
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = await walk(v, k);
      return out;
    }
    return value;
  }
  return walk(raw, '');
}

export async function resolveCertificateDocumentFileRefs(certificateId: number, raw: unknown): Promise<unknown> {
  async function walk(value: unknown, keyHint: string): Promise<unknown> {
    if (typeof value === 'string' && (keyHint === 'dataUrl' || keyHint === 'signatureDataUrl' || /SignatureDataUrl$/i.test(keyHint))) {
      const filename = fileNameFromCertificatePath(value, certificateId);
      if (!filename) return value;
      const file = await loadWorkpilotFile('electrical-certificate-files', [certificateId], filename);
      const data = file?.buffer ?? (file?.fullPath ? await import('fs/promises').then((m) => m.readFile(file.fullPath!)) : null);
      if (!data) return value;
      return `data:${contentTypeFromFilename(filename)};base64,${data.toString('base64')}`;
    }
    if (Array.isArray(value)) {
      const out = [];
      for (let i = 0; i < value.length; i += 1) out.push(await walk(value[i], keyHint));
      return out;
    }
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = await walk(v, k);
      return out;
    }
    return value;
  }
  return walk(raw, '');
}

