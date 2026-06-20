import path from 'path';

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

/** Canonical relative path for any stored branding asset reference. */
export function canonicalBrandingLogoPath(value: unknown, userId: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('data:')) return trimmed;

  const parsed = parseBrandingAssetPath(trimmed);
  if (parsed) {
    return brandingLogoPublicPath(parsed.scope, parsed.userId, parsed.filename);
  }

  return normalizeStoredBrandingLogoValue(userId, 'invoice', trimmed)
    ?? normalizeStoredBrandingLogoValue(userId, 'quotation', trimmed);
}

/** Resolve a stored logo reference to a browser-loadable absolute URL (via API proxy, not private Spaces). */
export function resolveBrandingLogoPublicUrl(
  value: unknown,
  userId: number,
  scope: BrandingLogoScope,
): string | null {
  const normalized = normalizeStoredBrandingLogoValue(userId, scope, value);
  if (!normalized) return null;
  if (normalized.startsWith('data:')) return normalized;

  const relative = canonicalBrandingLogoPath(normalized, userId) ?? normalized;
  if (relative.startsWith('http://') || relative.startsWith('https://')) {
    const parsed = parseBrandingAssetPath(relative);
    if (!parsed) return relative;
    const apiOrigin = apiPublicOrigin();
    const pathOnly = brandingLogoPublicPath(parsed.scope, parsed.userId, parsed.filename);
    return apiOrigin ? `${apiOrigin}${pathOnly}` : pathOnly;
  }

  const apiOrigin = apiPublicOrigin();
  if (apiOrigin && relative.startsWith('/')) {
    return `${apiOrigin}${relative}`;
  }

  return relative;
}
