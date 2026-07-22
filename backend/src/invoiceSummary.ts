import type { Pool } from 'pg';

export type JobInvoiceSummary = {
  total: number;
  draft: number;
  issued: number;
  awaiting_payment: number;
  paid: number;
  cancelled: number;
  label: string;
};

export function emptyInvoiceSummary(): JobInvoiceSummary {
  return {
    total: 0,
    draft: 0,
    issued: 0,
    awaiting_payment: 0,
    paid: 0,
    cancelled: 0,
    label: '0 invoices',
  };
}

export function formatInvoiceSummaryLabel(s: Omit<JobInvoiceSummary, 'label'>): string {
  if (s.total <= 0) return '0 invoices';
  const parts: string[] = [`${s.total} invoice${s.total === 1 ? '' : 's'}`];
  if (s.draft > 0) parts.push(`${s.draft} draft`);
  if (s.awaiting_payment > 0) parts.push('unpaid');
  else if (s.issued > 0) parts.push('issued');
  else if (s.paid > 0 && s.draft === 0 && s.awaiting_payment === 0 && s.issued === 0) {
    parts.push('paid');
  }
  return parts.join(' · ');
}

export function buildInvoiceSummary(counts: {
  total?: number;
  draft?: number;
  issued?: number;
  awaiting_payment?: number;
  paid?: number;
  cancelled?: number;
}): JobInvoiceSummary {
  const base = {
    total: Number(counts.total) || 0,
    draft: Number(counts.draft) || 0,
    issued: Number(counts.issued) || 0,
    awaiting_payment: Number(counts.awaiting_payment) || 0,
    paid: Number(counts.paid) || 0,
    cancelled: Number(counts.cancelled) || 0,
  };
  return { ...base, label: formatInvoiceSummaryLabel(base) };
}

/** Aggregate invoice status counts for a list of job ids. */
export async function loadInvoiceSummariesByJobIds(
  pool: Pool,
  jobIds: number[],
): Promise<Record<number, JobInvoiceSummary>> {
  const out: Record<number, JobInvoiceSummary> = {};
  for (const id of jobIds) out[id] = emptyInvoiceSummary();
  if (jobIds.length === 0) return out;

  const res = await pool.query<{
    job_id: number;
    total: string;
    draft: string;
    issued: string;
    awaiting_payment: string;
    paid: string;
    cancelled: string;
  }>(
    `SELECT job_id,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE state = 'draft')::int AS draft,
            COUNT(*) FILTER (WHERE state = 'issued')::int AS issued,
            COUNT(*) FILTER (
              WHERE state IN ('pending_payment', 'partially_paid', 'overdue')
            )::int AS awaiting_payment,
            COUNT(*) FILTER (WHERE state = 'paid')::int AS paid,
            COUNT(*) FILTER (WHERE state = 'cancelled')::int AS cancelled
     FROM invoices
     WHERE job_id = ANY($1::int[])
     GROUP BY job_id`,
    [jobIds],
  );

  for (const row of res.rows) {
    out[Number(row.job_id)] = buildInvoiceSummary({
      total: Number(row.total) || 0,
      draft: Number(row.draft) || 0,
      issued: Number(row.issued) || 0,
      awaiting_payment: Number(row.awaiting_payment) || 0,
      paid: Number(row.paid) || 0,
      cancelled: Number(row.cancelled) || 0,
    });
  }
  return out;
}
