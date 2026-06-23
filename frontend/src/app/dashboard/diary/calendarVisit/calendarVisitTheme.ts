export type VisitStatusKey = 'arrived' | 'en_route' | 'completed' | 'cancelled' | 'scheduled';

export type VisitPalette = {
  bg: string;
  border: string;
  badgeBg: string;
  headerBg: string;
  headerBorder: string;
};

/** Commusoft-style pastel block colours (stable per job). */
export const VISIT_PALETTES: VisitPalette[] = [
  { bg: '#FDF0E6', border: '#F0B27A', badgeBg: '#E67E22', headerBg: '#FDEBD0', headerBorder: '#D35400' },
  { bg: '#EAF4FB', border: '#85C1E9', badgeBg: '#3498DB', headerBg: '#D6EAF8', headerBorder: '#2874A6' },
  { bg: '#FDEDF3', border: '#F1948A', badgeBg: '#E74C3C', headerBg: '#FADBD8', headerBorder: '#C0392B' },
  { bg: '#E8F8F0', border: '#82E0AA', badgeBg: '#27AE60', headerBg: '#D5F5E3', headerBorder: '#1E8449' },
  { bg: '#F4ECF7', border: '#C39BD3', badgeBg: '#8E44AD', headerBg: '#EBDEF0', headerBorder: '#6C3483' },
];

export function paletteForJob(jobId: number): VisitPalette {
  return VISIT_PALETTES[Math.abs(jobId) % VISIT_PALETTES.length];
}

export function resolveVisitStatus(status?: string | null): VisitStatusKey {
  const s = (status || '').toLowerCase();
  if (s === 'arrived_at_site' || s === 'arrived' || s === 'on_site') return 'arrived';
  if (s === 'travelling_to_site' || s === 'en_route' || s === 'dispatched') return 'en_route';
  if (s === 'completed' || s === 'closed') return 'completed';
  if (s === 'cancelled' || s === 'aborted') return 'cancelled';
  return 'scheduled';
}

export function statusLabel(key: VisitStatusKey): string {
  switch (key) {
    case 'arrived':
      return 'On site';
    case 'en_route':
      return 'En route';
    case 'completed':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'Scheduled';
  }
}

export function statusIconColor(key: VisitStatusKey): string {
  switch (key) {
    case 'arrived':
      return '#27AE60';
    case 'en_route':
      return '#3498DB';
    case 'completed':
      return '#16A085';
    case 'cancelled':
      return '#E74C3C';
    default:
      return '#7F8C8D';
  }
}
