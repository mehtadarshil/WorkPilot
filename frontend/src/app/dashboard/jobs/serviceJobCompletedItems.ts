export type CompletedServicePayload = { name: string; remind_email: boolean };

export type ServiceChecklistReminderFields = {
  reminder_interval_n?: number | null;
  reminder_interval_unit?: string | null;
  reminder_early_n?: number | null;
  reminder_early_unit?: string | null;
};

/** Parse job.completed_service_items (legacy string[] or object rows). */
export function parseCompletedServiceItemsFromJob(raw: unknown): {
  completedNames: string[];
  remindEmail: Record<string, boolean>;
} {
  const completedNames: string[] = [];
  const remindEmail: Record<string, boolean> = {};
  if (!Array.isArray(raw)) return { completedNames, remindEmail };
  for (const el of raw) {
    if (typeof el === 'string') {
      const n = el.trim();
      if (!n || completedNames.includes(n)) continue;
      completedNames.push(n);
      remindEmail[n] = true;
      continue;
    }
    if (el && typeof el === 'object' && typeof (el as { name: unknown }).name === 'string') {
      const n = String((el as { name: string }).name).trim();
      if (!n || completedNames.includes(n)) continue;
      completedNames.push(n);
      remindEmail[n] = (el as { remind_email?: unknown }).remind_email !== false;
    }
  }
  return { completedNames, remindEmail };
}

export function buildCompletedServiceItemsPayload(
  isServiceJob: boolean,
  completedNames: string[],
  remindEmail: Record<string, boolean>,
): CompletedServicePayload[] {
  if (!isServiceJob) return [];
  return completedNames.map((name) => ({
    name,
    remind_email: remindEmail[name] !== false,
  }));
}

function intervalLabel(n: number, unit: string): string {
  const u = unit || 'years';
  const map: Record<string, [string, string]> = {
    days: ['day', 'days'],
    weeks: ['week', 'weeks'],
    months: ['month', 'months'],
    years: ['year', 'years'],
  };
  const pair = map[u] ?? map.years;
  return `${n} ${n === 1 ? pair[0] : pair[1]}`;
}

export function formatChecklistReminderSummary(item: ServiceChecklistReminderFields): string {
  const inN = item.reminder_interval_n ?? 1;
  const inU = item.reminder_interval_unit || 'years';
  const eN = item.reminder_early_n ?? 14;
  const eU = item.reminder_early_unit || 'days';
  return `Repeat every ${intervalLabel(inN, inU)}; first reminder up to ${intervalLabel(eN, eU)} before due`;
}

export function formatCompletedServicesForJobDetail(raw: unknown): string {
  if (!Array.isArray(raw) || raw.length === 0) return 'None selected';
  const parts: string[] = [];
  for (const el of raw) {
    if (typeof el === 'string') {
      const n = el.trim();
      if (n) parts.push(n);
    } else if (el && typeof el === 'object' && typeof (el as { name: unknown }).name === 'string') {
      const name = String((el as { name: string }).name).trim();
      if (!name) continue;
      const email = (el as { remind_email?: unknown }).remind_email !== false;
      parts.push(email ? name : `${name} (no reminder email)`);
    }
  }
  return parts.length ? parts.join(', ') : 'None selected';
}
