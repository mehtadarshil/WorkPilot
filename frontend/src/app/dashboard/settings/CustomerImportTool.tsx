'use client';

import { useCallback, useEffect, useState } from 'react';
import { Upload, X, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getJson, postJson } from '../../apiClient';
import { parseCsv, toObjects } from '../csvUtils';

interface CustomerType {
    id: number;
    name: string;
    description: string | null;
    company_name_required: boolean;
    allow_branches: boolean;
    work_address_name: string;
}

export default function CustomerImportTool({ token, onComplete }: { token: string; onComplete: () => void }) {
    const [importOpen, setImportOpen] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);
    const [importing, setImporting] = useState(false);
    const [customerCsvObjects, setCustomerCsvObjects] = useState<Record<string, string>[] | null>(null);
    const [siteCsvObjects, setSiteCsvObjects] = useState<Record<string, string>[] | null>(null);
    const [importEdits, setImportEdits] = useState<Record<string, Record<string, string>>>({});
    const [editImportKey, setEditImportKey] = useState<string | null>(null);

    const normKey = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

    const customerImportRows = (() => {
        if (!customerCsvObjects) return [];
        return customerCsvObjects.map((o, idx) => {
            const name = o['Customer Name']?.trim() || '';
            const key = `${normKey(name)}__${idx}`;
            const email = (o['Email Address'] || '').trim();
            const phone = (o['Mobile Number'] || o['Phone Number'] || '').trim();
            const archived = (o['Archived'] || '').trim();
            const missing: string[] = [];
            if (!name) missing.push('Customer Name');
            if (!email) missing.push('Email Address');
            return { key, raw: o, name, email, phone, archived, missing };
        });
    })();

    const siteImportRows = (() => {
        if (!siteCsvObjects) return [];
        return siteCsvObjects.map((o, idx) => {
            const customer = (o['Customer'] || '').trim();
            const siteName = (o['Site Name'] || '').trim();
            const addr1 = (o['Address Street'] || '').trim();
            const key = `${normKey(customer)}__${idx}`;
            const missing: string[] = [];
            if (!customer) missing.push('Customer');
            if (!siteName) missing.push('Site Name');
            if (!addr1) missing.push('Address Street');
            return { key, raw: o, customer, siteName, addr1, missing };
        });
    })();

    const openImport = () => {
        setImportError(null);
        setImporting(false);
        setCustomerCsvObjects(null);
        setSiteCsvObjects(null);
        setImportEdits({});
        setEditImportKey(null);
        setImportOpen(true);
    };

    const handleCustomerCsv = async (file: File) => {
        const text = await file.text();
        const objects = toObjects(parseCsv(text));
        setCustomerCsvObjects(objects);
    };

    const handleSiteCsv = async (file: File) => {
        const text = await file.text();
        const objects = toObjects(parseCsv(text));
        setSiteCsvObjects(objects);
    };

    const buildPayload = () => {
        const customersPayload = customerImportRows.map((c) => {
            const e = importEdits[c.key] || {};
            return {
                customer_name: e['Customer Name'] ?? c.raw['Customer Name'] ?? '',
                contact_name: e['Contact Name'] ?? c.raw['Contact Name'] ?? '',
                email_address: e['Email Address'] ?? c.raw['Email Address'] ?? '',
                phone_number: e['Phone Number'] ?? c.raw['Phone Number'] ?? '',
                mobile_number: e['Mobile Number'] ?? c.raw['Mobile Number'] ?? '',
                physical_address_street: e['Physical Address Street'] ?? c.raw['Physical Address Street'] ?? '',
                physical_address_city: e['Physical Address City'] ?? c.raw['Physical Address City'] ?? '',
                physical_address_region: e['Physical Address Region'] ?? c.raw['Physical Address Region'] ?? '',
                physical_address_postal_code: e['Physical Address Postal Code'] ?? c.raw['Physical Address Postal Code'] ?? '',
                physical_address_country: e['Physical Address Country'] ?? c.raw['Physical Address Country'] ?? '',
                lead_source: e['Lead Source'] ?? c.raw['Lead Source'] ?? '',
                archived: e['Archived'] ?? c.raw['Archived'] ?? '',
            };
        });

        const sitesPayload = siteImportRows.map((s) => {
            const e = importEdits[s.key] || {};
            return {
                customer: e['Customer'] ?? s.raw['Customer'] ?? '',
                site_name: e['Site Name'] ?? s.raw['Site Name'] ?? '',
                contact_name: e['Contact Name'] ?? s.raw['Contact Name'] ?? '',
                email_address: e['Email Address'] ?? s.raw['Email Address'] ?? '',
                phone_number: e['Phone Number'] ?? s.raw['Phone Number'] ?? '',
                mobile_number: e['Mobile Number'] ?? s.raw['Mobile Number'] ?? '',
                address_street: e['Address Street'] ?? s.raw['Address Street'] ?? '',
                address_city: e['Address City'] ?? s.raw['Address City'] ?? '',
                address_region: e['Address Region'] ?? s.raw['Address Region'] ?? '',
                address_postal_code: e['Address Postal Code'] ?? s.raw['Address Postal Code'] ?? '',
                address_country: e['Address Country'] ?? s.raw['Address Country'] ?? '',
                archived: e['Archived'] ?? s.raw['Archived'] ?? '',
            };
        });

        return { customers: customersPayload, sites: sitesPayload };
    };

    const runImport = async () => {
        if (!token) return;
        if (!customerCsvObjects || !siteCsvObjects) {
            setImportError('Please upload both customer_export.csv and site_export.csv');
            return;
        }
        setImporting(true);
        setImportError(null);
        try {
            await postJson('/import/customers-sites', buildPayload(), token);
            setImportOpen(false);
            onComplete();
        } catch (err) {
            setImportError(err instanceof Error ? err.message : 'Import failed');
        } finally {
            setImporting(false);
        }
    };

    const setEditValue = (key: string, field: string, value: string) => {
        setImportEdits((prev) => ({
            ...prev,
            [key]: { ...(prev[key] || {}), [field]: value },
        }));
    };

    return (
        <>
            <button
                type="button"
                onClick={openImport}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#14B8A6] px-5 py-2.5 font-bold text-white shadow-sm transition hover:brightness-110"
            >
                <Upload className="size-5" />
                Import Customers & Sites
            </button>

            {importOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
                    <div className="w-full max-w-6xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">Import customers + sites</h3>
                                <p className="text-sm text-slate-500">Upload both files. Sites will be imported into each customer’s Work address list automatically.</p>
                            </div>
                            <button onClick={() => setImportOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                                <X className="size-5" />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-2">
                            <div className="rounded-xl border border-slate-200 bg-white p-4">
                                <div className="mb-3 text-sm font-semibold text-slate-800">1) Upload `customer_export.csv`</div>
                                <input
                                    type="file"
                                    accept=".csv"
                                    onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (f) handleCustomerCsv(f);
                                    }}
                                    className="mb-3 block w-full text-xs text-slate-500 file:mr-4 file:rounded file:border-0 file:bg-[#14B8A6] file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-[#13a89a]"
                                />
                                {customerCsvObjects && (
                                    <div className="text-xs text-emerald-600 font-bold">
                                        {customerImportRows.length} customers found.
                                    </div>
                                )}
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-white p-4">
                                <div className="mb-3 text-sm font-semibold text-slate-800">2) Upload `site_export.csv`</div>
                                <input
                                    type="file"
                                    accept=".csv"
                                    onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (f) handleSiteCsv(f);
                                    }}
                                    className="mb-3 block w-full text-xs text-slate-500 file:mr-4 file:rounded file:border-0 file:bg-[#14B8A6] file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-[#13a89a]"
                                />
                                {siteCsvObjects && (
                                    <div className="text-xs text-emerald-600 font-bold">
                                        {siteImportRows.length} sites found.
                                    </div>
                                )}
                            </div>
                        </div>

                        {customerCsvObjects && siteCsvObjects && (
                            <div className="max-h-[50vh] overflow-y-auto px-6 pb-6">
                                <div className="rounded-lg border border-slate-200 overflow-hidden">
                                    <table className="w-full text-left text-xs bg-slate-50">
                                        <thead className="bg-slate-100 uppercase tracking-wider text-slate-500 font-bold">
                                            <tr>
                                                <th className="px-3 py-2">Customer / Mapping</th>
                                                <th className="px-3 py-2">Email</th>
                                                <th className="px-3 py-2">Phone</th>
                                                <th className="px-3 py-2">Sites</th>
                                                <th className="px-3 py-2">Validation</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-200 bg-white">
                                            {customerImportRows.map((r) => {
                                                const e = importEdits[r.key] || {};
                                                const name = e['Customer Name'] ?? r.name;
                                                const email = e['Email Address'] ?? r.email;
                                                const phone = (e['Mobile Number'] || e['Phone Number']) ?? r.phone;
                                                const isEditing = editImportKey === r.key;
                                                const sites = siteImportRows.filter(s => normKey(s.customer) === normKey(r.name));

                                                return (
                                                    <tr key={r.key} className={r.missing.length ? 'bg-red-50/30' : ''}>
                                                        <td className="px-3 py-2">
                                                            {isEditing ? (
                                                                <input
                                                                    autoFocus
                                                                    className="w-full rounded border border-[#14B8A6] px-1 py-0.5 text-xs outline-none"
                                                                    value={name}
                                                                    onChange={(e) => setEditValue(r.key, 'Customer Name', e.target.value)}
                                                                />
                                                            ) : (
                                                                <div className="font-bold flex items-center gap-2">
                                                                    {name}
                                                                    <button onClick={() => setEditImportKey(r.key)} className="text-[10px] text-slate-400 hover:text-slate-600 hover:underline">edit</button>
                                                                </div>
                                                            )}
                                                            {!name && <span className="text-[10px] font-bold text-red-500">Missing name</span>}
                                                        </td>
                                                        <td className="px-3 py-2 text-slate-500">
                                                            {isEditing ? (
                                                                <input
                                                                    className="w-full rounded border border-[#14B8A6] px-1 py-0.5 text-xs outline-none"
                                                                    value={email}
                                                                    onChange={(e) => setEditValue(r.key, 'Email Address', e.target.value)}
                                                                />
                                                            ) : email}
                                                        </td>
                                                        <td className="px-3 py-2 text-slate-500">
                                                            {isEditing ? (
                                                                <input
                                                                    className="w-full rounded border border-[#14B8A6] px-1 py-0.5 text-xs outline-none"
                                                                    value={phone}
                                                                    onChange={(e) => setEditValue(r.key, 'Mobile Number', e.target.value)}
                                                                />
                                                            ) : phone}
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            {sites.length > 0 ? (
                                                                <span className="inline-flex items-center rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                                                                    {sites.length} sites
                                                                </span>
                                                            ) : <span className="text-slate-400">None found</span>}
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            {r.missing.length > 0 ? (
                                                                <span className="text-[10px] font-bold text-red-500 uppercase">{r.missing.join(', ')}</span>
                                                            ) : (
                                                                <span className="text-[10px] font-bold text-emerald-600 uppercase">Valid</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
                            {importError && <span className="text-sm font-bold text-rose-600 mr-auto">{importError}</span>}
                            <button
                                onClick={() => setImportOpen(false)}
                                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={runImport}
                                disabled={importing || !customerCsvObjects || !siteCsvObjects}
                                className="rounded-lg bg-[#14B8A6] px-6 py-2 text-sm font-bold text-white shadow-sm transition hover:brightness-110 disabled:opacity-50"
                            >
                                {importing ? 'Importing…' : 'Run Import Now'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
