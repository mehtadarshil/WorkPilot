'use client';

import { useMemo, useState } from 'react';
import { BookOpen, Plus, Search } from 'lucide-react';
import type { InvoicePriceBookGroup, InvoicePriceBookItem } from '../../lib/invoicePriceBookTypes';

type JobPricingItem = {
  id: number;
  item_name: string;
  quantity: number;
  total: string | number;
};

type Props = {
  priceBooks: InvoicePriceBookGroup[];
  jobPricingItems?: JobPricingItem[];
  onAddItem: (item: InvoicePriceBookItem, bookName: string) => void;
  onAddJobPricingItem?: (item: JobPricingItem) => void;
  loading?: boolean;
};

export default function InvoicePriceBookPanel({
  priceBooks,
  jobPricingItems = [],
  onAddItem,
  onAddJobPricingItem,
  loading = false,
}: Props) {
  const [search, setSearch] = useState('');
  const [expandedBooks, setExpandedBooks] = useState<Record<number, boolean>>({});

  const totalItems = useMemo(
    () => priceBooks.reduce((sum, book) => sum + book.items.length, 0),
    [priceBooks],
  );

  const filteredBooks = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return priceBooks;
    return priceBooks
      .map((book) => ({
        ...book,
        items: book.items.filter(
          (item) =>
            item.item_name.toLowerCase().includes(q) ||
            book.price_book_name.toLowerCase().includes(q),
        ),
      }))
      .filter((book) => book.items.length > 0);
  }, [priceBooks, search]);

  const filteredJobItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return jobPricingItems;
    return jobPricingItems.filter((item) => item.item_name.toLowerCase().includes(q));
  }, [jobPricingItems, search]);

  const toggleBook = (bookId: number) => {
    setExpandedBooks((prev) => ({ ...prev, [bookId]: !(prev[bookId] ?? true) }));
  };

  if (loading) {
    return (
      <aside className="flex h-full flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="text-sm font-bold text-slate-800">Price book items</h3>
        </div>
        <div className="p-5 text-sm text-slate-500">Loading price books…</div>
      </aside>
    );
  }

  return (
    <aside className="flex h-full min-h-0 flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-gradient-to-r from-[#14B8A6]/5 to-white px-5 py-4">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-[#14B8A6]/10 p-2 text-[#14B8A6]">
            <BookOpen className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Customer price books</h3>
            <p className="text-[11px] text-slate-500">{totalItems} pricing items across {priceBooks.length} book{priceBooks.length === 1 ? '' : 's'}</p>
          </div>
        </div>
        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items or books…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/20"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {jobPricingItems.length > 0 && (
          <section>
            <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">Job pricing</h4>
            <div className="space-y-2">
              {filteredJobItems.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No job items match your search.</p>
              ) : (
                filteredJobItems.map((item) => (
                  <button
                    key={`job-${item.id}`}
                    type="button"
                    onClick={() => onAddJobPricingItem?.(item)}
                    className="group flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-left transition hover:border-[#14B8A6]/40 hover:bg-[#14B8A6]/5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800 group-hover:text-[#0f766e]">{item.item_name}</p>
                      <p className="text-[11px] text-slate-500">Qty {Number(item.quantity).toFixed(2)} on job</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-sm font-bold text-slate-700">£{Number(item.total || 0).toFixed(2)}</span>
                      <Plus className="size-4 text-[#14B8A6] opacity-70 group-hover:opacity-100" />
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>
        )}

        {filteredBooks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
            <p className="text-sm font-medium text-slate-600">No price book items found</p>
            <p className="mt-1 text-xs text-slate-500">Assign price books on the customer record to see items here.</p>
          </div>
        ) : (
          filteredBooks.map((book) => {
            const expanded = expandedBooks[book.price_book_id] ?? true;
            return (
              <section key={book.price_book_id}>
                <button
                  type="button"
                  onClick={() => toggleBook(book.price_book_id)}
                  className="mb-2 flex w-full items-center justify-between gap-2 text-left"
                >
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">{book.price_book_name}</h4>
                    <p className="text-[11px] text-slate-500">
                      {book.source === 'company_default' ? 'Company default' : 'Assigned to customer'}
                      {' · '}
                      {book.items.length} item{book.items.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-slate-400">{expanded ? 'Hide' : 'Show'}</span>
                </button>
                {expanded && (
                  <div className="space-y-2">
                    {book.items.map((item) => (
                      <button
                        key={`${book.price_book_id}-${item.id}`}
                        type="button"
                        onClick={() => onAddItem(item, book.price_book_name)}
                        className="group flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-left transition hover:border-[#14B8A6]/40 hover:bg-[#14B8A6]/5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800 group-hover:text-[#0f766e]">{item.item_name}</p>
                          {item.unit_price > 0 && item.unit_price !== item.sell_unit_price ? (
                            <p className="text-[11px] text-slate-500">Unit £{Number(item.unit_price).toFixed(2)}</p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-sm font-bold text-slate-700">£{Number(item.sell_unit_price).toFixed(2)}</span>
                          <Plus className="size-4 text-[#14B8A6] opacity-70 group-hover:opacity-100" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>
    </aside>
  );
}
