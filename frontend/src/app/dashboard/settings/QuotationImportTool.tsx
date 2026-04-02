'use client';

import { useCallback, useEffect, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { getJson, postJson } from '../../apiClient';
import { groupBy, parseCsv, toObjects } from '../csvUtils';
import ImportCustomerSelect from '../ImportCustomerSelect';

interface Customer {
    id: number;
    full_name: string;
    email: string;
}

interface QuotationImportRow {
    csvQuoteNumber: string;
    customerName: string;
    customerId: number | null;
    quotationDate: string;
    validUntil: string;
    notes: string;
    taxPercentage: number;
    currency: string;
    lineItems: { description: string; quantity: number; unit_price: number }[];
    missing: string[];
}

export default function QuotationImportTool({ token, onComplete }: { token: string; onComplete: () => void }) {
    const [importModalOpen, setImportModalOpen] = useState(false);
    const [importRows, setImportRows] = useState<QuotationImportRow[]>([]);
    const [importError, setImportError] = useState<string | null>(null);
    const [importing, setImporting] = useState(false);
    const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
    const [customers, setCustomers] = useState<Customer[]>([]);

    const fetchCustomers = useCallback(async () => {
        if (!token) return;
        try {
            const data = await getJson<{ customers: Customer[] }>('/customers?limit=5000&page=1', token);
            setCustomers(data.customers ?? []);
        } catch {
            setCustomers([]);
        }
    }, [token]);

    const openImport = async () => {
        await fetchCustomers();
        setImportRows([]);
        setImportError(null);
        setImportProgress(null);
        setImportModalOpen(true);
    };

    const handleQuotationCsvFile = async (file: File) => {
        const text = await file.text();
        const objects = toObjects(parseCsv(text));
        const grouped = groupBy(objects, (o) => o['Quote No'] || '');
        const rows: QuotationImportRow[] = Object.keys(grouped).filter(Boolean).map((quoteNo) => {
            const g = grouped[quoteNo];
            const first = g[0];
            const customerName = first['Customer Name'] || '';
            const customer = customers.find((c) => c.full_name.trim().toLowerCase() === customerName.trim().toLowerCase());
            const taxRaw = first['Line Tax Rate Percentage'] || first['Tax'] || '0';
            const taxPercentage = parseFloat(String(taxRaw).replace(/[^\d.-]/g, '')) || 0;
            const lineItems = g.map((r) => ({
                description: r['Line Description'] || r['Description'] || `Imported item ${r['Line Number'] || ''}`.trim(),
                quantity: parseFloat(r['Line Quantity'] || '1') || 1,
                unit_price: parseFloat((r['Line Unit Price'] || r['Line Amount'] || '0').replace(/,/g, '')) || 0,
            }));
            const row: QuotationImportRow = {
                csvQuoteNumber: quoteNo,
                customerName,
                customerId: customer?.id ?? null,
                quotationDate: first['Quote Date'] || new Date().toISOString().slice(0, 10),
                validUntil: first['Expiry Date'] || new Date().toISOString().slice(0, 10),
                notes: first['Reference'] || first['Description'] || '',
                taxPercentage,
                currency: 'GBP',
                lineItems,
                missing: [],
            };
            const missing: string[] = [];
            if (!row.customerId) missing.push('Customer mapping');
            if (!row.quotationDate) missing.push('Quote date');
            if (!row.validUntil) missing.push('Expiry date');
            if (!row.lineItems.length || row.lineItems.every((li) => !li.description.trim())) missing.push('Line items');
            row.missing = missing;
            return row;
        });
        setImportRows(rows);
    };

    const updateImportRow = (idx: number, patch: Partial<QuotationImportRow>) => {
        setImportRows((prev) => prev.map((r, i) => {
            if (i !== idx) return r;
            const next = { ...r, ...patch };
            const missing: string[] = [];
            if (!next.customerId) missing.push('Customer mapping');
            if (!next.quotationDate) missing.push('Quote date');
            if (!next.validUntil) missing.push('Expiry date');
            if (!next.lineItems.length || next.lineItems.every((li) => !li.description.trim())) missing.push('Line items');
            next.missing = missing;
            return next;
        }));
    };

    const runQuotationImport = async () => {
        if (!token) return;
        const validRows = importRows.filter((r) => r.missing.length === 0);
        if (validRows.length === 0) {
            setImportError('No valid rows to import. Please fix missing fields first.');
            return;
        }
        setImporting(true);
        setImportError(null);
        const total = validRows.length;
        setImportProgress({ done: 0, total });
        try {
            let done = 0;
            for (const row of validRows) {
                await postJson('/quotations', {
                    customer_id: row.customerId,
                    quotation_date: row.quotationDate,
                    valid_until: row.validUntil,
                    currency: row.currency,
                    notes: row.notes || undefined,
                    line_items: row.lineItems,
                    tax_percentage: row.taxPercentage,
                }, token);
                done += 1;
                setImportProgress({ done, total });
            }
            setImportModalOpen(false);
            setImportRows([]);
            onComplete();
        } catch (err) {
            setImportError(err instanceof Error ? err.message : 'Import failed');
        } finally {
            setImporting(false);
            setImportProgress(null);
        }
    };

    return (
        <>
            <button
                type="button"
                onClick={openImport}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#14B8A6] px-5 py-2.5 font-bold text-white shadow-sm transition hover:brightness-110"
            >
                <Upload className="size-5" />
                Import Quotations
            </button>

            {importModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => !importing && setImportModalOpen(false)}>
                    <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-4">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">Import Quotations from CSV</h3>
                                <p className="text-xs text-slate-500">Bulk import historical quotations and their line items.</p>
                            </div>
                            <button onClick={() => setImportModalOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                                <X className="size-5" />
                            </button>
                        </div>

                        <input 
                            type="file" 
                            accept=".csv,text/csv" 
                            className="mt-4 block w-full text-sm text-slate-500 file:mr-4 file:rounded file:border-0 file:bg-[#14B8A6] file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-[#13a89a]" 
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleQuotationCsvFile(f); }} 
                        />

                        {importRows.length > 0 && (
                            <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                                        <tr>
                                            <th className="px-3 py-2">Quote</th>
                                            <th className="px-3 py-2">Customer</th>
                                            <th className="px-3 py-2">Dates</th>
                                            <th className="px-3 py-2">Items</th>
                                            <th className="px-3 py-2">Missing</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {importRows.map((r, idx) => (
                                            <tr key={`${r.csvQuoteNumber}-${idx}`}>
                                                <td className="px-3 py-2 font-medium">{r.csvQuoteNumber}</td>
                                                <td className="px-3 py-2">
                                                    <ImportCustomerSelect
                                                        customers={customers}
                                                        value={r.customerId}
                                                        onChange={(id) => updateImportRow(idx, { customerId: id })}
                                                    />
                                                </td>
                                                <td className="px-3 py-2">
                                                    <div className="flex gap-2 text-xs">
                                                        <input type="date" value={r.quotationDate} onChange={(e) => updateImportRow(idx, { quotationDate: e.target.value })} className="rounded border border-slate-200 px-1 py-0.5" />
                                                        <input type="date" value={r.validUntil} onChange={(e) => updateImportRow(idx, { validUntil: e.target.value })} className="rounded border border-slate-200 px-1 py-0.5" />
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2">{r.lineItems.length}</td>
                                                <td className="px-3 py-2 text-xs">
                                                    {r.missing.length === 0 ? <span className="text-emerald-600 font-bold">READY</span> : <span className="text-rose-600 font-bold">{r.missing.join(', ')}</span>}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {importError && <p className="mt-3 text-sm text-rose-600 font-bold">{importError}</p>}
                        
                        {importing && importProgress && (
                            <div className="mt-4 space-y-1.5">
                                <div className="flex justify-between text-xs font-semibold text-slate-700">
                                    <span>Importing quotations</span>
                                    <span>{importProgress.done} / {importProgress.total}</span>
                                </div>
                                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                                    <div
                                        className="h-full rounded-full bg-[#14B8A6] transition-[width] duration-300"
                                        style={{ width: `${(importProgress.done / importProgress.total) * 100}%` }}
                                    />
                                </div>
                            </div>
                        )}

                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setImportModalOpen(false)}
                                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                            >
                                Close
                            </button>
                            <button
                                onClick={runQuotationImport}
                                disabled={importing || importRows.length === 0}
                                className="rounded-lg bg-[#14B8A6] px-6 py-2 text-sm font-bold text-white shadow-sm hover:bg-[#13a89a] disabled:opacity-50"
                            >
                                {importing ? 'Importing…' : 'Start Import'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
