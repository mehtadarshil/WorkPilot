import type { Pool, PoolClient } from 'pg';

type Db = Pool | PoolClient;

function isInactiveDiaryStatus(status: string | null | undefined): boolean {
  const s = String(status ?? '').toLowerCase().trim();
  return s === 'cancelled' || s === 'aborted';
}

/** Align jobs.expected_completion and jobs.schedule_start with the best diary visit time. */
export async function syncJobDatesFromDiaryEvents(db: Db, jobId: number): Promise<void> {
  const pick = await db.query<{ start_time: Date }>(
    `SELECT d.start_time
     FROM diary_events d
     WHERE d.job_id = $1
       AND NOT (LOWER(TRIM(COALESCE(d.status, ''))) IN ('cancelled', 'aborted'))
     ORDER BY
       CASE WHEN d.start_time >= NOW() THEN 0 ELSE 1 END ASC,
       CASE WHEN d.start_time >= NOW() THEN d.start_time END ASC NULLS LAST,
       d.start_time DESC
     LIMIT 1`,
    [jobId],
  );
  if ((pick.rowCount ?? 0) === 0) return;
  const startTime = pick.rows[0].start_time;
  await db.query(
    `UPDATE jobs
     SET expected_completion = $1, schedule_start = $1, updated_at = NOW()
     WHERE id = $2`,
    [startTime, jobId],
  );
}

export async function syncJobDatesFromDiaryEventId(db: Db, diaryEventId: number): Promise<void> {
  const row = await db.query<{ job_id: number }>('SELECT job_id FROM diary_events WHERE id = $1', [diaryEventId]);
  if ((row.rowCount ?? 0) === 0) return;
  await syncJobDatesFromDiaryEvents(db, row.rows[0].job_id);
}

export { isInactiveDiaryStatus };
