import { resolveWorkpilotAssetUrl } from '@/lib/resolveWorkpilotAssetUrl';

export function isSignatureImageSrc(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (v.startsWith('data:image')) return true;
  if (v.startsWith('http://') || v.startsWith('https://')) return true;
  if (v.includes('/electrical-certificates/') && v.includes('/files/')) return true;
  return false;
}

export function resolveSignatureSrc(value: string): string | null {
  if (!value.trim()) return null;
  if (isSignatureImageSrc(value)) {
    return resolveWorkpilotAssetUrl(value) ?? value;
  }
  return null;
}
