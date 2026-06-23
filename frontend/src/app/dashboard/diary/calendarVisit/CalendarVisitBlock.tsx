'use client';

import { format } from 'date-fns';
import { Ban, Check, Clock, Home, Navigation } from 'lucide-react';
import type { CalendarVisit } from './calendarVisitTypes';
import { paletteForJob, resolveVisitStatus, statusIconColor } from './calendarVisitTheme';

type Props = {
  visit: CalendarVisit;
  variant?: 'timeline' | 'stacked' | 'chip';
  className?: string;
  style?: React.CSSProperties;
  onMouseEnter?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseLeave?: () => void;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
};

function StatusCornerIcon({ status }: { status: ReturnType<typeof resolveVisitStatus> }) {
  const color = statusIconColor(status);
  const cls = 'size-3.5 shrink-0';
  switch (status) {
    case 'arrived':
      return <Home className={cls} style={{ color }} aria-hidden />;
    case 'en_route':
      return <Navigation className={cls} style={{ color }} aria-hidden />;
    case 'completed':
      return <Check className={cls} style={{ color }} aria-hidden />;
    case 'cancelled':
      return <Ban className={cls} style={{ color }} aria-hidden />;
    default:
      return <Clock className={cls} style={{ color }} aria-hidden />;
  }
}

export function CalendarVisitBlock({
  visit,
  variant = 'timeline',
  className = '',
  style,
  onMouseEnter,
  onMouseLeave,
  onClick,
}: Props) {
  const palette = paletteForJob(visit.jobId);
  const status = resolveVisitStatus(visit.eventStatus);
  const start = new Date(visit.startTime);
  const end = new Date(start.getTime() + visit.durationMinutes * 60000);
  const timeLabel = `${format(start, 'HH:mm')} - ${format(end, 'HH:mm')}`;

  if (variant === 'chip') {
    return (
      <div
        className={`truncate rounded border px-1 py-0.5 text-[10px] leading-tight cursor-help ${className}`}
        style={{ backgroundColor: palette.bg, borderColor: palette.border, ...style }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onClick={onClick}
      >
        <span className="font-semibold text-slate-700">{format(start, 'HH:mm')}</span>{' '}
        <span className="text-slate-600">{visit.customerName.slice(0, 24)}</span>
      </div>
    );
  }

  const isCompact = variant === 'stacked';

  return (
    <div
      className={`flex flex-col overflow-hidden rounded border text-[11px] leading-tight shadow-sm transition-shadow hover:shadow-md cursor-help ${className}`}
      style={{
        backgroundColor: palette.bg,
        borderColor: palette.border,
        borderLeftWidth: 3,
        ...style,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-1 px-1.5 pt-1">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <span
            className="flex size-4 shrink-0 items-center justify-center rounded text-[9px] font-extrabold text-white"
            style={{ backgroundColor: palette.badgeBg }}
          >
            J
          </span>
          <span className="truncate font-bold text-slate-800">{timeLabel}</span>
        </div>
        <StatusCornerIcon status={status} />
      </div>
      {!isCompact && (
        <div className="space-y-0.5 px-1.5 pb-1 pt-0.5">
          <div className="truncate rounded-sm bg-black/[0.06] px-1 py-0.5 text-[10px] font-medium text-slate-700">
            {visit.customerName}
          </div>
          <div className="truncate rounded-sm bg-black/[0.04] px-1 py-0.5 text-[10px] text-slate-500">
            {visit.address?.trim() || 'Address not listed'}
          </div>
        </div>
      )}
      {isCompact && (
        <div className="truncate px-1.5 pb-1 text-[10px] font-medium text-slate-700">{visit.customerName}</div>
      )}
    </div>
  );
}
