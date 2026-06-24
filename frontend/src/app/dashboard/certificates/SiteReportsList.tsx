'use client';

import { useCallback, useEffect, useState } from 'react';
import { deleteRequest, getJson, postJson } from '../../apiClient';
import { Loader2, Plus, Trash2, X, MoreVertical, Copy, Edit2 } from 'lucide-react';
import dayjs from 'dayjs';
import Link from 'next/link';
import CustomerSiteReportTab from '../customers/[id]/CustomerSiteReportTab';
import { formatSiteReportJobRef, SITE_REPORT_TABLE_HEAD } from './siteReportTableUtils';
import EditSiteReportDetailsModal from './components/EditSiteReportDetailsModal';

interface SiteReportRow {
  id: number;
  template_id: number | null;
  template_name: string | null;
  report_title: string | null;
  updated_at: string;
  created_at: string;
  certificate_number: string | null;
  job_id: number | null;
  job_number?: string | null;
  customer_id: number;
  customer_full_name: string | null;
  work_address_id: number | null;
  work_address_name: string | null;
  installation_label?: string | null;
}

interface CustomerOption {
  id: number;
  full_name: string;
}

interface TemplateOption {
  id: number;
  name: string;
}

interface Props {
  token: string;
}

export default function SiteReportsList({ token }: Props) {
  const [reports, setReports] = useState<SiteReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<SiteReportRow | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [rowMenuId, setRowMenuId] = useState<number | null>(null);
  const [rowMenuPosition, setRowMenuPosition] = useState({ top: 0, left: 0 });
  const [editDetailsOpen, setEditDetailsOpen] = useState(false);
  const [editReport, setEditReport] = useState<SiteReportRow | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<number | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [createCustomerId, setCreateCustomerId] = useState('');
  const [createTemplateId, setCreateTemplateId] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [workAddresses, setWorkAddresses] = useState<{ id: number; label: string }[]>([]);
  const [createWorkAddressId, setCreateWorkAddressId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getJson<{ reports: SiteReportRow[] }>('/site-reports', token);
      setReports(res.reports || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load site reports');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!token || !createCustomerId) {
      setWorkAddresses([]);
      setCreateWorkAddressId('');
      return;
    }
    getJson<{
      work_addresses: {
        id: number;
        name: string;
        address_line_1?: string | null;
        town?: string | null;
        postcode?: string | null;
      }[];
    }>(`/customers/${createCustomerId}/work-addresses?status=active`, token)
      .then((res) => {
        const list = res.work_addresses || [];
        const formatted = list.map((w) => {
          const addr = [w.address_line_1, w.town, w.postcode]
            .filter((x): x is string => Boolean(x && String(x).trim()))
            .join(', ');
          const label = [w.name?.trim() || `Site #${w.id}`, addr].filter(Boolean).join(' — ');
          return { id: w.id, label };
        });
        setWorkAddresses(formatted);
        setCreateWorkAddressId('');
      })
      .catch((err) => {
        console.error('Failed to load work addresses:', err);
        setWorkAddresses([]);
        setCreateWorkAddressId('');
      });
  }, [createCustomerId, token]);

  const openCreate = async () => {
    setCreateOpen(true);
    setCreateError(null);
    try {
      const [cRes, tRes] = await Promise.all([
        getJson<{ customers: CustomerOption[] }>('/customers?limit=100', token),
        getJson<{ templates: TemplateOption[] }>('/settings/site-report-templates', token),
      ]);
      const cList = cRes.customers || [];
      const tList = tRes.templates || [];
      setCustomers(cList);
      setTemplates(tList);
      setCreateCustomerId(cList[0] ? String(cList[0].id) : '');
      setCreateTemplateId(tList[0] ? String(tList[0].id) : '');
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : 'Failed to load options');
    }
  };

  const handleCreate = async () => {
    if (!createCustomerId || !createTemplateId) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await postJson<{ report: { id: number; customer_id: number; template_id: number; report_title: string | null; updated_at: string; created_at: string; work_address_id?: number | null } }>(
        `/customers/${createCustomerId}/site-reports`,
        { template_id: Number(createTemplateId), work_address_id: createWorkAddressId ? Number(createWorkAddressId) : null, job_id: null },
        token,
      );
      const newReport = res.report;
      setCreateOpen(false);
      await load();
      // Find the customer name for display
      const customer = customers.find((c) => c.id === newReport.customer_id);
      const workAddress = workAddresses.find((w) => w.id === newReport.work_address_id);
      setSelectedReport({
        id: newReport.id,
        customer_id: newReport.customer_id,
        customer_full_name: customer?.full_name || null,
        template_id: newReport.template_id,
        template_name: templates.find((t) => t.id === newReport.template_id)?.name || null,
        report_title: newReport.report_title,
        updated_at: newReport.updated_at,
        created_at: newReport.created_at,
        certificate_number: null,
        job_id: null,
        work_address_id: newReport.work_address_id ?? null,
        work_address_name: workAddress ? workAddress.label : null,
      });
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create report');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (report: SiteReportRow) => {
    const title = report.report_title || report.template_name || `Report #${report.id}`;
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setDeletingId(report.id);
    setError(null);
    try {
      await deleteRequest(`/customers/${report.customer_id}/site-report/${report.id}`, token);
      setReports((prev) => prev.filter((r) => r.id !== report.id));
      if (selectedReport?.id === report.id) setSelectedReport(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete site report');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDuplicate = async (report: SiteReportRow) => {
    if (!token) return;
    setDuplicatingId(report.id);
    try {
      await postJson(
        `/customers/${report.customer_id}/site-report/${report.id}/duplicate`,
        {},
        token,
      );
      setRowMenuId(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to duplicate site report');
    } finally {
      setDuplicatingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm font-medium text-slate-500">
        <Loader2 className="size-5 animate-spin" />
        Loading site reports…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>
    );
  }

  if (selectedReport) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <CustomerSiteReportTab
          customerId={String(selectedReport.customer_id)}
          workAddressId={selectedReport.work_address_id ? String(selectedReport.work_address_id) : undefined}
          clientDisplayName={selectedReport.customer_full_name || 'Client'}
          siteAddressLabel={selectedReport.work_address_name || 'No address'}
          jobId={selectedReport.job_id ? String(selectedReport.job_id) : null}
          initialReportId={selectedReport.id}
          onBack={() => setSelectedReport(null)}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-black tracking-tight text-slate-900">Site Reports</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            All site reports and certificates (FRA, Fire Risk Assessments, etc.) across clients.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void openCreate()}
          className="inline-flex items-center gap-2 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-[#119f8e]"
        >
          <Plus className="size-4" />
          Create new report
        </button>
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Create new report</h3>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="size-5" />
              </button>
            </div>
            <p className="mt-1 text-sm text-slate-500">Select a client and template to start a draft report.</p>

            {createError && (
              <p className="mt-3 text-sm text-rose-600">{createError}</p>
            )}

            <label className="mt-5 block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Client</span>
              <select
                value={createCustomerId}
                onChange={(e) => setCreateCustomerId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.full_name}</option>
                ))}
              </select>
            </label>

            {workAddresses.length > 0 && (
              <label className="mt-4 block">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Installation address (optional)</span>
                <select
                  value={createWorkAddressId}
                  onChange={(e) => setCreateWorkAddressId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
                >
                  <option value="">No site address selected</option>
                  {workAddresses.map((w) => (
                    <option key={w.id} value={w.id}>{w.label}</option>
                  ))}
                </select>
              </label>
            )}

            <label className="mt-4 block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Template</span>
              <select
                value={createTemplateId}
                onChange={(e) => setCreateTemplateId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={creating || !createCustomerId || !createTemplateId}
                onClick={() => void handleCreate()}
                className="flex-1 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-bold text-white hover:bg-[#119f8e] disabled:opacity-50"
              >
                {creating ? <Loader2 className="mx-auto size-4 animate-spin" /> : 'Create draft'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className={SITE_REPORT_TABLE_HEAD}>
            <tr>
              <th className="px-4 py-3">Report</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Installation</th>
              <th className="px-4 py-3">Job</th>
              <th className="px-4 py-3">Template</th>
              <th className="px-4 py-3">Certificate</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {reports.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                  No site reports yet. Create your first report above.
                </td>
              </tr>
            ) : (
              reports.map((r) => (
                <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/80">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">
                      {r.report_title || r.template_name || `Report #${r.id}`}
                    </p>
                    <p className="text-xs text-slate-500">
                      Created {dayjs(r.created_at).format('D MMM YYYY HH:mm')}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/customers/${r.customer_id}`}
                      className="font-semibold text-[#14B8A6] hover:text-[#119f8e] hover:underline"
                    >
                      {r.customer_full_name || '—'}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {r.installation_label?.trim() || r.work_address_name?.trim() || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {r.job_id ? (
                      <Link
                        href={`/dashboard/jobs/${r.job_id}`}
                        className="font-mono text-xs font-semibold text-[#14B8A6] hover:underline"
                      >
                        {formatSiteReportJobRef(r.job_number, r.job_id)}
                      </Link>
                    ) : (
                      formatSiteReportJobRef(r.job_number, r.job_id)
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.template_name || '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {r.certificate_number || 'Draft'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {dayjs(r.updated_at).format('D MMM YYYY HH:mm')}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    <div className="relative inline-flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedReport(r)}
                        className="font-bold text-[#14B8A6] hover:text-[#119f8e] hover:underline"
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setRowMenuPosition({
                            top: rect.bottom + 6,
                            left: Math.max(8, rect.right - 180),
                          });
                          setRowMenuId((id) => (id === r.id ? null : r.id));
                        }}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                        aria-label="More actions"
                      >
                        <MoreVertical className="size-4" />
                      </button>
                      {rowMenuId === r.id && (
                        <ul
                          className="fixed z-[100] min-w-[180px] rounded-lg border border-slate-200 bg-white py-1 text-left shadow-lg"
                          style={{ top: rowMenuPosition.top, left: rowMenuPosition.left }}
                        >
                          <li>
                            <button
                              type="button"
                              disabled={duplicatingId === r.id}
                              onClick={() => void handleDuplicate(r)}
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50 font-sans text-slate-700"
                            >
                              <Copy className="size-4 text-slate-500" /> Copy
                            </button>
                          </li>
                          <li>
                            <button
                              type="button"
                              onClick={() => {
                                setEditReport(r);
                                setEditDetailsOpen(true);
                                setRowMenuId(null);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 font-sans text-slate-700"
                            >
                              <Edit2 className="size-4 text-slate-500" /> Edit client & site
                            </button>
                          </li>
                          <li className="my-1 border-t border-slate-100" />
                          <li>
                            <button
                              type="button"
                              disabled={deletingId === r.id}
                              onClick={() => void handleDelete(r)}
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 disabled:opacity-50 font-sans"
                            >
                              <Trash2 className="size-4" /> Delete
                            </button>
                          </li>
                        </ul>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editReport && (
        <EditSiteReportDetailsModal
          open={editDetailsOpen}
          token={token}
          reportId={editReport.id}
          initialCustomerId={editReport.customer_id}
          initialWorkAddressId={editReport.work_address_id}
          initialJobId={editReport.job_id}
          initialReportTitle={editReport.report_title}
          onClose={() => {
            setEditDetailsOpen(false);
            setEditReport(null);
          }}
          onSaved={() => {
            void load();
          }}
        />
      )}
    </div>
  );
}
