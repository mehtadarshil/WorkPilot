'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Plus, AlertTriangle } from 'lucide-react';
import { getJson, patchJson, postJson } from '../../../apiClient';

interface Contact {
  id: number;
  customer_id: number;
  title: string | null;
  first_name: string | null;
  surname: string;
  position: string | null;
  email: string | null;
  mobile: string | null;
  landline: string | null;
  office_code: string | null;
  date_of_birth: string | null;
  twitter_handle: string | null;
  facebook_url: string | null;
  linkedin_url: string | null;
  is_primary: boolean;
  prefers_phone: boolean;
  prefers_sms: boolean;
  prefers_email: boolean;
  prefers_letter: boolean;
}

interface ContactsResponse {
  contacts: Contact[];
}

interface Props {
  customerId: string;
  workAddressId?: string;
}

type ContactForm = {
  title: string;
  first_name: string;
  surname: string;
  position: string;
  email: string;
  mobile: string;
  landline: string;
  office_code: string;
  date_of_birth: string;
  twitter_handle: string;
  facebook_url: string;
  linkedin_url: string;
  is_primary: boolean;
  prefers_phone: boolean;
  prefers_sms: boolean;
  prefers_email: boolean;
  prefers_letter: boolean;
};

const emptyForm: ContactForm = {
  title: 'Mr',
  first_name: '',
  surname: '',
  position: '',
  email: '',
  mobile: '',
  landline: '',
  office_code: '+44',
  date_of_birth: '',
  twitter_handle: '',
  facebook_url: '',
  linkedin_url: '',
  is_primary: false,
  prefers_phone: false,
  prefers_sms: false,
  prefers_email: false,
  prefers_letter: false,
};

export default function CustomerContactsTab({ customerId, workAddressId }: Props) {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openModal, setOpenModal] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [form, setForm] = useState<ContactForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchContacts = useCallback(async () => {
    if (!token || !customerId) return;
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (search.trim()) q.set('search', search.trim());
      if (workAddressId) q.set('work_address_id', workAddressId);
      const res = await getJson<ContactsResponse>(`/customers/${customerId}/contacts${q.toString() ? `?${q.toString()}` : ''}`, token);
      setContacts(res.contacts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load contacts');
    } finally {
      setLoading(false);
    }
  }, [token, customerId, search, workAddressId]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const primaryContact = useMemo(() => contacts.find((c) => c.is_primary) || null, [contacts]);

  const startCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpenModal(true);
  };

  const startEdit = (c: Contact) => {
    setEditing(c);
    setForm({
      title: c.title || 'Mr',
      first_name: c.first_name || '',
      surname: c.surname || '',
      position: c.position || '',
      email: c.email || '',
      mobile: c.mobile || '',
      landline: c.landline || '',
      office_code: c.office_code || '+44',
      date_of_birth: c.date_of_birth || '',
      twitter_handle: c.twitter_handle || '',
      facebook_url: c.facebook_url || '',
      linkedin_url: c.linkedin_url || '',
      is_primary: !!c.is_primary,
      prefers_phone: !!c.prefers_phone,
      prefers_sms: !!c.prefers_sms,
      prefers_email: !!c.prefers_email,
      prefers_letter: !!c.prefers_letter,
    });
    setOpenModal(true);
  };

  const saveContact = async () => {
    if (!token) return;
    if (!form.surname.trim()) {
      setError('Surname is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title: form.title,
        first_name: form.first_name || null,
        surname: form.surname,
        position: form.position || null,
        email: form.email || null,
        mobile: form.mobile || null,
        landline: form.landline || null,
        office_code: form.office_code || null,
        date_of_birth: form.date_of_birth || null,
        twitter_handle: form.twitter_handle || null,
        facebook_url: form.facebook_url || null,
        linkedin_url: form.linkedin_url || null,
        is_primary: form.is_primary,
        prefers_phone: form.prefers_phone,
        prefers_sms: form.prefers_sms,
        prefers_email: form.prefers_email,
        prefers_letter: form.prefers_letter,
      };
      if (editing) {
        await patchJson(`/customers/${customerId}/contacts/${editing.id}`, payload, token);
      } else {
        await postJson(`/customers/${customerId}/contacts`, payload, token);
      }
      setOpenModal(false);
      setEditing(null);
      setForm(emptyForm);
      fetchContacts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save contact');
    } finally {
      setSaving(false);
    }
  };

  const prefWarnings = [
    form.prefers_phone && !form.landline && !form.mobile ? 'Contact does not have a phone number' : null,
    form.prefers_sms && !form.mobile ? 'Contact does not have a mobile number' : null,
    form.prefers_email && !form.email ? 'Contact does not have an email address' : null,
  ].filter(Boolean) as string[];

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search contacts" className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]" />
          </div>
          <button onClick={fetchContacts} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Search</button>
          <button onClick={startCreate} className="inline-flex items-center gap-2 rounded-lg bg-[#14B8A6] px-3 py-2 text-sm font-semibold text-white hover:bg-[#119f90]">
            <Plus className="size-4" />
            Add new contact
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-4 py-3">
          <span className="text-sm font-semibold text-slate-900">Contacts</span>
          <span className="rounded-full bg-[#14B8A6]/10 px-2.5 py-0.5 text-xs font-semibold text-[#14B8A6]">
            {contacts.length} contact{contacts.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">Name</th>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">Position</th>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">Email</th>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">Phone number</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Loading contacts...</td></tr>
              ) : contacts.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No contacts found.</td></tr>
              ) : (
                contacts.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-medium text-slate-900">{[c.title, c.first_name, c.surname].filter(Boolean).join(' ')}</td>
                    <td className="px-4 py-3">{c.position || '-'}</td>
                    <td className="px-4 py-3 text-[#14B8A6]">{c.email || '-'}</td>
                    <td className="px-4 py-3">{c.mobile || c.landline || '-'}</td>
                    <td className="px-4 py-3 text-right">
                      {c.is_primary && <span className="mr-3 rounded-full bg-[#14B8A6]/10 px-2 py-0.5 text-xs font-semibold text-[#14B8A6]">Primary contact</span>}
                      <button onClick={() => startEdit(c)} className="font-semibold text-[#14B8A6] hover:underline">Edit</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-2 text-xs text-slate-500">
          <span>Showing {contacts.length === 0 ? 0 : 1} to {contacts.length} of {contacts.length} entries</span>
          <span>{primaryContact ? `Primary: ${[primaryContact.title, primaryContact.first_name, primaryContact.surname].filter(Boolean).join(' ')}` : 'No primary contact selected'}</span>
        </div>
      </div>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div>}

      {openModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => !saving && setOpenModal(false)}>
          <div className="w-full max-w-5xl rounded-2xl border border-slate-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-slate-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-slate-900">{editing ? 'Edit contact' : 'Add new contact'}</h3>
            </div>
            <div className="space-y-5 p-6">
              <div className="rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">Add new contact</div>
                <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
                  <div className="space-y-3">
                    <div className="grid grid-cols-[110px_1fr] items-center gap-2">
                      <label className="text-sm text-slate-600">Title</label>
                      <select value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]">
                        <option>Mr</option><option>Mrs</option><option>Miss</option><option>Ms</option><option>Dr</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-[110px_1fr] items-center gap-2">
                      <label className="text-sm text-slate-600">Name</label>
                      <input value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                    </div>
                    <div className="grid grid-cols-[110px_1fr] items-center gap-2">
                      <label className="text-sm text-slate-600">Surname *</label>
                      <input value={form.surname} onChange={(e) => setForm((f) => ({ ...f, surname: e.target.value }))} className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                    </div>
                    <div className="grid grid-cols-[110px_1fr] items-center gap-2">
                      <label className="text-sm text-slate-600">Date of birth</label>
                      <input type="date" value={form.date_of_birth} onChange={(e) => setForm((f) => ({ ...f, date_of_birth: e.target.value }))} className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                    </div>
                    <div className="grid grid-cols-[110px_70px_1fr] items-center gap-2">
                      <label className="text-sm text-slate-600">Office</label>
                      <input value={form.office_code} onChange={(e) => setForm((f) => ({ ...f, office_code: e.target.value }))} className="rounded border border-slate-200 px-2 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                      <input value={form.mobile} onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value }))} placeholder="Phone number" className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="grid grid-cols-[110px_1fr] items-center gap-2">
                      <label className="text-sm text-slate-600">Position</label>
                      <input value={form.position} onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))} className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                    </div>
                    <div className="grid grid-cols-[110px_1fr] items-center gap-2">
                      <label className="text-sm text-slate-600">Email</label>
                      <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                    </div>
                    <div className="grid grid-cols-[110px_1fr] items-center gap-2">
                      <label className="text-sm text-slate-600">Twitter</label>
                      <input value={form.twitter_handle} onChange={(e) => setForm((f) => ({ ...f, twitter_handle: e.target.value }))} className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                    </div>
                    <div className="grid grid-cols-[110px_1fr] items-center gap-2">
                      <label className="text-sm text-slate-600">Facebook URL</label>
                      <input value={form.facebook_url} onChange={(e) => setForm((f) => ({ ...f, facebook_url: e.target.value }))} className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                    </div>
                    <div className="grid grid-cols-[110px_1fr] items-center gap-2">
                      <label className="text-sm text-slate-600">LinkedIn URL</label>
                      <input value={form.linkedin_url} onChange={(e) => setForm((f) => ({ ...f, linkedin_url: e.target.value }))} className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">Communication preferences</div>
                <div className="p-4">
                  <div className="grid gap-2 text-sm text-slate-700">
                    <label className="inline-flex items-center gap-2"><input className="rounded border-slate-300 text-[#14B8A6] focus:ring-[#14B8A6]" type="checkbox" checked={form.prefers_phone} onChange={(e) => setForm((f) => ({ ...f, prefers_phone: e.target.checked }))} /> Phone call</label>
                    <label className="inline-flex items-center gap-2"><input className="rounded border-slate-300 text-[#14B8A6] focus:ring-[#14B8A6]" type="checkbox" checked={form.prefers_sms} onChange={(e) => setForm((f) => ({ ...f, prefers_sms: e.target.checked }))} /> SMS</label>
                    <label className="inline-flex items-center gap-2"><input className="rounded border-slate-300 text-[#14B8A6] focus:ring-[#14B8A6]" type="checkbox" checked={form.prefers_email} onChange={(e) => setForm((f) => ({ ...f, prefers_email: e.target.checked }))} /> Email</label>
                    <label className="inline-flex items-center gap-2"><input className="rounded border-slate-300 text-[#14B8A6] focus:ring-[#14B8A6]" type="checkbox" checked={form.prefers_letter} onChange={(e) => setForm((f) => ({ ...f, prefers_letter: e.target.checked }))} /> Letter</label>
                    <label className="inline-flex items-center gap-2 pt-2"><input className="rounded border-slate-300 text-[#14B8A6] focus:ring-[#14B8A6]" type="checkbox" checked={form.is_primary} onChange={(e) => setForm((f) => ({ ...f, is_primary: e.target.checked }))} /> Mark as primary contact</label>
                  </div>
                  {prefWarnings.length > 0 && (
                    <div className="mt-3 space-y-1 text-xs text-rose-600">
                      {prefWarnings.map((w) => (
                        <div key={w} className="flex items-center gap-1"><AlertTriangle className="size-3.5" /> {w}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
              <button onClick={() => setOpenModal(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              <button onClick={saveContact} disabled={saving} className="rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#119f90] disabled:opacity-50">
                {saving ? 'Saving...' : editing ? 'Update contact' : 'Add contact'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
