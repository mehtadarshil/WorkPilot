'use client';

import { useEffect, useState } from 'react';
import { resolveStockToolImageUrl } from '@/lib/resolveWorkpilotAssetUrl';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api';

type Props = {
  imageUrl: string | null | undefined;
  category: 'stock-photos' | 'tool-photos' | 'uniform-photos';
  token?: string | null;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
};

function buildFetchUrl(
  imageUrl: string,
  category: 'stock-photos' | 'tool-photos' | 'uniform-photos',
): string | null {
  const withAuth = resolveStockToolImageUrl(imageUrl, category, null);
  if (withAuth) return withAuth;
  if (imageUrl.startsWith('/api/')) {
    if (API_BASE_URL.startsWith('http://') || API_BASE_URL.startsWith('https://')) {
      const apiOrigin = API_BASE_URL.replace(/\/api\/?$/, '');
      return `${apiOrigin}${imageUrl}`;
    }
    return imageUrl;
  }
  const path = `/api/stock-tools/files/${category}/${imageUrl}`;
  if (API_BASE_URL.startsWith('http://') || API_BASE_URL.startsWith('https://')) {
    const apiOrigin = API_BASE_URL.replace(/\/api\/?$/, '');
    return `${apiOrigin}${path}`;
  }
  return path;
}

/** Loads stock/tool photos with Authorization (reliable cross-origin) and img+token fallback. */
export function AuthenticatedStockImage({
  imageUrl,
  category,
  token,
  alt,
  className,
  fallback = null,
}: Props) {
  const [blobSrc, setBlobSrc] = useState<string | null>(null);
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setBlobSrc(null);
    setImgSrc(null);
    setFailed(false);
    if (!imageUrl?.trim() || !token?.trim()) return;

    const fetchUrl = buildFetchUrl(imageUrl.trim(), category);
    if (!fetchUrl) {
      setFailed(true);
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(fetchUrl, {
          headers: { Authorization: `Bearer ${token.trim()}` },
          credentials: 'omit',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (!blob.type.startsWith('image/') && blob.size < 32) {
          throw new Error('Not an image');
        }
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobSrc(objectUrl);
      } catch {
        if (cancelled) return;
        const fallbackUrl = resolveStockToolImageUrl(imageUrl, category, token);
        if (fallbackUrl) {
          setImgSrc(fallbackUrl);
        } else {
          setFailed(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imageUrl, category, token]);

  const src = blobSrc || imgSrc;
  if (failed || !src) {
    if (imageUrl?.trim() && fallback) {
      return (
        <div className={`relative flex flex-col items-center justify-center gap-1 text-center ${className || ''}`}>
          {fallback}
          <span className="absolute bottom-1 left-1 right-1 rounded bg-black/50 px-1 py-0.5 text-[9px] font-medium text-white">
            Re-upload photo
          </span>
        </div>
      );
    }
    return <>{fallback}</>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
