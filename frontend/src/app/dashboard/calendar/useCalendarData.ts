'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  startOfDay,
  endOfDay,
} from 'date-fns';
import { getJson } from '../../apiClient';
import type {
  CalendarOfficer,
  CalendarViewMode,
  EventLayers,
  MergedCalendarEvent,
} from './calendarTypes';

const WEEK_OPTIONS = { weekStartsOn: 0 as const };

const ENGINEER_CALENDAR_PALETTE = [
  { borderColor: '#0f766e' },
  { borderColor: '#2563eb' },
  { borderColor: '#7c3aed' },
  { borderColor: '#db2777' },
  { borderColor: '#ea580c' },
  { borderColor: '#ca8a04' },
  { borderColor: '#16a34a' },
  { borderColor: '#0891b2' },
  { borderColor: '#4f46e5' },
  { borderColor: '#c026d3' },
  { borderColor: '#dc2626' },
  { borderColor: '#0d9488' },
] as const;

function officerColorKey(id: number | string | null | undefined, name?: string | null): string {
  if (id != null && id !== '' && Number.isFinite(Number(id))) return `id:${id}`;
  const n = (name ?? '').trim().toLowerCase();
  return n ? `name:${n}` : 'unassigned';
}

function officerCalendarStyle(key: string, customColor?: string | null) {
  if (customColor && /^#[0-9A-Fa-f]{6}$/i.test(customColor)) {
    return { backgroundColor: customColor, borderColor: customColor, textColor: '#ffffff' };
  }
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  const borderColor = ENGINEER_CALENDAR_PALETTE[hash % ENGINEER_CALENDAR_PALETTE.length]!.borderColor;
  return { backgroundColor: borderColor, borderColor, textColor: '#ffffff' };
}

function diaryEventOfficerKey(e: Record<string, unknown>): string {
  if (e.officer_id != null && Number.isFinite(Number(e.officer_id))) {
    return officerColorKey(Number(e.officer_id));
  }
  const officers = Array.isArray(e.officers) ? e.officers : [];
  const primary =
    officers.find((o) => o && typeof o === 'object' && (o as { is_primary?: boolean }).is_primary) ??
    officers[0];
  if (primary && typeof primary === 'object') {
    const p = primary as { id?: number; full_name?: string };
    return officerColorKey(p.id ?? null, p.full_name ?? null);
  }
  return officerColorKey(null, typeof e.officer_full_name === 'string' ? e.officer_full_name : null);
}

function diaryEventOfficerLabel(e: Record<string, unknown>): string {
  if (typeof e.officer_full_name === 'string' && e.officer_full_name.trim()) {
    return e.officer_full_name.trim();
  }
  const officers = Array.isArray(e.officers) ? e.officers : [];
  const names = officers
    .map((o) => (o && typeof o === 'object' ? (o as { full_name?: string }).full_name : null))
    .filter((n): n is string => typeof n === 'string' && n.trim().length > 0);
  if (names.length > 0) return names.join(', ');
  return 'Unassigned';
}

function holidayRequestLooksAllDay(startDateStr: string, endDateStr: string): boolean {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return true;
  const diffMs = end.getTime() - start.getTime();
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  if (diffMs <= 0 && sameDay) return true;
  if (sameDay && diffMs >= 23 * 60 * 60 * 1000) return true;
  const startMidnight = start.getHours() === 0 && start.getMinutes() === 0;
  const endLate = end.getHours() === 23 && end.getMinutes() >= 59;
  if (!sameDay && startMidnight && endLate) return true;
  return false;
}

function resolveRequestAllDay(request: {
  all_day?: boolean;
  start_date: string;
  end_date: string;
}): boolean {
  if (typeof request.all_day === 'boolean') return request.all_day;
  return holidayRequestLooksAllDay(request.start_date, request.end_date);
}

function queryRange(viewMode: CalendarViewMode, anchor: Date) {
  if (viewMode === 'daily') {
    return { start: startOfDay(anchor), end: endOfDay(anchor) };
  }
  if (viewMode === 'weekly') {
    return {
      start: startOfDay(startOfWeek(anchor, WEEK_OPTIONS)),
      end: endOfDay(endOfWeek(anchor, WEEK_OPTIONS)),
    };
  }
  return {
    start: startOfDay(startOfMonth(anchor)),
    end: endOfDay(endOfMonth(anchor)),
  };
}

function canLoadHolidayLayers(): boolean {
  try {
    const raw = window.localStorage.getItem('wp_user');
    if (!raw) return false;
    const user = JSON.parse(raw) as {
      role?: string;
      permissions?: Record<string, boolean> | null;
    };
    if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') return true;
    if (user.role === 'STAFF') return user.permissions?.field_users === true;
    return false;
  } catch {
    return false;
  }
}

export function useCalendarData(
  date: Date,
  viewMode: CalendarViewMode,
  layers: EventLayers,
) {
  const [token] = useState(() =>
    typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null,
  );
  const [officers, setOfficers] = useState<CalendarOfficer[]>([]);
  const [events, setEvents] = useState<MergedCalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [holidayLayersAllowed, setHolidayLayersAllowed] = useState(false);

  useEffect(() => {
    setHolidayLayersAllowed(canLoadHolidayLayers());
  }, []);

  const range = useMemo(() => queryRange(viewMode, date), [viewMode, date]);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const allowLayers = canLoadHolidayLayers();
      setHolidayLayersAllowed(allowLayers);

      const diaryQ = new URLSearchParams({
        range_start: range.start.toISOString(),
        range_end: range.end.toISOString(),
        include_completed: '1',
        scope: 'team',
      }).toString();

      const startYmd = format(range.start, 'yyyy-MM-dd');
      const endYmd = format(range.end, 'yyyy-MM-dd');
      const holQ = new URLSearchParams({ from: startYmd, to: endYmd }).toString();

      const [eventsRes, offRes, reqRes, holRes] = await Promise.all([
        getJson<{ events: Record<string, unknown>[] }>(`/diary-events?${diaryQ}`, token),
        getJson<{ officers: CalendarOfficer[] }>('/officers/list', token),
        allowLayers && layers.leave
          ? getJson<{ requests: Record<string, unknown>[] }>('/holiday-requests', token).catch(
              () => ({ requests: [] as Record<string, unknown>[] }),
            )
          : Promise.resolve({ requests: [] as Record<string, unknown>[] }),
        allowLayers && layers.holidays
          ? getJson<{ holidays: Record<string, unknown>[] }>(`/holidays?${holQ}`, token).catch(
              () => ({ holidays: [] as Record<string, unknown>[] }),
            )
          : Promise.resolve({ holidays: [] as Record<string, unknown>[] }),
      ]);

      const colorMap = new Map<string, string>();
      for (const officer of offRes.officers ?? []) {
        if (officer.calendar_color) {
          colorMap.set(officerColorKey(officer.id), officer.calendar_color);
        }
      }
      setOfficers(offRes.officers ?? []);

      const diaryEvts: MergedCalendarEvent[] = (eventsRes.events ?? []).map((e) => {
        const start = new Date(String(e.start_time));
        const end = new Date(start.getTime() + (Number(e.duration_minutes) || 60) * 60000);
        const oKey = diaryEventOfficerKey(e);
        const palette = officerCalendarStyle(oKey, colorMap.get(oKey));
        const officerLabel = diaryEventOfficerLabel(e);
        const isGeneral = e.is_general === true || e.job_id == null;
        return {
          id: `diary-${e.diary_id}`,
          title: `${isGeneral ? String(e.title || 'General event') : String(e.job_number || 'Job')} (${officerLabel})`,
          start,
          end,
          backgroundColor: palette.backgroundColor,
          borderColor: palette.borderColor,
          textColor: palette.textColor,
          officerKey: oKey,
          officerLabel,
          type: 'diary',
          raw: e,
        };
      });

      const companyHols: MergedCalendarEvent[] = (holRes.holidays ?? []).map((h) => ({
        id: `holiday-${h.id}`,
        title: `Holiday: ${String(h.title || '')}`,
        start: new Date(`${h.holiday_date}T00:00:00`),
        end: new Date(`${h.holiday_date}T23:59:59`),
        allDay: true,
        backgroundColor: '#4f46e5',
        borderColor: '#4f46e5',
        textColor: '#ffffff',
        type: 'holiday',
        raw: h,
      }));

      const leaveEvts: MergedCalendarEvent[] = (reqRes.requests ?? [])
        .filter((r) => r.status === 'approved' || r.status === 'pending')
        .filter((r) => {
          const start = new Date(String(r.start_date));
          const end = new Date(String(r.end_date));
          return start <= range.end && end >= range.start;
        })
        .map((r) => {
          const oKey = officerColorKey(
            r.officer_id as number | null,
            typeof r.officer_name === 'string' ? r.officer_name : null,
          );
          const palette = officerCalendarStyle(oKey, colorMap.get(oKey));
          const req = r as { all_day?: boolean; start_date: string; end_date: string };
          return {
            id: `leave-${r.id}`,
            title: `${r.status === 'approved' ? '' : '(Pending) '}${String(r.officer_name || 'Leave')} Leave`,
            start: new Date(String(r.start_date)),
            end: new Date(String(r.end_date)),
            allDay: resolveRequestAllDay(req),
            backgroundColor: palette.backgroundColor,
            borderColor: palette.borderColor,
            textColor: palette.textColor,
            officerKey: oKey,
            officerLabel: typeof r.officer_name === 'string' ? r.officer_name : 'Leave',
            type: 'leave',
            raw: r,
          };
        });

      setEvents([...diaryEvts, ...companyHols, ...leaveEvts]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load calendar');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [token, range.start, range.end, layers.leave, layers.holidays]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    token,
    officers,
    events,
    loading,
    error,
    refresh,
    holidayLayersAllowed,
  };
}
