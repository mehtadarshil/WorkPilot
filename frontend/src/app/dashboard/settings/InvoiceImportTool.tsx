'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, X, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getJson, postJson } from '../../apiClient';
import { groupBy, normalizeCsvDateToIso, parseCsv, toObjects } from '../csvUtils';
import ImportCustomerSelect from '../ImportCustomerSelect';

interface Customer {
    id: number;
    full_name: string;
    email: string;
}

interface InvoiceImportRow {
    csvInvoiceNumber: string;
    customerName: string;
    customerId: number | null;
    invoiceDate: string;
    dueDate: string;
    notes: string;
    taxPercentage: number;
    currency: string;
    enteredOn: string;
    lineItems: { description: string; quantity: number; unit_price: number }[];
    missing: string[];
}

export default function InvoiceImportTool({ token, onComplete }: { token: string; onComplete: () => void }) {
    const [importModalOpen, setImportModalOpen] = useState(false);
    const [importRows, setImportRows] = useState<InvoiceImportRow[]>([]);
    const [importError, setImportError] = useState<string | null>(null);
    const [importing, setImporting] = useState(false);
    const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const importCsvInputRef = useRef<HTMLInputElement>(null);
    const [importCsvFileName, setImportCsvFileName] = useState<string | null>(null);

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
        setImportCsvFileName(null);
        setImportProgress(null);
        setImportModalOpen(true);
    };

    const handleInvoiceCsvFile = async (file: File) => {
        const text = await file.text();
        const objects = toObjects(parseCsv(text));
        const grouped = groupBy(objects, (o) => o['Invoice Number'] || '');
        const rows: InvoiceImportRow[] = Object.keys(grouped).filter(Boolean).map((invoiceNo) => {
            const g = grouped[invoiceNo];
            const first = g[0];
            const customerName = first['Customer'] || '';
            const customer = customers.find((c) => c.full_name.trim().toLowerCase() === customerName.trim().toLowerCase());
            const taxRaw = first['Line Tax Rate Percentage'] || first['Tax'] || '0';
            const taxPercentage = parseFloat(String(taxRaw).replace(/[^\d.-]/g, '')) || 0;
            const lineItems = g.map((r) => ({
                description: r['Line Description'] || r['Description'] || `Imported item ${r['Line Number'] || ''}`.trim(),
                quantity: parseFloat(r['Line Quantity'] || '1') || 1,
                unit_price: parseFloat((r['Line Unit Price'] || r['Line Amount'] || '0').replace(/,/g, '')) || 0,
            }));
            const invoiceDateRaw =
                first['Invoice Date'] || first['Invoice date'] || first['invoice_date'] || first['Date'] || '';
            const dueDateRaw = first['Due Date'] || first['Due date'] || first['due_date'] || first['Payment due'] || '';
            const invoiceDateParsed = normalizeCsvDateToIso(invoiceDateRaw);
            const dueDateParsed = normalizeCsvDateToIso(dueDateRaw);
            const row: InvoiceImportRow = {
                csvInvoiceNumber: invoiceNo,
                customerName,
                customerId: customer?.id ?? null,
                invoiceDate: invoiceDateParsed ?? new Date().toISOString().slice(0, 10),
                dueDate: dueDateParsed ?? new Date().toISOString().slice(0, 10),
                notes: first['Reference'] || '',
                taxPercentage,
                currency: 'GBP',
                enteredOn: first['Entered On'] || '',
                lineItems,
                missing: [],
            };
            const missing: string[] = [];
            if (!row.customerId) missing.push('Customer mapping');
            if (invoiceDateRaw && !invoiceDateParsed) missing.push('Invoice date (unrecognised format)');
            if (dueDateRaw && !dueDateParsed) missing.push('Due date (unrecognised format)');
            if (!row.invoiceDate) missing.push('Invoice date');
            if (!row.dueDate) missing.push('Due date');
            if (!row.lineItems.length || row.lineItems.every((li) => !li.description.trim())) missing.push('Line items');
            row.missing = missing;
            return row;
        });
        setImportRows(rows);
    };

    const updateImportRow = (idx: number, patch: Partial<InvoiceImportRow>) => {
        setImportRows((prev) => prev.map((r, i) => {
            if (i !== idx) return r;
            const next = { ...r, ...patch };
            const missing: string[] = [];
            if (!next.customerId) missing.push('Customer mapping');
            if (!next.invoiceDate) missing.push('Invoice date');
            if (!next.dueDate) missing.push('Due date');
            if (!next.lineItems.length || next.lineItems.every((li) => !li.description.trim())) missing.push('Line items');
            next.missing = missing;
            return next;
        }));
    };

    const runInvoiceImport = async () => {
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
                const invIso = normalizeCsvDateToIso(row.invoiceDate) ?? row.invoiceDate;
                const dueIso = normalizeCsvDateToIso(row.dueDate) ?? row.dueDate;
                const csvInvNo = row.csvInvoiceNumber.trim();
                const created = await postJson<{ invoice?: { id: number } }>('/invoices', {
                    customer_id: row.customerId,
                    invoice_date: invIso,
                    due_date: dueIso,
                    currency: row.currency,
                    notes: row.notes || undefined,
                    line_items: row.lineItems,
                    tax_percentage: row.taxPercentage,
                    ...(csvInvNo ? { invoice_number: csvInvNo } : {}),
                }, token);
                if (row.enteredOn.trim()) {
                    const parsedEntered = new Date(row.enteredOn);
                    const labelDate = Number.isNaN(parsedEntered.getTime()) ? row.enteredOn : parsedEntered.toLocaleString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                    });
                    if (created.invoice?.id) {
                        await postJson(`/invoices/${created.invoice.id}/communications`, { type: 'note', text: `Imported on ${labelDate}` }, token);
                    }
                }
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
                Import Invoices
            </button>

            {importModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => !importing && setImportModalOpen(false)}>
                    <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-4">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">Import Invoices from CSV</h3>
                                <p className="text-xs text-slate-500">Bulk import historical invoices and their line items.</p>
                            </div>
                            <button onClick={() => setImportModalOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                                <X className="size-5" />
                            </button>
                        </div>
                        
                        <div className="mt-4">
                            <input
                                ref={importCsvInputRef}
                                type="file"
                                accept=".csv,text/csv"
                                className="sr-only"
                                onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) {
                                        setImportCsvFileName(f.name);
                                        handleInvoiceCsvFile(f);
                                    }
                                    e.target.value = '';
                                }}
                            />
                            <button
                                type="button"
                                onClick={() => importCsvInputRef.current?.click()}
                                className="inline-flex w-full max-w-md items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#14B8A6] bg-emerald-50 px-5 py-3.5 text-sm font-semibold text-[#0d9488] shadow-sm transition hover:bg-emerald-100/80 hover:shadow focus:outline-none focus:ring-2 focus:ring-[#14B8A6]/40"
                            >
                                <Upload className="size-5 shrink-0" aria-hidden />
                                Choose CSV file
                            </button>
                            {importCsvFileName && (
                                <p className="mt-2 text-sm text-slate-700 font-medium">Selected: {importCsvFileName}</p>
                            )}
                        </div>

                        {importRows.length > 0 && (
                            <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            <th className="px-3 py-2">Invoice</th>
                                            <th className="px-3 py-2">Customer</th>
                                            <th className="px-3 py-2">Dates</th>
                                            <th className="px-3 py-2">Items</th>
                                            <th className="px-3 py-2">Missing</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {importRows.map((r, idx) => (
                                            <tr key={`${r.csvInvoiceNumber}-${idx}`}>
                                                <td className="px-3 py-2 font-medium">{r.csvInvoiceNumber}</td>
                                                <td className="px-3 py-2">
                                                    <ImportCustomerSelect
                                                        customers={customers}
                                                        value={r.customerId}
                                                        onChange={(id) => updateImportRow(idx, { customerId: id })}
                                                    />
                                                </td>
                                                <td className="px-3 py-2">
                                                    <div className="flex gap-2 text-xs">
                                                        <input type="date" value={r.invoiceDate} onChange={(e) => updateImportRow(idx, { invoiceDate: e.target.value })} className="rounded border border-slate-200 px-1 py-0.5" />
                                                        <input type="date" value={r.dueDate} onChange={(e) => updateImportRow(idx, { dueDate: e.target.value })} className="rounded border border-slate-200 px-1 py-0.5" />
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
                                    <span>Importing invoices</span>
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
                                onClick={runInvoiceImport}
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
