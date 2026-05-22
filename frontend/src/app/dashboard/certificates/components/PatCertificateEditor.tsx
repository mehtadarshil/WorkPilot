'use client';

import Link from 'next/link';
import { ChevronLeft, Download, Loader2, Printer, Save } from 'lucide-react';
import { applyPatTotals, coercePatData, newId } from '@/lib/electricalCertificates/documentDefaults';
import type { PatApplianceRow, PatCertificateData } from '@/lib/electricalCertificates/types';
import { downloadCertificatePdf } from '@/lib/electricalCertificates/certificateExport';
import { useCertificateEditor } from '../CertificateEditorContext';

const inputClass = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30';

export function PatCertificateEditor() {
  const { certificate, document, setDocument, saveDocument, saving, saveError, lastSavedAt, patchMeta } = useCertificateEditor();
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;
  const pat = document.pat ? applyPatTotals(document.pat) : coercePatData(null, certificate.customer_full_name ?? '');

  const updatePat = (updater: (prev: PatCertificateData) => PatCertificateData) => {
    setDocument((prev) => {
      const current = prev.pat ? applyPatTotals(prev.pat) : coercePatData(null, certificate.customer_full_name ?? '');
      return { ...prev, typeSlug: 'portable_appliance_test', pat: applyPatTotals(updater(current)) };
    });
  };

  const updateAppliance = (rowId: string, patch: Partial<PatApplianceRow>) => {
    updatePat((prev) => ({
      ...prev,
      appliances: prev.appliances.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
    }));
  };

  const addAppliance = () => {
    updatePat((prev) => {
      const nextNumber = String(prev.appliances.length + 1).padStart(3, '0');
      return {
        ...prev,
        appliances: [
          ...prev.appliances,
          {
            id: newId('pat'),
            applianceId: nextNumber,
            brand: '',
            description: '',
            location: '',
            serialNo: '',
            retestPeriod: '12 Months',
            status: '',
          },
        ],
      };
    });
  };

  const removeAppliance = (rowId: string) => {
    updatePat((prev) => ({
      ...prev,
      appliances: prev.appliances.filter((row) => row.id !== rowId),
    }));
  };

  const downloadPdf = async () => {
    if (!token) return;
    await downloadCertificatePdf(certificate.id, certificate.certificate_number, token);
  };

  const markCompleted = async () => {
    await saveDocument();
    await patchMeta({ status: certificate.status === 'completed' ? 'in_progress' : 'completed' });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#f0f4f8]">
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/dashboard/certificates" className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50">
              <ChevronLeft className="size-4" />
            </Link>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Portable Appliance Test</p>
              <h1 className="text-lg font-bold text-slate-900">{certificate.certificate_number}</h1>
              <p className="text-sm text-slate-600">
                {certificate.customer_full_name}
                {certificate.installation_label ? ` · ${certificate.installation_label}` : ''}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${certificate.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
              {certificate.status === 'completed' ? 'Completed' : 'In progress'}
            </span>
            {saving ? (
              <span className="flex items-center gap-1 text-xs text-slate-500"><Loader2 className="size-3 animate-spin" /> Saving...</span>
            ) : (
              <span className="text-xs text-slate-500">{saveError ? saveError : lastSavedAt ? 'Saved' : ''}</span>
            )}
            <button type="button" onClick={() => void saveDocument()} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Save className="size-4" /> Save
            </button>
            <button type="button" onClick={() => window.open(`/dashboard/certificates/${certificate.id}/print`, '_blank')} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Printer className="size-4" /> Preview
            </button>
            <button type="button" onClick={() => void downloadPdf()} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Download className="size-4" /> PDF
            </button>
            <button type="button" onClick={() => void markCompleted()} className="rounded-lg bg-[#14B8A6] px-3 py-2 text-sm font-semibold text-white hover:bg-[#0d9488]">
              {certificate.status === 'completed' ? 'Reopen' : 'Mark complete'}
            </button>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto max-w-7xl space-y-5">
          <div className="grid gap-5 lg:grid-cols-3">
            <Panel title="Registered Business">
              <TextField label="Business name" value={pat.registeredBusiness.name} onChange={(v) => updatePat((p) => ({ ...p, registeredBusiness: { ...p.registeredBusiness, name: v } }))} />
              <TextArea label="Business address" value={pat.registeredBusiness.address} onChange={(v) => updatePat((p) => ({ ...p, registeredBusiness: { ...p.registeredBusiness, address: v } }))} rows={4} />
              <TextField label="Telephone" value={pat.registeredBusiness.phone} onChange={(v) => updatePat((p) => ({ ...p, registeredBusiness: { ...p.registeredBusiness, phone: v } }))} />
            </Panel>

            <Panel title="Job Address">
              <TextField label="Customer / company" value={pat.jobAddress.customerName} onChange={(v) => updatePat((p) => ({ ...p, jobAddress: { ...p.jobAddress, customerName: v } }))} />
              <TextArea label="Job address" value={pat.jobAddress.address} onChange={(v) => updatePat((p) => ({ ...p, jobAddress: { ...p.jobAddress, address: v } }))} rows={4} />
              <TextField label="Landlord / agent" value={pat.jobAddress.landlordAgent} onChange={(v) => updatePat((p) => ({ ...p, jobAddress: { ...p.jobAddress, landlordAgent: v } }))} />
            </Panel>

            <Panel title="Certificate Information">
              <TextField type="date" label="Date" value={pat.certificateInfo.date} onChange={(v) => updatePat((p) => ({ ...p, certificateInfo: { ...p.certificateInfo, date: v } }))} />
              <TextField label="Number" value={pat.certificateInfo.number} onChange={(v) => updatePat((p) => ({ ...p, certificateInfo: { ...p.certificateInfo, number: v } }))} />
              <div className="grid grid-cols-3 gap-2">
                <ReadOnlyMetric label="Tested" value={pat.certificateInfo.totalTested} />
                <ReadOnlyMetric label="Passed" value={pat.certificateInfo.totalPassed} />
                <ReadOnlyMetric label="Failed" value={pat.certificateInfo.totalFailed} />
              </div>
            </Panel>
          </div>

          <Panel
            title="Appliance details and test results"
            action={
              <button type="button" onClick={addAppliance} className="rounded-lg bg-[#14B8A6] px-3 py-2 text-sm font-semibold text-white hover:bg-[#0d9488]">
                Add appliance row
              </button>
            }
          >
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-[1180px] w-full border-collapse text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="border-b border-slate-200 px-2 py-2 text-left">ID</th>
                    <th className="border-b border-slate-200 px-2 py-2 text-left">Brand</th>
                    <th className="border-b border-slate-200 px-2 py-2 text-left">Description</th>
                    <th className="border-b border-slate-200 px-2 py-2 text-left">Location</th>
                    <th className="border-b border-slate-200 px-2 py-2 text-left">Serial no</th>
                    <th className="border-b border-slate-200 px-2 py-2 text-left">Retest period</th>
                    <th className="border-b border-slate-200 px-2 py-2 text-left">Status</th>
                    <th className="border-b border-slate-200 px-2 py-2 text-left" />
                  </tr>
                </thead>
                <tbody>
                  {pat.appliances.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">
                        No appliance rows yet. Add a row to start testing.
                      </td>
                    </tr>
                  ) : pat.appliances.map((row) => (
                    <tr key={row.id} className="odd:bg-white even:bg-slate-50/60">
                      <CellInput value={row.applianceId} onChange={(v) => updateAppliance(row.id, { applianceId: v })} />
                      <CellInput value={row.brand} onChange={(v) => updateAppliance(row.id, { brand: v })} />
                      <CellInput value={row.description} onChange={(v) => updateAppliance(row.id, { description: v })} />
                      <CellInput value={row.location} onChange={(v) => updateAppliance(row.id, { location: v })} />
                      <CellInput value={row.serialNo} onChange={(v) => updateAppliance(row.id, { serialNo: v })} />
                      <CellInput value={row.retestPeriod} onChange={(v) => updateAppliance(row.id, { retestPeriod: v })} />
                      <td className="border-b border-slate-100 px-2 py-1">
                        <select
                          value={row.status}
                          onChange={(e) => updateAppliance(row.id, { status: e.target.value as PatApplianceRow['status'] })}
                          className="w-28 rounded border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-[#14B8A6]"
                        >
                          <option value="">Select</option>
                          <option value="pass">Pass</option>
                          <option value="fail">Fail</option>
                        </select>
                      </td>
                      <td className="border-b border-slate-100 px-2 py-1 text-right">
                        <button type="button" onClick={() => removeAppliance(row.id)} className="rounded px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50">
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Test equipment used">
              <TextField label="Equipment make / model" value={pat.testEquipment.make} onChange={(v) => updatePat((p) => ({ ...p, testEquipment: { ...p.testEquipment, make: v } }))} />
              <TextField label="Serial no" value={pat.testEquipment.serialNo} onChange={(v) => updatePat((p) => ({ ...p, testEquipment: { ...p.testEquipment, serialNo: v } }))} />
              <TextArea label="Notes" value={pat.testEquipment.notes} onChange={(v) => updatePat((p) => ({ ...p, testEquipment: { ...p.testEquipment, notes: v } }))} rows={4} />
            </Panel>
            <Panel title="Engineer declaration">
              <TextField label="Engineer name" value={pat.engineer.name} onChange={(v) => updatePat((p) => ({ ...p, engineer: { ...p.engineer, name: v } }))} />
              <TextArea label="Inspection notes / observations" value={pat.engineer.notes} onChange={(v) => updatePat((p) => ({ ...p, engineer: { ...p.engineer, notes: v } }))} rows={6} />
            </Panel>
          </div>
        </div>
      </main>
    </div>
  );
}

function Panel({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        {action}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function TextField({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase text-slate-500">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass} mt-1`} />
    </label>
  );
}

function TextArea({ label, value, onChange, rows }: { label: string; value: string; onChange: (v: string) => void; rows: number }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase text-slate-500">{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} className={`${inputClass} mt-1 resize-y`} />
    </label>
  );
}

function ReadOnlyMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase text-slate-500">{label}</p>
      <p className="text-lg font-bold text-slate-900">{value || '0'}</p>
    </div>
  );
}

function CellInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <td className="border-b border-slate-100 px-2 py-1">
      <input value={value} onChange={(e) => onChange(e.target.value)} className="w-full min-w-28 rounded border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-[#14B8A6]" />
    </td>
  );
}
