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

/**
 * Mirror engineers from active diary visits onto jobs.officer_id + job_officers
 * so the Jobs list Assigned column stays in sync after diary booking/reschedule.
 */
export async function syncJobOfficersFromDiaryEvents(db: Db, jobId: number): Promise<void> {
  const officers = await db.query<{ officer_id: number }>(
    `SELECT officer_id
     FROM (
       SELECT officer_id, MAX(primary_rank) AS primary_rank
       FROM (
         SELECT deo.officer_id,
                CASE WHEN deo.is_primary THEN 1 ELSE 0 END AS primary_rank
         FROM diary_event_officers deo
         JOIN diary_events d ON d.id = deo.diary_event_id
         WHERE d.job_id = $1
           AND NOT (LOWER(TRIM(COALESCE(d.status, ''))) IN ('cancelled', 'aborted'))
         UNION ALL
         SELECT d.officer_id, 1 AS primary_rank
         FROM diary_events d
         WHERE d.job_id = $1
           AND d.officer_id IS NOT NULL
           AND NOT (LOWER(TRIM(COALESCE(d.status, ''))) IN ('cancelled', 'aborted'))
       ) x
       GROUP BY officer_id
     ) u
     ORDER BY primary_rank DESC, officer_id`,
    [jobId],
  );

  if ((officers.rowCount ?? 0) === 0) return;

  await db.query(`DELETE FROM job_officers WHERE job_id = $1`, [jobId]);
  for (let i = 0; i < officers.rows.length; i++) {
    await db.query(
      `INSERT INTO job_officers (job_id, officer_id, is_primary) VALUES ($1, $2, $3)`,
      [jobId, officers.rows[i].officer_id, i === 0],
    );
  }
  await db.query(
    `UPDATE jobs SET officer_id = $1, updated_at = NOW() WHERE id = $2`,
    [officers.rows[0].officer_id, jobId],
  );
}

export async function syncJobOfficersFromDiaryEventId(db: Db, diaryEventId: number): Promise<void> {
  const row = await db.query<{ job_id: number }>('SELECT job_id FROM diary_events WHERE id = $1', [diaryEventId]);
  if ((row.rowCount ?? 0) === 0 || row.rows[0].job_id == null) return;
  await syncJobOfficersFromDiaryEvents(db, row.rows[0].job_id);
}

export { isInactiveDiaryStatus };
