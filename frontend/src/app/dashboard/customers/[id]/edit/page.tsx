'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getJson, patchJson } from '../../../../apiClient';
import { ArrowLeft, Save } from 'lucide-react';

interface CustomerType {
  id: number;
  name: string;
  company_name_required?: boolean;
}

interface PriceBook {
  id: number;
  name: string;
}

export default function EditCustomerPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  const [customerTypes, setCustomerTypes] = useState<CustomerType[]>([]);
  const [priceBooks, setPriceBooks] = useState<PriceBook[]>([]);

  const [loading, setLoading] = useState(true);

  // Customer Details (Left Side)
  const [customerTypeId, setCustomerTypeId] = useState<number | ''>('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [addressLine3, setAddressLine3] = useState('');
  const [town, setTown] = useState('');
  const [county, setCounty] = useState('');
  const [postcode, setPostcode] = useState('');
  const [landline, setLandline] = useState('');
  
  // Right Side details (Usually primary contact or company fields)
  // Re-using core fields
  const [company, setCompany] = useState(''); // E.g., Company/Housing Name
  // For a contact:
  const [contactTitle, setContactTitle] = useState('');
  const [contactFirstName, setContactFirstName] = useState('');
  const [contactSurname, setContactSurname] = useState('');
  const [contactPosition, setContactPosition] = useState('');
  const [contactMobile, setContactMobile] = useState('');
  const [contactLandline, setContactLandline] = useState('');
  const [contactEmail, setContactEmail] = useState('');

  // Marketing & Accounts Options
  const [prefersPhone, setPrefersPhone] = useState(false);
  const [prefersSms, setPrefersSms] = useState(false);
  const [prefersEmail, setPrefersEmail] = useState(false);
  const [prefersLetter, setPrefersLetter] = useState(false);
  const [isLead, setIsLead] = useState(false);

  const [leadSource, setLeadSource] = useState('');
  const [priceBookId, setPriceBookId] = useState<number | ''>('');
  const [creditDays, setCreditDays] = useState('');
  
  const [w3w, setW3W] = useState('');
  const [waterSupply, setWaterSupply] = useState('');
  const [powerSupply, setPowerSupply] = useState('');
  const [technicalNotes, setTechnicalNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedType = customerTypes.find((t) => t.id === Number(customerTypeId)) || null;
  const companyRequired = !!selectedType?.company_name_required;

  const fetchData = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    try {
      const typesData = await getJson<{ customerTypes: CustomerType[] }>('/settings/customer-types', token);
      if (typesData.customerTypes) setCustomerTypes(typesData.customerTypes);

      const pbData = await getJson<PriceBook[]>('/settings/price-books', token);
      if (pbData) setPriceBooks(pbData);

      const customer: any = await getJson(`/customers/${id}`, token);
      
      setCustomerTypeId(customer.customer_type_id || '');
      setAddressLine1(customer.address_line_1 || '');
      setAddressLine2(customer.address_line_2 || '');
      setAddressLine3(customer.address_line_3 || '');
      setTown(customer.town || '');
      setCounty(customer.county || '');
      setPostcode(customer.postcode || '');
      setLandline(customer.landline || '');
      
      setCompany(customer.company || '');
      setContactTitle(customer.contact_title || '');
      setContactFirstName(customer.contact_first_name || '');
      setContactSurname(customer.contact_surname || '');
      setContactPosition(customer.contact_position || '');
      setContactMobile(customer.contact_mobile || customer.phone || '');
      setContactLandline(customer.contact_landline || '');
      setContactEmail(customer.contact_email || customer.email || '');

      setPrefersPhone(!!customer.prefers_phone);
      setPrefersSms(!!customer.prefers_sms);
      setPrefersEmail(!!customer.prefers_email);
      setPrefersLetter(!!customer.prefers_letter);
      setIsLead(customer.status === 'LEAD');

      setLeadSource(customer.lead_source || '');
      setPriceBookId(customer.price_book_id || '');
      setCreditDays(customer.credit_days ? customer.credit_days.toString() : '');
      
      setW3W(customer.w3w || '');
      setWaterSupply(customer.water_supply || '');
      setPowerSupply(customer.power_supply || '');
      setTechnicalNotes(customer.technical_notes || '');

    } catch (e: any) {
      setError(e.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    setError(null);

    if (companyRequired && !company.trim()) {
      setError('Company name is required for this customer type.');
      setSaving(false);
      return;
    }
    const derivedFullName = company.trim() || `${contactFirstName} ${contactSurname}`.trim() || 'Unknown Customer';
    const derivedEmail = contactEmail || 'no-reply@workpilot.placeholder.com';

    try {
      await patchJson(`/customers/${id}`, {
        full_name: derivedFullName,
        email: derivedEmail,
        company,
        status: isLead ? 'LEAD' : 'ACTIVE',
        customer_type_id: customerTypeId === '' ? null : Number(customerTypeId),
        address_line_1: addressLine1,
        address_line_2: addressLine2,
        address_line_3: addressLine3,
        town,
        county,
        postcode,
        landline,
        contact_title: contactTitle,
        contact_first_name: contactFirstName,
        contact_surname: contactSurname,
        contact_position: contactPosition,
        contact_mobile: contactMobile,
        contact_landline: contactLandline,
        contact_email: contactEmail,
        prefers_phone: prefersPhone,
        prefers_sms: prefersSms,
        prefers_email: prefersEmail,
        prefers_letter: prefersLetter,
        lead_source: leadSource,
        price_book_id: priceBookId === '' ? null : Number(priceBookId),
        credit_days: creditDays,
        w3w: w3w.trim() || null,
        water_supply: waterSupply.trim() || null,
        power_supply: powerSupply.trim() || null,
        technical_notes: technicalNotes.trim() || null
      }, token);

      router.back();
    } catch (err: any) {
      setError(err instanceof Error ? err.message : err?.message || 'Failed to update customer.');
      setSaving(false);
    }
  };

  const inputClass = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/20 bg-white";
  const labelClass = "text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1 block";

  if (loading) {
    return <div className="p-8 text-slate-500 font-medium">Loading form...</div>;
  }

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="rounded-md p-2 hover:bg-slate-100 transition-colors">
            <ArrowLeft className="size-5 text-slate-500" />
          </button>
          <h2 className="text-lg font-bold text-slate-900">Edit Customer</h2>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-bold text-white hover:bg-[#119f8e] disabled:opacity-50 transition-colors"
          >
            <Save className="size-4" />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 relative">
        <form onSubmit={handleSubmit} className="mx-auto max-w-5xl space-y-6">
          {error && (
            <div className="rounded-lg bg-rose-50 p-4 text-sm font-medium text-rose-800 border border-rose-200">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left side: Customer Details */}
            <div className="space-y-6">
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="border-b border-slate-200 bg-slate-100/50 px-5 py-3">
                  <h3 className="font-bold text-slate-800">Customer Details</h3>
                </div>
                <div className="p-5 space-y-4">
                  <div>
                    <label className={labelClass}>Customer Type *</label>
                    <select
                      required
                      value={customerTypeId}
                      onChange={e => setCustomerTypeId(e.target.value as any)}
                      className={inputClass}
                    >
                      <option value="">Select an option</option>
                      {customerTypes.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Company/Housing Name{companyRequired ? ' *' : ''}</label>
                    <input
                      type="text"
                      required={companyRequired}
                      value={company}
                      onChange={e => setCompany(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Address Line 1</label>
                    <input type="text" value={addressLine1} onChange={e => setAddressLine1(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Address Line 2</label>
                    <input type="text" value={addressLine2} onChange={e => setAddressLine2(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Address Line 3</label>
                    <input type="text" value={addressLine3} onChange={e => setAddressLine3(e.target.value)} className={inputClass} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Town</label>
                      <input type="text" value={town} onChange={e => setTown(e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>City</label>
                      <input type="text" value={county} onChange={e => setCounty(e.target.value)} className={inputClass} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Postcode</label>
                      <input type="text" value={postcode} onChange={e => setPostcode(e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Landline</label>
                      <input type="text" value={landline} onChange={e => setLandline(e.target.value)} className={inputClass} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right side: Contact Details */}
            <div className="space-y-6">
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="border-b border-slate-200 bg-slate-100/50 px-5 py-3">
                  <h3 className="font-bold text-slate-800">Contact Details</h3>
                  <p className="text-xs text-slate-500 mt-1">The details below are for the contact person in the company/housing organization.</p>
                </div>
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className={labelClass}>Title</label>
                      <select value={contactTitle} onChange={e => setContactTitle(e.target.value)} className={inputClass}>
                        <option value="">Select option</option>
                        <option value="Mr">Mr</option>
                        <option value="Mrs">Mrs</option>
                        <option value="Miss">Miss</option>
                        <option value="Ms">Ms</option>
                        <option value="Dr">Dr</option>
                        <option value="Prof">Prof</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className={labelClass}>First Name *</label>
                      <input type="text" value={contactFirstName} onChange={e => setContactFirstName(e.target.value)} className={inputClass} />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Surname *</label>
                    <input type="text" value={contactSurname} onChange={e => setContactSurname(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Position</label>
                    <input type="text" value={contactPosition} onChange={e => setContactPosition(e.target.value)} className={inputClass} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Mobile</label>
                      <input type="text" value={contactMobile} onChange={e => setContactMobile(e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Landline</label>
                      <input type="text" value={contactLandline} onChange={e => setContactLandline(e.target.value)} className={inputClass} />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Email Address</label>
                    <input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} className={inputClass} />
                  </div>
                  
                  <div className="pt-4 pb-2 border-t border-slate-100">
                    <label className={labelClass}>Marketing Preferences</label>
                    <div className="flex gap-4 items-center">
                      <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                        <input type="checkbox" checked={prefersPhone} onChange={e => setPrefersPhone(e.target.checked)} className="size-4 text-[#14B8A6] focus:ring-[#14B8A6] rounded" /> Phone
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                        <input type="checkbox" checked={prefersSms} onChange={e => setPrefersSms(e.target.checked)} className="size-4 text-[#14B8A6] focus:ring-[#14B8A6] rounded" /> SMS
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                        <input type="checkbox" checked={prefersEmail} onChange={e => setPrefersEmail(e.target.checked)} className="size-4 text-[#14B8A6] focus:ring-[#14B8A6] rounded" /> Email
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                        <input type="checkbox" checked={prefersLetter} onChange={e => setPrefersLetter(e.target.checked)} className="size-4 text-[#14B8A6] focus:ring-[#14B8A6] rounded" /> Letter
                      </label>
                    </div>
                  </div>

                  {/* Add Checkbox for Is this a lead? */}
                  <div className="pt-2">
                     <label className="flex items-start gap-2 cursor-pointer">
                        <input type="checkbox" checked={isLead} onChange={e => setIsLead(e.target.checked)} className="size-4 mt-1 text-[#14B8A6] focus:ring-[#14B8A6] rounded" /> 
                        <div className="flex flex-col">
                            <span className="text-sm font-semibold text-slate-900">Is this a lead?</span>
                            <span className="text-xs text-slate-500">Tick this if the prospect is just currently inquiring</span>
                        </div>
                      </label>
                  </div>

                </div>
              </div>



              <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                 <div className="border-b border-slate-200 bg-slate-100/50 px-5 py-3">
                  <h3 className="font-bold text-slate-800">Historical / Technical Details</h3>
                </div>
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>W3W (What3Words)</label>
                      <input type="text" value={w3w} onChange={e => setW3W(e.target.value)} className={inputClass} placeholder="e.g. filled.count.soap" />
                    </div>
                    <div>
                      <label className={labelClass}>Water Supply Ref</label>
                      <input type="text" value={waterSupply} onChange={e => setWaterSupply(e.target.value)} className={inputClass} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Power Supply Ref</label>
                      <input type="text" value={powerSupply} onChange={e => setPowerSupply(e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Lead Source</label>
                      <select value={leadSource} onChange={e => setLeadSource(e.target.value)} className={inputClass}>
                        <option value="">Select option</option>
                        <option value="Advertisement">Advertisement</option>
                        <option value="Recommendation">Recommendation</option>
                        <option value="Internet Search">Internet Search</option>
                        <option value="Social Media">Social Media</option>
                        <option value="Cold Call">Cold Call</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Technical Notes</label>
                    <textarea 
                      value={technicalNotes} 
                      onChange={e => setTechnicalNotes(e.target.value)} 
                      className={`${inputClass} min-h-[100px] resize-y`}
                      placeholder="Enter any additional technical details or specific site instructions..."
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                 <div className="border-b border-slate-200 bg-slate-100/50 px-5 py-3">
                  <h3 className="font-bold text-slate-800">Accounts Options</h3>
                </div>
                <div className="p-5 space-y-4">
                   <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Default Credit Days</label>
                      <input type="text" value={creditDays} onChange={e => setCreditDays(e.target.value)} className={inputClass} placeholder="e.g. 30" />
                    </div>
                    <div>
                      <label className={labelClass}>Price Book</label>
                      <select value={priceBookId} onChange={e => setPriceBookId(e.target.value as any)} className={inputClass}>
                        <option value="">Select option</option>
                        {priceBooks.map(b => (
                           <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

            </div>

          </div>
        </form>
      </div>
    </div>
  );
}
