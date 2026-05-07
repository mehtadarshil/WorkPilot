'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  ExternalLink,
  ListFilter,
  Printer,
  X,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { getJson } from '../../apiClient';

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

interface ComplianceReportRow {
  certification_id: number;
  name: string;
  description: string | null;
  validity_months: number;
  reminder_days_before: number;
  submission_count: number;
  expired_count: number;
  expiring_soon_count: number;
  valid_count: number;
}

interface ComplianceSubmissionRow {
  id: number;
  officer_id: number;
  officer_name: string;
  officer_email: string | null;
  certification_id: number;
  certification_name: string;
  issued_date: string;
  expiry_date: string;
  certificate_number: string | null;
  status: 'valid' | 'expiring_soon' | 'expired';
  created_at: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const statusBadge: Record<ComplianceSubmissionRow['status'], { label: string; className: string }> = {
  expired: { label: 'Expired', className: 'bg-rose-100 text-rose-800 ring-rose-200' },
  expiring_soon: { label: 'Expiring soon', className: 'bg-amber-100 text-amber-900 ring-amber-200' },
  valid: { label: 'Valid', className: 'bg-emerald-100 text-emerald-900 ring-emerald-200' },
};

export function CertificationsComplianceSection({ token }: { token: string | null }) {
  const [compliance, setCompliance] = useState<ComplianceReport | null>(null);
  const [hubLoading, setHubLoading] = useState(true);
  const [reports, setReports] = useState<ComplianceReportRow[]>([]);
  const [submissions, setSubmissions] = useState<ComplianceSubmissionRow[]>([]);
  const [filterCertificationId, setFilterCertificationId] = useState<number | null>(null);

  const fetchCompliance = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getJson<ComplianceReport>('/certifications/compliance', token);
      setCompliance(data);
    } catch {
      setCompliance(null);
    }
  }, [token]);

  const fetchHub = useCallback(async () => {
    if (!token) return;
    setHubLoading(true);
    try {
      const data = await getJson<{ reports: ComplianceReportRow[]; submissions: ComplianceSubmissionRow[] }>(
        '/certifications/compliance-hub',
        token,
      );
      setReports(data.reports ?? []);
      setSubmissions(data.submissions ?? []);
    } catch {
      setReports([]);
      setSubmissions([]);
    } finally {
      setHubLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchCompliance();
    fetchHub();
  }, [fetchCompliance, fetchHub]);

  const filteredSubmissions = useMemo(() => {
    if (filterCertificationId == null) return submissions;
    return submissions.filter((s) => s.certification_id === filterCertificationId);
  }, [submissions, filterCertificationId]);

  const activeReportName = filterCertificationId != null ? reports.find((r) => r.certification_id === filterCertificationId)?.name : null;

  return (
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

          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-slate-900">Reports</h3>
              <p className="text-xs text-slate-500">Certification types and how many issued certificates (submissions) sit in each status.</p>
            </div>
            {hubLoading ? (
              <p className="text-sm text-slate-500">Loading reports…</p>
            ) : reports.length === 0 ? (
              <p className="text-sm text-slate-500">No certification types defined yet.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-2 text-left font-semibold text-slate-700">Report</th>
                      <th className="px-4 py-2 text-right font-semibold text-slate-700">Submissions</th>
                      <th className="px-4 py-2 text-right font-semibold text-rose-700">Expired</th>
                      <th className="px-4 py-2 text-right font-semibold text-amber-800">Expiring</th>
                      <th className="px-4 py-2 text-right font-semibold text-emerald-800">Valid</th>
                      <th className="px-4 py-2 text-right font-semibold text-slate-700"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reports.map((r) => (
                      <tr key={r.certification_id} className="bg-white">
                        <td className="px-4 py-2">
                          <p className="font-medium text-slate-900">{r.name}</p>
                          {r.description && <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{r.description}</p>}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-700">{r.submission_count}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-rose-700">{r.expired_count}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-amber-800">{r.expiring_soon_count}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-emerald-800">{r.valid_count}</td>
                        <td className="px-4 py-2 text-right">
                          {r.submission_count > 0 ? (
                            <button
                              type="button"
                              onClick={() => setFilterCertificationId((cur) => (cur === r.certification_id ? null : r.certification_id))}
                              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition ${
                                filterCertificationId === r.certification_id
                                  ? 'bg-[#14B8A6] text-white'
                                  : 'text-[#14B8A6] hover:bg-teal-50'
                              }`}
                            >
                              <ListFilter className="size-3.5" />
                              {filterCertificationId === r.certification_id ? 'Showing' : 'Submissions'}
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-slate-900">All submissions</h3>
              {filterCertificationId != null && activeReportName && (
                <button
                  type="button"
                  onClick={() => setFilterCertificationId(null)}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  Filter: {activeReportName}
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            {hubLoading ? (
              <p className="text-sm text-slate-500">Loading submissions…</p>
            ) : filteredSubmissions.length === 0 ? (
              <p className="text-sm text-slate-500">
                {submissions.length === 0
                  ? 'No certifications assigned yet. Assign certifications to users to see them here.'
                  : 'No submissions for this report filter.'}
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-2 text-left font-semibold text-slate-700">User</th>
                      <th className="px-4 py-2 text-left font-semibold text-slate-700">Report</th>
                      <th className="px-4 py-2 text-left font-semibold text-slate-700">Issued</th>
                      <th className="px-4 py-2 text-left font-semibold text-slate-700">Expires</th>
                      <th className="px-4 py-2 text-left font-semibold text-slate-700">Status</th>
                      <th className="px-4 py-2 text-right font-semibold text-slate-700"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredSubmissions.map((s) => (
                      <tr key={s.id} className="bg-white">
                        <td className="px-4 py-2">
                          <p className="font-medium text-slate-900">{s.officer_name}</p>
                          {s.officer_email && <p className="text-xs text-slate-500">{s.officer_email}</p>}
                        </td>
                        <td className="px-4 py-2 text-slate-800">{s.certification_name}</td>
                        <td className="px-4 py-2 text-slate-600">{formatDate(s.issued_date)}</td>
                        <td className="px-4 py-2 text-slate-600">{formatDate(s.expiry_date)}</td>
                        <td className="px-4 py-2">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${statusBadge[s.status].className}`}>
                            {statusBadge[s.status].label}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Link
                            href={`/dashboard/certifications/certificate/${s.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-[#14B8A6]"
                          >
                            <ExternalLink className="size-3.5" />
                            View
                          </Link>
                          <Link
                            href={`/dashboard/certifications/certificate/${s.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-3 inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-[#14B8A6]"
                          >
                            <Printer className="size-3" />
                            Print
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      )}
    </motion.div>
  );
}
