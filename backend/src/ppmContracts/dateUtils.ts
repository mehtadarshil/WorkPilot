import type { PpmIntervalUnit } from './types';

export function addIntervalToDate(base: Date, intervalN: number, unit: PpmIntervalUnit): Date {
  const d = new Date(base.getTime());
  const n = Math.max(1, Math.round(intervalN));
  switch (unit) {
    case 'days':
      d.setUTCDate(d.getUTCDate() + n);
      break;
    case 'weeks':
      d.setUTCDate(d.getUTCDate() + n * 7);
      break;
    case 'months':
      d.setUTCMonth(d.getUTCMonth() + n);
      break;
    case 'years':
      d.setUTCFullYear(d.getUTCFullYear() + n);
      break;
    default:
      d.setUTCMonth(d.getUTCMonth() + n);
  }
  return d;
}

export function parseDateOnly(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : s;
}

/** Normalize PostgreSQL DATE / timestamptz / ISO string to YYYY-MM-DD. */
export function dateOnlyFromPg(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const y = value.getUTCFullYear();
    const m = value.getUTCMonth() + 1;
    const d = value.getUTCDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return parseDateOnly(s);
}

export function isoDateOnly(d: Date): string {
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

/** Project occurrence dates for calendar grid (next N occurrences from anchor). */
export function projectTaskOccurrences(
  nextDueDate: string,
  intervalN: number,
  intervalUnit: PpmIntervalUnit,
  monthsAhead: number,
): string[] {
  const anchor = dateOnlyFromPg(nextDueDate);
  if (!anchor) return [];

  const out: string[] = [];
  let cur = new Date(`${anchor}T12:00:00.000Z`);
  if (Number.isNaN(cur.getTime())) return [];

  const end = new Date();
  end.setUTCMonth(end.getUTCMonth() + monthsAhead);
  const seen = new Set<string>();
  for (let i = 0; i < 48; i++) {
    if (Number.isNaN(cur.getTime())) break;
    const key = isoDateOnly(cur);
    if (!key) break;
    if (cur > end && out.length > 0) break;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
    cur = addIntervalToDate(cur, intervalN, intervalUnit);
    if (cur > end && out.length >= 6) break;
  }
  return out.sort();
}
