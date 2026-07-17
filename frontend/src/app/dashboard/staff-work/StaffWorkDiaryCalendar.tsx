'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  subMonths,
  addMonths,
  addWeeks,
  subWeeks,
  isSameMonth,
  isSameDay,
  startOfDay,
  addHours,
  eachDayOfInterval,
} from 'date-fns';
import { ChevronLeft, ChevronRight, ChevronsLeftRight } from 'lucide-react';
import {
  CalendarVisitBlock,
  diaryEventToVisit,
} from '../diary/calendarVisit';

export type StaffWorkCalendarEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  officerKey?: string;
  officerLabel?: string;
  type?: string;
  raw?: unknown;
};

type Officer = { id: number; full_name: string };

type ViewMode = 'daily' | 'weekly' | 'monthly';

type Props = {
  officers: Officer[];
  events: StaffWorkCalendarEvent[];
  date: Date;
  onDateChange: (d: Date) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onSelectEvent: (evt: StaffWorkCalendarEvent) => void;
};

const WEEK_OPTIONS = { weekStartsOn: 0 as const };
const DAILY_TIMELINE_START_HOUR = 0;
const DAILY_TIMELINE_END_HOUR = 24;
const DAILY_TIMELINE_HOUR_COUNT = DAILY_TIMELINE_END_HOUR - DAILY_TIMELINE_START_HOUR;
const DAILY_TIMELINE_MIN_WIDTH_PX = DAILY_TIMELINE_HOUR_COUNT * 48;

function eventOfficerIds(evt: StaffWorkCalendarEvent): number[] {
  if (evt.type === 'holiday') return [];
  if (evt.type === 'leave') {
    const oid = (evt.raw as { officer_id?: number } | undefined)?.officer_id;
    return oid != null ? [oid] : [];
  }
  const raw = evt.raw as {
    officer_id?: number | null;
    officers?: { id: number }[];
  } | undefined;
  if (raw?.officers?.length) return raw.officers.map((o) => o.id);
  if (raw?.officer_id != null) return [raw.officer_id];
  return [];
}

function eventMatchesOfficer(evt: StaffWorkCalendarEvent, officerId: number): boolean {
  if (evt.type === 'holiday') return true;
  return eventOfficerIds(evt).includes(officerId);
}

function eventOnDay(evt: StaffWorkCalendarEvent, day: Date): boolean {
  // Diary visits: place on the local calendar day of start_time (matches job Diary events + main Diary).
  // Leave/holidays: keep span overlap so multi-day leave still fills each day.
  if (evt.type === 'diary') {
    return isSameDay(evt.start, day);
  }
  const dayStart = startOfDay(day);
  const dayEnd = new Date(dayStart);
  dayEnd.setHours(23, 59, 59, 999);
  return evt.start <= dayEnd && evt.end >= dayStart;
}

function diaryVisitFromEvent(evt: StaffWorkCalendarEvent) {
  const raw = evt.raw as Record<string, unknown>;
  return diaryEventToVisit({
    diary_id: raw.diary_id as number,
    job_id: raw.job_id as number,
    start_time: raw.start_time as string,
    duration_minutes: (raw.duration_minutes as number) || 60,
    title: (raw.title as string) || 'Job',
    customer_full_name: (raw.customer_full_name as string) || 'Customer',
    customer_address: (raw.customer_address as string) || (raw.location as string),
    address_line_1: raw.address_line_1 as string | null | undefined,
    description_name: raw.description_name as string | null | undefined,
    job_state: raw.job_state as string | null | undefined,
    site_contact_name: raw.site_contact_name as string | null | undefined,
    event_status: (raw.event_status as string) || 'scheduled',
    job_number: raw.job_number as string | null | undefined,
    customer_email: raw.customer_email as string | null | undefined,
    notes: raw.notes as string | null | undefined,
    officer_full_name: raw.officer_full_name as string | null | undefined,
    officers: raw.officers as { full_name: string }[] | undefined,
  });
}

function MiniCalendar({
  date,
  onSelect,
  activeDate,
}: {
  date: Date;
  onSelect: (d: Date) => void;
  activeDate: Date;
}) {
  const monthStart = startOfMonth(activeDate);
  const monthEnd = endOfMonth(monthStart);
  const gridStart = startOfWeek(monthStart);
  const gridEnd = endOfWeek(monthEnd);
  const calendarDays = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const weeks: Date[][] = [];
  for (let i = 0; i < calendarDays.length; i += 7) {
    weeks.push(calendarDays.slice(i, i + 7));
  }

  return (
    <div className="w-full">
      <div className="mb-2 flex items-center justify-between px-1">
        <button type="button" onClick={() => onSelect(subMonths(activeDate, 1))} className="text-slate-400 hover:text-slate-700">
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-[13px] font-bold text-slate-700">{format(activeDate, 'MMMM yyyy')}</span>
        <button type="button" onClick={() => onSelect(addMonths(activeDate, 1))} className="text-slate-400 hover:text-slate-700">
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-slate-400">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((n) => (
          <div key={n}>{n}</div>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={format(week[0], 'yyyy-MM-dd')} className="mb-1 grid grid-cols-7 gap-1">
          {week.map((d) => {
            const active = isSameDay(d, date);
            return (
              <button
                key={format(d, 'yyyy-MM-dd')}
                type="button"
                onClick={() => onSelect(d)}
                className={`flex aspect-square items-center justify-center p-1 text-[12px] font-medium transition-colors ${
                  !isSameMonth(d, monthStart) ? 'text-slate-300' : 'text-slate-700'
                } ${active ? 'bg-[#14B8A6] text-white' : 'hover:bg-slate-100'}`}
              >
                {format(d, 'd')}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function StaffEventChip({
  evt,
  onSelect,
}: {
  evt: StaffWorkCalendarEvent;
  onSelect: () => void;
}) {
  const timeLabel = evt.allDay
    ? 'All day'
    : `${format(evt.start, 'HH:mm')}${evt.end ? ` – ${format(evt.end, 'HH:mm')}` : ''}`;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      className="w-full truncate rounded border px-1 py-0.5 text-left text-[10px] leading-tight transition hover:opacity-90"
      style={{
        backgroundColor: evt.backgroundColor,
        borderColor: evt.borderColor,
        color: evt.textColor,
      }}
    >
      <span className="font-semibold">{timeLabel}</span>{' '}
      <span>{evt.title.replace(/^[^\s]+\s/, '')}</span>
    </button>
  );
}

export function StaffWorkDiaryCalendar({
  officers,
  events,
  date,
  onDateChange,
  viewMode,
  onViewModeChange,
  onSelectEvent,
}: Props) {
  const [activeMonthDate, setActiveMonthDate] = useState(date);
  const diaryTimelineScrollRef = useRef<HTMLDivElement>(null);
  const [scrollHints, setScrollHints] = useState({ left: false, right: false });
  const [hasOverflow, setHasOverflow] = useState(false);

  const weekDays = eachDayOfInterval({
    start: startOfWeek(date, WEEK_OPTIONS),
    end: endOfWeek(date, WEEK_OPTIONS),
  });

  const monthGridDays = eachDayOfInterval({
    start: startOfWeek(startOfMonth(date), WEEK_OPTIONS),
    end: endOfWeek(endOfMonth(date), WEEK_OPTIONS),
  });

  const visibleOfficers = useMemo(() => {
    if (officers.length > 0) return officers;
    const names = new Map<number, string>();
    for (const evt of events) {
      for (const oid of eventOfficerIds(evt)) {
        if (!names.has(oid)) {
          names.set(oid, evt.officerLabel || `Officer ${oid}`);
        }
      }
    }
    return Array.from(names.entries()).map(([id, full_name]) => ({ id, full_name }));
  }, [officers, events]);

  const updateScrollHints = useCallback(() => {
    const el = diaryTimelineScrollRef.current;
    if (!el) {
      setScrollHints({ left: false, right: false });
      setHasOverflow(false);
      return;
    }
    const { scrollLeft, clientWidth, scrollWidth } = el;
    const overflow = scrollWidth > clientWidth + 2;
    setHasOverflow(overflow);
    if (!overflow) {
      setScrollHints({ left: false, right: false });
      return;
    }
    const maxScroll = scrollWidth - clientWidth;
    setScrollHints({
      left: scrollLeft > 3,
      right: scrollLeft < maxScroll - 3,
    });
  }, []);

  useEffect(() => {
    updateScrollHints();
    const el = diaryTimelineScrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => updateScrollHints());
    ro.observe(el);
    window.addEventListener('resize', updateScrollHints);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateScrollHints);
    };
  }, [date, visibleOfficers.length, events.length, updateScrollHints, viewMode]);

  const navigatePrev = () => {
    if (viewMode === 'daily') onDateChange(addDays(date, -1));
    else if (viewMode === 'weekly') onDateChange(subWeeks(date, 1));
    else onDateChange(subMonths(date, 1));
  };

  const navigateNext = () => {
    if (viewMode === 'daily') onDateChange(addDays(date, 1));
    else if (viewMode === 'weekly') onDateChange(addWeeks(date, 1));
    else onDateChange(addMonths(date, 1));
  };

  const renderEvent = (
    evt: StaffWorkCalendarEvent,
    variant: 'chip' | 'stacked' | 'timeline',
    extra?: { style?: React.CSSProperties; className?: string },
  ) => {
    if (evt.type === 'diary' && evt.raw) {
      return (
        <CalendarVisitBlock
          key={evt.id}
          visit={diaryVisitFromEvent(evt)}
          variant={variant}
          className={extra?.className}
          style={extra?.style}
          onClick={(e) => {
            e.stopPropagation();
            onSelectEvent(evt);
          }}
        />
      );
    }
    return (
      <StaffEventChip
        key={evt.id}
        evt={evt}
        onSelect={() => onSelectEvent(evt)}
      />
    );
  };

  return (
    <div className="flex min-h-[560px] flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3 text-sm">
        <h3 className="text-[15px] font-bold text-slate-800">
          {viewMode === 'daily' && format(date, 'EEEE do MMMM yyyy')}
          {viewMode === 'weekly' &&
            `${format(startOfWeek(date, WEEK_OPTIONS), 'MMM d')} – ${format(endOfWeek(date, WEEK_OPTIONS), 'MMM d, yyyy')}`}
          {viewMode === 'monthly' && format(date, 'MMMM yyyy')}
        </h3>
        <div className="flex rounded border border-slate-200 bg-slate-100 text-slate-600">
          {(['daily', 'weekly', 'monthly'] as const).map((mode, i) => (
            <button
              key={mode}
              type="button"
              onClick={() => onViewModeChange(mode)}
              className={`px-4 py-1.5 capitalize ${i < 2 ? 'border-r border-slate-200' : ''} ${
                viewMode === mode ? 'bg-white font-bold shadow-sm' : 'hover:bg-slate-200'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {viewMode === 'monthly' ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto p-3">
            <div className="grid grid-cols-7 gap-1 border-b border-slate-200 pb-2 text-center text-[11px] font-bold text-slate-400">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((n) => (
                <div key={n}>{n}</div>
              ))}
            </div>
            <div className="grid flex-1 grid-cols-7 gap-px bg-slate-200 pt-px">
              {monthGridDays.map((d) => {
                const inMonth = isSameMonth(d, date);
                const dayEvents = events
                  .filter((e) => eventOnDay(e, d))
                  .sort((a, b) => a.start.getTime() - b.start.getTime());
                const isToday = isSameDay(d, new Date());
                const isSelected = isSameDay(d, date);
                return (
                  <button
                    key={format(d, 'yyyy-MM-dd')}
                    type="button"
                    onClick={() => {
                      onDateChange(d);
                      setActiveMonthDate(d);
                      onViewModeChange('daily');
                    }}
                    className={`flex min-h-[118px] flex-col bg-white p-1.5 text-left transition-colors ${
                      !inMonth ? 'text-slate-300' : 'text-slate-800'
                    } ${isToday ? 'ring-1 ring-inset ring-[#14B8A6]' : ''} ${
                      isSelected && inMonth ? 'bg-teal-50/70' : ''
                    } hover:bg-slate-50`}
                  >
                    <span className={`mb-1 text-[11px] font-bold ${!inMonth ? 'text-slate-300' : 'text-slate-600'}`}>
                      {format(d, 'd')}
                    </span>
                    <div className="min-h-0 flex-1 space-y-0.5 overflow-hidden">
                      {dayEvents.slice(0, 3).map((evt) => renderEvent(evt, 'chip'))}
                      {dayEvents.length > 3 && (
                        <div className="text-[10px] font-medium text-slate-500">+{dayEvents.length - 3} more</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
            <div className="flex min-h-0 flex-1 overflow-hidden">
              <div className="z-30 flex w-[180px] shrink-0 flex-col border-r border-slate-300 bg-white">
                <div className="flex h-[45px] shrink-0 items-center border-b border-slate-300 px-3 text-sm font-bold text-slate-700">
                  Users
                </div>
                {visibleOfficers.map((officer) => (
                  <div
                    key={officer.id}
                    className="flex min-h-[80px] items-center border-b border-slate-200 px-3 text-[13px] font-bold text-slate-600"
                  >
                    {officer.full_name}
                  </div>
                ))}
              </div>

              {viewMode === 'weekly' ? (
                <div className="relative min-h-0 min-w-0 flex-1 overflow-auto">
                  <div className="min-w-[720px]">
                    <div className="sticky top-0 z-20 grid grid-cols-7 border-b border-slate-300 bg-white">
                      {weekDays.map((d) => (
                        <div key={format(d, 'yyyy-MM-dd')} className="border-r border-slate-200 p-2 text-center last:border-r-0">
                          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{format(d, 'EEE')}</div>
                          <div className={`text-sm font-bold ${isSameDay(d, date) ? 'text-[#14B8A6]' : 'text-slate-700'}`}>
                            {format(d, 'd')}
                          </div>
                        </div>
                      ))}
                    </div>
                    {visibleOfficers.map((officer) => (
                      <div key={officer.id} className="grid min-h-[80px] grid-cols-7 border-b border-slate-200">
                        {weekDays.map((day) => {
                          const cellEvents = events
                            .filter((e) => eventMatchesOfficer(e, officer.id) && eventOnDay(e, day))
                            .sort((a, b) => a.start.getTime() - b.start.getTime());
                          return (
                            <div
                              key={`${officer.id}-${format(day, 'yyyy-MM-dd')}`}
                              className="relative border-r border-slate-100 p-1 last:border-r-0"
                            >
                              <div className="flex max-h-[72px] flex-col gap-1 overflow-y-auto">
                                {cellEvents.map((evt) =>
                                  renderEvent(evt, 'stacked', { className: 'shrink-0' }),
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="relative min-h-0 min-w-0 flex-1">
                  <div ref={diaryTimelineScrollRef} onScroll={updateScrollHints} className="h-full overflow-auto scroll-smooth">
                    <div style={{ minWidth: DAILY_TIMELINE_MIN_WIDTH_PX }}>
                      <div className="sticky top-0 z-20 flex h-[45px] shrink-0 border-b border-slate-300 bg-white">
                        {Array.from({ length: DAILY_TIMELINE_HOUR_COUNT }).map((_, i) => (
                          <div
                            key={i}
                            className="flex-1 border-r border-slate-200 p-2 text-center text-sm font-bold text-slate-700 last:border-r-0"
                          >
                            {format(addHours(startOfDay(date), DAILY_TIMELINE_START_HOUR + i), 'ha').toLowerCase()}
                          </div>
                        ))}
                      </div>
                      {visibleOfficers.map((officer) => {
                        const officerEvents = events.filter(
                          (e) => eventMatchesOfficer(e, officer.id) && eventOnDay(e, date),
                        );
                        const totalDayMins = DAILY_TIMELINE_HOUR_COUNT * 60;
                        return (
                          <div key={officer.id} className="relative min-h-[80px] border-b border-slate-200">
                            <div className="pointer-events-none absolute inset-0 z-0 flex">
                              {Array.from({ length: DAILY_TIMELINE_HOUR_COUNT }).map((_, i) => (
                                <div key={i} className="flex flex-1 border-r border-slate-200 last:border-r-0">
                                  <div className="h-full w-1/2 border-r border-slate-100" />
                                  <div className="h-full w-1/2" />
                                </div>
                              ))}
                            </div>
                            {officerEvents.map((evt) => {
                              if (evt.allDay) {
                                return (
                                  <div key={evt.id} className="relative z-20 px-1 pt-1">
                                    {renderEvent(evt, 'stacked', { className: 'shrink-0' })}
                                  </div>
                                );
                              }
                              if (evt.type !== 'diary') {
                                const s = evt.start;
                                const durationMins = Math.max(30, (evt.end.getTime() - evt.start.getTime()) / 60000);
                                const startTotalMins = s.getHours() * 60 + s.getMinutes();
                                const offsetMins = startTotalMins - DAILY_TIMELINE_START_HOUR * 60;
                                let leftPct = (offsetMins / totalDayMins) * 100;
                                if (leftPct < 0) leftPct = 0;
                                let widthPct = (durationMins / totalDayMins) * 100;
                                if (leftPct + widthPct > 100) widthPct = 100 - leftPct;
                                if (leftPct >= 100) return null;
                                return renderEvent(evt, 'timeline', {
                                  className: 'absolute top-1 bottom-1 z-30 opacity-95',
                                  style: { left: `${leftPct}%`, width: `${widthPct}%` },
                                });
                              }
                              const raw = evt.raw as { start_time: string; duration_minutes?: number };
                              const s = new Date(raw.start_time);
                              const startTotalMins = s.getHours() * 60 + s.getMinutes();
                              const offsetMins = startTotalMins - DAILY_TIMELINE_START_HOUR * 60;
                              let leftPct = (offsetMins / totalDayMins) * 100;
                              if (leftPct < 0) leftPct = 0;
                              let widthPct = ((raw.duration_minutes || 60) / totalDayMins) * 100;
                              if (leftPct + widthPct > 100) widthPct = 100 - leftPct;
                              if (leftPct >= 100) return null;
                              return renderEvent(evt, 'timeline', {
                                className: 'absolute top-1 bottom-1 z-30 opacity-95',
                                style: { left: `${leftPct}%`, width: `${widthPct}%` },
                              });
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {scrollHints.left && (
                    <div className="pointer-events-none absolute inset-y-0 left-0 top-0 z-[28] w-10 bg-gradient-to-r from-white from-30% to-transparent" />
                  )}
                  {scrollHints.right && (
                    <div className="pointer-events-none absolute inset-y-0 right-0 top-0 z-[28] w-14 bg-gradient-to-l from-white from-40% to-transparent" />
                  )}
                  {hasOverflow && scrollHints.left && (
                    <div className="pointer-events-none absolute bottom-0 left-0 top-[45px] z-[32] flex w-11 items-center justify-center">
                      <button
                        type="button"
                        aria-label="Scroll timeline left"
                        className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-600 shadow-md"
                        onClick={() => diaryTimelineScrollRef.current?.scrollBy({ left: -280, behavior: 'smooth' })}
                      >
                        <ChevronLeft className="size-5" />
                      </button>
                    </div>
                  )}
                  {hasOverflow && scrollHints.right && (
                    <div className="pointer-events-none absolute bottom-0 right-0 top-[45px] z-[32] flex w-11 items-center justify-center">
                      <button
                        type="button"
                        aria-label="Scroll timeline right"
                        className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-600 shadow-md"
                        onClick={() => diaryTimelineScrollRef.current?.scrollBy({ left: 280, behavior: 'smooth' })}
                      >
                        <ChevronRight className="size-5" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            {viewMode === 'daily' && hasOverflow && (
              <div className="flex shrink-0 items-center justify-center gap-2 border-t border-slate-200 bg-slate-50/90 px-3 py-2 text-center text-xs font-medium text-slate-600">
                <ChevronsLeftRight className="size-4 shrink-0 text-[#14B8A6]" />
                <span>Scroll sideways to see the full day.</span>
              </div>
            )}
          </div>
        )}

        <div className="flex w-[280px] shrink-0 flex-col overflow-y-auto border-l border-slate-300 bg-white">
          <div className="border-b border-slate-200 p-4">
            <div className="mb-3 flex justify-end gap-1">
              <button
                type="button"
                className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                onClick={() => onDateChange(new Date())}
              >
                Today
              </button>
              <button type="button" className="rounded border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-50" onClick={navigatePrev}>
                <ChevronLeft className="size-3" />
              </button>
              <button type="button" className="rounded border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-50" onClick={navigateNext}>
                <ChevronRight className="size-3" />
              </button>
            </div>
            <MiniCalendar
              date={date}
              activeDate={activeMonthDate}
              onSelect={(d) => {
                onDateChange(d);
                setActiveMonthDate(d);
              }}
            />
          </div>
          <div className="p-4 text-[13px] leading-relaxed text-slate-600">
            <p className="font-semibold text-slate-800">Jobs, leave &amp; holidays</p>
            <p className="mt-1 text-slate-500">
              Same layout as the diary scheduler. Click a visit for details. Company holidays appear on every engineer row.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
