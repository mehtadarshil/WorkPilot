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

  await splitCombinedDiaryEventsForJob(db, jobId);

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
  try {
    await splitCombinedDiaryEventsInRange(db, rangeStart, rangeEnd, {
      tenantUserId: opts.tenantUserId,
      isSuperAdmin: opts.isSuperAdmin,
      officerId: opts.officerId ?? null,
    });
  } catch (splitErr) {
    console.error('splitCombinedDiaryEventsInRange:', splitErr);
  }

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
      await splitCombinedDiaryEventsForJob(db, r.id);
      await ensureDiaryEventsForScheduledJob(db, r.id, creator);
    } catch (err) {
      console.error(`ensureDiaryEventsForScheduledJob job ${r.id}:`, err);
    }
  }
}

export { isInactiveDiaryStatus };

/**
 * Split a legacy diary visit that has multiple engineers into one visit row per engineer.
 * Each engineer then has independent status, timesheet, and job report.
 */
export async function splitCombinedDiaryEvent(db: Db, diaryEventId: number): Promise<number[]> {
  const officersRes = await db.query<{ officer_id: number; is_primary: boolean; status: string | null }>(
    `SELECT officer_id, is_primary, status
     FROM diary_event_officers
     WHERE diary_event_id = $1
     ORDER BY is_primary DESC, officer_id`,
    [diaryEventId],
  );
  if (officersRes.rows.length <= 1) return [diaryEventId];

  const eventRes = await db.query<{
    job_id: number;
    officer_id: number | null;
    start_time: Date;
    duration_minutes: number | null;
    notes: string | null;
    created_by_name: string | null;
    status: string | null;
    abort_reason: string | null;
  }>(
    `SELECT job_id, officer_id, start_time, duration_minutes, notes, created_by_name, status, abort_reason
     FROM diary_events WHERE id = $1`,
    [diaryEventId],
  );
  if ((eventRes.rowCount ?? 0) === 0) return [diaryEventId];
  const base = eventRes.rows[0];
  const sharedStatus = base.status;
  const resultIds: number[] = [];

  for (let i = 0; i < officersRes.rows.length; i++) {
    const { officer_id: oid, status: officerStatus } = officersRes.rows[i];
    const effectiveStatus = (officerStatus && String(officerStatus).trim()) || (i === 0 ? sharedStatus : null) || 'No status';

    if (i === 0) {
      await db.query(
        `UPDATE diary_events
         SET officer_id = $1, status = $2, updated_at = NOW()
         WHERE id = $3`,
        [oid, effectiveStatus, diaryEventId],
      );
      await db.query(`DELETE FROM diary_event_officers WHERE diary_event_id = $1`, [diaryEventId]);
      await db.query(
        `INSERT INTO diary_event_officers (diary_event_id, officer_id, is_primary, status)
         VALUES ($1, $2, true, $3)
         ON CONFLICT (diary_event_id, officer_id) DO UPDATE SET is_primary = true, status = EXCLUDED.status`,
        [diaryEventId, oid, effectiveStatus],
      );
      resultIds.push(diaryEventId);
      continue;
    }

    const ins = await db.query<{ id: number }>(
      `INSERT INTO diary_events (job_id, officer_id, start_time, duration_minutes, notes, created_by_name, status, abort_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        base.job_id,
        oid,
        base.start_time,
        base.duration_minutes ?? 60,
        base.notes,
        base.created_by_name,
        effectiveStatus,
        i === 0 ? base.abort_reason : null,
      ],
    );
    const newId = Number(ins.rows[0].id);
    await db.query(
      `INSERT INTO diary_event_officers (diary_event_id, officer_id, is_primary, status)
       VALUES ($1, $2, false, $3)
       ON CONFLICT (diary_event_id, officer_id) DO NOTHING`,
      [newId, oid, effectiveStatus],
    );

    await db.query(
      `UPDATE timesheet_entries SET diary_event_id = $1, updated_at = NOW()
       WHERE diary_event_id = $2 AND officer_id = $3`,
      [newId, diaryEventId, oid],
    );
    await db.query(
      `UPDATE diary_event_status_logs SET diary_event_id = $1
       WHERE diary_event_id = $2 AND officer_id = $3`,
      [newId, diaryEventId, oid],
    );

    resultIds.push(newId);
  }

  return resultIds;
}

export async function splitCombinedDiaryEventsForJob(db: Db, jobId: number): Promise<void> {
  const combined = await db.query<{ id: number }>(
    `SELECT d.id FROM diary_events d
     WHERE d.job_id = $1
       AND (SELECT COUNT(*)::int FROM diary_event_officers deo WHERE deo.diary_event_id = d.id) > 1`,
    [jobId],
  );
  for (const row of combined.rows) {
    try {
      await splitCombinedDiaryEvent(db, row.id);
    } catch (err) {
      console.error(`splitCombinedDiaryEvent ${row.id}:`, err);
    }
  }
}

export async function splitCombinedDiaryEventsInRange(
  db: Db,
  rangeStart: string,
  rangeEnd: string,
  opts: { tenantUserId: number | null; isSuperAdmin: boolean; officerId?: number | null },
): Promise<void> {
  const params: unknown[] = [rangeStart, rangeEnd];
  let idx = 3;
  let where = `d.start_time >= $1::timestamptz AND d.start_time <= $2::timestamptz
       AND (SELECT COUNT(*)::int FROM diary_event_officers deo WHERE deo.diary_event_id = d.id) > 1`;

  if (!opts.isSuperAdmin && opts.tenantUserId != null) {
    where += ` AND EXISTS (SELECT 1 FROM jobs j WHERE j.id = d.job_id AND j.created_by = $${idx++})`;
    params.push(opts.tenantUserId);
  }
  if (opts.officerId != null && Number.isFinite(opts.officerId)) {
    where += ` AND EXISTS (
      SELECT 1 FROM diary_event_officers deo2
      WHERE deo2.diary_event_id = d.id AND deo2.officer_id = $${idx}
    )`;
    params.push(opts.officerId);
    idx += 1;
  }

  const combined = await db.query<{ id: number }>(`SELECT d.id FROM diary_events d WHERE ${where}`, params);
  for (const row of combined.rows) {
    try {
      await splitCombinedDiaryEvent(db, row.id);
    } catch (err) {
      console.error(`splitCombinedDiaryEvent ${row.id}:`, err);
    }
  }
}

export async function diaryEventHasMultipleOfficersDb(db: Db, diaryEventId: number): Promise<boolean> {
  const r = await db.query<{ c: number }>(
    `SELECT COUNT(*)::int AS c FROM diary_event_officers WHERE diary_event_id = $1`,
    [diaryEventId],
  );
  return (r.rows[0]?.c ?? 0) > 1;
}

/**
 * Split legacy combined visits and return the diary row for the acting engineer.
 * When Ricky opens Manesh's visit id, this resolves to Ricky's own row.
 */
export async function resolveActingDiaryEventId(
  db: Db,
  diaryEventId: number,
  officerId: number,
): Promise<number> {
  if (!Number.isFinite(officerId)) return diaryEventId;
  if (await diaryEventHasMultipleOfficersDb(db, diaryEventId)) {
    await splitCombinedDiaryEvent(db, diaryEventId);
    return resolveDiaryEventIdForOfficer(db, diaryEventId, officerId);
  }
  const cur = await db.query<{ officer_id: number | null }>(
    `SELECT officer_id FROM diary_events WHERE id = $1`,
    [diaryEventId],
  );
  if ((cur.rowCount ?? 0) === 0) return diaryEventId;
  const assignedOid = cur.rows[0].officer_id;
  if (assignedOid != null && assignedOid !== officerId) {
    return resolveDiaryEventIdForOfficer(db, diaryEventId, officerId);
  }
  return diaryEventId;
}

export async function resolveDiaryEventIdForOfficer(
  db: Db,
  diaryEventId: number,
  officerId: number,
): Promise<number> {
  const base = await db.query<{ job_id: number; start_time: Date }>(
    `SELECT job_id, start_time FROM diary_events WHERE id = $1`,
    [diaryEventId],
  );
  if ((base.rowCount ?? 0) === 0) return diaryEventId;
  const { job_id, start_time } = base.rows[0];
  const match = await db.query<{ id: number }>(
    `SELECT id FROM diary_events
     WHERE job_id = $1 AND officer_id = $2
       AND ABS(EXTRACT(EPOCH FROM (start_time - $3::timestamptz))) < 120
     ORDER BY id ASC
     LIMIT 1`,
    [job_id, officerId, start_time],
  );
  return match.rows[0]?.id ?? diaryEventId;
}
