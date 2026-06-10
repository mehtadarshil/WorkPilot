import type { Pool } from 'pg';

export async function officerAssignedToJob(
  pool: Pool,
  officerId: number,
  jobId: number,
): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM jobs j
     WHERE j.id = $1
       AND (j.officer_id = $2
         OR EXISTS (SELECT 1 FROM job_officers jo WHERE jo.job_id = j.id AND jo.officer_id = $2)
         OR EXISTS (SELECT 1 FROM diary_events d WHERE d.job_id = j.id AND d.officer_id = $2))`,
    [jobId, officerId],
  );
  return (r.rowCount ?? 0) > 0;
}
