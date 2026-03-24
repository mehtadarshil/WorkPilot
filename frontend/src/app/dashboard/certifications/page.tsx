'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Award, Plus, Pencil, Trash2, AlertTriangle, CheckCircle, Clock, FileBarChart, Printer, FileCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { getJson, postJson, patchJson, deleteRequest } from '../../apiClient';

interface Certification {
  id: number;
  name: string;
  description: string | null;
  validity_months: number;
  reminder_days_before: number;
  created_at: string;
  updated_at: string;
}

interface Officer {
  id: number;
  full_name: string;
  role_position: string | null;
  department: string | null;
  state: string;
}

interface ComplianceItem {
  id: number;
  officer_name: string;
  officer_email?: string | null;
  certification_name: string;
  expiry_date: string;
  days_remaining?: number;
  days_overdue?: number;
}

interface ComplianceReport {
  expiring_soon: ComplianceItem[];
  expired: ComplianceItem[];
  valid: ComplianceItem[];
  summary: { expiring_soon_count: number; expired_count: number; valid_count: number };
}

const inputClass = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function CertificationsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'certifications' | 'compliance'>('certifications');
  const [certifications, setCertifications] = useState<Certification[]>([]);
  const [compliance, setCompliance] = useState<ComplianceReport | null>(null);
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [modalOpen, setModalOpen] = useState<'add' | 'edit' | 'assign' | 'create' | null>(null);
  const [editingCert, setEditingCert] = useState<Certification | null>(null);
  const [assignCert, setAssignCert] = useState<Certification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formValidityMonths, setFormValidityMonths] = useState(12);
  const [formReminderDays, setFormReminderDays] = useState(30);

  const [assignOfficerId, setAssignOfficerId] = useState<number | null>(null);
  const [assignIssuedDate, setAssignIssuedDate] = useState(new Date().toISOString().slice(0, 10));
  const [assignExpiryDate, setAssignExpiryDate] = useState('');
  const [assignCertNumber, setAssignCertNumber] = useState('');
  const [assignIssuedBy, setAssignIssuedBy] = useState('');
  const [assignNotes, setAssignNotes] = useState('');

  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  const fetchCertifications = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getJson<{ certifications: Certification[] }>('/certifications', token);
      setCertifications(data.certifications ?? []);
    } catch {
      setCertifications([]);
    }
  }, [token]);

  const fetchCompliance = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getJson<ComplianceReport>('/certifications/compliance', token);
      setCompliance(data);
    } catch {
      setCompliance(null);
    }
  }, [token]);

  const fetchOfficers = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getJson<{ officers: Officer[] }>('/officers/list', token);
      setOfficers(data.officers ?? []);
    } catch {
      setOfficers([]);
    }
  }, [token]);

  useEffect(() => {
    fetchCertifications();
    fetchOfficers();
  }, [fetchCertifications, fetchOfficers]);

  useEffect(() => {
    if (activeTab === 'compliance') fetchCompliance();
  }, [activeTab, fetchCompliance]);

  const openAdd = () => {
    setError(null);
    setFormName('');
    setFormDescription('');
    setFormValidityMonths(12);
    setFormReminderDays(30);
    setEditingCert(null);
    setModalOpen('add');
  };

  const openEdit = (c: Certification) => {
    setError(null);
    setEditingCert(c);
    setFormName(c.name);
    setFormDescription(c.description ?? '');
    setFormValidityMonths(c.validity_months);
    setFormReminderDays(c.reminder_days_before);
    setModalOpen('edit');
  };

  const openAssign = (c: Certification) => {
    setError(null);
    setAssignCert(c);
    setAssignOfficerId(null);
    const issued = new Date().toISOString().slice(0, 10);
    const expiry = new Date();
    expiry.setMonth(expiry.getMonth() + c.validity_months);
    setAssignIssuedDate(issued);
    setAssignExpiryDate(expiry.toISOString().slice(0, 10));
    setAssignCertNumber('');
    setAssignIssuedBy('');
    setAssignNotes('');
    setModalOpen('assign');
  };

  const openCreateCertificate = () => {
    setError(null);
    setAssignCert(certifications[0] ?? null);
    setAssignOfficerId(null);
    const issued = new Date().toISOString().slice(0, 10);
    const c = certifications[0];
    const expiry = c ? (() => { const d = new Date(); d.setMonth(d.getMonth() + c.validity_months); return d.toISOString().slice(0, 10); })() : '';
    setAssignIssuedDate(issued);
    setAssignExpiryDate(expiry);
    setAssignCertNumber('');
    setAssignIssuedBy('');
    setAssignNotes('');
    setModalOpen('create');
  };

  const closeModal = () => {
    setModalOpen(null);
    setEditingCert(null);
    setAssignCert(null);
    setError(null);
  };

  const handleSubmitCert = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!formName.trim()) {
      setError('Certification name is required.');
      return;
    }
    if (!token) return;
    try {
      if (modalOpen === 'add') {
        await postJson<{ certification: Certification }>(
          '/certifications',
          {
            name: formName.trim(),
            description: formDescription.trim() || undefined,
            validity_months: formValidityMonths,
            reminder_days_before: formReminderDays,
          },
          token,
        );
      } else if (editingCert) {
        await patchJson<{ certification: Certification }>(
          `/certifications/${editingCert.id}`,
          {
            name: formName.trim(),
            description: formDescription.trim() || null,
            validity_months: formValidityMonths,
            reminder_days_before: formReminderDays,
          },
          token,
        );
      }
      closeModal();
      fetchCertifications();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    }
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!assignCert || !assignOfficerId || !token) return;
    try {
      const res = await postJson<{ assignment: { id: number } }>(
        `/officers/${assignOfficerId}/certifications`,
        {
          certification_id: assignCert.id,
          issued_date: assignIssuedDate,
          expiry_date: assignExpiryDate || undefined,
          certificate_number: assignCertNumber.trim() || undefined,
          issued_by: assignIssuedBy.trim() || undefined,
          notes: assignNotes.trim() || undefined,
        },
        token,
      );
      closeModal();
      fetchCertifications();
      fetchCompliance();
      if (modalOpen === 'create' && res?.assignment?.id) {
        router.push(`/dashboard/certifications/certificate/${res.assignment.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign.');
    }
  };

  const handleDelete = async (id: number) => {
    if (!token) return;
    try {
      await deleteRequest(`/certifications/${id}`, token);
      setDeleteConfirm(null);
      fetchCertifications();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete.');
    }
  };

  return (
    <>
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
        <div className="flex items-center gap-2 text-slate-600">
          <Award className="size-5" />
          <h2 className="font-semibold text-slate-900">Certifications</h2>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black tracking-tight text-slate-900">Certification Management</h1>
              <p className="mt-1 text-slate-500">
                Manage certifications, assign them to officers, and track compliance.
              </p>
            </div>
            {activeTab === 'certifications' && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={openCreateCertificate}
                  disabled={certifications.length === 0 || officers.filter((o) => o.state === 'active').length === 0}
                  className="flex items-center gap-2 rounded-lg bg-[#14B8A6] px-6 py-2.5 text-sm font-bold text-white shadow-sm shadow-[#14B8A6]/20 transition hover:bg-[#13a89a] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FileCheck className="size-5" />
                  Create certificate
                </button>
                <button
                  type="button"
                  onClick={openAdd}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-6 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  <Plus className="size-5" />
                  Add certification type
                </button>
              </div>
            )}
          </div>

          <div className="mt-8 flex gap-1 border-b border-slate-200">
            <button
              type="button"
              onClick={() => setActiveTab('certifications')}
              className={`flex items-center gap-2 rounded-t-lg px-4 py-3 text-sm font-semibold transition ${
                activeTab === 'certifications'
                  ? 'border border-b-0 border-slate-200 border-b-white bg-white text-[#14B8A6]'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Award className="size-4" />
              Certifications
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('compliance')}
              className={`flex items-center gap-2 rounded-t-lg px-4 py-3 text-sm font-semibold transition ${
                activeTab === 'compliance'
                  ? 'border border-b-0 border-slate-200 border-b-white bg-white text-[#14B8A6]'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileBarChart className="size-4" />
              Compliance Report
            </button>
          </div>

          {activeTab === 'certifications' && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-b-xl border border-t-0 border-slate-200 bg-white shadow-sm"
            >
              {certifications.length === 0 ? (
                <div className="px-6 py-12 text-center text-slate-500">
                  No certifications yet. Add one to get started (e.g. OSHA 30, CPR, First Aid).
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {certifications.map((c) => (
                    <div
                      key={c.id}
                      className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-slate-50/50"
                    >
                      <div>
                        <p className="font-semibold text-slate-900">{c.name}</p>
                        <p className="mt-0.5 text-sm text-slate-500">
                          {c.description || 'No description'}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          Valid {c.validity_months} months • Remind {c.reminder_days_before} days before expiry
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openAssign(c)}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Assign to officer
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(c)}
                          className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100"
                          title="Edit"
                        >
                          <Pencil className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirm(c.id)}
                          className="rounded-lg border border-slate-200 p-1.5 text-rose-600 hover:bg-rose-50"
                          title="Delete"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'compliance' && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-b-xl border border-t-0 border-slate-200 bg-white p-6 shadow-sm"
            >
              {!compliance ? (
                <div className="py-12 text-center text-slate-500">Loading compliance report…</div>
              ) : (
                <div className="space-y-8">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4">
                      <div className="flex items-center gap-2 text-rose-700">
                        <AlertTriangle className="size-5" />
                        <span className="font-bold">Expired</span>
                      </div>
                      <p className="mt-1 text-2xl font-black text-rose-800">{compliance.summary.expired_count}</p>
                      <p className="text-xs text-rose-600">Requires renewal</p>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                      <div className="flex items-center gap-2 text-amber-700">
                        <Clock className="size-5" />
                        <span className="font-bold">Expiring soon</span>
                      </div>
                      <p className="mt-1 text-2xl font-black text-amber-800">{compliance.summary.expiring_soon_count}</p>
                      <p className="text-xs text-amber-600">Within reminder window</p>
                    </div>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                      <div className="flex items-center gap-2 text-emerald-700">
                        <CheckCircle className="size-5" />
                        <span className="font-bold">Valid</span>
                      </div>
                      <p className="mt-1 text-2xl font-black text-emerald-800">{compliance.summary.valid_count}</p>
                      <p className="text-xs text-emerald-600">Up to date</p>
                    </div>
                  </div>

                  {compliance.expired.length > 0 && (
                    <div>
                      <h3 className="mb-3 font-semibold text-rose-800">Expired certifications</h3>
                      <div className="overflow-hidden rounded-lg border border-rose-100">
                        <table className="w-full text-sm">
                          <thead className="bg-rose-50">
                            <tr>
                              <th className="px-4 py-2 text-left font-semibold text-rose-800">Officer</th>
                              <th className="px-4 py-2 text-left font-semibold text-rose-800">Certification</th>
                              <th className="px-4 py-2 text-left font-semibold text-rose-800">Expired</th>
                              <th className="px-4 py-2 text-right font-semibold text-rose-800">Days overdue</th>
                              <th className="px-4 py-2 text-right font-semibold text-rose-800"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-rose-100">
                            {compliance.expired.map((item) => (
                              <tr key={item.id} className="bg-white">
                                <td className="px-4 py-2">{item.officer_name}</td>
                                <td className="px-4 py-2">{item.certification_name}</td>
                                <td className="px-4 py-2">{formatDate(item.expiry_date)}</td>
                                <td className="px-4 py-2 text-right font-medium text-rose-700">
                                  {(item as { days_overdue?: number }).days_overdue ?? 0} days
                                </td>
                                <td className="px-4 py-2 text-right">
                                  <Link href={`/dashboard/certifications/certificate/${item.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-[#14B8A6]">
                                    <Printer className="size-3" /> Print
                                  </Link>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {compliance.expiring_soon.length > 0 && (
                    <div>
                      <h3 className="mb-3 font-semibold text-amber-800">Expiring soon (renewal reminders)</h3>
                      <div className="overflow-hidden rounded-lg border border-amber-100">
                        <table className="w-full text-sm">
                          <thead className="bg-amber-50">
                            <tr>
                              <th className="px-4 py-2 text-left font-semibold text-amber-800">Officer</th>
                              <th className="px-4 py-2 text-left font-semibold text-amber-800">Certification</th>
                              <th className="px-4 py-2 text-left font-semibold text-amber-800">Expires</th>
                              <th className="px-4 py-2 text-right font-semibold text-amber-800">Days left</th>
                              <th className="px-4 py-2 text-right font-semibold text-amber-800"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-amber-100">
                            {compliance.expiring_soon.map((item) => (
                              <tr key={item.id} className="bg-white">
                                <td className="px-4 py-2">{item.officer_name}</td>
                                <td className="px-4 py-2">{item.certification_name}</td>
                                <td className="px-4 py-2">{formatDate(item.expiry_date)}</td>
                                <td className="px-4 py-2 text-right font-medium text-amber-700">
                                  {(item as { days_remaining?: number }).days_remaining ?? 0} days
                                </td>
                                <td className="px-4 py-2 text-right">
                                  <Link href={`/dashboard/certifications/certificate/${item.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-[#14B8A6]">
                                    <Printer className="size-3" /> Print
                                  </Link>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {compliance.valid.length > 0 && (
                    <div>
                      <h3 className="mb-3 font-semibold text-emerald-800">Valid certifications</h3>
                      <div className="overflow-hidden rounded-lg border border-emerald-100">
                        <table className="w-full text-sm">
                          <thead className="bg-emerald-50">
                            <tr>
                              <th className="px-4 py-2 text-left font-semibold text-emerald-800">Officer</th>
                              <th className="px-4 py-2 text-left font-semibold text-emerald-800">Certification</th>
                              <th className="px-4 py-2 text-left font-semibold text-emerald-800">Expires</th>
                              <th className="px-4 py-2 text-right font-semibold text-emerald-800"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-emerald-100">
                            {compliance.valid.map((item) => (
                              <tr key={item.id} className="bg-white">
                                <td className="px-4 py-2">{item.officer_name}</td>
                                <td className="px-4 py-2">{item.certification_name}</td>
                                <td className="px-4 py-2">{formatDate(item.expiry_date)}</td>
                                <td className="px-4 py-2 text-right">
                                  <Link href={`/dashboard/certifications/certificate/${item.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-[#14B8A6]">
                                    <Printer className="size-3" /> Print
                                  </Link>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {compliance.expired.length === 0 && compliance.expiring_soon.length === 0 && compliance.valid.length === 0 && (
                    <p className="text-center text-slate-500">No certifications assigned yet. Assign certifications to officers to see them here.</p>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>

      {/* Add/Edit modal */}
      {(modalOpen === 'add' || modalOpen === 'edit') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={closeModal}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-slate-900">{modalOpen === 'add' ? 'Add certification type' : 'Edit certification type'}</h3>
            <p className="mt-1 text-sm text-slate-500">
              {modalOpen === 'add' ? 'Define a certification (e.g. OSHA 30, CPR) that you can issue to officers.' : ''}
            </p>
            <form onSubmit={handleSubmitCert} className="mt-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Name *</label>
                <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. OSHA 30, CPR, First Aid" className={inputClass} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Description</label>
                <textarea rows={2} value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Brief description" className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Validity (months)</label>
                  <input type="number" min={1} max={120} value={formValidityMonths} onChange={(e) => setFormValidityMonths(parseInt(e.target.value, 10) || 12)} className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Remind (days before)</label>
                  <input type="number" min={0} max={365} value={formReminderDays} onChange={(e) => setFormReminderDays(parseInt(e.target.value, 10) || 30)} className={inputClass} />
                </div>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal} className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="submit" className="flex-1 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#13a89a]">Save</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Assign / Create certificate modal */}
      {(modalOpen === 'assign' || modalOpen === 'create') && (assignCert || modalOpen === 'create') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={closeModal}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-slate-900">
              {modalOpen === 'create' ? 'Create certificate' : `Assign "${assignCert?.name}" to officer`}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {modalOpen === 'create' ? 'Issue a certificate to an officer. The certificate document will open after saving.' : ''}
            </p>
            <form onSubmit={handleAssign} className="mt-6 space-y-4">
              {modalOpen === 'create' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700">Certification type *</label>
                  <select
                    value={assignCert?.id ?? ''}
                    onChange={(e) => {
                      const c = certifications.find((x) => x.id === parseInt(e.target.value, 10));
                      if (c) {
                        setAssignCert(c);
                        const exp = new Date();
                        exp.setMonth(exp.getMonth() + c.validity_months);
                        setAssignExpiryDate(exp.toISOString().slice(0, 10));
                      }
                    }}
                    className={inputClass}
                    required
                  >
                    <option value="">Select certification</option>
                    {certifications.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700">Officer *</label>
                <select value={assignOfficerId ?? ''} onChange={(e) => setAssignOfficerId(e.target.value ? parseInt(e.target.value, 10) : null)} className={inputClass} required>
                  <option value="">Select officer</option>
                  {officers.filter((o) => o.state === 'active').map((o) => (
                    <option key={o.id} value={o.id}>{o.full_name} {o.department ? `(${o.department})` : ''}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Issued date</label>
                  <input type="date" value={assignIssuedDate} onChange={(e) => setAssignIssuedDate(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Expiry date</label>
                  <input type="date" value={assignExpiryDate} onChange={(e) => setAssignExpiryDate(e.target.value)} className={inputClass} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Certificate number</label>
                <input type="text" value={assignCertNumber} onChange={(e) => setAssignCertNumber(e.target.value)} placeholder="Optional" className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Issued by</label>
                <input type="text" value={assignIssuedBy} onChange={(e) => setAssignIssuedBy(e.target.value)} placeholder="e.g. OSHA, Red Cross" className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Notes</label>
                <textarea rows={2} value={assignNotes} onChange={(e) => setAssignNotes(e.target.value)} placeholder="Optional notes for the certificate" className={inputClass} />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal} className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="submit" className="flex-1 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#13a89a]">
                  {modalOpen === 'create' ? 'Create & view certificate' : 'Assign'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setDeleteConfirm(null)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-semibold text-slate-900">Delete this certification?</p>
            <p className="mt-1 text-sm text-slate-500">Officer assignments will also be removed.</p>
            <div className="mt-6 flex gap-3">
              <button type="button" onClick={() => setDeleteConfirm(null)} className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
              <button type="button" onClick={() => handleDelete(deleteConfirm)} className="flex-1 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700">Delete</button>
            </div>
          </motion.div>
        </div>
      )}
    </>
  );
}
