'use client';

import { format } from 'date-fns';
import { Ban, Check, Clock, Home, Navigation } from 'lucide-react';
import type { CalendarVisit } from './calendarVisitTypes';
import { formatJobStateLabel } from './jobStateLabel';
import { paletteForVisit, resolveVisitStatus, statusIconColor } from './calendarVisitTheme';

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

function visitJobNumber(visit: CalendarVisit): string {
  if (visit.isGeneral || visit.jobId == null) {
    return visit.title?.trim() || visit.worksCategory?.trim() || 'General event';
  }
  const n = visit.jobNumber?.trim();
  if (n) return n;
  return `JOB-${String(visit.jobId).padStart(4, '0')}`;
}

function visitAddressLine(visit: CalendarVisit): string {
  return visit.addressLine1?.trim() || visit.address?.trim() || 'No address';
}

function visitWorksCategory(visit: CalendarVisit): string {
  return visit.worksCategory?.trim() || visit.title?.trim() || 'General works';
}

function VisitSummaryLines({
  visit,
  showTime,
  compact,
}: {
  visit: CalendarVisit;
  showTime?: boolean;
  compact?: boolean;
}) {
  const start = new Date(visit.startTime);
  const jobNo = visitJobNumber(visit);
  const address = visit.isGeneral ? visit.addressLine1?.trim() || visit.address?.trim() || '' : visitAddressLine(visit);
  const category = visitWorksCategory(visit);
  const status = visit.isGeneral ? null : formatJobStateLabel(visit.jobState);
  const textSize = compact ? 'text-[9px]' : 'text-[10px]';

  return (
    <div className={`space-y-0.5 leading-tight ${textSize}`}>
      <div className="truncate font-semibold text-slate-800">
        {showTime ? (
          <>
            <span className="text-slate-500">{format(start, 'HH:mm')}</span>{' '}
          </>
        ) : null}
        {jobNo}
        {address ? <span className="font-medium text-slate-600"> · {address}</span> : null}
      </div>
      <div className="truncate font-medium text-slate-700">{category}</div>
      {status ? (
        <div className="truncate font-semibold uppercase tracking-wide text-slate-500">{status}</div>
      ) : null}
    </div>
  );
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
  const palette = paletteForVisit(visit);
  const status = resolveVisitStatus(visit.eventStatus);
  const start = new Date(visit.startTime);
  const end = new Date(start.getTime() + visit.durationMinutes * 60000);
  const timeLabel = `${format(start, 'HH:mm')} - ${format(end, 'HH:mm')}`;

  if (variant === 'chip') {
    return (
      <div
        className={`rounded border px-1 py-0.5 cursor-help ${className}`}
        style={{ backgroundColor: palette.bg, borderColor: palette.border, ...style }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onClick={onClick}
      >
        <VisitSummaryLines visit={visit} showTime compact />
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
            {visit.isGeneral ? 'G' : 'J'}
          </span>
          <span className="truncate font-bold text-slate-800">{timeLabel}</span>
        </div>
        <StatusCornerIcon status={status} />
      </div>
      <div className={`px-1.5 pb-1 pt-0.5 ${isCompact ? 'pt-0' : ''}`}>
        <VisitSummaryLines visit={visit} compact={isCompact} />
      </div>
    </div>
  );
}
