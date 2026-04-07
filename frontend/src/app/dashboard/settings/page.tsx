'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileText, Save, Quote, Building2, Users, Palette, ImageIcon, Mail } from 'lucide-react';
import { motion } from 'framer-motion';
import { getJson, patchJson } from '../../apiClient';
import CustomerTypesSettings from './CustomerTypesSettings';
import PriceBooksSettings from './PriceBooksSettings';
import JobDescriptionsSettings from './JobDescriptionsSettings';
import BusinessUnitsSettings from './BusinessUnitsSettings';
import UserGroupsSettings from './UserGroupsSettings';
import UsersSettings from './UsersSettings';
import EmailSettings from './EmailSettings';
import ImportSettings from './ImportSettings';
import { BookOpen, Wrench, Briefcase, Users2, Database, UserCog } from 'lucide-react';

interface InvoiceSettings {
  default_currency: string;
  invoice_prefix: string;
  terms_and_conditions: string | null;
  default_due_days: number;
  company_name: string;
  company_address: string | null;
  company_phone: string | null;
  company_email: string | null;
  company_logo: string | null;
  company_website: string | null;
  company_tax_id: string | null;
  tax_label: string;
  default_tax_percentage: number;
  footer_text: string | null;
  invoice_accent_color?: string;
  invoice_accent_end_color?: string;
  payment_terms?: string | null;
  bank_details?: string | null;
}

interface QuotationSettings {
  default_currency: string;
  quotation_prefix: string;
  terms_and_conditions: string | null;
  default_valid_days: number;
  company_name: string;
  company_address: string | null;
  company_phone: string | null;
  company_email: string | null;
  company_logo: string | null;
  company_website: string | null;
  company_tax_id: string | null;
  tax_label: string;
  default_tax_percentage: number;
  footer_text: string | null;
  quotation_accent_color?: string;
  quotation_accent_end_color?: string;
  payment_terms?: string | null;
  bank_details?: string | null;
}

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR', 'JPY'];

const THEME_PRESETS = [
  { name: 'WorkPilot teal', accent: '#14B8A6', end: '#0d9488' },
  { name: 'Ocean blue', accent: '#2563eb', end: '#1d4ed8' },
  { name: 'Indigo', accent: '#6366f1', end: '#4f46e5' },
  { name: 'Emerald', accent: '#059669', end: '#047857' },
  { name: 'Rose', accent: '#e11d48', end: '#be123c' },
  { name: 'Slate', accent: '#475569', end: '#334155' },
] as const;

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<
    'company' | 'invoice' | 'quotation' | 'email' | 'customer-types' | 'price-books' | 'job-descriptions' | 'business-units' | 'user-groups' | 'users' | 'import'
  >('company');
  const [invoiceSettings, setInvoiceSettings] = useState<InvoiceSettings | null>(null);
  const [quotationSettings, setQuotationSettings] = useState<QuotationSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState('WorkPilot');
  const [companyAddress, setCompanyAddress] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [companyLogo, setCompanyLogo] = useState('');
  const [companyWebsite, setCompanyWebsite] = useState('');
  const [companyTaxId, setCompanyTaxId] = useState('');
  const [companyTaxLabel, setCompanyTaxLabel] = useState('Tax');

  const [formCurrency, setFormCurrency] = useState('USD');
  const [formPrefix, setFormPrefix] = useState('INV');
  const [formTerms, setFormTerms] = useState('');
  const [formDueDays, setFormDueDays] = useState(30);
  const [formDefaultTaxPercentage, setFormDefaultTaxPercentage] = useState(0);
  const [formFooter, setFormFooter] = useState('');
  const [formInvoiceAccent, setFormInvoiceAccent] = useState('#14B8A6');
  const [formInvoiceAccentEnd, setFormInvoiceAccentEnd] = useState('#0d9488');
  const [formPaymentTerms, setFormPaymentTerms] = useState('');
  const [formBankDetails, setFormBankDetails] = useState('');

  const [qFormCurrency, setQFormCurrency] = useState('USD');
  const [qFormPrefix, setQFormPrefix] = useState('QUOT');
  const [qFormTerms, setQFormTerms] = useState('');
  const [qFormValidDays, setQFormValidDays] = useState(30);
  const [qFormDefaultTaxPercentage, setQFormDefaultTaxPercentage] = useState(0);
  const [qFormFooter, setQFormFooter] = useState('');
  const [qFormQuotationAccent, setQFormQuotationAccent] = useState('#14B8A6');
  const [qFormQuotationAccentEnd, setQFormQuotationAccentEnd] = useState('#0d9488');
  const [qFormPaymentTerms, setQFormPaymentTerms] = useState('');
  const [qFormBankDetails, setQFormBankDetails] = useState('');

  // Sub-tabs for Company, Invoice, Quotation
  const [companySubTab, setCompanySubTab] = useState<'details' | 'preview'>('details');
  const [invoiceSubTab, setInvoiceSubTab] = useState<'details' | 'preview'>('details');
  const [quotationSubTab, setQuotationSubTab] = useState<'details' | 'preview'>('details');

  const DUMMY_INVOICE = {
    invoice_number: `${formPrefix}-000001`,
    invoice_date: new Date().toISOString(),
    due_date: new Date(Date.now() + formDueDays * 24 * 60 * 60 * 1000).toISOString(),
    customer_full_name: 'John Doe',
    customer_email: 'john@example.com',
    customer_address: '123 Business St, London, UK',
    currency: formCurrency,
    subtotal: 1000,
    tax_amount: 1000 * (formDefaultTaxPercentage / 100),
    total_amount: 1000 * (1 + formDefaultTaxPercentage / 100),
    total_paid: 0,
    line_items: [
      { id: 1, description: 'Professional Services', quantity: 10, unit_price: 100, amount: 1000 }
    ],
    notes: 'Sample note for live preview.'
  };

  const DUMMY_QUOTATION = {
    quotation_number: `${qFormPrefix}-000001`,
    quotation_date: new Date().toISOString(),
    valid_until: new Date(Date.now() + qFormValidDays * 24 * 60 * 60 * 1000).toISOString(),
    customer_full_name: 'Jane Smith',
    customer_email: 'jane@example.com',
    customer_address: '456 Client Ave, Manchester, UK',
    currency: qFormCurrency,
    subtotal: 1000,
    tax_amount: 1000 * (qFormDefaultTaxPercentage / 100),
    total_amount: 1000 * (1 + qFormDefaultTaxPercentage / 100),
    line_items: [
      { id: 1, description: 'Initial Consultation & Design', quantity: 1, unit_price: 1000, amount: 1000 }
    ],
    notes: 'Sample note for live preview.'
  };

  function formatDate(iso: string | null): string {
    if (!iso) return '-';
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function formatCurrency(amount: number, currency: string): string {
    try {
      return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount);
    } catch {
      return `${currency}${amount.toFixed(2)}`;
    }
  }

  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  const fetchInvoiceSettings = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getJson<{ settings: InvoiceSettings }>('/settings/invoice', token);
      const s = data.settings;
      setInvoiceSettings(s);
      setFormCurrency(s.default_currency);
      setFormPrefix(s.invoice_prefix);
      setFormTerms(s.terms_and_conditions ?? '');
      setFormDueDays(s.default_due_days);
      setCompanyName(s.company_name ?? 'WorkPilot');
      setCompanyAddress(s.company_address ?? '');
      setCompanyPhone(s.company_phone ?? '');
      setCompanyEmail(s.company_email ?? '');
      setCompanyLogo(s.company_logo ?? '');
      setCompanyWebsite(s.company_website ?? '');
      setCompanyTaxId(s.company_tax_id ?? '');
      setCompanyTaxLabel(s.tax_label ?? 'Tax');
      setFormDefaultTaxPercentage(s.default_tax_percentage ?? 0);
      setFormFooter(s.footer_text ?? '');
      setFormInvoiceAccent(s.invoice_accent_color ?? '#14B8A6');
      setFormInvoiceAccentEnd(s.invoice_accent_end_color ?? '#0d9488');
      setFormPaymentTerms(s.payment_terms ?? '');
      setFormBankDetails(s.bank_details ?? '');
    } catch {
      setInvoiceSettings(null);
    }
  }, [token]);

  const fetchQuotationSettings = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getJson<{ settings: QuotationSettings }>('/settings/quotation', token);
      const s = data.settings;
      setQuotationSettings(s);
      setQFormCurrency(s.default_currency);
      setQFormPrefix(s.quotation_prefix);
      setQFormTerms(s.terms_and_conditions ?? '');
      setQFormValidDays(s.default_valid_days);
      setCompanyName(s.company_name ?? 'WorkPilot');
      setCompanyAddress(s.company_address ?? '');
      setCompanyPhone(s.company_phone ?? '');
      setCompanyEmail(s.company_email ?? '');
      setCompanyLogo(s.company_logo ?? '');
      setCompanyWebsite(s.company_website ?? '');
      setCompanyTaxId(s.company_tax_id ?? '');
      setCompanyTaxLabel(s.tax_label ?? 'Tax');
      setQFormDefaultTaxPercentage(s.default_tax_percentage ?? 0);
      setQFormFooter(s.footer_text ?? '');
      setQFormQuotationAccent(s.quotation_accent_color ?? '#14B8A6');
      setQFormQuotationAccentEnd(s.quotation_accent_end_color ?? '#0d9488');
      setQFormPaymentTerms(s.payment_terms ?? '');
      setQFormBankDetails(s.bank_details ?? '');
    } catch {
      setQuotationSettings(null);
    }
  }, [token]);

  useEffect(() => {
    fetchInvoiceSettings();
    fetchQuotationSettings();
  }, [fetchInvoiceSettings, fetchQuotationSettings]);

  useEffect(() => {
    if (activeTab === 'quotation') fetchQuotationSettings();
    if (activeTab === 'company' || activeTab === 'invoice') fetchInvoiceSettings();
  }, [activeTab, fetchQuotationSettings, fetchInvoiceSettings]);

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    if (!token) return;
    try {
      const companyPayload = {
        company_name: companyName.trim() || 'WorkPilot',
        company_address: companyAddress.trim() || null,
        company_phone: companyPhone.trim() || null,
        company_email: companyEmail.trim() || null,
        company_logo: companyLogo.trim() || null,
        company_website: companyWebsite.trim() || null,
        company_tax_id: companyTaxId.trim() || null,
        tax_label: companyTaxLabel.trim() || 'Tax',
      };
      await patchJson<{ settings: InvoiceSettings }>('/settings/invoice', companyPayload, token);
      await patchJson<{ settings: QuotationSettings }>('/settings/quotation', companyPayload, token);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      fetchInvoiceSettings();
      fetchQuotationSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    if (!token) return;
    try {
      await patchJson<{ settings: InvoiceSettings }>('/settings/invoice', {
        default_currency: formCurrency,
        invoice_prefix: formPrefix.trim() || 'INV',
        terms_and_conditions: formTerms.trim() || null,
        default_due_days: formDueDays,
        company_name: companyName.trim() || 'WorkPilot',
        company_address: companyAddress.trim() || null,
        company_phone: companyPhone.trim() || null,
        company_email: companyEmail.trim() || null,
        company_logo: companyLogo.trim() || null,
        company_website: companyWebsite.trim() || null,
        company_tax_id: companyTaxId.trim() || null,
        tax_label: companyTaxLabel.trim() || 'Tax',
        default_tax_percentage: formDefaultTaxPercentage,
        footer_text: formFooter.trim() || null,
        payment_terms: formPaymentTerms.trim() || null,
        bank_details: formBankDetails.trim() || null,
        invoice_accent_color: formInvoiceAccent.trim() || '#14B8A6',
        invoice_accent_end_color: formInvoiceAccentEnd.trim() || '#0d9488',
      }, token);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      fetchInvoiceSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveQuotation = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    if (!token) return;
    try {
      await patchJson<{ settings: QuotationSettings }>('/settings/quotation', {
        default_currency: qFormCurrency,
        quotation_prefix: qFormPrefix.trim() || 'QUOT',
        terms_and_conditions: qFormTerms.trim() || null,
        default_valid_days: qFormValidDays,
        company_name: companyName.trim() || 'WorkPilot',
        company_address: companyAddress.trim() || null,
        company_phone: companyPhone.trim() || null,
        company_email: companyEmail.trim() || null,
        company_logo: companyLogo.trim() || null,
        company_website: companyWebsite.trim() || null,
        company_tax_id: companyTaxId.trim() || null,
        tax_label: companyTaxLabel.trim() || 'Tax',
        default_tax_percentage: qFormDefaultTaxPercentage,
        footer_text: qFormFooter.trim() || null,
        payment_terms: qFormPaymentTerms.trim() || null,
        bank_details: qFormBankDetails.trim() || null,
        quotation_accent_color: qFormQuotationAccent.trim() || '#14B8A6',
        quotation_accent_end_color: qFormQuotationAccentEnd.trim() || '#0d9488',
      }, token);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      fetchQuotationSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30';

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-black tracking-tight text-slate-900">Settings</h1>
        <p className="mt-1 text-slate-500">Configure your application preferences.</p>

        <div className="mt-8 flex flex-col md:flex-row gap-8">
          {/* Sidebar */}
          <div className="flex flex-col gap-1 w-full md:w-64 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('company')}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${activeTab === 'company' ? 'bg-[#14B8A6]/10 text-[#14B8A6]' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
            >
              <Building2 className="size-4" />
              Company
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('invoice')}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${activeTab === 'invoice' ? 'bg-[#14B8A6]/10 text-[#14B8A6]' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
            >
              <FileText className="size-4" />
              Invoice Settings
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('quotation')}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${activeTab === 'quotation' ? 'bg-[#14B8A6]/10 text-[#14B8A6]' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
            >
              <Quote className="size-4" />
              Quotation Settings
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('email')}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${activeTab === 'email' ? 'bg-[#14B8A6]/10 text-[#14B8A6]' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
            >
              <Mail className="size-4" />
              Email
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('customer-types')}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${activeTab === 'customer-types' ? 'bg-[#14B8A6]/10 text-[#14B8A6]' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
            >
              <Users className="size-4" />
              Customer Types
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('price-books')}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${activeTab === 'price-books' ? 'bg-[#14B8A6]/10 text-[#14B8A6]' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
            >
              <BookOpen className="size-4" />
              Price Books
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('job-descriptions')}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${activeTab === 'job-descriptions' ? 'bg-[#14B8A6]/10 text-[#14B8A6]' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
            >
              <Wrench className="size-4" />
              Job Descriptions
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('business-units')}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${activeTab === 'business-units' ? 'bg-[#14B8A6]/10 text-[#14B8A6]' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
            >
              <Briefcase className="size-4" />
              Business Units
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('user-groups')}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${activeTab === 'user-groups' ? 'bg-[#14B8A6]/10 text-[#14B8A6]' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
            >
              <Users2 className="size-4" />
              User Groups
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('users')}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${activeTab === 'users' ? 'bg-[#14B8A6]/10 text-[#14B8A6]' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
            >
              <UserCog className="size-4" />
              Users
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('import')}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${activeTab === 'import' ? 'bg-[#14B8A6]/10 text-[#14B8A6]' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
            >
              <Database className="size-4" />
              Import CSV
            </button>
          </div>

          {/* Content Area */}
          <div className="flex-1 min-w-0">

        {activeTab === 'company' && (
          <div className="mt-0">
            <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1 w-fit">
              <button
                type="button"
                onClick={() => setCompanySubTab('details')}
                className={`rounded-md px-4 py-1.5 text-xs font-bold transition ${companySubTab === 'details' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Settings Details
              </button>
              <button
                type="button"
                onClick={() => setCompanySubTab('preview')}
                className={`rounded-md px-4 py-1.5 text-xs font-bold transition ${companySubTab === 'preview' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Live Preview
              </button>
            </div>

            {companySubTab === 'details' ? (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
              >
                <h2 className="mb-6 text-lg font-bold text-slate-900">Company Customization</h2>
                <p className="mb-6 text-sm text-slate-500">Configure your company details shown on invoices and quotations.</p>
                <form onSubmit={handleSaveCompany} className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700">Company logo</label>
                  <div className="mt-1 flex flex-wrap items-center gap-3">
                    <input type="text" value={companyLogo} onChange={(e) => setCompanyLogo(e.target.value)} placeholder="URL or paste base64 data URL" className={inputClass} />
                    <label className="cursor-pointer rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                      Upload image
                      <input type="file" accept="image/*" className="sr-only" onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          const r = new FileReader();
                          r.onload = () => { const s = r.result; if (typeof s === 'string') setCompanyLogo(s); };
                          r.readAsDataURL(f);
                        }
                      }} />
                    </label>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Enter a logo URL or upload an image (PNG, JPG). Shown on invoices and quotations.</p>
                  {companyLogo && (
                    <div className="mt-2 flex h-12 w-12 overflow-hidden rounded-lg border border-slate-200">
                      <img src={companyLogo} alt="Logo preview" className="h-full w-full object-contain" />
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Company name</label>
                  <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="WorkPilot" className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Company website</label>
                  <input type="url" value={companyWebsite} onChange={(e) => setCompanyWebsite(e.target.value)} placeholder="https://example.com" className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Tax ID / VAT number</label>
                  <input type="text" value={companyTaxId} onChange={(e) => setCompanyTaxId(e.target.value)} placeholder="VAT123456789" className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Tax label</label>
                  <input type="text" value={companyTaxLabel} onChange={(e) => setCompanyTaxLabel(e.target.value)} placeholder="Tax" className={inputClass} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700">Company address</label>
                  <textarea rows={2} value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} placeholder="Street, City, Country" className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Company phone</label>
                  <input type="text" value={companyPhone} onChange={(e) => setCompanyPhone(e.target.value)} placeholder="+1 234 567 8900" className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Company email</label>
                  <input type="email" value={companyEmail} onChange={(e) => setCompanyEmail(e.target.value)} placeholder="billing@company.com" className={inputClass} />
                </div>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex items-center gap-3">
                <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-[#14B8A6] px-5 py-2.5 font-semibold text-white shadow-sm hover:bg-[#13a89a] disabled:opacity-50">
                  <Save className="size-4" />
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
                {saved && <span className="text-sm font-medium text-emerald-600">Saved!</span>}
              </div>
            </form>
          </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden p-8"
              >
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-[#14B8A6]/10 text-[#14B8A6]">
                    <Building2 className="size-8" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">{companyName || 'Your Company Name'}</h3>
                  <p className="mt-2 max-w-sm text-sm text-slate-500">This is how your company branding will appear on communications.</p>
                  
                  <div className="mt-10 grid w-full max-w-lg grid-cols-1 gap-6 text-left">
                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-6">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Branding Assets</p>
                      <div className="flex items-center gap-6">
                        {companyLogo ? (
                          <div className="size-20 rounded-xl border border-white bg-white overflow-hidden shadow-md">
                            <img src={companyLogo} alt="Logo" className="h-full w-full object-contain" />
                          </div>
                        ) : (
                          <div className="size-20 rounded-xl bg-slate-200 flex items-center justify-center text-slate-400 border border-white shadow-inner">
                            <ImageIcon className="size-8" />
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-bold text-slate-800">{companyName}</p>
                          <p className="text-xs text-slate-500">{companyWebsite || 'No website set'}</p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-6">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Contact Info</p>
                      <div className="space-y-2">
                        <p className="text-sm text-slate-700 flex items-center justify-between">
                          <span className="font-semibold">Email:</span>
                          <span className="font-medium text-slate-900">{companyEmail || '—'}</span>
                        </p>
                        <p className="text-sm text-slate-700 flex items-center justify-between">
                          <span className="font-semibold">Phone:</span>
                          <span className="font-medium text-slate-900">{companyPhone || '—'}</span>
                        </p>
                        <div className="pt-2">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Address</p>
                          <p className="text-sm font-medium text-slate-900 whitespace-pre-wrap">{companyAddress || 'No address set'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        )}

        {activeTab === 'invoice' && (
          <div className="mt-6">
            <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1 w-fit">
              <button
                type="button"
                onClick={() => setInvoiceSubTab('details')}
                className={`rounded-md px-4 py-1.5 text-xs font-bold transition ${invoiceSubTab === 'details' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Invoice Options
              </button>
              <button
                type="button"
                onClick={() => setInvoiceSubTab('preview')}
                className={`rounded-md px-4 py-1.5 text-xs font-bold transition ${invoiceSubTab === 'preview' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Preview Invoice
              </button>
            </div>

            {invoiceSubTab === 'details' ? (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
              >
                <h2 className="mb-2 text-lg font-bold text-slate-900">Invoice Settings</h2>
                <p className="mb-6 text-sm text-slate-500">
                  Defaults for new invoices, terms, tax — plus logo and colours used on the printable / PDF-style invoice.
                </p>
                <form onSubmit={handleSaveInvoice} className="space-y-6">
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5">
                <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <ImageIcon className="size-4 text-[#14B8A6]" />
                  Invoice logo
                </h3>
                <p className="mb-4 text-xs text-slate-500">Shown on the invoice header (same as company logo; you can override here for invoices only by saving from this tab).</p>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="text"
                    value={companyLogo}
                    onChange={(e) => setCompanyLogo(e.target.value)}
                    placeholder="URL or paste base64 data URL"
                    className={`${inputClass} min-w-[200px] flex-1`}
                  />
                  <label className="cursor-pointer rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                    Upload image
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          const r = new FileReader();
                          r.onload = () => {
                            const s = r.result;
                            if (typeof s === 'string') setCompanyLogo(s);
                          };
                          r.readAsDataURL(f);
                        }
                      }}
                    />
                  </label>
                </div>
                {companyLogo && (
                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex h-14 w-14 overflow-hidden rounded-lg border border-slate-200 bg-white">
                      <img src={companyLogo} alt="Logo preview" className="h-full w-full object-contain" />
                    </div>
                    <button
                      type="button"
                      onClick={() => setCompanyLogo('')}
                      className="text-xs font-medium text-rose-600 hover:underline"
                    >
                      Remove logo
                    </button>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5">
                <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Palette className="size-4 text-[#14B8A6]" />
                  Invoice theme
                </h3>
                <p className="mb-4 text-xs text-slate-500">
                  Accent colours for the top bar gradient, invoice number, and total on printed / on-screen invoices.
                </p>
                <div className="mb-4 flex flex-wrap gap-2">
                  {THEME_PRESETS.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => {
                        setFormInvoiceAccent(p.accent);
                        setFormInvoiceAccentEnd(p.end);
                      }}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-[#14B8A6] hover:text-[#14B8A6]"
                    >
                      <span
                        className="mr-2 inline-block size-3 rounded-full align-middle"
                        style={{ background: `linear-gradient(135deg, ${p.accent}, ${p.end})` }}
                      />
                      {p.name}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Accent start</label>
                    <div className="mt-1 flex gap-2">
                      <input
                        type="color"
                        value={/^#[0-9A-Fa-f]{6}$/i.test(formInvoiceAccent) ? formInvoiceAccent : '#14B8A6'}
                        onChange={(e) => setFormInvoiceAccent(e.target.value)}
                        className="h-10 w-14 cursor-pointer rounded border border-slate-200 bg-white p-1"
                        title="Accent start"
                      />
                      <input
                        type="text"
                        value={formInvoiceAccent}
                        onChange={(e) => setFormInvoiceAccent(e.target.value)}
                        placeholder="#14B8A6"
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Accent end (gradient)</label>
                    <div className="mt-1 flex gap-2">
                      <input
                        type="color"
                        value={/^#[0-9A-Fa-f]{6}$/i.test(formInvoiceAccentEnd) ? formInvoiceAccentEnd : '#0d9488'}
                        onChange={(e) => setFormInvoiceAccentEnd(e.target.value)}
                        className="h-10 w-14 cursor-pointer rounded border border-slate-200 bg-white p-1"
                        title="Accent end"
                      />
                      <input
                        type="text"
                        value={formInvoiceAccentEnd}
                        onChange={(e) => setFormInvoiceAccentEnd(e.target.value)}
                        placeholder="#0d9488"
                        className={inputClass}
                      />
                    </div>
                  </div>
                </div>
                <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                  <div className="h-1.5 w-full" style={{ background: `linear-gradient(to right, ${formInvoiceAccent}, ${formInvoiceAccentEnd})` }} />
                  <div className="flex items-center justify-between px-4 py-3 text-sm">
                    <span className="font-semibold text-slate-800">Preview</span>
                    <span className="font-bold" style={{ color: formInvoiceAccent }}>
                      INV-000001
                    </span>
                  </div>
                  <div className="border-t border-slate-100 px-4 py-2 text-right text-sm font-bold" style={{ color: formInvoiceAccent }}>
                    Total £0.00
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Default currency</label>
                  <select value={formCurrency} onChange={(e) => setFormCurrency(e.target.value)} className={inputClass}>
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Invoice prefix</label>
                  <input type="text" value={formPrefix} onChange={(e) => setFormPrefix(e.target.value)} placeholder="INV" className={inputClass} maxLength={20} />
                  <p className="mt-1 text-xs text-slate-500">Used for invoice numbers (e.g. INV-000001)</p>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Default due duration (days)</label>
                <input type="number" min={1} max={365} value={formDueDays} onChange={(e) => setFormDueDays(parseInt(e.target.value, 10) || 30)} className={inputClass} />
                <p className="mt-1 text-xs text-slate-500">Number of days from invoice date until payment is due</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Terms and conditions</label>
                <textarea rows={4} value={formTerms} onChange={(e) => setFormTerms(e.target.value)} placeholder="Payment terms, late fees, etc." className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Payment terms (shown on invoice)</label>
                <textarea
                  rows={3}
                  value={formPaymentTerms}
                  onChange={(e) => setFormPaymentTerms(e.target.value)}
                  placeholder="Example: Payment due within 14 days from invoice date."
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Bank details (shown on invoice)</label>
                <textarea
                  rows={4}
                  value={formBankDetails}
                  onChange={(e) => setFormBankDetails(e.target.value)}
                  placeholder={'Bank: ABC Bank\nSort code: 00-00-00\nAccount no: 12345678\nIBAN: ...'}
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Default tax (%)</label>
                  <input type="number" min={0} max={100} step={0.01} value={formDefaultTaxPercentage} onChange={(e) => setFormDefaultTaxPercentage(parseFloat(e.target.value) || 0)} className={inputClass} placeholder="0" />
                  <p className="mt-1 text-xs text-slate-500">Applied to subtotal when creating invoices</p>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Footer text</label>
                <textarea rows={2} value={formFooter} onChange={(e) => setFormFooter(e.target.value)} placeholder="Thank you for your business!" className={inputClass} />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex items-center gap-3">
                <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-[#14B8A6] px-5 py-2.5 font-semibold text-white shadow-sm hover:bg-[#13a89a] disabled:opacity-50">
                  <Save className="size-4" />
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
                {saved && <span className="text-sm font-medium text-emerald-600">Saved!</span>}
              </div>
            </form>
          </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                className="rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden"
              >
                <div
                  className="h-1.5 w-full"
                  style={{ background: `linear-gradient(to right, ${formInvoiceAccent}, ${formInvoiceAccentEnd})` }}
                />
                <div className="p-8">
                  <div className="flex justify-between items-start mb-10">
                    <div className="flex items-center gap-4">
                      {companyLogo ? (
                        <div className="size-14 rounded-xl border border-slate-100 overflow-hidden bg-white shadow-sm">
                          <img src={companyLogo} alt="Logo" className="h-full w-full object-contain" />
                        </div>
                      ) : (
                        <div className="size-14 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400">
                          <ImageIcon className="size-8" />
                        </div>
                      )}
                      <div>
                        <h3 className="text-xl font-bold text-slate-900">{companyName}</h3>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">INVOICE</p>
                        <div className="mt-2 text-[10px] font-medium text-slate-500 max-w-[200px] leading-relaxed">
                          {companyAddress && <p>{companyAddress}</p>}
                          {companyPhone && <p>{companyPhone}</p>}
                          {companyEmail && <p>{companyEmail}</p>}
                          {companyTaxId && <p>{companyTaxLabel}: {companyTaxId}</p>}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-black italic tracking-tighter" style={{ color: formInvoiceAccent }}>
                        {DUMMY_INVOICE.invoice_number}
                      </p>
                      <div className="mt-4 space-y-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        <p>Date: <span className="text-slate-900">{formatDate(DUMMY_INVOICE.invoice_date)}</span></p>
                        <p>Due: <span className="text-slate-900">{formatDate(DUMMY_INVOICE.due_date)}</span></p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-8 text-left">
                    <div className="rounded-xl bg-slate-50 p-4 border border-slate-100">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Bill To</p>
                      <p className="text-sm font-bold text-slate-800">{DUMMY_INVOICE.customer_full_name}</p>
                      <p className="text-[11px] text-slate-500">{DUMMY_INVOICE.customer_address}</p>
                    </div>
                  </div>

                  <table className="w-full text-left text-xs mb-8">
                    <thead>
                      <tr className="border-b-2 border-slate-100 bg-slate-50/50">
                        <th className="px-4 py-2 font-bold text-slate-600">Description</th>
                        <th className="px-4 py-2 text-right font-bold text-slate-600">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-slate-50">
                        <td className="px-4 py-3 font-semibold text-slate-800">Professional Services (x10)</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900">{formatCurrency(DUMMY_INVOICE.subtotal, DUMMY_INVOICE.currency)}</td>
                      </tr>
                    </tbody>
                  </table>

                  <div className="flex flex-col items-end gap-1 mb-10">
                    <div className="flex w-48 justify-between text-[11px] font-bold text-slate-500">
                      <span>Subtotal</span>
                      <span>{formatCurrency(DUMMY_INVOICE.subtotal, DUMMY_INVOICE.currency)}</span>
                    </div>
                    <div className="flex w-48 justify-between text-[11px] font-bold text-slate-500">
                      <span>{companyTaxLabel} ({formDefaultTaxPercentage}%)</span>
                      <span>{formatCurrency(DUMMY_INVOICE.tax_amount, DUMMY_INVOICE.currency)}</span>
                    </div>
                    <div className="flex w-48 justify-between border-t border-slate-100 pt-2 mt-1">
                      <span className="text-sm font-bold text-slate-900">Total Due</span>
                      <span className="text-lg font-black" style={{ color: formInvoiceAccent }}>
                        {formatCurrency(DUMMY_INVOICE.total_amount, DUMMY_INVOICE.currency)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6 pt-6 border-t border-slate-100 text-left">
                    {formBankDetails && (
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Payment Info</p>
                        <p className="whitespace-pre-wrap text-[10px] font-medium leading-relaxed text-slate-600">{formBankDetails}</p>
                      </div>
                    )}
                    {formTerms && (
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Terms</p>
                        <p className="whitespace-pre-wrap text-[10px] font-medium leading-relaxed text-slate-600">{formTerms}</p>
                      </div>
                    )}
                  </div>
                  {formFooter && <p className="mt-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">— {formFooter} —</p>}
                </div>
              </motion.div>
            )}
          </div>
        )}

        {activeTab === 'quotation' && (
          <div className="mt-6">
            <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1 w-fit">
              <button
                type="button"
                onClick={() => setQuotationSubTab('details')}
                className={`rounded-md px-4 py-1.5 text-xs font-bold transition ${quotationSubTab === 'details' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Quotation Options
              </button>
              <button
                type="button"
                onClick={() => setQuotationSubTab('preview')}
                className={`rounded-md px-4 py-1.5 text-xs font-bold transition ${quotationSubTab === 'preview' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Preview Quotation
              </button>
            </div>

            {quotationSubTab === 'details' ? (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
              >
                <h2 className="mb-2 text-lg font-bold text-slate-900">Quotation Settings</h2>
                <p className="mb-6 text-sm text-slate-500">
                  Defaults for new quotations, terms, tax — plus logo and colours used on the printable / PDF-style quotation.
                </p>
                <form onSubmit={handleSaveQuotation} className="space-y-6">
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5">
                <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <ImageIcon className="size-4 text-[#14B8A6]" />
                  Quotation logo
                </h3>
                <p className="mb-4 text-xs text-slate-500">Shown on the quotation header (same as company logo; you can override here for quotations only by saving from this tab).</p>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="text"
                    value={companyLogo}
                    onChange={(e) => setCompanyLogo(e.target.value)}
                    placeholder="URL or paste base64 data URL"
                    className={`${inputClass} min-w-[200px] flex-1`}
                  />
                  <label className="cursor-pointer rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                    Upload image
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          const r = new FileReader();
                          r.onload = () => {
                            const s = r.result;
                            if (typeof s === 'string') setCompanyLogo(s);
                          };
                          r.readAsDataURL(f);
                        }
                      }}
                    />
                  </label>
                </div>
                {companyLogo && (
                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex h-14 w-14 overflow-hidden rounded-lg border border-slate-200 bg-white">
                      <img src={companyLogo} alt="Logo preview" className="h-full w-full object-contain" />
                    </div>
                    <button
                      type="button"
                      onClick={() => setCompanyLogo('')}
                      className="text-xs font-medium text-rose-600 hover:underline"
                    >
                      Remove logo
                    </button>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5">
                <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Palette className="size-4 text-[#14B8A6]" />
                  Quotation theme
                </h3>
                <p className="mb-4 text-xs text-slate-500">
                  Accent colours for the top bar gradient, quotation number, and total on printed / on-screen quotations.
                </p>
                <div className="mb-4 flex flex-wrap gap-2">
                  {THEME_PRESETS.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => {
                        setQFormQuotationAccent(p.accent);
                        setQFormQuotationAccentEnd(p.end);
                      }}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-[#14B8A6] hover:text-[#14B8A6]"
                    >
                      <span
                        className="mr-2 inline-block size-3 rounded-full align-middle"
                        style={{ background: `linear-gradient(135deg, ${p.accent}, ${p.end})` }}
                      />
                      {p.name}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Accent start</label>
                    <div className="mt-1 flex gap-2">
                      <input
                        type="color"
                        value={/^#[0-9A-Fa-f]{6}$/i.test(qFormQuotationAccent) ? qFormQuotationAccent : '#14B8A6'}
                        onChange={(e) => setQFormQuotationAccent(e.target.value)}
                        className="h-10 w-14 cursor-pointer rounded border border-slate-200 bg-white p-1"
                        title="Accent start"
                      />
                      <input
                        type="text"
                        value={qFormQuotationAccent}
                        onChange={(e) => setQFormQuotationAccent(e.target.value)}
                        placeholder="#14B8A6"
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Accent end (gradient)</label>
                    <div className="mt-1 flex gap-2">
                      <input
                        type="color"
                        value={/^#[0-9A-Fa-f]{6}$/i.test(qFormQuotationAccentEnd) ? qFormQuotationAccentEnd : '#0d9488'}
                        onChange={(e) => setQFormQuotationAccentEnd(e.target.value)}
                        className="h-10 w-14 cursor-pointer rounded border border-slate-200 bg-white p-1"
                        title="Accent end"
                      />
                      <input
                        type="text"
                        value={qFormQuotationAccentEnd}
                        onChange={(e) => setQFormQuotationAccentEnd(e.target.value)}
                        placeholder="#0d9488"
                        className={inputClass}
                      />
                    </div>
                  </div>
                </div>
                <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                  <div className="h-1.5 w-full" style={{ background: `linear-gradient(to right, ${qFormQuotationAccent}, ${qFormQuotationAccentEnd})` }} />
                  <div className="flex items-center justify-between px-4 py-3 text-sm">
                    <span className="font-semibold text-slate-800">Preview</span>
                    <span className="font-bold" style={{ color: qFormQuotationAccent }}>
                      QUOT-000001
                    </span>
                  </div>
                  <div className="border-t border-slate-100 px-4 py-2 text-right text-sm font-bold" style={{ color: qFormQuotationAccent }}>
                    Total £0.00
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Default currency</label>
                  <select value={qFormCurrency} onChange={(e) => setQFormCurrency(e.target.value)} className={inputClass}>
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Quotation prefix</label>
                  <input type="text" value={qFormPrefix} onChange={(e) => setQFormPrefix(e.target.value)} placeholder="QUOT" className={inputClass} maxLength={20} />
                  <p className="mt-1 text-xs text-slate-500">Used for quotation numbers (e.g. QUOT-000001)</p>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Default validity (days)</label>
                <input type="number" min={1} max={365} value={qFormValidDays} onChange={(e) => setQFormValidDays(parseInt(e.target.value, 10) || 30)} className={inputClass} />
                <p className="mt-1 text-xs text-slate-500">Number of days the quotation is valid</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Terms and conditions</label>
                <textarea rows={4} value={qFormTerms} onChange={(e) => setQFormTerms(e.target.value)} placeholder="Terms, validity, etc." className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Payment terms (shown on quotation)</label>
                <textarea
                  rows={3}
                  value={qFormPaymentTerms}
                  onChange={(e) => setQFormPaymentTerms(e.target.value)}
                  placeholder="Example: Payment due within 14 days from accepted date."
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Bank details (shown on quotation)</label>
                <textarea
                  rows={4}
                  value={qFormBankDetails}
                  onChange={(e) => setQFormBankDetails(e.target.value)}
                  placeholder={'Bank: ABC Bank\nSort code: 00-00-00\nAccount no: 12345678\nIBAN: ...'}
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Default tax (%)</label>
                  <input type="number" min={0} max={100} step={0.01} value={qFormDefaultTaxPercentage} onChange={(e) => setQFormDefaultTaxPercentage(parseFloat(e.target.value) || 0)} className={inputClass} placeholder="0" />
                  <p className="mt-1 text-xs text-slate-500">Applied to subtotal when creating quotations</p>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Footer text</label>
                <textarea rows={2} value={qFormFooter} onChange={(e) => setQFormFooter(e.target.value)} placeholder="Thank you for your business!" className={inputClass} />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex items-center gap-3">
                <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-[#14B8A6] px-5 py-2.5 font-semibold text-white shadow-sm hover:bg-[#13a89a] disabled:opacity-50">
                  <Save className="size-4" />
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
                {saved && <span className="text-sm font-medium text-emerald-600">Saved!</span>}
              </div>
            </form>
          </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                className="rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden"
              >
                <div
                  className="h-1.5 w-full"
                  style={{ background: `linear-gradient(to right, ${qFormQuotationAccent}, ${qFormQuotationAccentEnd})` }}
                />
                <div className="p-8">
                  <div className="flex justify-between items-start mb-10">
                    <div className="flex items-center gap-4">
                      {companyLogo ? (
                        <div className="size-14 rounded-xl border border-slate-100 overflow-hidden bg-white shadow-sm">
                          <img src={companyLogo} alt="Logo" className="h-full w-full object-contain" />
                        </div>
                      ) : (
                        <div className="size-14 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400">
                          <ImageIcon className="size-8" />
                        </div>
                      )}
                      <div>
                        <h3 className="text-xl font-bold text-slate-900">{companyName}</h3>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">QUOTATION</p>
                        <div className="mt-2 text-[10px] font-medium text-slate-500 max-w-[200px] leading-relaxed">
                          {companyAddress && <p>{companyAddress}</p>}
                          {companyPhone && <p>{companyPhone}</p>}
                          {companyEmail && <p>{companyEmail}</p>}
                          {companyTaxId && <p>{companyTaxLabel}: {companyTaxId}</p>}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-black italic tracking-tighter" style={{ color: qFormQuotationAccent }}>
                        {DUMMY_QUOTATION.quotation_number}
                      </p>
                      <div className="mt-4 space-y-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        <p>Date: <span className="text-slate-900">{formatDate(DUMMY_QUOTATION.quotation_date)}</span></p>
                        <p>Valid Until: <span className="text-slate-900">{formatDate(DUMMY_QUOTATION.valid_until)}</span></p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-8 text-left">
                    <div className="rounded-xl bg-slate-50 p-4 border border-slate-100">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Prepared For</p>
                      <p className="text-sm font-bold text-slate-800">{DUMMY_QUOTATION.customer_full_name}</p>
                      <p className="text-[11px] text-slate-500">{DUMMY_QUOTATION.customer_address}</p>
                    </div>
                  </div>

                  <table className="w-full text-left text-xs mb-8">
                    <thead>
                      <tr className="border-b-2 border-slate-100 bg-slate-50/50">
                        <th className="px-4 py-2 font-bold text-slate-600">Service Description</th>
                        <th className="px-4 py-2 text-right font-bold text-slate-600">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-slate-50">
                        <td className="px-4 py-3 font-semibold text-slate-800">Initial Consultation & Design (x1)</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900">{formatCurrency(DUMMY_QUOTATION.subtotal, DUMMY_QUOTATION.currency)}</td>
                      </tr>
                    </tbody>
                  </table>

                  <div className="flex flex-col items-end gap-1 mb-10">
                    <div className="flex w-48 justify-between text-[11px] font-bold text-slate-500">
                      <span>Subtotal</span>
                      <span>{formatCurrency(DUMMY_QUOTATION.subtotal, DUMMY_QUOTATION.currency)}</span>
                    </div>
                    <div className="flex w-48 justify-between text-[11px] font-bold text-slate-500">
                      <span>{companyTaxLabel} ({qFormDefaultTaxPercentage}%)</span>
                      <span>{formatCurrency(DUMMY_QUOTATION.tax_amount, DUMMY_QUOTATION.currency)}</span>
                    </div>
                    <div className="flex w-48 justify-between border-t border-slate-100 pt-2 mt-1">
                      <span className="text-sm font-bold text-slate-900">Total Amount</span>
                      <span className="text-lg font-black" style={{ color: qFormQuotationAccent }}>
                        {formatCurrency(DUMMY_QUOTATION.total_amount, DUMMY_QUOTATION.currency)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6 pt-6 border-t border-slate-100 text-left">
                    {qFormBankDetails && (
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Payment Information</p>
                        <p className="whitespace-pre-wrap text-[10px] font-medium leading-relaxed text-slate-600">{qFormBankDetails}</p>
                      </div>
                    )}
                    {qFormTerms && (
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Terms & Conditions</p>
                        <p className="whitespace-pre-wrap text-[10px] font-medium leading-relaxed text-slate-600">{qFormTerms}</p>
                      </div>
                    )}
                  </div>
                  {qFormFooter && <p className="mt-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">— {qFormFooter} —</p>}
                </div>
              </motion.div>
            )}
          </div>
        )}

        {activeTab === 'email' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-b-xl border border-t-0 border-slate-200 bg-white p-8 shadow-sm"
          >
            <EmailSettings />
          </motion.div>
        )}

        {activeTab === 'customer-types' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-b-xl border border-transparent"
          >
            <CustomerTypesSettings />
          </motion.div>
        )}

        {activeTab === 'price-books' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-b-xl border border-transparent"
          >
            <PriceBooksSettings />
          </motion.div>
        )}

        {activeTab === 'job-descriptions' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-b-xl border border-transparent"
          >
            <JobDescriptionsSettings />
          </motion.div>
        )}

        {activeTab === 'business-units' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-b-xl border border-transparent mt-4"
          >
            <BusinessUnitsSettings />
          </motion.div>
        )}

        {activeTab === 'user-groups' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-b-xl border border-transparent mt-4"
          >
            <UserGroupsSettings />
          </motion.div>
        )}

        {activeTab === 'users' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-b-xl border border-transparent mt-4"
          >
            <UsersSettings />
          </motion.div>
        )}

        {activeTab === 'import' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-b-xl border border-transparent mt-4"
          >
            <ImportSettings />
          </motion.div>
        )}
          </div>
        </div>
      </div>
    </div>
  );
}
