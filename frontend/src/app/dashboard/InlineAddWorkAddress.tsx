'use client';

import { useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { postJson } from '../apiClient';

export type InlineWorkAddress = {
  id: number;
  name: string | null;
  address_line_1: string | null;
  address_line_2?: string | null;
  address_line_3?: string | null;
  town: string | null;
  county: string | null;
  postcode: string | null;
};

type Props = {
  customerId: number | null;
  token: string | null;
  /** The site select control */
  children: ReactNode;
  onCreated: (address: InlineWorkAddress) => void;
};

const emptyForm = {
  name: '',
  address_line_1: '',
  address_line_2: '',
  town: '',
  county: '',
  postcode: '',
};

/**
 * Wraps a work-address select with a + button and inline create form
 * so sites can be added without leaving the current page.
 */
export default function InlineAddWorkAddress({ customerId, token, children, onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const disabled = customerId == null || !token;

  const handleSave = async () => {
    if (!token || customerId == null) return;
    const name = form.name.trim();
    const addressLine1 = form.address_line_1.trim();
    if (!name || !addressLine1) {
      setError('Site name and address line 1 are required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await postJson<{ work_address: { id: number } }>(
        `/customers/${customerId}/work-addresses`,
        {
          name,
          address_line_1: addressLine1,
          address_line_2: form.address_line_2.trim() || null,
          town: form.town.trim() || null,
          county: form.county.trim() || null,
          postcode: form.postcode.trim() || null,
          is_active: true,
        },
        token,
      );
      onCreated({
        id: res.work_address.id,
        name,
        address_line_1: addressLine1,
        address_line_2: form.address_line_2.trim() || null,
        town: form.town.trim() || null,
        county: form.county.trim() || null,
        postcode: form.postcode.trim() || null,
      });
      setOpen(false);
      setForm(emptyForm);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add site address');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">{children}</div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setOpen((v) => !v);
            setError(null);
          }}
          className="flex size-[38px] shrink-0 items-center justify-center rounded-lg border border-slate-200 text-[#14B8A6] transition-colors hover:bg-[#14B8A6] hover:text-white disabled:pointer-events-none disabled:opacity-40"
          title={open ? 'Cancel add site' : 'Add work / site address'}
        >
          <Plus className="size-4" />
        </button>
      </div>
      {open && customerId != null && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-600">New site / work address</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-700">
              Site name
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
                placeholder="e.g. Manor House"
              />
            </label>
            <label className="text-xs font-medium text-slate-700">
              Address line 1
              <input
                value={form.address_line_1}
                onChange={(e) => setForm((f) => ({ ...f, address_line_1: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
                placeholder="Street address"
              />
            </label>
            <label className="text-xs font-medium text-slate-700">
              Address line 2
              <input
                value={form.address_line_2}
                onChange={(e) => setForm((f) => ({ ...f, address_line_2: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
              />
            </label>
            <label className="text-xs font-medium text-slate-700">
              Town
              <input
                value={form.town}
                onChange={(e) => setForm((f) => ({ ...f, town: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
              />
            </label>
            <label className="text-xs font-medium text-slate-700">
              County
              <input
                value={form.county}
                onChange={(e) => setForm((f) => ({ ...f, county: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
              />
            </label>
            <label className="text-xs font-medium text-slate-700">
              Postcode
              <input
                value={form.postcode}
                onChange={(e) => setForm((f) => ({ ...f, postcode: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
              />
            </label>
          </div>
          {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="flex-1 rounded-lg bg-[#14B8A6] px-3 py-2 text-sm font-semibold text-white hover:bg-[#0d9488] disabled:opacity-50"
            >
              {saving ? 'Adding…' : 'Add site and select'}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setOpen(false);
                setError(null);
                setForm(emptyForm);
              }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
