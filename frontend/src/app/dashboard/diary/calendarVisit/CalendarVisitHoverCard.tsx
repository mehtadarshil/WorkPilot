'use client';

import { format } from 'date-fns';
import { Home } from 'lucide-react';
import type { CalendarVisit, HoverAnchor } from './calendarVisitTypes';
import {
  paletteForJob,
  resolveVisitStatus,
  statusIconColor,
  statusLabel,
} from './calendarVisitTheme';

type Tool = { id: number; name: string; category?: string; location?: string };

type Props = {
  visit: CalendarVisit;
  anchor: HoverAnchor;
  tools?: Tool[];
  loadingTools?: boolean;
};

export function CalendarVisitHoverCard({ visit, anchor, tools = [], loadingTools }: Props) {
  const palette = paletteForJob(visit.jobId);
  const status = resolveVisitStatus(visit.eventStatus);
  const start = new Date(visit.startTime);
  const end = new Date(start.getTime() + visit.durationMinutes * 60000);
  const timeLabel = `${format(start, 'HH:mm')} - ${format(end, 'HH:mm')}`;
  const titleLine = visit.title?.trim() || 'Job visit';
  const showBelow = anchor.y >= 220;

  return (
    <div
      className="pointer-events-none fixed z-[9999] w-[272px] overflow-hidden rounded-md border-2 bg-white shadow-xl"
      style={{
        left: anchor.x,
        top: showBelow ? anchor.y + 20 : anchor.y - 8,
        transform: showBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
        borderColor: palette.headerBorder,
      }}
    >
      <div
        className="relative flex items-center gap-2 border-b px-2.5 py-2 pr-9"
        style={{ backgroundColor: palette.headerBg, borderColor: palette.border }}
      >
        <span
          className="flex size-6 shrink-0 items-center justify-center rounded text-xs font-extrabold text-white"
          style={{ backgroundColor: palette.badgeBg }}
        >
          J
        </span>
        <p className="min-w-0 flex-1 text-[12px] font-semibold leading-snug text-slate-800">
          {timeLabel} {titleLine}
        </p>
        <div className="absolute right-2 top-2">
          <Home className="size-4" style={{ color: statusIconColor(status) }} aria-hidden />
        </div>
      </div>

      <div className="space-y-1 bg-[#ECEFF1] px-3 py-2.5">
        <p className="text-[13px] font-bold leading-snug text-slate-900">{visit.customerName}</p>
        <p className="text-[12px] leading-snug text-slate-600">
          {visit.address?.trim() || 'Address not listed'}
        </p>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          {statusLabel(status)}
          {visit.jobNumber ? ` · Job ${visit.jobNumber}` : ''}
        </p>

        {(loadingTools || tools.length > 0) && (
          <div className="border-t border-slate-300/60 pt-1.5">
            <p className="text-[10px] font-semibold text-slate-500">Tools</p>
            {loadingTools ? (
              <p className="text-[10px] italic text-slate-400">Loading…</p>
            ) : (
              <p className="text-[10px] text-slate-600">{tools.map((t) => t.name).join(', ')}</p>
            )}
          </div>
        )}

        {visit.notes?.trim() && (
          <p className="border-t border-slate-300/60 pt-1.5 text-[10px] italic text-slate-500 line-clamp-2">
            {visit.notes}
          </p>
        )}
      </div>
    </div>
  );
}
