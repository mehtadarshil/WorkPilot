'use client';

import { useCallback, useEffect, useState } from 'react';
import { getJson } from '@/app/apiClient';
import {
  DEFAULT_COMPANY_BRANDING,
  type CompanyBranding,
} from '@/lib/electricalCertificates/companyBranding';

export function useCompanyBranding() {
  const [branding, setBranding] = useState<CompanyBranding>(DEFAULT_COMPANY_BRANDING);
  const [loading, setLoading] = useState(true);

  const fetchBranding = useCallback(async () => {
    const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;
    if (!token) {
      setBranding(DEFAULT_COMPANY_BRANDING);
      setLoading(false);
      return;
    }
    try {
      const data = await getJson<{ branding: CompanyBranding }>(
        '/electrical-certificates/branding',
        token,
      );
      setBranding({ ...DEFAULT_COMPANY_BRANDING, ...data.branding });
    } catch {
      setBranding(DEFAULT_COMPANY_BRANDING);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchBranding();
  }, [fetchBranding]);

  return { branding, loading, refresh: fetchBranding };
}
