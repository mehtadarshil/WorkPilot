export type VisitStatusLog = {
  status: string;
  latitude: number | null;
  longitude: number | null;
  timestamp: string;
};

export type VisitTimesheetSegment = {
  segment_type: string | null;
  clock_in: string;
  clock_out: string | null;
  duration_seconds: number;
  notes?: string | null;
  officer_full_name?: string | null;
};

function normalizeStatus(status: string): string {
  return status.trim().toLowerCase().replace(/\s+/g, '_');
}

export function visitStatusLabel(status: string): string {
  const s = normalizeStatus(status);
  if (s === 'travelling_to_site' || s === 'travelling' || s === 'traveling_to_site' || s === 'traveling') {
    return 'Travelling to site';
  }
  if (s === 'arrived_at_site' || s === 'arrived' || s === 'on_site') return 'Arrived at site';
  if (s === 'job_report_submitted') return 'Job report submitted';
  if (s === 'completed') return 'Completed';
  if (s === 'cancelled' || s === 'aborted') return 'Cancelled';
  return status.replace(/_/g, ' ');
}

export function visitStatusTone(status: string): 'travel' | 'onsite' | 'report' | 'done' | 'cancel' | 'other' {
  const s = normalizeStatus(status);
  if (s === 'travelling_to_site' || s === 'travelling' || s === 'traveling_to_site' || s === 'traveling') {
    return 'travel';
  }
  if (s === 'arrived_at_site' || s === 'arrived' || s === 'on_site') return 'onsite';
  if (s === 'job_report_submitted') return 'report';
  if (s === 'completed') return 'done';
  if (s === 'cancelled' || s === 'aborted') return 'cancel';
  return 'other';
}

export function visitSegmentLabel(segmentType: string | null): string {
  const s = normalizeStatus(segmentType ?? '');
  if (s === 'travelling') return 'Travelling';
  if (s === 'on_site') return 'On site';
  return segmentType?.trim() || 'Segment';
}

export function hasVisitCoordinates(lat: number | null, lon: number | null): boolean {
  return lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0);
}

export function visitMapsUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lon}`)}`;
}

export function formatVisitDurationBetweenMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m} min${s > 0 ? ` ${s}s` : ''}`;
  return `${s}s`;
}
