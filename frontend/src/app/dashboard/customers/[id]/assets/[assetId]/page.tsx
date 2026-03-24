'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getJson } from '../../../../../apiClient';
import { ArrowLeft } from 'lucide-react';

interface AssetDetails {
  id: number;
  asset_group: string;
  asset_type: string | null;
  description: string;
  make: string | null;
  model: string | null;
  serial_number: string | null;
  photo_url: string | null;
  barcode: string | null;
  installed_by_us: boolean;
  under_warranty: boolean;
  is_functioning: string | null;
  location: string | null;
}

export default function CustomerAssetDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const customerId = String(params?.id || '');
  const assetId = String(params?.assetId || '');
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  const [asset, setAsset] = useState<AssetDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAsset = useCallback(async () => {
    if (!token || !customerId || !assetId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getJson<{ asset: AssetDetails }>(`/customers/${customerId}/assets/${assetId}`, token);
      setAsset(res.asset);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load asset');
    } finally {
      setLoading(false);
    }
  }, [token, customerId, assetId]);

  useEffect(() => {
    fetchAsset();
  }, [fetchAsset]);

  if (loading) return <div className="p-8 text-slate-500">Loading asset...</div>;
  if (!asset) {
    return (
      <div className="p-8">
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error || 'Asset not found'}</div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <button onClick={() => router.push(`/dashboard/customers/${customerId}?tab=Assets`)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100">
            <ArrowLeft className="size-4" />
          </button>
          <div className="text-sm text-slate-600">
            <span className="font-medium text-slate-900">Asset details</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2">
            <h2 className="text-sm font-semibold text-slate-800">Asset details</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
            <Row label="Asset group" value={asset.asset_group} />
            <Row label="Asset type" value={asset.asset_type} />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-2">
            <h2 className="text-sm font-semibold text-slate-800">Asset details</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
            <Row label="Description" value={asset.description} />
            <Row label="Make" value={asset.make} />
            <Row label="Model" value={asset.model} />
            <Row label="Serial number" value={asset.serial_number} />
            <Row label="Photo of asset" value={asset.photo_url} />
            <Row label="Barcode" value={asset.barcode} />
            <Row label="Did you install this asset?" value={asset.installed_by_us ? 'Yes' : 'No'} />
            <Row label="Is this asset under warranty?" value={asset.under_warranty ? 'Yes' : 'No'} />
            <Row label="Is the asset functioning?" value={asset.is_functioning} />
            <Row label="Location" value={asset.location} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid grid-cols-[170px_1fr] items-start gap-2">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <span className="text-sm text-slate-600">{value && value.trim() ? value : '-'}</span>
    </div>
  );
}
