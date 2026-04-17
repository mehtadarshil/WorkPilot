'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

export interface WorkAddressOption {
  id: number;
  label: string;
}

type Props = {
  options: WorkAddressOption[];
  value: number | null;
  onChange: (id: number | null) => void;
  className?: string;
  disabled?: boolean;
  /** Shown when nothing selected (button). Defaults to create-quotation copy. */
  emptyButtonLabel?: string;
  /** First row in dropdown to clear selection. Defaults to create-quotation copy. */
  emptyMenuLabel?: string;
};

export default function WorkAddressSelect({
  options,
  value,
  onChange,
  className = '',
  disabled = false,
  emptyButtonLabel = 'None — customer address only on quotation',
  emptyMenuLabel = 'None — customer address only',
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.id === value) ?? null;

  const sorted = useMemo(() => {
    return [...options].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  }, [options]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((o) => o.label.toLowerCase().includes(q));
  }, [sorted, search]);

  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0, maxH: 320 });

  const updatePosition = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const maxH = Math.min(Math.floor(window.innerHeight * 0.5), 320);
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
    const top = openUp ? Math.max(8, rect.top - maxH - 4) : rect.bottom + 4;
    setMenuPos({
      top,
      left: rect.left,
      width: Math.max(rect.width, 220),
      maxH: openUp ? Math.min(maxH, spaceAbove - 8) : Math.min(maxH, spaceBelow - 8),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const onScroll = () => updatePosition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (portalRef.current?.contains(t)) return;
      setOpen(false);
      setSearch('');
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  useEffect(() => {
    if (open) setSearch('');
  }, [open]);

  return (
    <div ref={wrapRef} className={className}>
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          if (!open) updatePosition();
          setOpen((o) => !o);
        }}
        className={`flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-900 outline-none transition focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30 ${
          open ? 'border-[#14B8A6] ring-2 ring-[#14B8A6]/30' : ''
        } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
      >
        <span className="min-w-0 truncate font-medium">{selected ? selected.label : emptyButtonLabel}</span>
        <ChevronDown className={`size-4 shrink-0 text-slate-400 transition ${open ? 'rotate-180 text-[#14B8A6]' : ''}`} />
      </button>
      {open &&
        !disabled &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={portalRef}
            className="fixed z-[200] flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
            style={{
              top: menuPos.top,
              left: menuPos.left,
              width: menuPos.width,
              minWidth: 220,
              maxHeight: menuPos.maxH,
            }}
          >
            <div className="shrink-0 border-b border-slate-100 px-2 py-2">
              <input
                type="text"
                inputMode="search"
                autoComplete="off"
                placeholder="Search work / site addresses…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-black placeholder:text-slate-500 outline-none transition focus:bg-white focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
                autoFocus
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm font-medium text-slate-500 transition hover:bg-slate-50 hover:text-rose-600"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                {emptyMenuLabel}
              </button>
              {options.length === 0 ? (
                <div className="px-3 py-2 text-sm text-slate-400">This customer has no active work addresses yet.</div>
              ) : filtered.length === 0 ? (
                <div className="px-3 py-2 text-sm text-slate-400">No matches</div>
              ) : (
                filtered.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className={`w-full min-w-0 px-3 py-2 text-left text-sm transition ${
                      o.id === value ? 'bg-[#14B8A6]/10 font-medium text-[#14B8A6]' : 'text-slate-900 group'
                    } hover:bg-slate-50`}
                    onClick={() => {
                      onChange(o.id);
                      setOpen(false);
                    }}
                  >
                    <span className="block truncate">{o.label}</span>
                  </button>
                ))
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
