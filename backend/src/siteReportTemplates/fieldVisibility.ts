import type { SiteReportFieldHideFollowingRule, SiteReportTemplateField } from './types';

export function parseHideFollowingRule(raw: unknown): SiteReportFieldHideFollowingRule | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const when_values = Array.isArray(o.when_values)
    ? o.when_values
        .filter((v): v is string => typeof v === 'string')
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean)
    : [];
  const hide_next_count =
    typeof o.hide_next_count === 'number' && Number.isFinite(o.hide_next_count)
      ? Math.min(20, Math.max(0, Math.round(o.hide_next_count)))
      : 0;
  if (when_values.length === 0 || hide_next_count <= 0) return undefined;
  return { when_values, hide_next_count };
}

function fieldAnswerValue(
  fieldId: string,
  values: Record<string, string>,
  overrides?: Record<string, string>,
): string {
  const override = overrides?.[fieldId];
  return (override !== undefined ? override : values[fieldId] ?? '').trim().toLowerCase();
}

/** Field ids hidden by hide_following_when rules on earlier fields in the same list. */
export function computeHiddenSiteReportFieldIds(
  fields: SiteReportTemplateField[],
  values: Record<string, string>,
  overrides?: Record<string, string>,
): Set<string> {
  const hidden = new Set<string>();
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    const rule = field.hide_following_when;
    if (!rule || rule.hide_next_count <= 0 || rule.when_values.length === 0) continue;
    const answer = fieldAnswerValue(field.id, values, overrides);
    if (!rule.when_values.includes(answer)) continue;
    for (let j = 1; j <= rule.hide_next_count && i + j < fields.length; j++) {
      hidden.add(fields[i + j]!.id);
    }
  }
  return hidden;
}

export function visibleSiteReportFields(
  fields: SiteReportTemplateField[],
  values: Record<string, string>,
  overrides?: Record<string, string>,
): SiteReportTemplateField[] {
  const hidden = computeHiddenSiteReportFieldIds(fields, values, overrides);
  return fields.filter((f) => !hidden.has(f.id));
}
