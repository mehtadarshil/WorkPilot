export function formatSiteReportJobRef(
  jobNumber: string | null | undefined,
  jobId: number | null | undefined,
): string {
  if (jobNumber?.trim()) return jobNumber.trim();
  if (jobId != null && Number.isFinite(jobId)) return `#${String(jobId).padStart(4, '0')}`;
  return '—';
}

export const SITE_REPORT_TABLE_HEAD =
  'border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500';
