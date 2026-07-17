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

  const officersRes = await db.query<{ officer_id: number; is_primary: boolean }>(
    `SELECT officer_id, is_primary FROM job_officers WHERE job_id = $1 ORDER BY is_primary DESC, officer_id`,
    [jobId],
  );
  let officerIds = officersRes.rows.map((r) => r.officer_id);
  const primaryOfficerId =
    officersRes.rows.find((r) => r.is_primary)?.officer_id ?? j.officer_id ?? officerIds[0] ?? null;
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
       VALUES ($1, $2, $3)
       ON CONFLICT (diary_event_id, officer_id) DO UPDATE SET is_primary = EXCLUDED.is_primary`,
      [deId, oid, primaryOfficerId != null && oid === primaryOfficerId],
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

/** Same appointment window for matching sibling engineer visits (hours). */
const SIBLING_VISIT_MATCH_SECONDS = 6 * 60 * 60;

/**
 * Split legacy combined visits and return the diary row for the acting engineer.
 * When Ricky opens Manesh's visit id, this resolves to Ricky's own row.
 * If Ricky is on the job but has no visit yet, creates one at the same schedule.
 */
export async function resolveActingDiaryEventId(
  db: Db,
  diaryEventId: number,
  officerId: number,
): Promise<number> {
  if (!Number.isFinite(officerId)) return diaryEventId;
  if (await diaryEventHasMultipleOfficersDb(db, diaryEventId)) {
    await splitCombinedDiaryEvent(db, diaryEventId);
    const afterSplit = await resolveDiaryEventIdForOfficer(db, diaryEventId, officerId);
    if (afterSplit !== diaryEventId) return afterSplit;
  }
  const cur = await db.query<{
    officer_id: number | null;
    job_id: number;
    start_time: Date;
    duration_minutes: number | null;
    notes: string | null;
    created_by_name: string | null;
    status: string | null;
  }>(
    `SELECT officer_id, job_id, start_time, duration_minutes, notes, created_by_name, status
     FROM diary_events WHERE id = $1`,
    [diaryEventId],
  );
  if ((cur.rowCount ?? 0) === 0) return diaryEventId;
  const row = cur.rows[0];
  if (row.officer_id === officerId) return diaryEventId;

  const existing = await resolveDiaryEventIdForOfficer(db, diaryEventId, officerId);
  if (existing !== diaryEventId) {
    const check = await db.query<{ officer_id: number | null }>(
      `SELECT officer_id FROM diary_events WHERE id = $1`,
      [existing],
    );
    if (check.rows[0]?.officer_id === officerId) return existing;
  }

  // Any open visit for this officer on the job (wider than the sibling time window).
  const openOwn = await db.query<{ id: number }>(
    `SELECT id FROM diary_events
     WHERE job_id = $1 AND officer_id = $2
       AND LOWER(TRIM(REPLACE(COALESCE(status, ''), ' ', '_'))) NOT IN ('completed', 'cancelled', 'aborted')
     ORDER BY ABS(EXTRACT(EPOCH FROM (start_time - $3::timestamptz))) ASC, id ASC
     LIMIT 1`,
    [row.job_id, officerId, row.start_time],
  );
  if ((openOwn.rowCount ?? 0) > 0) return Number(openOwn.rows[0].id);

  // Officer is assigned to the job but has no visit row yet — clone schedule so they can report independently.
  const onJob = await db.query<{ ok: number }>(
    `SELECT 1 AS ok FROM job_officers WHERE job_id = $1 AND officer_id = $2
     UNION ALL
     SELECT 1 AS ok FROM jobs WHERE id = $1 AND officer_id = $2
     LIMIT 1`,
    [row.job_id, officerId],
  );
  if ((onJob.rowCount ?? 0) === 0) return diaryEventId;

  const duration =
    row.duration_minutes != null && Number.isFinite(row.duration_minutes) ? row.duration_minutes : 60;
  const sourceNorm = String(row.status ?? '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_');
  // Only mirror in-progress visit states so a completed colleague visit does not lock the new row.
  const cloneStatus =
    sourceNorm === 'travelling_to_site' || sourceNorm === 'arrived_at_site'
      ? String(row.status).trim()
      : 'No status';
  const ins = await db.query<{ id: number }>(
    `INSERT INTO diary_events (job_id, officer_id, start_time, duration_minutes, notes, created_by_name, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      row.job_id,
      officerId,
      row.start_time,
      duration,
      row.notes,
      row.created_by_name?.trim() || 'System',
      cloneStatus,
    ],
  );
  const newId = Number(ins.rows[0].id);
  await db.query(
    `INSERT INTO diary_event_officers (diary_event_id, officer_id, is_primary)
     VALUES ($1, $2, true)
     ON CONFLICT (diary_event_id, officer_id) DO NOTHING`,
    [newId, officerId],
  );
  return newId;
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
       AND ABS(EXTRACT(EPOCH FROM (start_time - $3::timestamptz))) < $4
     ORDER BY id ASC
     LIMIT 1`,
    [job_id, officerId, start_time, SIBLING_VISIT_MATCH_SECONDS],
  );
  return match.rows[0]?.id ?? diaryEventId;
}

export type AppointmentSiblingVisit = {
  id: number;
  officer_id: number | null;
  start_time: Date;
  duration_minutes: number | null;
  notes: string | null;
  status: string | null;
  created_by_name: string | null;
};

/** Open visits on the same job in the same appointment window (multi-engineer jobs). */
export async function listAppointmentSiblingVisits(
  db: Db,
  diaryEventId: number,
): Promise<AppointmentSiblingVisit[]> {
  const base = await db.query<{
    id: number;
    job_id: number | null;
    officer_id: number | null;
    start_time: Date;
    duration_minutes: number | null;
    notes: string | null;
    status: string | null;
    created_by_name: string | null;
  }>(
    `SELECT id, job_id, officer_id, start_time, duration_minutes, notes, status, created_by_name
     FROM diary_events WHERE id = $1`,
    [diaryEventId],
  );
  if ((base.rowCount ?? 0) === 0) return [];
  const row = base.rows[0];
  if (row.job_id == null) {
    return [
      {
        id: row.id,
        officer_id: row.officer_id,
        start_time: row.start_time,
        duration_minutes: row.duration_minutes,
        notes: row.notes,
        status: row.status,
        created_by_name: row.created_by_name,
      },
    ];
  }
  const sibs = await db.query<AppointmentSiblingVisit>(
    `SELECT id, officer_id, start_time, duration_minutes, notes, status, created_by_name
     FROM diary_events
     WHERE job_id = $1
       AND LOWER(TRIM(REPLACE(COALESCE(status, ''), ' ', '_'))) NOT IN ('cancelled', 'aborted')
       AND ABS(EXTRACT(EPOCH FROM (start_time - $2::timestamptz))) < $3
     ORDER BY id ASC`,
    [row.job_id, row.start_time, SIBLING_VISIT_MATCH_SECONDS],
  );
  return sibs.rows;
}

function visitStatusBlocksEngineerRemoval(status: string | null | undefined): boolean {
  const s = String(status ?? '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_');
  return (
    s === 'completed' ||
    s === 'travelling_to_site' ||
    s === 'travelling' ||
    s === 'traveling_to_site' ||
    s === 'traveling' ||
    s === 'arrived_at_site' ||
    s === 'arrived' ||
    s === 'on_site' ||
    s === 'onsite' ||
    s === 'in_progress' ||
    s === 'working_on_site' ||
    s === 'job_report_submitted'
  );
}

/**
 * Apply schedule fields to every open visit in the appointment group, and optionally
 * rebuild one visit per selected engineer (multi-engineer edit visit).
 * Returns the diary event id that should remain the "current" visit after reconcile.
 */
export async function applyAppointmentReschedule(
  db: Db,
  diaryEventId: number,
  opts: {
    startTime?: Date | null;
    durationMinutes?: number | null;
    notes?: string | null;
    notesProvided?: boolean;
    officerIds?: number[] | null;
    createdByName?: string;
  },
): Promise<number> {
  // One row per engineer so job reports/status stay independent.
  if (await diaryEventHasMultipleOfficersDb(db, diaryEventId)) {
    await splitCombinedDiaryEvent(db, diaryEventId);
  }

  let siblings = await listAppointmentSiblingVisits(db, diaryEventId);
  if (siblings.length === 0) {
    throw new Error('Diary event not found');
  }

  const base = siblings.find((s) => s.id === diaryEventId) ?? siblings[0];
  const jobRow = await db.query<{ job_id: number | null }>(
    `SELECT job_id FROM diary_events WHERE id = $1`,
    [base.id],
  );
  const jobId = jobRow.rows[0]?.job_id ?? null;

  const nextStart =
    opts.startTime !== undefined && opts.startTime !== null ? opts.startTime : base.start_time;
  const nextDuration =
    opts.durationMinutes !== undefined && opts.durationMinutes != null
      ? opts.durationMinutes
      : (base.duration_minutes ?? 60);
  const nextNotes = opts.notesProvided ? (opts.notes ?? null) : base.notes;

  const scheduleIds = siblings.map((s) => s.id);
  await db.query(
    `UPDATE diary_events
     SET start_time = $1,
         duration_minutes = $2,
         notes = $3,
         updated_at = NOW()
     WHERE id = ANY($4::int[])`,
    [nextStart, nextDuration, nextNotes, scheduleIds],
  );

  if (opts.officerIds == null || jobId == null) {
    return diaryEventId;
  }

  const desired = [...new Set(opts.officerIds.filter((id) => Number.isFinite(id)))];
  if (desired.length === 0) {
    throw new Error('Select at least one engineer');
  }

  siblings = await listAppointmentSiblingVisits(db, diaryEventId);
  const byOfficer = new Map<number, AppointmentSiblingVisit>();
  for (const s of siblings) {
    if (s.officer_id != null && !byOfficer.has(s.officer_id)) {
      byOfficer.set(s.officer_id, s);
    }
  }

  const creator = opts.createdByName?.trim() || base.created_by_name?.trim() || 'System';
  const keptIds: number[] = [];

  for (let i = 0; i < desired.length; i++) {
    const oid = desired[i];
    const isPrimary = i === 0; // first selected engineer is the appointment/job primary
    const existing = byOfficer.get(oid);
    if (existing) {
      await db.query(
        `UPDATE diary_events
         SET officer_id = $1, start_time = $2, duration_minutes = $3, notes = $4, updated_at = NOW()
         WHERE id = $5`,
        [oid, nextStart, nextDuration, nextNotes, existing.id],
      );
      await db.query(`DELETE FROM diary_event_officers WHERE diary_event_id = $1`, [existing.id]);
      await db.query(
        `INSERT INTO diary_event_officers (diary_event_id, officer_id, is_primary)
         VALUES ($1, $2, $3)
         ON CONFLICT (diary_event_id, officer_id) DO UPDATE SET is_primary = EXCLUDED.is_primary`,
        [existing.id, oid, isPrimary],
      );
      keptIds.push(existing.id);
      byOfficer.delete(oid);
      continue;
    }

    const ins = await db.query<{ id: number }>(
      `INSERT INTO diary_events (job_id, officer_id, start_time, duration_minutes, notes, created_by_name, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'No status')
       RETURNING id`,
      [jobId, oid, nextStart, nextDuration, nextNotes, creator],
    );
    const newId = Number(ins.rows[0].id);
    await db.query(
      `INSERT INTO diary_event_officers (diary_event_id, officer_id, is_primary)
       VALUES ($1, $2, $3)
       ON CONFLICT (diary_event_id, officer_id) DO UPDATE SET is_primary = EXCLUDED.is_primary`,
      [newId, oid, isPrimary],
    );
    keptIds.push(newId);
  }

  // Cancel open visits for engineers no longer selected (never touch in-progress/completed).
  for (const orphan of byOfficer.values()) {
    if (visitStatusBlocksEngineerRemoval(orphan.status)) {
      continue;
    }
    await db.query(
      `UPDATE diary_events
       SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1`,
      [orphan.id],
    );
  }

  // Prefer keeping the caller's original id when it still exists; else primary engineer visit.
  if (keptIds.includes(diaryEventId)) return diaryEventId;
  return keptIds[0] ?? diaryEventId;
}
