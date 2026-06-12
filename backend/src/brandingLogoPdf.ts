import fs from 'fs/promises';
import { loadWorkpilotFile } from './workpilotFileStorage';

function appOrigin(): string {
  return (process.env.PUBLIC_APP_URL || process.env.APP_ORIGIN || '').replace(/\/+$/, '');
}

function imageContentTypeFromFilename(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  return 'image/jpeg';
}

function resolveAssetUrl(href: string): string {
  if (href.startsWith('data:') || href.startsWith('http://') || href.startsWith('https://')) return href;
  if (href.startsWith('//')) return `https:${href}`;
  const origin = appOrigin();
  if (href.startsWith('/') && origin) return `${origin}${href}`;
  return href;
}

export async function resolveBrandingLogoForPdf(
  href: string | null | undefined,
  ownerUserId?: number,
): Promise<string | null> {
  if (!href || !String(href).trim()) return null;
  const trimmed = String(href).trim();
  if (trimmed.startsWith('data:')) return trimmed;

  try {
    const pathname = trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? new URL(trimmed).pathname
      : trimmed;
    const parts = pathname.split('/').map((p) => decodeURIComponent(p)).filter(Boolean);
    const brandingIndex = parts.findIndex((p) => p === 'branding-assets');
    const scope = parts[brandingIndex + 1];
    const userId = parseInt(String(parts[brandingIndex + 2]), 10);
    const fileName = parts[brandingIndex + 3];

    if (
      brandingIndex >= 0 &&
      (scope === 'invoice' || scope === 'quotation') &&
      Number.isFinite(userId) &&
      (ownerUserId == null || userId === ownerUserId) &&
      fileName
    ) {
      const file = await loadWorkpilotFile('branding-assets', [scope, userId], fileName);
      const buffer = file?.buffer ?? (file?.fullPath ? await fs.readFile(file.fullPath) : null);
      if (buffer) {
        return `data:${imageContentTypeFromFilename(fileName)};base64,${buffer.toString('base64')}`;
      }
    }
  } catch {
    /* Fall back to URL-based rendering for manually entered external URLs. */
  }

  return resolveAssetUrl(trimmed);
}
