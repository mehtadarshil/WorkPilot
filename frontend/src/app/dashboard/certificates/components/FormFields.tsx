import { useState, useEffect } from 'react';
import type { KeyboardEvent } from 'react';
import dayjs from 'dayjs';

const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/40';
const labelClass = 'text-[11px] font-bold uppercase tracking-wide text-slate-600';

export const TEXT_QUICK_NA_LIM = [
  { value: 'N/A', label: 'N/A' },
  { value: 'LIM', label: 'LIM' },
];

export const SELECT_QUICK_NA_LIM = [
  { value: 'na', label: 'N/A' },
  { value: 'lim', label: 'LIM' },
];

export const SELECT_QUICK_NA_LIM_UNKNOWN = [
  { value: 'na', label: 'N/A' },
  { value: 'lim', label: 'LIM' },
  { value: 'UNKNOWN', label: 'UNKNOWN' },
];

export function QuickSetButtons({
  value,
  onChange,
  options,
  compact = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-1 ${compact ? 'pt-0.5' : 'pt-1'}`}>
      {options.map((option) => {
        const selected = value.trim().toLowerCase() === option.value.trim().toLowerCase();
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded border px-2 py-0.5 font-semibold transition-colors ${
              compact ? 'text-[10px]' : 'text-[11px]'
            } ${
              selected
                ? 'border-[#14B8A6] bg-[#14B8A6]/15 text-[#0d9488]'
                : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-white'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function QuickSetTextField({
  label,
  value,
  onChange,
  options = TEXT_QUICK_NA_LIM,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options?: { value: string; label: string }[];
  type?: string;
}) {
  return (
    <div>
      <TextField label={label} value={value} onChange={onChange} type={type} />
      <QuickSetButtons value={value} onChange={onChange} options={options} compact />
    </div>
  );
}

export function QuickSetTextAreaField({
  label,
  value,
  onChange,
  options = TEXT_QUICK_NA_LIM,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options?: { value: string; label: string }[];
  rows?: number;
}) {
  return (
    <div>
      <TextAreaField label={label} value={value} onChange={onChange} rows={rows} />
      <QuickSetButtons value={value} onChange={onChange} options={options} compact />
    </div>
  );
}


export function QuickSetSelectField({
  label,
  value,
  onChange,
  options,
  quickOptions = SELECT_QUICK_NA_LIM,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  quickOptions?: { value: string; label: string }[];
}) {
  return (
    <div>
      <SelectField label={label} value={value} onChange={onChange} options={options} />
      <QuickSetButtons value={value} onChange={onChange} options={quickOptions} compact />
    </div>
  );
}

function handleFormFieldKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
  const grid = event.currentTarget.closest<HTMLElement>('[data-form-grid]');
  if (!grid) return;
  const fields = Array.from(
    grid.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      'input:not([type="checkbox"]):not([disabled]), select:not([disabled]), textarea:not([disabled])',
    ),
  );
  const index = fields.indexOf(event.currentTarget);
  if (index < 0) return;

  const focusField = (nextIndex: number) => {
    const field = fields[Math.max(0, Math.min(nextIndex, fields.length - 1))];
    if (!field) return;
    field.focus();
    if ('select' in field && typeof field.select === 'function') field.select();
  };

  if (event.key === 'Enter') {
    event.preventDefault();
    focusField(event.shiftKey ? index - 1 : index + 1);
    return;
  }

  const colStep = grid.dataset.formCols === '2' ? 2 : 1;
  const moves: Partial<Record<string, number>> = {
    ArrowUp: -colStep,
    ArrowDown: colStep,
    ArrowLeft: -1,
    ArrowRight: 1,
  };
  const delta = moves[event.key];
  if (delta === undefined) return;
  event.preventDefault();
  focusField(index + delta);
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className={labelClass}>{children}</label>;
}
export function DateInput({
  label,
  value,
  onChange,
  placeholder = 'DD/MM/YYYY',
  inputClassName,
  labelClassName,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputClassName?: string;
  labelClassName?: string;
}) {
  const formatToDisplay = (val: string) => {
    if (!val) return '';
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) return val;
    const d = dayjs(val, 'YYYY-MM-DD');
    return d.isValid() ? d.format('DD/MM/YYYY') : val;
  };

  const [inputValue, setInputValue] = useState(formatToDisplay(value));

  useEffect(() => {
    setInputValue(formatToDisplay(value));
  }, [value]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let text = e.target.value;
    text = text.replace(/[^0-9/]/g, '');

    // Automatically append slashes
    if (text.length === 2 && !text.includes('/')) {
      text = text + '/';
    } else if (text.length === 5 && text.split('/').length === 2) {
      text = text + '/';
    }

    if (text.length > 10) {
      text = text.slice(0, 10);
    }

    setInputValue(text);

    if (text.length === 10) {
      const parts = text.split('/');
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const year = parseInt(parts[2], 10);
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1000 && year <= 9999) {
          const formattedMonth = month < 10 ? `0${month}` : `${month}`;
          const formattedDay = day < 10 ? `0${day}` : `${day}`;
          const isoDate = `${year}-${formattedMonth}-${formattedDay}`;
          onChange(isoDate);
        }
      }
    } else if (text === '') {
      onChange('');
    }
  };

  const handleBlur = () => {
    if (!inputValue) {
      onChange('');
      return;
    }
    if (inputValue.length !== 10) {
      setInputValue(formatToDisplay(value));
    } else {
      const parts = inputValue.split('/');
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);
      if (!(day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1000 && year <= 9999)) {
        setInputValue(formatToDisplay(value));
      }
    }
  };

  return (
    <div className="space-y-1">
      {label && <label className={labelClassName || labelClass}>{label}</label>}
      <input
        type="text"
        className={inputClassName || inputClass}
        value={inputValue}
        placeholder={placeholder}
        onChange={handleTextChange}
        onBlur={handleBlur}
        onKeyDown={handleFormFieldKeyDown}
      />
    </div>
  );
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
  if (type === 'date') {
    return <DateInput label={label} value={value} onChange={onChange} placeholder={placeholder} />;
  }

  return (
    <div className="space-y-1">
      <FieldLabel>{label}</FieldLabel>
      <input
        type={type}
        className={inputClass}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleFormFieldKeyDown}
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
        onKeyDown={handleFormFieldKeyDown}
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
      <select
        className={inputClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleFormFieldKeyDown}
      >
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
  compact = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; className?: string }[];
  compact?: boolean;
}) {
  return (
    <div className="space-y-1">
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      <div className={`flex flex-wrap ${compact ? 'gap-0.5' : 'gap-1'}`}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`rounded border font-semibold transition-colors ${
              compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
            } ${
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

/** Compact outcome row for inspection schedule tables. */
export function InspectionOutcomePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return <OutcomeButtons label="" value={value} onChange={onChange} options={INSPECTION_OUTCOMES} compact />;
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
