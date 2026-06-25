'use client';

import { useState, useEffect } from 'react';
import CustomerSiteReportSignaturePad from '@/app/dashboard/customers/[id]/CustomerSiteReportSignaturePad';
import { getJson } from '@/app/apiClient';

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Could not read signature'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read signature'));
    reader.readAsDataURL(blob);
  });
}

export function DeclarationSignatureField({
  label,
  value,
  onChange,
  nameValue,
  onNameChange,
}: {
  label: string;
  value: string;
  onChange: (dataUrl: string) => void;
  nameValue?: string;
  onNameChange?: (name: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [officers, setOfficers] = useState<{ id: number; full_name: string; role_position: string | null }[]>([]);
  const [fetchingOfficers, setFetchingOfficers] = useState(false);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;
    if (!token) return;
    setFetchingOfficers(true);
    getJson<{ officers: any[] }>('/officers/list', token)
      .then((data) => {
        setOfficers(data.officers || []);
      })
      .catch((err) => {
        console.error('Error fetching officers list for dropdown:', err);
      })
      .finally(() => {
        setFetchingOfficers(false);
      });
  }, []);

  const userJson = typeof window !== 'undefined' ? window.localStorage.getItem('wp_user') : null;
  const currentUser = userJson ? JSON.parse(userJson) : null;
  const isAdmin = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'ADMIN';

  // Filter officers: if not admin, only show officer whose linked user ID matches
  const allowedOfficers = officers.filter(o => {
    if (isAdmin) return true;
    return currentUser?.officerId === o.id;
  });

  const options = [...allowedOfficers];
  if (!isAdmin && options.length === 0 && currentUser) {
    options.push({
      id: currentUser.officerId || -99,
      full_name: currentUser.full_name || currentUser.email || 'Me',
      role_position: currentUser.role
    });
  }

  const handleSelectOfficer = async (officerIdStr: string) => {
    const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;
    if (!token) return;
    
    if (!officerIdStr) {
      if (onNameChange) onNameChange('');
      onChange('');
      return;
    }

    const selectedId = parseInt(officerIdStr, 10);
    const selected = options.find(o => o.id === selectedId);
    if (!selected) return;

    if (onNameChange) {
      onNameChange(selected.full_name);
    }

    setBusy(true);
    try {
      let signatureUrl = '';
      if (selected.id === -99 || selected.id === currentUser?.officerId) {
        try {
          const res = await getJson<{ signature_data_url: string | null }>('/settings/signature', token);
          signatureUrl = res.signature_data_url || '';
        } catch {
          if (currentUser?.officerId) {
            const res = await getJson<{ signature_data_url: string | null }>(`/officers/${currentUser.officerId}/signature`, token);
            signatureUrl = res.signature_data_url || '';
          }
        }
      } else {
        const res = await getJson<{ signature_data_url: string | null }>(`/officers/${selected.id}/signature`, token);
        signatureUrl = res.signature_data_url || '';
      }
      onChange(signatureUrl);
    } catch (err) {
      console.error('Failed to fetch signature for signatory:', err);
    } finally {
      setBusy(false);
    }
  };

  const save = async (blob: Blob) => {
    setBusy(true);
    try {
      onChange(await blobToDataUrl(blob));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 space-y-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-600">{label}</p>
      
      {onNameChange && (
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Select signatory profile</label>
          <select
            value={options.find(o => o.full_name === nameValue)?.id || ''}
            onChange={(e) => handleSelectOfficer(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
            disabled={fetchingOfficers || busy}
          >
            <option value="">-- Choose Profile --</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.full_name} {o.role_position ? `(${o.role_position})` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {value ? (
        <div className="rounded border border-slate-200 bg-white p-2">
          <img src={value} alt={label} className="mx-auto h-16 max-w-full object-contain" />
        </div>
      ) : null}
      
      <CustomerSiteReportSignaturePad busy={busy} saveLabel={`Draw & Save Signature`} onSave={save} />
      
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          className="text-xs font-semibold text-rose-600 hover:underline"
        >
          Clear signature
        </button>
      ) : null}
    </div>
  );
}
