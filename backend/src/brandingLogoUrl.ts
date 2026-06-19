import path from 'path';
import { workpilotFileUrl } from './workpilotFileStorage';

export type BrandingLogoScope = 'invoice' | 'quotation';

export function brandingLogoPublicPath(scope: BrandingLogoScope, userId: number, filename: string): string {
  return `/api/branding-assets/${scope}/${userId}/${encodeURIComponent(path.basename(filename))}`;
}

export function normalizeStoredBrandingLogoValue(
  userId: number,
  scope: BrandingLogoScope,
  value: unknown,
): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('/api/branding-assets/')) return trimmed;

  try {
    const pathname = trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? new URL(trimmed).pathname
      : trimmed;
    const parts = pathname.split('/').map((p) => decodeURIComponent(p)).filter(Boolean);
    const brandingIndex = parts.findIndex((p) => p === 'branding-assets');
    if (
      brandingIndex >= 0 &&
      parts[brandingIndex + 1] === scope &&
      parts[brandingIndex + 2] === String(userId) &&
      parts[brandingIndex + 3]
    ) {
      return brandingLogoPublicPath(scope, userId, parts[brandingIndex + 3]);
    }
  } catch {
    /* keep manually entered URLs unchanged */
  }

  return trimmed;
}

export function parseBrandingAssetPath(
  value: string,
): { scope: BrandingLogoScope; userId: number; filename: string } | null {
  try {
    const pathname = value.startsWith('http://') || value.startsWith('https://')
      ? new URL(value).pathname
      : value;
    const parts = pathname.split('/').map((p) => decodeURIComponent(p)).filter(Boolean);
    const brandingIndex = parts.findIndex((p) => p === 'branding-assets');
    const scope = parts[brandingIndex + 1];
    const userId = parseInt(String(parts[brandingIndex + 2]), 10);
    const filename = parts[brandingIndex + 3];
    if (
      brandingIndex >= 0 &&
      (scope === 'invoice' || scope === 'quotation') &&
      Number.isFinite(userId) &&
      userId > 0 &&
      filename
    ) {
      return { scope, userId, filename: path.basename(filename) };
    }
  } catch {
    return null;
  }
  return null;
}

export function apiPublicOrigin(): string {
  const raw =
    process.env.API_PUBLIC_URL?.trim() ||
    process.env.PUBLIC_API_URL?.trim() ||
    process.env.PUBLIC_APP_URL?.trim() ||
    '';
  return raw.replace(/\/+$/, '');
}

/** Resolve a stored logo reference to a browser-loadable absolute URL. */
export function resolveBrandingLogoPublicUrl(
  value: unknown,
  userId: number,
  scope: BrandingLogoScope,
): string | null {
  const normalized = normalizeStoredBrandingLogoValue(userId, scope, value);
  if (!normalized) return null;
  if (
    normalized.startsWith('data:') ||
    normalized.startsWith('http://') ||
    normalized.startsWith('https://')
  ) {
    return normalized;
  }

  const parsed = parseBrandingAssetPath(normalized);
  if (parsed) {
    const spacesUrl = workpilotFileUrl('branding-assets', [parsed.scope, parsed.userId], parsed.filename);
    if (spacesUrl) return spacesUrl;
  }

  const apiOrigin = apiPublicOrigin();
  if (apiOrigin && normalized.startsWith('/')) {
    return `${apiOrigin}${normalized}`;
  }

  return normalized;
}
