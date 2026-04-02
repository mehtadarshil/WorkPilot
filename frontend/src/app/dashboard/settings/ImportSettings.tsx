'use client';

import { Upload, FileText, Quote, Users, Info, Database } from 'lucide-react';
import CustomerImportTool from './CustomerImportTool';
import InvoiceImportTool from './InvoiceImportTool';
import QuotationImportTool from './QuotationImportTool';

// Generic Import Section Wrapper
function ImportSection({ 
    title, 
    description, 
    icon: Icon, 
    children 
}: { 
    title: string; 
    description: string; 
    icon: any; 
    children: React.ReactNode 
}) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-start gap-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[#14B8A6]">
                    <Icon className="size-6" />
                </div>
                <div>
                    <h3 className="text-lg font-bold text-slate-900">{title}</h3>
                    <p className="text-sm text-slate-500">{description}</p>
                </div>
            </div>
            {children}
        </div>
    );
}

export default function ImportSettings() {
    const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

    if (!token) return null;

    return (
        <div className="mt-8 space-y-8 pb-12">
            <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
                    <Database className="size-6 text-[#14B8A6]" />
                    Data Import
                </h2>
                <p className="text-slate-500">Bulk import your data from CSV files and keep your records updated.</p>
            </div>

            <div className="grid grid-cols-1 gap-6">
                {/* Customers & Sites */}
                <ImportSection 
                    title="Customers & Sites" 
                    description="Import your client database and their corresponding work addresses (sites). Requires both customer_export.csv and site_export.csv."
                    icon={Users}
                >
                    <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 mb-4">
                        <div className="flex gap-3 text-blue-700">
                            <Info className="size-5 shrink-0" />
                            <p className="text-xs leading-relaxed">
                                This import handles complex relationships between customers and their sites. 
                                Ensure common names match between files to link sites to customers.
                            </p>
                        </div>
                    </div>
                    <CustomerImportTool token={token} onComplete={() => {}} />
                </ImportSection>

                {/* Invoices */}
                <ImportSection 
                    title="Invoices" 
                    description="Import historical invoice records. Records will be matched to existing customers by their full name."
                    icon={FileText}
                >
                    <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 mb-4">
                        <div className="flex gap-3 text-slate-600 font-medium">
                            <Info className="size-5 shrink-0 text-[#14B8A6]" />
                            <p className="text-xs leading-relaxed">
                                Header requirement: <span className="font-bold">Invoice Number</span> must be unique. 
                                Line items can be multiple rows with the same invoice number.
                            </p>
                        </div>
                    </div>
                    <InvoiceImportTool token={token} onComplete={() => {}} />
                </ImportSection>

                {/* Quotations */}
                <ImportSection 
                    title="Quotations" 
                    description="Import historical quotation/estimate records with their detailed line items."
                    icon={Quote}
                >
                    <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 mb-4">
                        <div className="flex gap-3 text-slate-600 font-medium">
                            <Info className="size-5 shrink-0 text-[#14B8A6]" />
                            <p className="text-xs leading-relaxed">
                                Header requirement: <span className="font-bold">Quote No</span> is used to group line items.
                            </p>
                        </div>
                    </div>
                    <QuotationImportTool token={token} onComplete={() => {}} />
                </ImportSection>
            </div>
        </div>
    );
}
