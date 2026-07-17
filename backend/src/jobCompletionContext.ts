import type { Pool, PoolClient } from 'pg';

type Db = Pool | PoolClient;

export type JobCompletionSibling = {
  diary_event_id: number;
  officer_full_name: string | null;
  visit_status: string | null;
  next_job_state: string | null;
  job_report_submitted: boolean;
  is_current_visit: boolean;
  visit_is_open: boolean;
};

export type FinishedSiblingChoice = {
  officer_full_name: string | null;
  next_job_state: string | null;
};

export type JobCompletionContext = {
  has_multiple_engineers: boolean;
  open_visit_count: number;
  siblings: JobCompletionSibling[];
  has_stage_conflict: boolean;
  distinct_chosen_states: string[];
  /** `jobs.state` before this visit closes the job. */
  current_job_state: string | null;
  /** True when only this engineer's visit is still open on a multi-engineer job. */
  is_last_engineer_to_complete: boolean;
  /** Engineers who already completed their visit and what they chose. */
  finished_sibling_choices: FinishedSiblingChoice[];
};

function visitIsOpenSql(): string {
  return `COALESCE(LOWER(TRIM(REPLACE(COALESCE(d.status, ''), ' ', '_'))), '') NOT IN ('completed', 'cancelled', 'aborted')`;
}

/**
 * Other engineers on the same job may choose different post-visit job stages.
 * Job state applies only after every visit is closed; the last completion wins.
 */
export async function buildJobCompletionContext(
  db: Db,
  jobId: number,
  currentDiaryEventId: number,
): Promise<JobCompletionContext> {
  const res = await db.query<{
    diary_event_id: number;
    officer_full_name: string | null;
    visit_status: string | null;
    next_job_state: string | null;
    job_report_submitted: boolean;
    visit_is_open: boolean;
  }>(
    `SELECT d.id AS diary_event_id,
            o.full_name AS officer_full_name,
            d.status AS visit_status,
            d.next_job_state,
            EXISTS (
              SELECT 1 FROM diary_event_status_logs l
              WHERE l.diary_event_id = d.id AND l.status = 'job_report_submitted'
            ) AS job_report_submitted,
            (${visitIsOpenSql()}) AS visit_is_open
     FROM diary_events d
     LEFT JOIN officers o ON o.id = d.officer_id
     WHERE d.job_id = $1
       AND COALESCE(LOWER(TRIM(REPLACE(COALESCE(d.status, ''), ' ', '_'))), '') <> 'aborted'
     ORDER BY d.start_time ASC NULLS LAST, d.id ASC`,
    [jobId],
  );

  const siblings: JobCompletionSibling[] = res.rows.map((r) => ({
    diary_event_id: Number(r.diary_event_id),
    officer_full_name: r.officer_full_name,
    visit_status: r.visit_status,
    next_job_state: r.next_job_state,
    job_report_submitted: !!r.job_report_submitted,
    is_current_visit: Number(r.diary_event_id) === currentDiaryEventId,
    visit_is_open: !!r.visit_is_open,
  }));

  const openVisitCount = siblings.filter((s) => s.visit_is_open).length;
  const hasMultipleEngineers = siblings.length > 1;

  const chosenStates = new Set<string>();
  for (const s of siblings) {
    if (s.next_job_state && String(s.next_job_state).trim()) {
      chosenStates.add(String(s.next_job_state).trim());
    }
  }

  const jobRes = await db.query<{ state: string | null }>(
    `SELECT state FROM jobs WHERE id = $1`,
    [jobId],
  );
  const currentJobState =
    jobRes.rows[0]?.state != null && String(jobRes.rows[0].state).trim()
      ? String(jobRes.rows[0].state).trim()
      : null;

  const currentSibling = siblings.find((s) => s.is_current_visit);
  const isLastEngineerToComplete =
    hasMultipleEngineers &&
    openVisitCount === 1 &&
    currentSibling?.visit_is_open === true;

  const finishedSiblingChoices: FinishedSiblingChoice[] = siblings
    .filter((s) => !s.is_current_visit && !s.visit_is_open)
    .map((s) => ({
      officer_full_name: s.officer_full_name,
      next_job_state: s.next_job_state,
    }));

  return {
    has_multiple_engineers: hasMultipleEngineers,
    open_visit_count: openVisitCount,
    siblings,
    has_stage_conflict: chosenStates.size > 1,
    distinct_chosen_states: [...chosenStates],
    current_job_state: currentJobState,
    is_last_engineer_to_complete: isLastEngineerToComplete,
    finished_sibling_choices: finishedSiblingChoices,
  };
}
