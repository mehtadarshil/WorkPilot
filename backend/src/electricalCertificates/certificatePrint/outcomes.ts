import type { InspectionOutcome } from '../types';
import { PRINT_ASSESSMENT_STYLES, PRINT_OUTCOME_STYLES } from './tokens';

export const INSPECTION_LEGEND_ITEMS: { outcome: InspectionOutcome; text: string }[] = [
  { outcome: 'pass', text: 'Acceptable condition' },
  { outcome: 'c1', text: 'Unacceptable condition' },
  { outcome: 'c2', text: 'Unacceptable condition' },
  { outcome: 'c3', text: 'Improvement recommended' },
  { outcome: 'fi', text: 'Further investigation' },
  { outcome: 'nv', text: 'Not verified' },
  { outcome: 'lim', text: 'Limitation' },
  { outcome: 'na', text: 'Not applicable' },
];

export function isPassLikeValue(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === 'pass' || v === 'yes' || v === 'y' || v === '✓' || v === 'ok' || v === 'satisfactory';
}

export function normalizeAssessment(value: string): 'satisfactory' | 'unsatisfactory' | null {
  const v = value.trim().toLowerCase();
  if (v === 'satisfactory' || v === 'pass') return 'satisfactory';
  if (v === 'unsatisfactory' || v === 'fail' || v === 'failed') return 'unsatisfactory';
  return null;
}

export function inspectionOutcomeBadgeHtml(outcome: InspectionOutcome | string, esc: (s: string) => string): string {
  if (!outcome) return '<span class="cp-outcome-empty">—</span>';
  const style = PRINT_OUTCOME_STYLES[outcome as keyof typeof PRINT_OUTCOME_STYLES];
  if (!style) return esc(String(outcome));
  return `<span class="cp-outcome-badge" title="${esc(style.title)}" style="background:${style.bg};color:${style.fg}">${esc(style.label)}</span>`;
}

export function inspectionScheduleLegendHtml(esc: (s: string) => string): string {
  const items = INSPECTION_LEGEND_ITEMS.map(
    (item) =>
      `<span class="cp-legend-item">${inspectionOutcomeBadgeHtml(item.outcome, esc)}<span>${esc(item.text)}</span></span>`,
  ).join('');
  return `<div class="cp-legend">${items}</div>`;
}

export function assessmentBannerHtml(value: string, esc: (s: string) => string, label?: string): string {
  const normalized = normalizeAssessment(value);
  if (normalized) {
    const style = PRINT_ASSESSMENT_STYLES[normalized];
    const labelHtml = label ? `<p class="assessment-label">${esc(label)}</p>` : '';
    return `${labelHtml}<span class="cp-assessment" style="background:${style.bg};color:${style.fg}">${style.label}</span>`;
  }
  if (!value.trim()) return '';
  const labelHtml = label ? `<p class="assessment-label">${esc(label)}</p>` : '';
  return `${labelHtml}<span class="cp-assessment-neutral">${esc(value)}</span>`;
}

export function printCheckmarkHtml(value: string, esc: (s: string) => string): string {
  const v = value.trim();
  if (!v) return '<span class="cp-check-muted">—</span>';
  if (isPassLikeValue(v)) return '<span class="cp-check cp-check-pass">✓</span>';
  const lower = v.toLowerCase();
  if (lower === 'fail' || lower === 'no' || lower === 'n') {
    return '<span class="cp-check cp-check-fail">✗</span>';
  }
  return `<span class="cp-check-muted">${esc(v)}</span>`;
}
