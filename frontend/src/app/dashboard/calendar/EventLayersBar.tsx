'use client';

type Props = {
  showLeaveToggle: boolean;
  leave: boolean;
  holidays: boolean;
  onChange: (next: { leave: boolean; holidays: boolean }) => void;
};

export function EventLayersBar({ showLeaveToggle, leave, holidays, onChange }: Props) {
  if (!showLeaveToggle) return null;
  return (
    <div className="flex flex-wrap items-center gap-4 text-sm font-medium text-slate-600">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Layers</span>
      <label className="inline-flex items-center gap-2">
        <input
          type="checkbox"
          checked={leave}
          onChange={(e) => onChange({ leave: e.target.checked, holidays })}
          className="rounded border-slate-300 text-[#14B8A6] focus:ring-[#14B8A6]"
        />
        Leave
      </label>
      <label className="inline-flex items-center gap-2">
        <input
          type="checkbox"
          checked={holidays}
          onChange={(e) => onChange({ leave, holidays: e.target.checked })}
          className="rounded border-slate-300 text-[#14B8A6] focus:ring-[#14B8A6]"
        />
        Company holidays
      </label>
    </div>
  );
}
