'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { InvoicePriceBookFlatItem } from '../../lib/invoicePriceBookTypes';

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSelectItem: (item: InvoicePriceBookFlatItem) => void;
  suggestions: InvoicePriceBookFlatItem[];
  placeholder?: string;
  className?: string;
};

export default function LineItemDescriptionInput({
  value,
  onChange,
  onSelectItem,
  suggestions,
  placeholder = 'Item description',
  className = '',
}: Props) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return suggestions.slice(0, 12);
    return suggestions
      .filter((item) => item.item_name.toLowerCase().includes(q) || item.price_book_name.toLowerCase().includes(q))
      .slice(0, 12);
  }, [suggestions, value]);

  useEffect(() => {
    setActiveIndex(0);
  }, [value, filtered.length]);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const pick = (item: InvoicePriceBookFlatItem) => {
    onSelectItem(item);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        className={className}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!open || filtered.length === 0) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex((prev) => (prev + 1) % filtered.length);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
          } else if (e.key === 'Enter' && filtered[activeIndex]) {
            e.preventDefault();
            pick(filtered[activeIndex]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {open && filtered.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl">
          {filtered.map((item, index) => (
            <button
              key={`${item.price_book_id}-${item.id}`}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(item)}
              className={`flex w-full items-start justify-between gap-3 border-b border-slate-50 px-3 py-2.5 text-left transition last:border-b-0 ${
                index === activeIndex ? 'bg-[#14B8A6]/10' : 'hover:bg-slate-50'
              }`}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-800">{item.item_name}</p>
                <p className="truncate text-[11px] text-slate-500">{item.price_book_name}</p>
              </div>
              <span className="shrink-0 text-sm font-bold text-[#14B8A6]">
                £{Number(item.sell_unit_price ?? item.price ?? item.unit_price ?? 0).toFixed(2)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
