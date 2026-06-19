'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

type Props = {
  value: string;
  options?: string[];
  disabled?: boolean;
  className?: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  rowIndex: number;
  colIndex: number;
  title?: string;
};

const MENU_MAX_HEIGHT = 176;

export function CircuitCellInput({
  value,
  options,
  disabled,
  className,
  onChange,
  onKeyDown,
  rowIndex,
  colIndex,
  title,
}: Props) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({ visibility: 'hidden' });
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered =
    options?.filter((opt) => !value || opt.toLowerCase().includes(value.trim().toLowerCase())) ?? [];

  const showDropdown = open && !disabled && options && options.length > 0 && filtered.length > 0;

  const updateMenuPosition = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;

    const rect = input.getBoundingClientRect();
    const gap = 2;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const openUpward = spaceBelow < 120 && spaceAbove > spaceBelow;

    setMenuStyle({
      position: 'fixed',
      left: rect.left,
      width: Math.max(rect.width, 140),
      zIndex: 10000,
      visibility: 'visible',
      ...(openUpward
        ? {
            bottom: window.innerHeight - rect.top + gap,
            maxHeight: Math.min(MENU_MAX_HEIGHT, spaceAbove),
          }
        : {
            top: rect.bottom + gap,
            maxHeight: Math.min(MENU_MAX_HEIGHT, spaceBelow),
          }),
    });
  }, []);

  useEffect(() => {
    setHighlight(0);
  }, [value, open]);

  useLayoutEffect(() => {
    if (!showDropdown) return;
    updateMenuPosition();
    window.addEventListener('scroll', updateMenuPosition, true);
    window.addEventListener('resize', updateMenuPosition);
    return () => {
      window.removeEventListener('scroll', updateMenuPosition, true);
      window.removeEventListener('resize', updateMenuPosition);
    };
  }, [showDropdown, updateMenuPosition, filtered.length]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!containerRef.current?.contains(target) && !listRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const selectOption = (option: string) => {
    onChange(option);
    setOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (showDropdown) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setHighlight((i) => Math.min(i + 1, filtered.length - 1));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setHighlight((i) => Math.max(i - 1, 0));
        return;
      }
      if (event.key === 'Enter' && filtered[highlight]) {
        event.preventDefault();
        selectOption(filtered[highlight]);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        return;
      }
    }
    onKeyDown?.(event);
  };

  const dropdownMenu =
    showDropdown && typeof document !== 'undefined' ? (
      <ul
        ref={listRef}
        role="listbox"
        style={menuStyle}
        className="overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg"
      >
        {filtered.map((option, index) => (
          <li key={option} role="option" aria-selected={index === highlight}>
            {option === 'Spare' || option === 'Unknown' ? (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectOption(option)}
                onMouseEnter={() => setHighlight(index)}
                className={`block w-full px-2.5 py-1.5 text-left text-xs font-semibold ${
                  index === highlight ? 'bg-teal-100 text-teal-900' : 'bg-teal-50 text-teal-800 hover:bg-teal-100'
                }`}
              >
                {option}
              </button>
            ) : (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectOption(option)}
                onMouseEnter={() => setHighlight(index)}
                className={`block w-full px-2.5 py-1.5 text-left text-xs font-medium text-slate-800 ${
                  index === highlight ? 'bg-teal-50 text-teal-900' : 'hover:bg-slate-50'
                }`}
              >
                {option}
              </button>
            )}
          </li>
        ))}
      </ul>
    ) : null;

  return (
    <div ref={containerRef} className="relative flex w-full items-center">
      <input
        ref={inputRef}
        disabled={disabled}
        className={className}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          if (options?.length) setOpen(true);
        }}
        onFocus={() => {
          if (options?.length) setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        data-circuit-row={rowIndex}
        data-circuit-col={colIndex}
        title={title}
        autoComplete="off"
      />
      {options && options.length > 0 && !disabled && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Show suggestions"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setOpen((o) => !o);
            inputRef.current?.focus();
          }}
          className="absolute right-0.5 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <ChevronDown className="size-3" />
        </button>
      )}
      {dropdownMenu && createPortal(dropdownMenu, document.body)}
    </div>
  );
}
