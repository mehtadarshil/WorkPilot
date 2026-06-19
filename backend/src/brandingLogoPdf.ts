import fs from 'fs/promises';
import { loadWorkpilotFile } from './workpilotFileStorage';
import { apiPublicOrigin, parseBrandingAssetPath } from './brandingLogoUrl';

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
  const origin = apiPublicOrigin();
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
    const parsed = parseBrandingAssetPath(pathname);
    if (parsed && (ownerUserId == null || parsed.userId === ownerUserId)) {
      const file = await loadWorkpilotFile('branding-assets', [parsed.scope, parsed.userId], parsed.filename);
      const buffer = file?.buffer ?? (file?.fullPath ? await fs.readFile(file.fullPath) : null);
      if (buffer) {
        return `data:${imageContentTypeFromFilename(parsed.filename)};base64,${buffer.toString('base64')}`;
      }
    }
  } catch {
    /* Fall back to URL-based rendering for manually entered external URLs. */
  }

  return resolveAssetUrl(trimmed);
}
