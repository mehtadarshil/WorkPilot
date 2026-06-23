'use client';

import { useEffect, useState } from 'react';
import dayjs from 'dayjs';

function formatRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function PpmSlaCountdown({
  slaDueAt,
  breached: initialBreached,
}: {
  slaDueAt: string;
  breached?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const dueMs = dayjs(slaDueAt).valueOf();
  if (!Number.isFinite(dueMs)) return null;

  const remaining = dueMs - now;
  const breached = initialBreached ?? remaining <= 0;

  return (
    <span className="tabular-nums">
      {breached ? (
        <>Overdue by {formatRemaining(-remaining)}</>
      ) : (
        <>{formatRemaining(remaining)} remaining</>
      )}
    </span>
  );
}
