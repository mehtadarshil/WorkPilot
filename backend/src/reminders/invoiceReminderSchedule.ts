/** Days from invoice due date (0 = on due date) when an automated reminder should fire. */
export function resolveInvoiceReminderSlot(
  daysFromDue: number,
  defaultDueDays: number,
  afterDueReminderDays: number,
): { phase: number; label: string } | null {
  if (daysFromDue < 0) return null;

  const dueDays = Math.max(1, Math.min(365, Math.round(defaultDueDays)));
  const afterDays = Math.max(1, Math.min(30, Math.round(afterDueReminderDays)));

  if (daysFromDue === 0) {
    return { phase: 0, label: 'Payment due reminder' };
  }
  if (daysFromDue === dueDays) {
    return { phase: dueDays, label: 'Overdue payment reminder' };
  }
  if (daysFromDue > dueDays) {
    const extra = daysFromDue - dueDays;
    if (extra > 0 && extra % afterDays === 0) {
      return { phase: daysFromDue, label: 'Payment follow-up reminder' };
    }
  }
  return null;
}
