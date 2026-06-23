const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api';

/** Turn stored `/api/...` asset paths into URLs the browser can load in production. */
export function resolveWorkpilotAssetUrl(src: string | null | undefined): string | null {
  if (!src) return null;
  const trimmed = src.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('data:') || trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  if (trimmed.startsWith('/api/')) {
    if (API_BASE_URL.startsWith('http://') || API_BASE_URL.startsWith('https://')) {
      const apiOrigin = API_BASE_URL.replace(/\/api\/?$/, '');
      return `${apiOrigin}${trimmed}`;
    }
    return trimmed;
  }

  if (trimmed.startsWith('/')) {
    if (API_BASE_URL.startsWith('http://') || API_BASE_URL.startsWith('https://')) {
      const apiOrigin = API_BASE_URL.replace(/\/api\/?$/, '');
      return `${apiOrigin}${trimmed}`;
    }
  }

  return trimmed;
}

/** Append auth token for `<img src>` requests that cannot send Authorization headers. */
export function resolveWorkpilotAssetUrlWithAuth(
  src: string | null | undefined,
  token?: string | null,
): string | null {
  const base = resolveWorkpilotAssetUrl(src);
  if (!base) return null;
  if (!token?.trim()) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}token=${encodeURIComponent(token.trim())}`;
}

/** Stock inventory or tool registry photo from DB `image_url`. */
export function resolveStockToolImageUrl(
  imageUrl: string | null | undefined,
  category: 'stock-photos' | 'tool-photos',
  token?: string | null,
): string | null {
  if (!imageUrl?.trim()) return null;
  const trimmed = imageUrl.trim();
  if (trimmed.startsWith('/api/') || trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return resolveWorkpilotAssetUrlWithAuth(trimmed, token);
  }
  return resolveWorkpilotAssetUrlWithAuth(`/api/stock-tools/files/${category}/${trimmed}`, token);
}
