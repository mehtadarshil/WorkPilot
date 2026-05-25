'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Download, Loader2, Printer, Save } from 'lucide-react';
import { applyPatTotals, coercePatData, newId } from '@/lib/electricalCertificates/documentDefaults';
import type { ElectricalCertificate, PatApplianceRow, PatCertificateData } from '@/lib/electricalCertificates/types';
import type { CompanyBranding } from '@/lib/electricalCertificates/companyBranding';
import { downloadCertificatePdf, openCertificatePdfPreviewWindow, previewCertificatePdf } from '@/lib/electricalCertificates/certificateExport';
import { getJson, postJson } from '../../../apiClient';
import { useCertificateEditor } from '../CertificateEditorContext';
import CustomerSiteReportSignaturePad from '../../customers/[id]/CustomerSiteReportSignaturePad';

const inputClass = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30';

type PatTestEquipmentDefaults = {
  make: string;
  serialNo: string;
  notes: string;
};

type CertificateEngineer = {
  key: string;
  kind: 'dashboard' | 'field';
  id: number;
  user_id: number | null;
  officer_id: number | null;
  full_name: string;
  role_position: string | null;
  access_label: string;
  email: string | null;
};

function resolveEngineerKey(engineer: PatCertificateData['engineer'], members: CertificateEngineer[]): string {
  if (engineer.userId != null) {
    const byUser = members.find((member) => member.user_id === engineer.userId);
    if (byUser) return byUser.key;
  }
  if (engineer.officerId != null) {
    const byOfficer = members.find((member) => member.officer_id === engineer.officerId);
    if (byOfficer) return byOfficer.key;
  }
  return '';
}

function memberCanSign(member: CertificateEngineer, userId: number | null, officerId: number | null): boolean {
  if (userId != null && member.user_id === userId) return true;
  if (officerId != null && member.officer_id === officerId) return true;
  return false;
}

function dateOnly(raw: string): string {
  return raw.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? '';
}

export function PatCertificateEditor() {
  const { certificate, document, setDocument, saveDocument, saving, saveError, lastSavedAt, patchMeta } = useCertificateEditor();
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;
  const pat = document.pat ? applyPatTotals(document.pat) : coercePatData(null, certificate.customer_full_name ?? '');
  const [engineers, setEngineers] = useState<CertificateEngineer[]>([]);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [currentOfficerId, setCurrentOfficerId] = useState<number | null>(null);
  const [signatureBusy, setSignatureBusy] = useState(false);
  const [signatureError, setSignatureError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    void getJson<{ branding: CompanyBranding }>('/electrical-certificates/branding', token)
      .then(({ branding }) => {
        setDocument((prev) => {
          const current = prev.pat ? applyPatTotals(prev.pat) : coercePatData(null, certificate.customer_full_name ?? '');
          const address = [branding.company_address, branding.company_email, branding.company_website]
            .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
            .join('\n');
          const registeredBusiness = {
            name: current.registeredBusiness.name.trim() || branding.company_name || '',
            address: current.registeredBusiness.address.trim() || address,
            phone: current.registeredBusiness.phone.trim() || branding.company_phone || '',
          };
          const jobAddress = {
            ...current.jobAddress,
            customerName: current.jobAddress.customerName.trim() || certificate.customer_full_name || '',
            address: current.jobAddress.address.trim() || certificate.installation_label || '',
          };
          if (
            registeredBusiness.name === current.registeredBusiness.name &&
            registeredBusiness.address === current.registeredBusiness.address &&
            registeredBusiness.phone === current.registeredBusiness.phone &&
            jobAddress.customerName === current.jobAddress.customerName &&
            jobAddress.address === current.jobAddress.address
          ) {
            return prev;
          }
          return {
            ...prev,
            typeSlug: 'portable_appliance_test',
            pat: applyPatTotals({ ...current, registeredBusiness, jobAddress }),
          };
        });
      })
      .catch(() => {
        // Branding defaults are a convenience; keep the editor usable if settings cannot load.
      });
  }, [certificate.customer_full_name, certificate.installation_label, setDocument, token]);

  useEffect(() => {
    if (!token) return;
    void getJson<{ testEquipment: PatTestEquipmentDefaults }>('/electrical-certificates/pat-defaults', token)
      .then(({ testEquipment }) => {
        setDocument((prev) => {
          const current = prev.pat ? applyPatTotals(prev.pat) : coercePatData(null, certificate.customer_full_name ?? '');
          const nextTestEquipment = {
            make: current.testEquipment.make.trim() || testEquipment.make || '',
            serialNo: current.testEquipment.serialNo.trim() || testEquipment.serialNo || '',
            notes: current.testEquipment.notes.trim() || testEquipment.notes || '',
          };
          if (
            nextTestEquipment.make === current.testEquipment.make &&
            nextTestEquipment.serialNo === current.testEquipment.serialNo &&
            nextTestEquipment.notes === current.testEquipment.notes
          ) {
            return prev;
          }
          return {
            ...prev,
            typeSlug: 'portable_appliance_test',
            pat: applyPatTotals({ ...current, testEquipment: nextTestEquipment }),
          };
        });
      })
      .catch(() => {
        // PAT equipment defaults are optional; keep the editor usable if settings cannot load.
      });
  }, [certificate.customer_full_name, setDocument, token]);

  useEffect(() => {
    if (!token) return;
    void Promise.all([
      getJson<{ engineers: CertificateEngineer[] }>('/electrical-certificates/engineers', token),
      getJson<{ user: { id?: number; userId?: number; officer_id?: number | null; officerId?: number | null } }>('/auth/me', token),
    ])
      .then(([engineersRes, meRes]) => {
        const members = engineersRes.engineers ?? [];
        setEngineers(members);
        const userId = meRes.user.id ?? meRes.user.userId ?? null;
        const officerId = meRes.user.officer_id ?? meRes.user.officerId ?? null;
        setCurrentUserId(typeof userId === 'number' && Number.isFinite(userId) ? userId : null);
        setCurrentOfficerId(typeof officerId === 'number' && Number.isFinite(officerId) ? officerId : null);
      })
      .catch(() => {
        setEngineers([]);
        setCurrentUserId(null);
        setCurrentOfficerId(null);
      });
  }, [token]);

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
            status: 'pass',
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

  const selectedEngineerKey = resolveEngineerKey(pat.engineer, engineers);
  const selectedEngineer = engineers.find((member) => member.key === selectedEngineerKey) ?? null;

  const updateEngineerSelection = (memberKey: string) => {
    const member = memberKey ? engineers.find((item) => item.key === memberKey) : null;
    updatePat((prev) => ({
      ...prev,
      engineer: {
        ...prev.engineer,
        officerId: member?.officer_id ?? null,
        userId: member?.user_id ?? null,
        name: member?.full_name ?? '',
        signatureDataUrl: '',
        signedAt: '',
        signedByUserId: null,
        signedByOfficerId: null,
      },
    }));
  };

  const saveEngineerSignature = async (blob: Blob) => {
    if (!token || !selectedEngineerKey) return;
    setSignatureBusy(true);
    setSignatureError(null);
    try {
      const signatureDataUrl = await blobToDataUrl(blob);
      const res = await postJson<{ certificate: ElectricalCertificate }>(
        `/electrical-certificates/${certificate.id}/pat-engineer-signature`,
        { engineer_key: selectedEngineerKey, signature_data_url: signatureDataUrl, signature_date: signatureDate },
        token,
      );
      setDocument(() => res.certificate.document);
    } catch (e) {
      setSignatureError(e instanceof Error ? e.message : 'Could not save signature');
    } finally {
      setSignatureBusy(false);
    }
  };

  const canSignSelectedEngineer = selectedEngineer
    ? memberCanSign(selectedEngineer, currentUserId, currentOfficerId)
    : false;
  const signatureDate = dateOnly(pat.engineer.signedAt) || new Date().toISOString().slice(0, 10);

  const downloadPdf = async () => {
    if (!token) return;
    await saveDocument();
    await downloadCertificatePdf(certificate.id, certificate.certificate_number, token);
  };

  const previewPdf = async () => {
    if (!token) return;
    const previewWindow = openCertificatePdfPreviewWindow();
    await saveDocument();
    await previewCertificatePdf(certificate.id, token, previewWindow);
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
            <button type="button" onClick={() => void previewPdf()} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
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
            {pat.appliances.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                No appliance rows yet. Add a row to start testing.
              </p>
            ) : (
              <div className="grid gap-3">
                {pat.appliances.map((row, index) => (
                  <div key={row.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-slate-900">Appliance {index + 1}</p>
                        <p className="text-xs text-slate-500">All fields are visible without horizontal scrolling.</p>
                      </div>
                      <button type="button" onClick={() => removeAppliance(row.id)} className="rounded px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50">
                        Remove
                      </button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <TextField label="ID" value={row.applianceId} onChange={(v) => updateAppliance(row.id, { applianceId: v })} />
                      <TextField label="Brand" value={row.brand} onChange={(v) => updateAppliance(row.id, { brand: v })} />
                      <TextField label="Description" value={row.description} onChange={(v) => updateAppliance(row.id, { description: v })} />
                      <TextField label="Location" value={row.location} onChange={(v) => updateAppliance(row.id, { location: v })} />
                      <TextField label="Serial no" value={row.serialNo} onChange={(v) => updateAppliance(row.id, { serialNo: v })} />
                      <TextField label="Retest period" value={row.retestPeriod} onChange={(v) => updateAppliance(row.id, { retestPeriod: v })} />
                      <label className="block">
                        <span className="text-xs font-semibold uppercase text-slate-500">Status</span>
                        <select
                          value={row.status || 'pass'}
                          onChange={(e) => updateAppliance(row.id, { status: e.target.value as PatApplianceRow['status'] })}
                          className={`${inputClass} mt-1 bg-white`}
                        >
                          <option value="pass">Pass</option>
                          <option value="fail">Fail</option>
                        </select>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Test equipment used">
              <TextField label="Equipment make / model" value={pat.testEquipment.make} onChange={(v) => updatePat((p) => ({ ...p, testEquipment: { ...p.testEquipment, make: v } }))} />
              <TextField label="Serial no" value={pat.testEquipment.serialNo} onChange={(v) => updatePat((p) => ({ ...p, testEquipment: { ...p.testEquipment, serialNo: v } }))} />
              <TextArea label="Notes" value={pat.testEquipment.notes} onChange={(v) => updatePat((p) => ({ ...p, testEquipment: { ...p.testEquipment, notes: v } }))} rows={4} />
            </Panel>
            <Panel title="Engineer declaration">
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">Engineer</span>
                <select
                  value={selectedEngineerKey}
                  onChange={(e) => updateEngineerSelection(e.target.value)}
                  className={`${inputClass} mt-1 bg-white`}
                >
                  <option value="">Select team member</option>
                  {engineers.map((engineer) => (
                    <option key={engineer.key} value={engineer.key}>
                      {engineer.full_name} · {engineer.access_label}
                    </option>
                  ))}
                </select>
              </label>
              <TextField label="Engineer name" value={pat.engineer.name} onChange={(v) => updatePat((p) => ({ ...p, engineer: { ...p.engineer, name: v } }))} />
              <TextField
                type="date"
                label="Signature date"
                value={signatureDate}
                onChange={(v) => updatePat((p) => ({ ...p, engineer: { ...p.engineer, signedAt: v } }))}
              />
              <TextArea label="Inspection notes / observations" value={pat.engineer.notes} onChange={(v) => updatePat((p) => ({ ...p, engineer: { ...p.engineer, notes: v } }))} rows={6} />
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-slate-900">Engineer signature</p>
                    <p className="text-xs text-slate-500">
                      Signatures are only accepted when the selected engineer profile matches the logged-in user.
                    </p>
                  </div>
                  {pat.engineer.signatureDataUrl ? (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                      Signed
                    </span>
                  ) : null}
                </div>
                {pat.engineer.signatureDataUrl ? (
                  <div className="mb-3 rounded-lg border border-slate-200 bg-white p-3">
                    <img src={pat.engineer.signatureDataUrl} alt={`${pat.engineer.name} signature`} className="h-20 max-w-full object-contain" />
                    <p className="mt-2 text-xs text-slate-500">
                      Signed by {pat.engineer.name || 'engineer'}{signatureDate ? ` on ${signatureDate}` : ''}
                    </p>
                  </div>
                ) : null}
                {!selectedEngineerKey ? (
                  <p className="text-sm text-slate-500">Select a team member before signing.</p>
                ) : !canSignSelectedEngineer ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    You are logged in as a different user, so you cannot sign for {pat.engineer.name || 'this engineer'}.
                  </p>
                ) : (
                  <CustomerSiteReportSignaturePad
                    disabled={signatureBusy}
                    busy={signatureBusy}
                    saveLabel="Save signature to certificate"
                    onSave={(blob) => saveEngineerSignature(blob)}
                  />
                )}
                {signatureError ? <p className="mt-2 text-sm text-rose-700">{signatureError}</p> : null}
              </div>
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

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Could not read signature image'));
    reader.readAsDataURL(blob);
  });
}
