'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

export interface ImportCustomerOption {
  id: number;
  full_name: string;
}

type Props = {
  customers: ImportCustomerOption[];
  value: number | null;
  onChange: (id: number | null) => void;
  className?: string;
};

export default function ImportCustomerSelect({ customers, value, onChange, className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);

  const selected = customers.find((c) => c.id === value) ?? null;

  const sorted = useMemo(() => {
    return [...customers].sort((a, b) => a.full_name.localeCompare(b.full_name, undefined, { sensitivity: 'base' }));
  }, [customers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((c) => c.full_name.toLowerCase().includes(q));
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
        onClick={(e) => {
          e.stopPropagation();
          if (!open) updatePosition();
          setOpen((o) => !o);
        }}
        className="flex w-full min-w-0 items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2 py-1 text-left text-sm text-slate-900"
      >
        <span className="min-w-0 truncate">{selected ? selected.full_name : 'Select customer'}</span>
        <ChevronDown className={`size-4 shrink-0 text-slate-500 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open &&
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
                placeholder="Search customers…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm text-black placeholder:text-slate-500 outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]"
                autoFocus
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left text-sm text-slate-500 hover:bg-slate-50"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                Clear selection
              </button>
              {filtered.length === 0 ? (
                <div className="px-3 py-2 text-sm text-slate-400">No matches</div>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`w-full min-w-0 truncate px-3 py-1.5 text-left text-sm hover:bg-slate-50 ${
                      c.id === value ? 'bg-[#14B8A6]/10 font-medium text-[#14B8A6]' : 'text-slate-900'
                    }`}
                    onClick={() => {
                      onChange(c.id);
                      setOpen(false);
                    }}
                  >
                    {c.full_name}
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
