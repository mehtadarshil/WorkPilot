import { PASS_FAIL_OUTCOME_STYLES } from './passFailOutcomes';

export function PassFailOutcomeBadge({ value }: { value: string }) {
  const key = value.trim().toLowerCase() as keyof typeof PASS_FAIL_OUTCOME_STYLES;
  const style = PASS_FAIL_OUTCOME_STYLES[key];
  if (!style) {
    if (!value.trim()) return <span className="cp-outcome-empty">—</span>;
    return <span>{value}</span>;
  }
  return (
    <span className="cp-outcome-badge" title={style.title} style={{ backgroundColor: style.bg, color: style.fg }}>
      {style.label}
    </span>
  );
}
