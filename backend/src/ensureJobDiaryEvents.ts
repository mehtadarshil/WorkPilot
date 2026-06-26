import type { Pool, PoolClient } from 'pg';

type Db = Pool | PoolClient;

function isInactiveDiaryStatus(status: string | null | undefined): boolean {
  const s = String(status ?? '').toLowerCase().trim();
  return s === 'cancelled' || s === 'aborted';
}

/**
 * Create one diary visit per assigned engineer when a job is scheduled but has no active diary rows.
 * Keeps mobile/web diary in sync with jobs.schedule_start + job_officers.
 */
export async function ensureDiaryEventsForScheduledJob(
  db: Db,
  jobId: number,
  createdByName = 'System',
): Promise<number[]> {
  const job = await db.query<{
    schedule_start: Date | null;
    duration_minutes: number | null;
    scheduling_notes: string | null;
    officer_id: number | null;
    book_into_diary: boolean | null;
    state: string;
  }>(
    `SELECT schedule_start, duration_minutes, scheduling_notes, officer_id, book_into_diary, state
     FROM jobs WHERE id = $1`,
    [jobId],
  );
  if ((job.rowCount ?? 0) === 0) return [];
  const j = job.rows[0];
  if (j.book_into_diary === false) return [];
  if (!j.schedule_start) return [];
  if (j.state === 'completed' || j.state === 'closed') return [];

  const officersRes = await db.query<{ officer_id: number }>(
    `SELECT officer_id FROM job_officers WHERE job_id = $1 ORDER BY is_primary DESC, officer_id`,
    [jobId],
  );
  let officerIds = officersRes.rows.map((r) => r.officer_id);
  if (officerIds.length === 0 && j.officer_id != null) {
    officerIds = [j.officer_id];
  }
  if (officerIds.length === 0) return [];

  const createdIds: number[] = [];
  const startTime = j.schedule_start;
  const duration = j.duration_minutes != null && Number.isFinite(j.duration_minutes) ? j.duration_minutes : 60;
  const notes = j.scheduling_notes;

  for (const oid of officerIds) {
    const existing = await db.query<{ id: number }>(
      `SELECT d.id FROM diary_events d
       WHERE d.job_id = $1
         AND (
           d.officer_id = $2
           OR EXISTS (
             SELECT 1 FROM diary_event_officers deo
             WHERE deo.diary_event_id = d.id AND deo.officer_id = $2
           )
         )
         AND NOT (LOWER(TRIM(COALESCE(d.status, ''))) IN ('cancelled', 'aborted'))
         AND ABS(EXTRACT(EPOCH FROM (d.start_time - $3::timestamptz))) < 300
       LIMIT 1`,
      [jobId, oid, startTime],
    );
    if ((existing.rowCount ?? 0) > 0) {
      createdIds.push(Number(existing.rows[0].id));
      continue;
    }

    const ins = await db.query<{ id: number }>(
      `INSERT INTO diary_events (job_id, officer_id, start_time, duration_minutes, notes, created_by_name, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'No status')
       RETURNING id`,
      [jobId, oid, startTime, duration, notes, createdByName],
    );
    const deId = Number(ins.rows[0].id);
    await db.query(
      `INSERT INTO diary_event_officers (diary_event_id, officer_id, is_primary)
       VALUES ($1, $2, true)
       ON CONFLICT (diary_event_id, officer_id) DO NOTHING`,
      [deId, oid],
    );
    createdIds.push(deId);
  }

  return createdIds;
}

/** Backfill diary visits for scheduled jobs in a calendar range that are missing diary rows. */
export async function ensureDiaryEventsForScheduledJobsInRange(
  db: Db,
  rangeStart: string,
  rangeEnd: string,
  opts: {
    tenantUserId: number | null;
    isSuperAdmin: boolean;
    officerId?: number | null;
    createdByName?: string;
  },
): Promise<void> {
  const params: unknown[] = [rangeStart, rangeEnd];
  let idx = 3;
  let where = `j.schedule_start IS NOT NULL
       AND j.schedule_start >= $1::timestamptz
       AND j.schedule_start <= $2::timestamptz
       AND COALESCE(j.book_into_diary, true) = true
       AND j.state NOT IN ('completed', 'closed')`;

  if (!opts.isSuperAdmin && opts.tenantUserId != null) {
    where += ` AND j.created_by = $${idx++}`;
    params.push(opts.tenantUserId);
  }

  if (opts.officerId != null && Number.isFinite(opts.officerId)) {
    where += ` AND (
      j.officer_id = $${idx}
      OR EXISTS (SELECT 1 FROM job_officers jo WHERE jo.job_id = j.id AND jo.officer_id = $${idx})
    )`;
    params.push(opts.officerId);
    idx += 1;
  }

  where += ` AND NOT EXISTS (
    SELECT 1 FROM diary_events d
    WHERE d.job_id = j.id
      AND NOT (LOWER(TRIM(COALESCE(d.status, ''))) IN ('cancelled', 'aborted'))
  )`;

  const rows = await db.query<{ id: number }>(`SELECT j.id FROM jobs j WHERE ${where}`, params);
  const creator = opts.createdByName?.trim() || 'System';
  for (const r of rows.rows) {
    try {
      await ensureDiaryEventsForScheduledJob(db, r.id, creator);
    } catch (err) {
      console.error(`ensureDiaryEventsForScheduledJob job ${r.id}:`, err);
    }
  }
}

export { isInactiveDiaryStatus };
