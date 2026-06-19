'use client';

import { resolveWorkpilotAssetUrl } from '@/lib/resolveWorkpilotAssetUrl';

type Props = {
  src: string;
  alt?: string;
  className?: string;
};

export function CompanyLogoPreview({ src, alt = 'Logo preview', className }: Props) {
  const resolved = resolveWorkpilotAssetUrl(src);
  if (!resolved) return null;
  return <img src={resolved} alt={alt} className={className} />;
}
