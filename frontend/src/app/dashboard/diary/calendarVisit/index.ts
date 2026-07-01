export type { CalendarVisit, HoverAnchor } from './calendarVisitTypes';
export { CalendarVisitBlock } from './CalendarVisitBlock';
export { CalendarVisitHoverCard } from './CalendarVisitHoverCard';
export { paletteForJob, paletteForVisit, GENERAL_VISIT_PALETTE, resolveVisitStatus } from './calendarVisitTheme';

export function diaryEventToVisit(evt: {
  diary_id: number;
  job_id: number | null;
  is_general?: boolean;
  start_time: string;
  duration_minutes: number;
  title: string;
  customer_full_name: string;
  customer_address?: string;
  address_line_1?: string | null;
  description_name?: string | null;
  job_state?: string | null;
  site_contact_name?: string | null;
  event_status: string;
  job_number?: string | null;
  customer_email?: string | null;
  notes?: string | null;
  officer_full_name?: string | null;
  officers?: { full_name: string }[];
}): import('./calendarVisitTypes').CalendarVisit {
  const isGeneral = evt.is_general === true || evt.job_id == null;
  const worksCategory = isGeneral
    ? evt.title?.trim() || 'General event'
    : evt.description_name?.trim() ||
      evt.title?.trim() ||
      null;
  const addressLine1 =
    evt.address_line_1?.trim() ||
    evt.customer_address?.split(',')[0]?.trim() ||
    null;

  return {
    id: evt.diary_id,
    jobId: evt.job_id,
    isGeneral,
    startTime: evt.start_time,
    durationMinutes: evt.duration_minutes,
    title: evt.title,
    customerName: evt.site_contact_name?.trim() || evt.customer_full_name,
    address: evt.customer_address,
    addressLine1,
    worksCategory,
    jobState: evt.job_state ?? null,
    eventStatus: evt.event_status,
    jobNumber: evt.job_number,
    customerEmail: evt.customer_email,
    notes: evt.notes,
    officerNames:
      evt.officers && evt.officers.length > 0
        ? evt.officers.map((o) => o.full_name).join(', ')
        : evt.officer_full_name || null,
  };
}
