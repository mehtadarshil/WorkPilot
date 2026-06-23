import type { ObservationItem } from '../types';
import { OBSERVATION_CODE_SUMMARY, countObservationCodes } from './observationSummary';

export function ObservationSummaryGrid({ items }: { items: ObservationItem[] }) {
  const counts = countObservationCodes(items);
  return (
    <div className="cp-obs-summary-grid">
      {OBSERVATION_CODE_SUMMARY.map((box) => (
        <div key={box.code} className="cp-obs-summary-box">
          <div className="cp-obs-summary-badge" style={{ backgroundColor: box.bg, color: box.fg }}>
            <span className="cp-obs-summary-code">{box.title}</span>
          </div>
          <p className="cp-obs-summary-count">{counts[box.code]} result{counts[box.code] === 1 ? '' : 's'}</p>
          <p className="cp-obs-summary-text">{box.subtitle}</p>
        </div>
      ))}
    </div>
  );
}
