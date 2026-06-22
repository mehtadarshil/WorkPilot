import { normalizeAssessment } from './outcomes';
import { PRINT_ASSESSMENT_STYLES } from './tokens';

export function AssessmentBanner({ value, label }: { value: string; label?: string }) {
  const normalized = normalizeAssessment(value);
  if (normalized) {
    const style = PRINT_ASSESSMENT_STYLES[normalized];
    return (
      <div className="my-2">
        {label && <p className="mb-1 text-xs font-semibold text-slate-600">{label}</p>}
        <span className="cp-assessment" style={{ backgroundColor: style.bg, color: style.fg }}>
          {style.label}
        </span>
      </div>
    );
  }
  if (!value.trim()) return null;
  return (
    <div className="my-2">
      {label && <p className="mb-1 text-xs font-semibold text-slate-600">{label}</p>}
      <span className="cp-assessment-neutral">{value}</span>
    </div>
  );
}
