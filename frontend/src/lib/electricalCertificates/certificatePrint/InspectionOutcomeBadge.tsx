import type { InspectionOutcome } from '../types';
import { inspectionOutcomeStyle } from './outcomes';

export function InspectionOutcomeBadge({ outcome }: { outcome: InspectionOutcome | string }) {
  if (!outcome) return <span className="cp-outcome-empty">—</span>;
  const style = inspectionOutcomeStyle(outcome);
  if (!style) return <span>{outcome}</span>;
  return (
    <span
      className="cp-outcome-badge"
      title={style.title}
      style={{ backgroundColor: style.bg, color: style.fg }}
    >
      {style.label}
    </span>
  );
}
