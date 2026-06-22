import { isPassLikeValue } from './outcomes';

export function PrintCheckmark({ value }: { value: string }) {
  const v = value.trim();
  if (!v) return <span className="cp-check-muted">—</span>;
  if (isPassLikeValue(v)) return <span className="cp-check cp-check-pass">✓</span>;
  const lower = v.toLowerCase();
  if (lower === 'fail' || lower === 'no' || lower === 'n') {
    return <span className="cp-check cp-check-fail">✗</span>;
  }
  return <span className="cp-check-muted">{v}</span>;
}
