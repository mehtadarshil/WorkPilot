'use client';

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30';
const labelClass = 'text-xs font-semibold uppercase tracking-wide text-slate-500';

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className={labelClass}>{children}</label>;
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <FieldLabel>{label}</FieldLabel>
      <input
        type={type}
        className={inputClass}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <FieldLabel>{label}</FieldLabel>
      <textarea
        className={inputClass}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1">
      <FieldLabel>{label}</FieldLabel>
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function OutcomeButtons({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; className?: string }[];
}) {
  return (
    <div className="space-y-1">
      <FieldLabel>{label}</FieldLabel>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
              value === o.value
                ? o.className ?? 'border-[#14B8A6] bg-[#14B8A6]/10 text-[#0d9488]'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-bold text-slate-900">{title}</h3>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export const PASS_FAIL_OPTIONS = [
  { value: 'pass', label: 'PASS', className: 'border-emerald-500 bg-emerald-50 text-emerald-800' },
  { value: 'fail', label: 'FAIL', className: 'border-rose-500 bg-rose-50 text-rose-800' },
  { value: 'lim', label: 'LIM', className: 'border-amber-500 bg-amber-50 text-amber-800' },
  { value: 'na', label: 'N/A', className: 'border-slate-400 bg-slate-50 text-slate-700' },
];

export const YES_NO_OPTIONS = [
  { value: 'yes', label: 'YES' },
  { value: 'no', label: 'NO' },
  { value: 'lim', label: 'LIM' },
  { value: 'na', label: 'N/A' },
];

export const INSPECTION_OUTCOMES = [
  { value: 'pass', label: '✓', className: 'border-emerald-500 bg-emerald-50 text-emerald-800' },
  { value: 'c1', label: 'C1', className: 'border-rose-600 bg-rose-50 text-rose-900' },
  { value: 'c2', label: 'C2', className: 'border-orange-500 bg-orange-50 text-orange-900' },
  { value: 'c3', label: 'C3', className: 'border-amber-500 bg-amber-50 text-amber-900' },
  { value: 'fi', label: 'FI', className: 'border-violet-500 bg-violet-50 text-violet-900' },
  { value: 'lim', label: 'LIM', className: 'border-slate-500 bg-slate-50 text-slate-800' },
  { value: 'nv', label: 'N/V', className: 'border-slate-400 bg-slate-50 text-slate-600' },
  { value: 'na', label: 'N/A', className: 'border-slate-300 bg-slate-50 text-slate-600' },
];
