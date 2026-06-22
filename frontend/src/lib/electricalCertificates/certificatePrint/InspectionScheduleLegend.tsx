import { INSPECTION_LEGEND_ITEMS } from './outcomes';
import { InspectionOutcomeBadge } from './InspectionOutcomeBadge';

export function InspectionScheduleLegend() {
  return (
    <div className="cp-legend">
      {INSPECTION_LEGEND_ITEMS.map((item) => (
        <span key={`${item.outcome}-${item.text}`} className="cp-legend-item">
          <InspectionOutcomeBadge outcome={item.outcome} />
          <span>{item.text}</span>
        </span>
      ))}
    </div>
  );
}
