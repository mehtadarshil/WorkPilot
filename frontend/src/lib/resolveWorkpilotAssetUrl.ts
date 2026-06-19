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
