export const PASS_FAIL_OUTCOME_STYLES = {
  pass: { bg: '#059669', fg: '#fff', label: 'PASS', title: 'Pass' },
  fail: { bg: '#dc2626', fg: '#fff', label: 'FAIL', title: 'Fail' },
  yes: { bg: '#059669', fg: '#fff', label: 'YES', title: 'Yes' },
  no: { bg: '#dc2626', fg: '#fff', label: 'NO', title: 'No' },
  lim: { bg: '#374151', fg: '#fff', label: 'LIM', title: 'Limitation' },
  na: { bg: '#6b7280', fg: '#fff', label: 'N/A', title: 'Not applicable' },
} as const;

export type PassFailOutcomeKey = keyof typeof PASS_FAIL_OUTCOME_STYLES;

export function passFailOutcomeBadgeHtml(value: string, esc: (s: string) => string): string {
  const key = value.trim().toLowerCase() as PassFailOutcomeKey;
  const style = PASS_FAIL_OUTCOME_STYLES[key];
  if (!style) {
    if (!value.trim()) return '<span class="cp-outcome-empty">—</span>';
    return esc(value);
  }
  return `<span class="cp-outcome-badge" title="${esc(style.title)}" style="background:${style.bg};color:${style.fg}">${esc(style.label)}</span>`;
}
