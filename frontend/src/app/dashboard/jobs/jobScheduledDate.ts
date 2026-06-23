export function pickJobScheduledDateIso(
  expectedCompletion: string | null | undefined,
  diaryEvents: Array<{ start_time: string; status?: string | null }>,
): string | null {
  const active = diaryEvents.filter((e) => {
    const s = String(e.status ?? '').toLowerCase().trim();
    return s !== 'cancelled' && s !== 'aborted';
  });
  if (active.length > 0) {
    const sorted = [...active].sort(
      (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
    );
    const now = Date.now();
    const upcoming = sorted.find((e) => new Date(e.start_time).getTime() >= now);
    return (upcoming ?? sorted[sorted.length - 1]).start_time;
  }
  const ec = expectedCompletion?.trim();
  return ec || null;
}
