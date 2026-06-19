'use client';

import type { HTMLAttributes, ReactNode } from 'react';

/** Wider certificate form container (Tradecert uses full workspace width). */
export function TradecertFormLayout({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-6xl space-y-4">{children}</div>;
}

export function TradecertFieldGrid({
  children,
  cols = 2,
  ...rest
}: {
  children: ReactNode;
  cols?: 1 | 2 | 3;
} & HTMLAttributes<HTMLDivElement>) {
  const gridClass =
    cols === 1
      ? 'grid grid-cols-1 gap-3'
      : cols === 3
        ? 'grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3'
        : 'grid grid-cols-1 gap-3 sm:grid-cols-2';
  return (
    <div className={gridClass} data-form-grid data-form-cols={String(cols)} {...rest}>
      {children}
    </div>
  );
}

export function TradecertPanel({
  title,
  children,
  toolbar,
}: {
  title: string;
  children: ReactNode;
  toolbar?: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-300 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-800">{title}</h3>
        {toolbar}
      </div>
      <div className="space-y-3 p-4">{children}</div>
    </section>
  );
}
