'use client';

import dayjs from 'dayjs';
import { Car, MapPin, CheckCircle, ClipboardCheck, XCircle, Circle, Navigation } from 'lucide-react';
import type { VisitStatusLog, VisitTimesheetSegment } from './visitStatusLabels';
import {
  formatVisitDurationBetweenMs,
  hasVisitCoordinates,
  visitMapsUrl,
  visitSegmentLabel,
  visitStatusLabel,
  visitStatusTone,
} from './visitStatusLabels';

function StatusIcon({ tone }: { tone: ReturnType<typeof visitStatusTone> }) {
  const className = 'size-3.5 shrink-0';
  switch (tone) {
    case 'travel':
      return <Car className={className} />;
    case 'onsite':
      return <MapPin className={className} />;
    case 'report':
      return <ClipboardCheck className={className} />;
    case 'done':
      return <CheckCircle className={className} />;
    case 'cancel':
      return <XCircle className={className} />;
    default:
      return <Circle className={className} />;
  }
}

function toneClasses(tone: ReturnType<typeof visitStatusTone>): { dot: string; icon: string } {
  switch (tone) {
    case 'travel':
      return { dot: 'bg-sky-500 border-sky-200', icon: 'text-sky-600 bg-sky-50' };
    case 'onsite':
      return { dot: 'bg-amber-500 border-amber-200', icon: 'text-amber-700 bg-amber-50' };
    case 'report':
      return { dot: 'bg-teal-500 border-teal-200', icon: 'text-teal-700 bg-teal-50' };
    case 'done':
      return { dot: 'bg-emerald-500 border-emerald-200', icon: 'text-emerald-700 bg-emerald-50' };
    case 'cancel':
      return { dot: 'bg-rose-500 border-rose-200', icon: 'text-rose-700 bg-rose-50' };
    default:
      return { dot: 'bg-slate-400 border-slate-200', icon: 'text-slate-600 bg-slate-100' };
  }
}

function formatClockDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export function VisitJobSheetTimeline({
  statusLogs,
  timesheetEntries,
  onEditClick,
}: {
  statusLogs: VisitStatusLog[];
  timesheetEntries: VisitTimesheetSegment[];
  onEditClick?: () => void;
}) {
  if (statusLogs.length === 0 && timesheetEntries.length === 0) return null;

  return (
    <div className="mt-4 space-y-5">
      {statusLogs.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Travel &amp; status timeline
            </p>
            {onEditClick && (
              <button
                type="button"
                onClick={onEditClick}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-[#14B8A6] hover:underline"
              >
                Edit Timeline
              </button>
            )}
          </div>
          <ol className="space-y-0">
            {statusLogs.map((log, index) => {
              const tone = visitStatusTone(log.status);
              const colors = toneClasses(tone);
              const ts = dayjs(log.timestamp);
              const prev = index > 0 ? dayjs(statusLogs[index - 1].timestamp) : null;
              const elapsedMs = prev?.isValid() && ts.isValid() ? ts.diff(prev) : null;
              const hasCoords = hasVisitCoordinates(log.latitude, log.longitude);

              return (
                <li key={`${log.timestamp}-${log.status}-${index}`} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className={`flex size-7 items-center justify-center rounded-full border-2 ${colors.icon}`}
                    >
                      <StatusIcon tone={tone} />
                    </div>
                    {index < statusLogs.length - 1 && <div className="my-1 w-0.5 flex-1 min-h-[20px] bg-slate-200" />}
                  </div>
                  <div className={`min-w-0 flex-1 ${index < statusLogs.length - 1 ? 'pb-4' : 'pb-1'}`}>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-sm font-bold text-slate-800">{visitStatusLabel(log.status)}</span>
                      {elapsedMs != null && elapsedMs > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                          <Navigation className="size-3" />
                          {formatVisitDurationBetweenMs(elapsedMs)} since previous
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {ts.isValid()
                        ? ts.format('dddd D MMM YYYY [at] HH:mm:ss')
                        : log.timestamp}
                    </p>
                    {hasCoords && log.latitude != null && log.longitude != null && (
                      <a
                        href={visitMapsUrl(log.latitude, log.longitude)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-[#14B8A6] hover:underline"
                      >
                        <MapPin className="size-3.5 shrink-0" />
                        {log.latitude.toFixed(5)}, {log.longitude.toFixed(5)}
                        <span className="font-normal text-slate-400">· Open map</span>
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {timesheetEntries.length > 0 && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">
            Recorded timesheet segments
          </p>
          <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Engineer</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Started</th>
                  <th className="px-3 py-2">Ended</th>
                  <th className="px-3 py-2 text-right">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {timesheetEntries.map((entry, idx) => {
                  const start = dayjs(entry.clock_in);
                  const end = entry.clock_out ? dayjs(entry.clock_out) : null;
                  return (
                    <tr key={`${entry.clock_in}-${idx}`}>
                      <td className="px-3 py-2 font-semibold text-slate-800">
                        {entry.officer_full_name || '—'}
                      </td>
                      <td className="px-3 py-2 font-semibold text-slate-800">
                        {visitSegmentLabel(entry.segment_type)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {start.isValid() ? start.format('HH:mm:ss') : '—'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {end?.isValid() ? end.format('HH:mm:ss') : 'In progress'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-semibold">
                        {formatClockDuration(entry.duration_seconds)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
