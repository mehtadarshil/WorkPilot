/**
 * Convert browser-local date + time form fields to UTC ISO for the API.
 * Avoids sending naive strings like `2026-06-29T23:30:00` which servers parse as UTC.
 */
export function localDateAndTimeToIso(date: string, time: string): string {
  const [y, m, d] = date.split('-').map((n) => parseInt(n, 10));
  const [hh, mm] = time.split(':').map((n) => parseInt(n, 10));
  if (![y, m, d, hh, mm].every((n) => Number.isFinite(n))) {
    throw new Error('Invalid date or time');
  }
  return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();
}

/** End of local calendar day (23:59) as UTC ISO. */
export function localDateEndOfDayToIso(date: string): string {
  const [y, m, d] = date.split('-').map((n) => parseInt(n, 10));
  if (![y, m, d].every((n) => Number.isFinite(n))) {
    throw new Error('Invalid date');
  }
  return new Date(y, m - 1, d, 23, 59, 0, 0).toISOString();
}
